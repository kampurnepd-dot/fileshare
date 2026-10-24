# Multithreaded File Share

A file sharing server written in C++ with a small web page on top of it. You can sign up, log in, upload files, download them, search by name and delete them. A file can only be deleted by the person who uploaded it.

I built it in stages: first a plain TCP server and a terminal client, then SQLite instead of a folder, then the web page, then accounts. Each stage still works with the one before it, except where noted at the bottom.

## How the pieces fit

```
browser (React, Vite)  -->  Node bridge  -->  C++ server  -->  fileshare.db
      HTTP + socket.io        port 3000        TCP, port 8080      SQLite
```

A browser cannot open a raw TCP connection, so the C++ server cannot be reached from a web page directly. The Node bridge sits in the middle. It takes an HTTP request from the page, opens a TCP connection to the C++ server, speaks the server's text protocol, and sends the answer back as JSON (or as the file bytes for a download). It also runs socket.io, which is how a second open tab finds out that a file was uploaded or deleted without reloading.

The C++ server starts a new thread for every client that connects. Each thread opens its own SQLite connection, so clients do not block each other. SQLite runs in WAL mode with a 5 second busy timeout for the moments when two clients write at once.

## What is where

| Folder / file | What it is |
| --- | --- |
| `server1.cpp` | the file server |
| `client.cpp` | the original terminal client |
| `fileshare-ui/server/` | the Node bridge |
| `fileshare-ui/src/` | the React page (`pages/` has login and signup, `components/` the rest) |

## Running it

You need `g++`, the SQLite development files, and Node.js.

```
sudo apt install g++ libsqlite3-dev
```

Build and start the server. Always start it from the same folder, because `fileshare.db` is created in whatever folder you start it from.

```
cd fileshare
g++ -std=c++17 -pthread server1.cpp -o server1 -lsqlite3
./server1
```

In another terminal, install and start the bridge and the page together:

```
cd fileshare-ui
npm install
npm install socket.io socket.io-client react-router-dom axios
npm start
```

Open the address Vite prints, normally http://localhost:5173. If that port is busy Vite picks 5174. Both are allowed in the bridge's CORS list. Any other port has to be added to `ALLOWED_ORIGINS` at the top of the bridge file.

Before using it, open the bridge file and change `PEPPER` to some text of your own. It is mixed into every password hash. If you change it later, accounts made before the change can no longer log in.

## Accounts and who can delete what

Signing up sends the name, email and password to the bridge. The bridge turns the password into a hash (scrypt, with the email and the pepper as salt) and only the hash is sent to the C++ server and stored. The real password is never saved. Because the same email and password always give the same hash, the server can look a user up with one query on both columns.

When you log in, the bridge makes a random token, remembers which email it belongs to, and sends it to the page. The page keeps it in `localStorage` and sends it back in an `Authorization` header on uploads and deletes. The bridge uses it to find your email.

When a file is uploaded, the uploader's email is stored next to it. A delete request carries the email of whoever is asking, and the server refuses unless it matches. The same check stops someone else from replacing your file by uploading one with the same name. Files that were uploaded before this existed have no owner, so any logged-in user can delete them.

## The protocol between the bridge and the server

Every command is one line ending in a newline. Some commands are followed by more lines.

| Command | What follows | Reply |
| --- | --- | --- |
| `LIST` | | `<length>` then that many bytes of file names, one per line |
| `SEARCH <text>` | | matching names, one per line, then an empty line |
| `DOWNLOAD <name>` | | an empty line, `<size>`, then the bytes. If something is wrong, one line of error text instead of the empty line |
| `UPLOAD <name>` | owner email, `<size>`, the bytes | one line |
| `DELETE <name>` | owner email | one line |
| `CREATE USER` | name, email, hash | one line |
| `LOGIN USER` | email, hash | `OK` and the name, or `NOUSER` |
| `QUIT` | | the server closes the connection |

Search ignores upper and lower case (`lower()` on both sides in the SQL). Download and delete need the exact name.

## Things I know are not great

- Logins live in the bridge's memory. Restart the bridge and everyone has to log in again.
- An upload is read fully into memory before it is written to the database, so there is a 200 MB limit per file.
- It makes one thread per client with no upper limit. A thread pool would be the proper fix.
- `client.cpp` was written before accounts. It does not send the owner line, so uploading and deleting from the terminal no longer work against this server. Listing and downloading still do.
- The pepper is written in the bridge source. There is no HTTPS. This is a project for learning, not something to put on the internet.
