// /api 라우트. 정적 파일·포트는 main.ts 가 붙인다 (테스트는 이 앱에 바로 app.request).
// 실패 응답은 { error } — 화면이 문구를 그대로 보여 준다.
import { Hono } from "hono";
import type { Context } from "hono";
import { isLabel } from "../core/period.ts";
import { buildPlan } from "../core/plan.ts";
import { checkAmount, checkItem, checkName } from "../core/validate.ts";
import * as store from "./db.ts";
import type { Db } from "./db.ts";

const bad = (c: Context, error: string, status: 400 | 404 | 409 = 400) => c.json({ error }, status);

async function body(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function idParam(c: Context, name = "id"): number | null {
  const n = Number(c.req.param(name));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function createApp(db: Db): Hono {
  const app = new Hono();

  app.get("/api/plan", (c) => {
    const period = c.req.query("period");
    if (!isLabel(period)) return bad(c, "period 쿼리가 필요합니다 (예: ?period=2026-10).");
    const { startDay } = store.getSettings(db);
    const items = store.listItems(db);
    return c.json(buildPlan(period, startDay, store.listAccounts(db), items, store.listOverrides(db, period)));
  });

  app.get("/api/accounts", (c) => c.json(store.listAccounts(db)));

  app.post("/api/accounts", async (c) => {
    const b = (await body(c)) as Record<string, unknown> | null;
    const name = checkName(b?.name);
    if (!name.ok) return bad(c, name.error);
    return c.json(store.createAccount(db, name.value, String(b?.memo ?? "").trim()), 201);
  });

  app.put("/api/accounts/:id", async (c) => {
    const id = idParam(c);
    const b = (await body(c)) as Record<string, unknown> | null;
    const name = checkName(b?.name);
    if (!name.ok) return bad(c, name.error);
    const a = id && store.updateAccount(db, id, name.value, String(b?.memo ?? "").trim());
    return a ? c.json(a) : bad(c, "계좌가 없습니다. 화면을 새로 고쳐 주세요.", 404);
  });

  app.delete("/api/accounts/:id", (c) => {
    const id = idParam(c);
    if (!id || !store.getAccount(db, id)) return bad(c, "계좌가 없습니다. 화면을 새로 고쳐 주세요.", 404);
    const n = store.countItems(db, id);
    if (n > 0) return bad(c, `이 계좌에 항목이 ${n}개 있습니다. 항목을 다른 계좌로 옮기거나 지운 뒤 다시 시도해 주세요.`, 409);
    store.deleteAccount(db, id);
    return c.body(null, 204);
  });

  app.get("/api/items", (c) => c.json(store.listItems(db)));

  app.post("/api/items", async (c) => {
    const r = checkItem(await body(c));
    if (!r.ok) return bad(c, r.error);
    if (!store.getAccount(db, r.value.accountId)) return bad(c, "고른 계좌가 없습니다. 계좌를 다시 골라 주세요.");
    return c.json(store.createItem(db, r.value), 201);
  });

  app.put("/api/items/:id", async (c) => {
    const id = idParam(c);
    if (!id || !store.getItem(db, id)) return bad(c, "항목이 없습니다. 화면을 새로 고쳐 주세요.", 404);
    const r = checkItem(await body(c));
    if (!r.ok) return bad(c, r.error);
    if (!store.getAccount(db, r.value.accountId)) return bad(c, "고른 계좌가 없습니다. 계좌를 다시 골라 주세요.");
    return c.json(store.updateItem(db, id, r.value));
  });

  app.delete("/api/items/:id", (c) => {
    const id = idParam(c);
    if (!id || !store.deleteItem(db, id)) return bad(c, "항목이 없습니다. 화면을 새로 고쳐 주세요.", 404);
    return c.body(null, 204);
  });

  // 기간 하나의 실제 금액 (고지서 금액이 확정되면)
  app.put("/api/items/:id/actual/:period", async (c) => {
    const id = idParam(c);
    const period = c.req.param("period");
    if (!id || !store.getItem(db, id)) return bad(c, "항목이 없습니다. 화면을 새로 고쳐 주세요.", 404);
    if (!isLabel(period)) return bad(c, "기간은 YYYY-MM 형식이어야 합니다.");
    const b = (await body(c)) as Record<string, unknown> | null;
    const amount = checkAmount(b?.amount);
    if (!amount.ok) return bad(c, amount.error);
    store.setOverride(db, { itemId: id, period, amount: amount.value });
    return c.body(null, 204);
  });

  app.delete("/api/items/:id/actual/:period", (c) => {
    const id = idParam(c);
    if (!id) return bad(c, "항목이 없습니다. 화면을 새로 고쳐 주세요.", 404);
    store.deleteOverride(db, id, c.req.param("period"));
    return c.body(null, 204);
  });

  app.get("/api/settings", (c) => c.json(store.getSettings(db)));

  app.put("/api/settings", async (c) => {
    const b = (await body(c)) as Record<string, unknown> | null;
    const d = b?.startDay;
    if (typeof d !== "number" || !Number.isInteger(d) || d < 1 || d > 28) {
      return bad(c, "기간 시작일은 1~28 사이로 넣어 주세요 (29일 이후는 짧은 달에 없어서 받지 않습니다).");
    }
    store.setSettings(db, { startDay: d });
    return c.json(store.getSettings(db));
  });

  app.all("/api/*", (c) => bad(c, `없는 API 입니다: ${c.req.method} ${c.req.path}`, 404));

  return app;
}
