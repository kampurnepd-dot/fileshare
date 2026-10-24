import { useRef, useState } from "react";

export default function UploadBox({ onUpload }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  function handleFiles(list) {
    for (const file of list) onUpload(file);
  }

  return (
    <>
      <div className="head">
        <h2>Upload</h2>
      </div>
      <div
        className={"drop" + (over ? " over" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <p>Drag and drop files here</p>
        <button onClick={() => inputRef.current.click()}>Choose files</button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </>
  );
}
