import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// While developing, the page runs on Vite (port 5173).
// Anything starting with /api is forwarded to the Node bridge (port 3000),
// so the page can just call fetch("/api/files") with no CORS setup.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
