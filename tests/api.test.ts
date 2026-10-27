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

let today = "2026-10-27";

beforeEach(() => {
  db = openDb(":memory:");
  today = "2026-10-27";
  app = createApp(db, () => today);
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

  it("생활비 예상 표시(living): 기본 false, 넣고 고칠 수 있다", async () => {
    const c = await call("POST", "/api/items", rent);
    expect(c.json.living).toBe(false);
    const l = await call("POST", "/api/items", { ...rent, name: "생활비", living: true });
    expect(l.json.living).toBe(true);
    expect((await call("PUT", `/api/items/${l.json.id}`, { ...rent, name: "생활비", living: false })).json.living).toBe(false);
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

  it("입금: 기간·계좌별 합계, 수정·삭제, 입금 있는 계좌는 못 지운다", async () => {
    await call("POST", "/api/items", { ...rent, accountId: 1, name: "식비", amount: 600_000, day: 1 });
    const dep = { accountId: 1, period: "2026-10", date: "2026-10-24", amount: 800_000, memo: "월급 하루 일찍" };
    const c = await call("POST", "/api/deposits", dep);
    expect(c.status).toBe(201);
    let plan = (await call("GET", "/api/plan?period=2026-10")).json;
    // 넣은 날이 기간 밖(시작 전날)이어도 고른 기간으로 센다
    expect(plan.accounts[0]).toMatchObject({ total: 600_000, deposited: 800_000 });
    expect(plan.accounts[0].deposits[0]).toMatchObject({ date: "2026-10-24", memo: "월급 하루 일찍" });
    expect(plan.deposited).toBe(800_000);
    expect((await call("GET", "/api/plan?period=2026-11")).json.deposited).toBe(0);

    const u = await call("PUT", `/api/deposits/${c.json.id}`, { ...dep, accountId: 2, amount: 500_000 });
    expect(u.json).toMatchObject({ accountId: 2, amount: 500_000 });
    plan = (await call("GET", "/api/plan?period=2026-10")).json;
    expect(plan.accounts.map((a: { deposited: number }) => a.deposited)).toEqual([0, 500_000, 0]);

    const r = await call("DELETE", "/api/accounts/2");
    expect(r.status).toBe(409);
    expect(r.json.error).toMatch(/입금이 1건/);
    expect((await call("DELETE", `/api/deposits/${c.json.id}`)).status).toBe(204);
    expect((await call("DELETE", `/api/deposits/${c.json.id}`)).status).toBe(404);
    expect((await call("DELETE", "/api/accounts/2")).status).toBe(204);
  });

  it("입금 입력 검사", async () => {
    const dep = { accountId: 1, period: "2026-10", date: "2026-10-25", amount: 1 };
    const cases: [unknown, RegExp, number][] = [
      [{ ...dep, amount: 0 }, /0원/, 400],
      [{ ...dep, amount: -5 }, /금액/, 400],
      [{ ...dep, date: "2026-02-30" }, /넣은 날/, 400],
      [{ ...dep, date: "" }, /넣은 날/, 400],
      [{ ...dep, period: "2026-13" }, /기간/, 400],
      [{ ...dep, accountId: 99 }, /계좌/, 400],
      [null, /JSON 객체/, 400],
    ];
    for (const [b, msg, status] of cases) {
      const r = await call("POST", "/api/deposits", b);
      expect(r.status, JSON.stringify(b)).toBe(status);
      expect(r.json.error).toMatch(msg);
    }
    expect((await call("PUT", "/api/deposits/99", dep)).status).toBe(404);
  });

  it("잔액(주식·적금·대출): 금액이 바뀔 때만 기준일이 바뀐다", async () => {
    const c = await call("POST", "/api/balances", { kind: "stock", name: "토스증권", amount: 3_200_000 });
    expect(c.status).toBe(201);
    expect(c.json).toMatchObject({ kind: "stock", memo: "", updatedAt: "2026-10-27" });
    today = "2026-11-03";
    const same = await call("PUT", `/api/balances/${c.json.id}`, { kind: "stock", name: "토스증권 ISA", amount: 3_200_000, memo: "x" });
    expect(same.json).toMatchObject({ name: "토스증권 ISA", memo: "x", updatedAt: "2026-10-27" });
    const changed = await call("PUT", `/api/balances/${c.json.id}`, { kind: "stock", name: "토스증권 ISA", amount: 3_050_000 });
    expect(changed.json).toMatchObject({ amount: 3_050_000, updatedAt: "2026-11-03" });
    await call("POST", "/api/balances", { kind: "loan", name: "전세대출", amount: 120_000_000 });
    expect((await call("GET", "/api/balances")).json.map((b: { kind: string }) => b.kind)).toEqual(["stock", "loan"]);
    expect((await call("POST", "/api/balances", { kind: "cash", name: "a", amount: 1 })).json.error).toMatch(/종류/);
    expect((await call("POST", "/api/balances", { kind: "saving", name: "", amount: 1 })).json.error).toMatch(/이름/);
    expect((await call("DELETE", `/api/balances/${c.json.id}`)).status).toBe(204);
    expect((await call("PUT", `/api/balances/${c.json.id}`, { kind: "stock", name: "a", amount: 1 })).status).toBe(404);
  });

  it("생활비 거래: 기간(시작일 기준)으로 조회, 같은 ref 는 409, 환불은 음수", async () => {
    await call("PUT", "/api/settings", { startDay: 20 });
    const sp = { date: "2026-10-20", time: "12:05", amount: 9600, category: "식비", merchant: "왓더버거", source: "신한카드 신용", ref: "card:1" };
    expect((await call("POST", "/api/spends", sp)).status).toBe(201);
    const dup = await call("POST", "/api/spends", sp);
    expect(dup.status).toBe(409);
    expect(dup.json.error).toMatch(/이미 넣은 거래/);
    await call("POST", "/api/spends", { ...sp, date: "2026-11-19", time: null, amount: -3000, ref: "card:2" });
    await call("POST", "/api/spends", { ...sp, date: "2026-10-19", ref: "card:3" }); // 앞 기간
    await call("POST", "/api/spends", { ...sp, ref: undefined });
    await call("POST", "/api/spends", { ...sp, ref: "" }); // ref 없으면 겹쳐도 넣는다
    const oct = (await call("GET", "/api/spends?period=2026-10")).json;
    expect(oct.map((x: { amount: number }) => x.amount)).toEqual([9600, 9600, 9600, -3000]);
    expect((await call("GET", "/api/spends?period=2026-09")).json).toHaveLength(1);
    expect((await call("GET", "/api/spends")).status).toBe(400);
    expect((await call("DELETE", `/api/spends/${oct[0].id}`)).status).toBe(204);
    expect((await call("DELETE", `/api/spends/${oct[0].id}`)).status).toBe(404);
  });

  it("생활비 예정액: 기간별로 넣고 고치고 지운다", async () => {
    expect((await call("GET", "/api/budget/2026-10")).json).toEqual({ period: "2026-10", amount: null });
    expect((await call("PUT", "/api/budget/2026-10", { amount: 600_000 })).json).toEqual({ period: "2026-10", amount: 600_000 });
    await call("PUT", "/api/budget/2026-10", { amount: 550_000 });
    expect((await call("GET", "/api/budget/2026-10")).json.amount).toBe(550_000);
    expect((await call("GET", "/api/budget/2026-11")).json.amount).toBeNull();
    expect((await call("PUT", "/api/budget/2026-10", { amount: -1 })).status).toBe(400);
    expect((await call("PUT", "/api/budget/2026-1", { amount: 1 })).status).toBe(400);
    expect((await call("DELETE", "/api/budget/2026-10")).status).toBe(204);
    expect((await call("GET", "/api/budget/2026-10")).json.amount).toBeNull();
  });

  it("생활비 거래 입력 검사", async () => {
    const sp = { date: "2026-10-20", amount: 1, category: "식비", merchant: "a" };
    const cases: [unknown, RegExp][] = [
      [{ ...sp, date: "2026-10-32" }, /날짜/],
      [{ ...sp, time: "25:00" }, /시각/],
      [{ ...sp, amount: 0 }, /0 이 아닌/],
      [{ ...sp, amount: 1.5 }, /0 이 아닌/],
      [{ ...sp, category: "술값" }, /분류는/],
      [{ ...sp, merchant: " " }, /가맹점/],
    ];
    for (const [b, msg] of cases) {
      const r = await call("POST", "/api/spends", b);
      expect(r.status, JSON.stringify(b)).toBe(400);
      expect(r.json.error).toMatch(msg);
    }
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

  it("1단계 DB(user_version 1)는 열 때 입금·잔액·거래 테이블이 붙고 기존 데이터는 그대로", async () => {
    const dir = mkdtempSync(join(tmpdir(), "moneylog-"));
    try {
      const path = join(dir, "v1.db");
      const a = openDb(path);
      a.exec("INSERT INTO item (account_id, name, amount, cycle) VALUES (3, '월세', 550000, 'monthly')");
      a.exec("DROP TABLE deposit; DROP TABLE balance; DROP TABLE spend; DROP TABLE budget; ALTER TABLE item DROP COLUMN living; PRAGMA user_version = 1;");
      a.close();
      const b = openDb(path);
      expect(b.prepare("PRAGMA user_version").get()).toEqual({ user_version: 5 });
      expect(b.prepare("SELECT COUNT(*) AS n FROM spend").get()).toEqual(expect.objectContaining({ n: 0 }));
      expect(b.prepare("SELECT COUNT(*) AS n FROM deposit").get()).toEqual(expect.objectContaining({ n: 0 }));
      expect(b.prepare("SELECT COUNT(*) AS n FROM balance").get()).toEqual(expect.objectContaining({ n: 0 }));
      expect(b.prepare("SELECT name FROM item").all()).toEqual([expect.objectContaining({ name: "월세" })]);
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
