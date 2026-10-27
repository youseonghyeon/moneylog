import preact from "@preact/preset-vite";
import { defineConfig } from "vitest/config";

// 개발: vite(5173) 가 /api 를 dev:api(8787) 로 넘긴다
export default defineConfig({
  plugins: [preact()],
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8787" } },
  test: { include: ["tests/**/*.test.ts"] },
});
