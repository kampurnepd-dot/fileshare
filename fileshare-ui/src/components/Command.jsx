import { useState } from "react";
import "./Command.css";

export default function CommandBox({ onSend }) {
  const [command, setCommand] = useState("");

  function send() {
    const text = command.trim();

    if (!text) return;

    onSend(text);
    setCommand("");
  }

  return (
    <form
      className="command-box"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <textarea
        className="command-input"
        placeholder="Enter a command, e.g. LIST"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        rows={1}
        aria-label="Server command"
      />

      <button
        className="command-send"
        type="submit"
        disabled={!command.trim()}
      >
        Send
      </button>
    </form>
  );
}