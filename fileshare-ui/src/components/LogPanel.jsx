import { useEffect, useRef } from "react";

export default function LogPanel({ logs }) {
  const endRef = useRef(null);

  // keep the newest line in view
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [logs]);

  return (
    <>
      <div className="head">
        <h2>Log</h2>
      </div>
      <div className="log">
        {logs.length === 0 && <div className="empty">Nothing yet</div>}
        {logs.map((l) => (
          <div key={l.id} className={l.kind}>
            {l.time} &nbsp; {l.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </>
  );
}
