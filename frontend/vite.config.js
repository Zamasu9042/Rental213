import { defineConfig } from "vite";

/** Dev/preview proxy → Docker Compose host ports (see ron's_backend/compose.yaml). */
const microserviceProxy = {
  "/services/equipment": {
    target: "http://127.0.0.1:8001",
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/services\/equipment/, "")
  },
  "/services/rental": {
    target: "http://127.0.0.1:8002",
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/services\/rental/, "")
  },
  "/services/account": {
    target: "http://127.0.0.1:8006",
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/services\/account/, "")
  },
  "/services/damage": {
    target: "http://127.0.0.1:8004",
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/services\/damage/, "")
  }
};

export default defineConfig({
  base: "./",
  server: {
    proxy: { ...microserviceProxy }
  },
  preview: {
    proxy: { ...microserviceProxy }
  }
});
