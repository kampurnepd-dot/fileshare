import { useState, useEffect, useCallback } from "react";
import { listFiles, deleteFile, downloadFile, uploadFile ,commandline,serachfile} from "./api.js";
import FileList from "./components/FileList.jsx";
import UploadBox from "./components/UploadBox.jsx";
import Transfers from "./components/Transfers.jsx";
import LogPanel from "./components/LogPanel.jsx";
import Command from "./components/Command.jsx";
import { useSocket } from "./context/Socket.jsx";

let nextId = 1; // simple counter for list keys


export default function App() {
  const socket = useSocket();
  const [files, setFiles] = useState([]);
  const [file,setFile] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | online | offline
  const [logs, setLogs] = useState([]);
  const [transfers, setTransfers] = useState([]);

  const log = useCallback((text, kind = "info") => {
    setLogs((old) => [...old.slice(-99), { id: nextId++, time: new Date().toLocaleTimeString(), text, kind }]);
  }, []);


  const Search = useCallback(async(filename)=>{
  try{
  setFile(await serachfile(filename));
  setStatus("Searching");

  }catch(err){
  
  log(err.message,"error");
  }
  },[log]);
 

  const refresh = useCallback(async () => {
    try {
      setFiles(await listFiles());
      setStatus("online");
    } catch (e) {
      setStatus("offline");
      log(e.message, "error");
    }
  }, [log]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  

  function updateTransfer(id, changes) {
    setTransfers((old) => old.map((t) => (t.id === id ? { ...t, ...changes } : t)));

  }

  async function handleUpload(file) {
    const id = nextId++;
    
    setTransfers((old) => [{ id, name: file.name, kind: "Upload", percent: 0, state: "running" }, ...old]);
    log("Uploading " + file.name + " (" + file.size + " bytes)");
    try {
      const message = await uploadFile(file, (percent) => updateTransfer(id, { percent }));
      updateTransfer(id, { percent: 100, state: "done" });
      log(message, "ok");
      socket.emit("uploaded");
      console.log("upload send ")
    } catch (e) {
      updateTransfer(id, { state: "failed" });
      log(e.message, "error");
    }
    refresh();
  }

  async function handleDownload(name) {
    const id = nextId++;
    setTransfers((old) => [{ id, name, kind: "Download", percent: 0, state: "running" }, ...old]);
    log("Downloading " + name);
    try {
      

      const blob = await downloadFile(name);
      // turn the bytes into a temporary link and click it, so the browser saves the file
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      updateTransfer(id, { percent: 100, state: "done" });
      log("Downloaded " + name, "ok");
    } catch (e) {
      updateTransfer(id, { state: "failed" });
      log(e.message, "error");
    }
  }

  async function handleDelete(name) {
    if (!window.confirm("Delete " + name + " from the server?")) return;
    try {
      log(await deleteFile(name), "ok");
      socket.emit("deleted");
    } catch (e) {
      log(e.message, "error");
    }
    refresh();
  }
  async function handleCommand(command) {
  log("> " + command);
  try {
    log(await commandline(command), "ok");
  } catch (e) {
    log(e.message, "error");
  }
  refresh();   // a DELETE changes the file list
}



useEffect(()=>{
    const handlerefresh= ()=>{
      refresh();
    }
   socket.on("uploaded",handlerefresh);
   socket.on("deleted",handlerefresh);
   console.log("upload received");
   return ()=>{
    socket.off("uploaded",handlerefresh);
    socket.off("deleted",handlerefresh);
   }
    
   
  },[socket]);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">FS</span>
          <span>File Share</span>
        </div>
        <span className={"pill " + status}>
          {status === "online" ? "Connected" : status === "offline" ? "Server offline" : "Connecting..."}
        </span>
      </header>

      <main>
        <h1>Welcome to File Share</h1>
        <p className="sub">Upload, download and manage files on your server.</p>

        <div className="grid">
          <section className="card wide">
            <FileList
              onSearch={Search}
              file ={file}
              files={files}
              status={status}
              onRefresh={refresh}
              onDownload={handleDownload}
              onDelete={handleDelete}
            />
          </section>

          <section className="card">
            <UploadBox onUpload={handleUpload} />
          </section>

          <section className="card">
            <Transfers transfers={transfers} />
          </section>

          <section className="card wide">
            <LogPanel logs={logs} />
          </section>
          <section className="card wide">
  <Command onSend={handleCommand} />
</section>
        </div>
      </main>
    </div>
  );
}
