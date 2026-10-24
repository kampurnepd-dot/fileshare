
import { useState } from "react";
import "./Filelist.css";
import "./Command.css";

export default function FileList({
  onSearch,
  file,
  files,
  status,
  onRefresh,
  onDownload,
  onDelete,
}) {
  const [filename, setfilename] = useState("");

  function send(e) {
    e.preventDefault();

    const text = filename.trim();
    if (!text) return;

    onSearch(text);
  }

  return (
    <>
      <div className="head">
        <h2>Files on server</h2>
        <button className="ghost" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      {/* Search panel styled like Command */}
      <form className="command-box" onSubmit={send}>
        <textarea
          className="command-input"
          value={filename}
          onChange={(e) => setfilename(e.target.value)}
          placeholder="Search for a filename..."
          rows={1}
          aria-label="Search filename"
        />

        <button
          className="command-send"
          type="submit"
          disabled={!filename.trim()}
        >
          Search
        </button>
      </form>

      {status === "offline" && (
        <div className="empty">
          Cannot reach the file server. Is ./server running?
        </div>
      )}

      {status === "loading" && (
        <div className="empty">Loading...</div>
      )}

      {status === "online" && files.length === 0 && (
        <div className="empty">Server storage is empty</div>
      )}

      {status === "Searching" && file.length === 0 && (
        <div className="empty">File Not Found</div>
      )}

      {status === "Searching" &&
        file.map((name) => (
          <div className="row" key={name}>
            <span className="icon">
              {name.includes(".")
                ? name.split(".").pop().slice(0, 4)
                : "file"}
            </span>

            <span className="name">{name}</span>

            <button onClick={() => onDownload(name)}>
              Download
            </button>

            <button
              className="danger"
              onClick={() => onDelete(name)}
            >
              Delete
            </button>
          </div>
        ))}

      {status === "online" &&
        files.map((name) => (
          <div className="row" key={name}>
            <span className="icon">
              {name.includes(".")
                ? name.split(".").pop().slice(0, 4)
                : "file"}
            </span>

            <span className="name">{name}</span>

            <button onClick={() => onDownload(name)}>
              Download
            </button>

            <button
              className="danger"
              onClick={() => onDelete(name)}
            >
              Delete
            </button>
          </div>
        ))}
    </>
  );
}
