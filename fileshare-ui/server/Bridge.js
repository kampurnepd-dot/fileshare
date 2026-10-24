import net from "net";
import http from "http";
import { Server } from "socket.io";

const WEB_PORT = 3000;
const SERVER_HOST = "127.0.0.1";
const SERVER_PORT = 8080;
import crypto from "crypto";

const PEPPER = "change-this-to-any-long-secret";

// token -> { name, email }. Lives here, outside any route, so every request sees it.
const sessions = new Map();

function currentUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return sessions.get(token) || null;   // { name, email } or null
}

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
];

// --------------------------------------------------
// TCP connection to the C++ file server
// --------------------------------------------------

class Conn {
  constructor() {
    this.buf = Buffer.alloc(0);
    this.wake = null;
    this.closed = false;

    this.sock = net.connect(SERVER_PORT, SERVER_HOST);

    this.ready = new Promise((resolve, reject) => {
      this.sock.once("connect", resolve);
      this.sock.once("error", reject);
    });

    this.sock.on("data", (data) => {
      this.buf = Buffer.concat([this.buf, data]);
      this._notify();
    });

    const done = () => {
      this.closed = true;
      this._notify();
    };

    this.sock.on("close", done);
    this.sock.on("error", done);
  }

  _notify() {
    if (this.wake) {
      const wake = this.wake;
      this.wake = null;
      wake();
    }
  }

  async _take(tryTake) {
    while (true) {
      const result = tryTake();

      if (result !== null) {
        return result;
      }

      if (this.closed) {
        throw new Error("C++ server closed the connection");
      }

      await new Promise((resolve) => {
        this.wake = resolve;
      });
    }
  }

  readLine() {
    return this._take(() => {
      const index = this.buf.indexOf(10);

      if (index < 0) return null;

      const line = this.buf.subarray(0, index).toString();
      this.buf = this.buf.subarray(index + 1);

      return line.replace(/\r$/, "");
    });
  }

  readBytes(n) {
    return this._take(() => {
      if (this.buf.length < n) return null;

      const bytes = this.buf.subarray(0, n);
      this.buf = this.buf.subarray(n);

      return bytes;
    });
  }

  send(data) {
    this.sock.write(data);
  }

  end() {
    if (!this.sock.destroyed) {
      this.sock.end("QUIT\n");
    }
  }
}

async function withServer(fn) {
  const conn = new Conn();

  try {
    await conn.ready;
    return await fn(conn);
  } finally {
    conn.end();
  }
}

// --------------------------------------------------
// File operations
// --------------------------------------------------

async function searchFiles(conn, name) {
  conn.send(`SEARCH ${name}\n`);

  const names = [];

  while (true) {
    const line = await conn.readLine();
    if (line === "") break;
    names.push(line);
  }

  return names;
}

async function listFiles(conn) {
  conn.send("LIST\n");

  const length = parseInt(await conn.readLine(), 10);

  if (!(length >= 0)) {
    throw new Error("Invalid LIST response");
  }

  const text =
    length > 0
      ? (await conn.readBytes(length)).toString()
      : "";

  return text.split("\n").filter(Boolean);
}

async function downloadFile(conn, name) {
  conn.send(`DOWNLOAD ${name}\n`);

  const error = await conn.readLine();

  if (error !== "") {
    return { error };
  }

  const size = parseInt(await conn.readLine(), 10);

  if (!(size >= 0)) {
    throw new Error("Invalid DOWNLOAD response");
  }

  return { data: await conn.readBytes(size) };
}

async function uploadFile(conn, name, body,token) {
  conn.send(`UPLOAD ${name}\n`);
  conn.send(`${token}\n`);
  conn.send(`${body.length}\n`);
  conn.send(body);

  return await conn.readLine();
}

async function deleteFile(conn, name,token) {
  conn.send(`DELETE ${name}\n`);
  conn.send(`${token}\n`);

  return await conn.readLine();
}

async function commandline(conn, line, user) {
  const space = line.indexOf(" ");

  const command = (
    space < 0 ? line : line.slice(0, space)
  ).toUpperCase();

  const argument =
    space < 0 ? "" : line.slice(space + 1).trim();

  if (command === "LIST") {
    const files = await listFiles(conn);

    return files.length
      ? files.join("\n")
      : "Server storage is empty";
  }

  if (command === "DELETE" && argument) {
    if (!user) return "Please log in to delete files";
    return await deleteFile(conn, argument, user.email);
  }

  return null;
}

// --------------------------------------------------
// User operations
// --------------------------------------------------

// The same email + password always gives the same hash, so the database can match both.
function hashPassword(email, password) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, email + PEPPER, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key.toString("hex"));
    });
  });
}

async function createuser(conn, userName, email, password) {
  const name = userName.trim();
  const Email = email.trim().toLowerCase();
  const hash = await hashPassword(Email, password.trim());

  conn.send(`CREATE USER\n${name}\n${Email}\n${hash}\n`);

  return await conn.readLine();
}

async function loginuser(conn, email, password) {
  const Email = email.trim().toLowerCase();
  const hash = await hashPassword(Email, password.trim());

  conn.send(`LOGIN USER\n${Email}\n${hash}\n`);

  const first = await conn.readLine();      // "OK" or "NOUSER"
  if (first !== "OK") return null;

  return { name: await conn.readLine() };
}

// --------------------------------------------------
// HTTP helpers
// --------------------------------------------------

function json(res, status, data) {
  if (res.writableEnded || res.destroyed) return;

  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });

  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];

    req.on("data", (data) => parts.push(data));
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });
}

function hasLineBreak(value) {
  return /[\r\n]/.test(value);
}

function isSuccessful(message) {
  return /successfully/i.test(message);
}

// --------------------------------------------------
// HTTP server
// --------------------------------------------------

const server = http.createServer(async (req, res) => {
  // CORS must run before every route and every response.
  
  const origin = req.headers.origin;

  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, DELETE, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  // Respond to browser preflight requests immediately.
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, "http://localhost");
  const name = url.searchParams.get("name") || "";

  try {
    // Validate file names before sending TCP commands.
    if (hasLineBreak(name)) {
      return json(res, 400, {
        ok: false,
        message: "Invalid file name",
      });
    }

    // LIST FILES
    if (
      req.method === "GET" &&
      url.pathname === "/api/files"
    ) {
      const files = await withServer(listFiles);

      return json(res, 200, {
        ok: true,
        files,
      });
    }

    // DOWNLOAD FILE
    if (
      req.method === "GET" &&
      url.pathname === "/api/download"
    ) {
      if (!name) {
        return json(res, 400, {
          ok: false,
          message: "File name is required",
        });
      }

      const result = await withServer((conn) =>
        downloadFile(conn, name)
      );

      if (result.error) {
        return json(res, 404, {
          ok: false,
          message: result.error,
        });
      }

      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": result.data.length,
        "Content-Disposition":
          `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      });

      return res.end(result.data);
    }

    // UPLOAD FILE
    if (
      req.method === "POST" &&
      url.pathname === "/api/upload"
    ) {
      if (!name) {
        return json(res, 400, {
          ok: false,
          message: "File name is required",
        });
      }

      const body = await readBody(req);
      const user = currentUser(req);

      if (!user) {
        return json(res, 401, {
          ok: false,
          message: "Please log in to upload files",
        });
      }

      const message = await withServer((conn) =>
        uploadFile(conn, name, body, user.email)
      );

      const ok = isSuccessful(message);

      return json(res, ok ? 200 : 400, {
        ok,
        message,
      });
    }

    // DELETE FILE
    if (
      req.method === "DELETE" &&
      url.pathname === "/api/files"
    ) {
      if (!name) {
        return json(res, 400, {
          ok: false,
          message: "File name is required",
        });
      }
      const user = currentUser(req);

      if (!user) {
        return json(res, 401, {
          ok: false,
          message: "Please log in to delete files",
        });
      }

      const message = await withServer((conn) =>
        deleteFile(conn, name, user.email)
      );

      const ok = /deleted successfully/i.test(message);

      return json(res, ok ? 200 : 400, {
        ok,
        message,
      });
    }

    // COMMAND BOX: LIST or DELETE <file>
    if (
      req.method === "POST" &&
      url.pathname === "/api/command"
    ) {
      const line = (await readBody(req)).toString().trim();

      if (hasLineBreak(line)) {
        return json(res, 400, {
          ok: false,
          message: "One command per line",
        });
      }

      const reply = await withServer((conn) =>
        commandline(conn, line, currentUser(req))
      );

      if (reply === null) {
        return json(res, 400, {
          ok: false,
          message:
            "Use LIST or DELETE <file>. Use the buttons to upload or download.",
        });
      }

      return json(res, 200, {
        ok: true,
        message: reply,
      });
    }

    // SEARCH FILES
    if (
      req.method === "GET" &&
      url.pathname === "/api/search"
    ) {
      const files = await withServer((conn) =>
        searchFiles(conn, name)
      );

      return json(res, 200, {
        ok: true,
        file: files,
      });
    }

    // SIGNUP
    if (
      req.method === "POST" &&
      url.pathname === "/api/signin"
    ) {
      let body;

      try {
        body = JSON.parse(
          (await readBody(req)).toString()
        );
      } catch {
        return json(res, 400, {
          ok: false,
          message: "Invalid JSON",
        });
      }

      const userName = String(body.userName || "").trim();
      const email = String(body.email || "").trim();
      const password = String(body.password || "").trim();

      if (!userName || !email || !password) {
        return json(res, 400, {
          ok: false,
          message: "All fields are required",
        });
      }

      if (hasLineBreak(userName + email + password)) {
        return json(res, 400, {
          ok: false,
          message: "Invalid input",
        });
      }

      const message = await withServer((conn) =>
        createuser(conn, userName, email, password)
      );

      const ok = isSuccessful(message);

      return json(res, ok ? 200 : 400, {
        ok,
        message,
      });
    }

    // LOGIN
    if (
      req.method === "POST" &&
      url.pathname === "/api/login"
    ) {
      let body;
      
      
      try {
        body = JSON.parse(
          (await readBody(req)).toString()
        );
      } catch {
        
        return json(res, 400, {
          ok: false,
          message: "Invalid JSON",
        });
      }
      

      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "").trim();

      if (!email || !password) {
        return json(res, 400, {
          ok: false,
          message: "Email and password are required",
        });
      }

      if (hasLineBreak(email + password)) {
        return json(res, 400, {
          ok: false,
          message: "Invalid input",
        });
      }

      const user = await withServer((conn) =>
        loginuser(conn, email, password)
      );

      if (!user) {
        return json(res, 401, {
          ok: false,
          message: "Wrong email or password",
        });
      }

      const token = crypto.randomBytes(24).toString("hex");
      sessions.set(token, { name: user.name, email });

      return json(res, 200, {
        ok: true,
        token,
        user: { name: user.name, email },
      });
    }

    // UNKNOWN ROUTE
    return json(res, 404, {
      ok: false,
      message: "Not found",
    });
  } catch (error) {
    console.error("HTTP route error:", error.message);

    return json(res, 502, {
      ok: false,
      message: "Cannot talk to file server: " + error.message,
    });
  }
});

// --------------------------------------------------
// Socket.IO
// --------------------------------------------------

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("uploaded", () => {
    console.log("File uploaded; notifying other clients");
    socket.broadcast.emit("uploaded");
  });

  socket.on("deleted", () => {
    socket.broadcast.emit("deleted");
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

server.listen(WEB_PORT, () => {
  console.log(
    `Bridge ready on http://localhost:${WEB_PORT}`
  );
});