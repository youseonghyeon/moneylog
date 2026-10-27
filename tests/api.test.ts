import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.ts";
import { openDb } from "../src/server/db.ts";
import type { Db } from "../src/server/db.ts";
import type { Hono } from "hono";

let db: Db;
let app: Hono;

beforeEach(() => {
  db = openDb(":memory:");
  app = createApp(db);
});
afterEach(() => db.close());

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const rent = { accountId: 3, name: "월세", amount: 550_000, cycle: "monthly", day: 25 };

describe("API", () => {
  it("첫 실행에 기본 계좌 3개", async () => {
    const r = await call("GET", "/api/accounts");
    expect(r.json.map((a: { name: string }) => a.name)).toEqual(["생활비", "대출·고지서", "고정 지출"]);
  });

  it("항목 추가 → 계획에 반영 → 수정 → 삭제", async () => {
    const c = await call("POST", "/api/items", rent);
    expect(c.status).toBe(201);
    let plan = await call("GET", "/api/plan?period=2026-10");
    expect(plan.json.accounts[2].total).toBe(550_000);
    expect(plan.json.accounts[2].lines[0].due).toBe("2026-10-25");

    const u = await call("PUT", `/api/items/${c.json.id}`, { ...rent, amount: 600_000 });
    expect(u.json.amount).toBe(600_000);
    plan = await call("GET", "/api/plan?period=2026-10");
    expect(plan.json.total).toBe(600_000);

    expect((await call("DELETE", `/api/items/${c.json.id}`)).status).toBe(204);
    expect((await call("GET", "/api/plan?period=2026-10")).json.total).toBe(0);
  });

  it("잘못된 입력은 400 과 고치는 법", async () => {
    const cases: [unknown, RegExp][] = [
      [{ ...rent, amount: -1 }, /금액/],
      [{ ...rent, amount: 1.5 }, /금액/],
      [{ ...rent, name: "  " }, /이름/],
      [{ ...rent, cycle: "weekly" }, /주기/],
      [{ ...rent, day: 32 }, /날짜/],
      [{ ...rent, cycle: "yearly" }, /몇 월/],
      [{ ...rent, startMonth: "2026-13" }, /시작 달/],
      [{ ...rent, startMonth: "2027-01", endMonth: "2026-12" }, /종료 달이 시작 달보다/],
      [{ ...rent, accountId: 99 }, /계좌/],
      ["문자열", /JSON 객체/],
    ];
    for (const [body, msg] of cases) {
      const r = await call("POST", "/api/items", body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.json.error).toMatch(msg);
    }
    const raw = await app.request("/api/items", { method: "POST", body: "{깨진" });
    expect(raw.status).toBe(400);
  });

  it("항목이 있는 계좌는 못 지운다 (409)", async () => {
    await call("POST", "/api/items", rent);
    const r = await call("DELETE", "/api/accounts/3");
    expect(r.status).toBe(409);
    expect(r.json.error).toMatch(/항목이 1개/);
    expect((await call("DELETE", "/api/accounts/1")).status).toBe(204);
    expect((await call("DELETE", "/api/accounts/1")).status).toBe(404);
  });

  it("실제 금액: 그 기간에만, 지우면 예상으로", async () => {
    const c = await call("POST", "/api/items", { ...rent, accountId: 2, name: "전기", amount: 50_000, variable: true });
    expect((await call("PUT", `/api/items/${c.json.id}/actual/2026-10`, { amount: 61_230 })).status).toBe(204);
    const line = async (p: string) => (await call("GET", `/api/plan?period=${p}`)).json.accounts[1].lines[0];
    expect(await line("2026-10")).toMatchObject({ amount: 61_230, estimated: false });
    expect(await line("2026-11")).toMatchObject({ amount: 50_000, estimated: true });
    await call("DELETE", `/api/items/${c.json.id}/actual/2026-10`);
    expect(await line("2026-10")).toMatchObject({ amount: 50_000, estimated: true });
    expect((await call("PUT", `/api/items/${c.json.id}/actual/2026-1`, { amount: 1 })).status).toBe(400);
    // 항목을 지우면 실제 금액도 같이 지워진다
    await call("DELETE", `/api/items/${c.json.id}`);
    expect(db.prepare("SELECT COUNT(*) AS n FROM override").get()).toEqual(expect.objectContaining({ n: 0 }));
  });

  it("기간 시작일은 1~28, 계획에 반영", async () => {
    expect((await call("PUT", "/api/settings", { startDay: 29 })).status).toBe(400);
    expect((await call("PUT", "/api/settings", { startDay: 0 })).status).toBe(400);
    expect((await call("PUT", "/api/settings", { startDay: 25 })).json).toEqual({ startDay: 25 });
    await call("POST", "/api/items", { ...rent, day: 10 });
    const plan = (await call("GET", "/api/plan?period=2026-10")).json;
    expect(plan.period).toEqual({ label: "2026-10", start: "2026-10-25", end: "2026-11-24" });
    expect(plan.accounts[2].lines[0].due).toBe("2026-11-10");
  });

  it("period 없음·없는 API 는 JSON 오류", async () => {
    expect((await call("GET", "/api/plan")).status).toBe(400);
    const r = await call("GET", "/api/nope");
    expect(r.status).toBe(404);
    expect(r.json.error).toMatch(/없는 API/);
  });
});

describe("DB 파일", () => {
  it("다시 열어도 데이터가 남고 마이그레이션은 한 번만", async () => {
    const dir = mkdtempSync(join(tmpdir(), "moneylog-"));
    try {
      const path = join(dir, "t.db");
      const a = openDb(path);
      await createApp(a).request("/api/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rent),
      });
      a.close();
      const b = openDb(path);
      expect(b.prepare("SELECT COUNT(*) AS n FROM account").get()).toEqual(expect.objectContaining({ n: 3 }));
      expect(b.prepare("SELECT name FROM item").all()).toEqual([expect.objectContaining({ name: "월세" })]);
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
