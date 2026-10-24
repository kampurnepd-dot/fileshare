// All talking to the Node bridge lives here, so the components stay simple.

async function readJson(res) {
  return res.json().catch(() => ({}));
}

export async function serachfile(name){
    const res = await fetch("/api/search?name=" + encodeURIComponent(name), {method:"GET"})
    const data = await readJson(res);
    if(!res.ok) throw new Error(data.message || "error in finding file");
    return data.file;
}

export async function listFiles() {
  const res = await fetch("/api/files");
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data.files;
}
function autoHeaders(){
const token = localStorage.getItem("token");
return token ? {Authorization: "Bearer " + token} : {};
}

export async function deleteFile(name) {
  const res = await fetch("/api/files?name=" + encodeURIComponent(name), { method: "DELETE",headers : autoHeaders() });
  const data = await readJson(res);
  if (!data.ok) throw new Error(data.message || "Delete failed");
  return data.message;
}

export async function downloadFile(name) {
  const res = await fetch("/api/download?name=" + encodeURIComponent(name));
  if (!res.ok) {
    const data = await readJson(res);
    throw new Error(data.message || "Download failed");
  }
  return res.blob();
}


export function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload?name=" + encodeURIComponent(file.name));
    const t = localStorage.getItem("token");
    if(t) xhr.setRequestHeader("Authorization", "Bearer " + t);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data.message);
      else reject(new Error(data.message || "Upload failed"));
    };
    xhr.onerror = () => reject(new Error("Cannot reach the bridge"));
    xhr.send(file);
  });
}

export async function commandline(command){
  const res = await fetch("api/command" ,{method:"POST" ,body :command, headers:autoHeaders()});
  const data = readJson(res);
  if (!res.ok) throw new Error(data.message || "Command failed");
  return data.message;
  
}

