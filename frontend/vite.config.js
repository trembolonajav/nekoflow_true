import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /assets é das imagens do design (public/assets); o bundle vai para /static.
export default defineConfig({
  plugins: [react()],
  build: { assetsDir: "static" },
  server: {
    port: 9073,
    proxy: { "/api": process.env.VITE_API_PROXY || "http://localhost:9090" },
  },
});
