// 서버 진입점: /api + /healthz + vite 빌드(dist/) 정적 서빙을 한 프로세스로.
// 환경 변수: PORT(기본 8787) · DB_PATH(기본 .data/moneylog.db, 운영은 /data/moneylog.db) · STATIC_DIR(기본 ./dist)
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";
import { openDb } from "./db.ts";

const PORT = Number(process.env.PORT ?? 8787);
const DB_PATH = process.env.DB_PATH ?? ".data/moneylog.db";
const STATIC_DIR = process.env.STATIC_DIR ?? "./dist";

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = openDb(DB_PATH);
const app = createApp(db);

app.get("/healthz", (c) => c.text("ok\n"));

// vite 가 해시를 붙인 번들은 영구 캐시, 나머지(index.html)는 매번 확인 — 새 배포가 바로 보이게
app.use("*", async (c, next) => {
  await next();
  if (c.req.path.startsWith("/api/")) return;
  c.header("Cache-Control", c.req.path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
});
app.use("*", serveStatic({ root: STATIC_DIR }));
app.get("*", serveStatic({ root: STATIC_DIR, path: "index.html" }));

const server = serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`moneylog: http://localhost:${info.port} (DB ${DB_PATH})`);
});

// k8s 가 Pod 를 내릴 때 SIGTERM — PID 1 은 기본 처리가 없어 직접 닫는다
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    server.close();
    db.close();
    process.exit(0);
  });
}
