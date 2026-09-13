import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In dev, the browser calls /api/* on the Vite server, which forwards to Express.
    // Same origin from the browser's view → no CORS setup needed locally.
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/socket.io": { target: "http://localhost:3000", ws: true },
    },
  },
});
