// SQLite 저장소 (node:sqlite, 파일 하나). 운영에서는 PVC 위 /data/moneylog.db.
// 스키마 변경은 MIGRATIONS 끝에 붙이고 PRAGMA user_version 으로 어디까지 적용했는지 센다.
import { DatabaseSync } from "node:sqlite";
import { BALANCE_KINDS } from "../core/types.ts";
import type { SpendPart } from "../core/types.ts";
import type { Account, Balance, BalanceInput, BalanceKind, Deposit, DepositInput, Item, ItemInput, Override, Settings, Spend, SpendCategory, SpendInput } from "../core/types.ts";

export type Db = DatabaseSync;

const MIGRATIONS = [
  `
  CREATE TABLE account (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    memo TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE item (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES account(id),
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    variable INTEGER NOT NULL DEFAULT 0,
    cycle TEXT NOT NULL,
    day INTEGER,
    month INTEGER,
    start_month TEXT,
    end_month TEXT,
    memo TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE override (
    item_id INTEGER NOT NULL REFERENCES item(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    amount INTEGER NOT NULL,
    PRIMARY KEY (item_id, period)
  );
  CREATE TABLE setting (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  INSERT INTO account (name, sort) VALUES ('생활비', 0), ('대출·고지서', 1), ('고정 지출', 2);
  INSERT INTO setting (key, value) VALUES ('startDay', '1');
  `,
  `
  CREATE TABLE deposit (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES account(id),
    period TEXT NOT NULL,
    date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    memo TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX deposit_period ON deposit (period);
  CREATE TABLE balance (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    memo TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE spend (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT,
    amount INTEGER NOT NULL,
    category TEXT NOT NULL,
    merchant TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    ref TEXT UNIQUE
  );
  CREATE INDEX spend_date ON spend (date);
  `,
  `
  ALTER TABLE item ADD COLUMN living INTEGER NOT NULL DEFAULT 0;
  `,
  `
  CREATE TABLE budget (period TEXT PRIMARY KEY, amount INTEGER NOT NULL);
  `,
  `
  CREATE TABLE spend_part (
    id INTEGER PRIMARY KEY,
    spend_id INTEGER NOT NULL REFERENCES spend(id) ON DELETE CASCADE,
    sort INTEGER NOT NULL,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    category TEXT NOT NULL
  );
  CREATE INDEX spend_part_spend ON spend_part (spend_id);
  `,
];

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return db;
}

type Row = Record<string, unknown>;

const toAccount = (r: Row): Account => ({
  id: Number(r.id),
  name: String(r.name),
  memo: String(r.memo),
  sort: Number(r.sort),
});

const toItem = (r: Row): Item => ({
  id: Number(r.id),
  accountId: Number(r.account_id),
  name: String(r.name),
  amount: Number(r.amount),
  variable: r.variable === 1,
  cycle: r.cycle === "yearly" ? "yearly" : "monthly",
  day: r.day == null ? null : Number(r.day),
  month: r.month == null ? null : Number(r.month),
  startMonth: r.start_month == null ? null : String(r.start_month),
  endMonth: r.end_month == null ? null : String(r.end_month),
  memo: String(r.memo),
  living: r.living === 1,
});

export function listAccounts(db: Db): Account[] {
  return (db.prepare("SELECT * FROM account ORDER BY sort, id").all() as Row[]).map(toAccount);
}

export function getAccount(db: Db, id: number): Account | null {
  const r = db.prepare("SELECT * FROM account WHERE id = ?").get(id) as Row | undefined;
  return r ? toAccount(r) : null;
}

export function createAccount(db: Db, name: string, memo: string): Account {
  const sort = (db.prepare("SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM account").get() as { s: number }).s;
  const r = db.prepare("INSERT INTO account (name, memo, sort) VALUES (?, ?, ?)").run(name, memo, sort);
  return getAccount(db, Number(r.lastInsertRowid))!;
}

export function updateAccount(db: Db, id: number, name: string, memo: string): Account | null {
  db.prepare("UPDATE account SET name = ?, memo = ? WHERE id = ?").run(name, memo, id);
  return getAccount(db, id);
}

export function countItems(db: Db, accountId: number): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM item WHERE account_id = ?").get(accountId) as { n: number }).n;
}

export function countDeposits(db: Db, accountId: number): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM deposit WHERE account_id = ?").get(accountId) as { n: number }).n;
}

export function deleteAccount(db: Db, id: number): boolean {
  return db.prepare("DELETE FROM account WHERE id = ?").run(id).changes > 0;
}

export function listItems(db: Db): Item[] {
  return (db.prepare("SELECT * FROM item ORDER BY id").all() as Row[]).map(toItem);
}

export function getItem(db: Db, id: number): Item | null {
  const r = db.prepare("SELECT * FROM item WHERE id = ?").get(id) as Row | undefined;
  return r ? toItem(r) : null;
}

const itemParams = (it: ItemInput) =>
  [it.accountId, it.name, it.amount, it.variable ? 1 : 0, it.cycle, it.day, it.month, it.startMonth, it.endMonth, it.memo, it.living ? 1 : 0] as const;

export function createItem(db: Db, it: ItemInput): Item {
  const r = db
    .prepare(
      `INSERT INTO item (account_id, name, amount, variable, cycle, day, month, start_month, end_month, memo, living)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(...itemParams(it));
  return getItem(db, Number(r.lastInsertRowid))!;
}

export function updateItem(db: Db, id: number, it: ItemInput): Item | null {
  db.prepare(
    `UPDATE item SET account_id = ?, name = ?, amount = ?, variable = ?, cycle = ?, day = ?, month = ?,
       start_month = ?, end_month = ?, memo = ?, living = ? WHERE id = ?`,
  ).run(...itemParams(it), id);
  return getItem(db, id);
}

export function deleteItem(db: Db, id: number): boolean {
  return db.prepare("DELETE FROM item WHERE id = ?").run(id).changes > 0;
}

export function listOverrides(db: Db, period: string): Override[] {
  return (db.prepare("SELECT * FROM override WHERE period = ?").all(period) as Row[]).map((r) => ({
    itemId: Number(r.item_id),
    period: String(r.period),
    amount: Number(r.amount),
  }));
}

export function setOverride(db: Db, o: Override): void {
  db.prepare(
    "INSERT INTO override (item_id, period, amount) VALUES (?, ?, ?) ON CONFLICT (item_id, period) DO UPDATE SET amount = excluded.amount",
  ).run(o.itemId, o.period, o.amount);
}

export function deleteOverride(db: Db, itemId: number, period: string): void {
  db.prepare("DELETE FROM override WHERE item_id = ? AND period = ?").run(itemId, period);
}

export function getSettings(db: Db): Settings {
  const r = db.prepare("SELECT value FROM setting WHERE key = 'startDay'").get() as { value: string } | undefined;
  return { startDay: r ? Number(r.value) : 1 };
}

export function setSettings(db: Db, s: Settings): void {
  db.prepare(
    "INSERT INTO setting (key, value) VALUES ('startDay', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  ).run(String(s.startDay));
}

const toDeposit = (r: Row): Deposit => ({
  id: Number(r.id),
  accountId: Number(r.account_id),
  period: String(r.period),
  date: String(r.date),
  amount: Number(r.amount),
  memo: String(r.memo),
});

export function listDeposits(db: Db, period: string): Deposit[] {
  return (db.prepare("SELECT * FROM deposit WHERE period = ? ORDER BY date, id").all(period) as Row[]).map(toDeposit);
}

export function getDeposit(db: Db, id: number): Deposit | null {
  const r = db.prepare("SELECT * FROM deposit WHERE id = ?").get(id) as Row | undefined;
  return r ? toDeposit(r) : null;
}

export function createDeposit(db: Db, d: DepositInput): Deposit {
  const r = db
    .prepare("INSERT INTO deposit (account_id, period, date, amount, memo) VALUES (?, ?, ?, ?, ?)")
    .run(d.accountId, d.period, d.date, d.amount, d.memo);
  return getDeposit(db, Number(r.lastInsertRowid))!;
}

export function updateDeposit(db: Db, id: number, d: DepositInput): Deposit | null {
  db.prepare("UPDATE deposit SET account_id = ?, period = ?, date = ?, amount = ?, memo = ? WHERE id = ?").run(
    d.accountId,
    d.period,
    d.date,
    d.amount,
    d.memo,
    id,
  );
  return getDeposit(db, id);
}

export function deleteDeposit(db: Db, id: number): boolean {
  return db.prepare("DELETE FROM deposit WHERE id = ?").run(id).changes > 0;
}

const toBalance = (r: Row): Balance => ({
  id: Number(r.id),
  kind: (BALANCE_KINDS as string[]).includes(String(r.kind)) ? (r.kind as BalanceKind) : "stock",
  name: String(r.name),
  amount: Number(r.amount),
  memo: String(r.memo),
  updatedAt: String(r.updated_at),
});

export function listBalances(db: Db): Balance[] {
  return (db.prepare("SELECT * FROM balance ORDER BY id").all() as Row[]).map(toBalance);
}

export function getBalance(db: Db, id: number): Balance | null {
  const r = db.prepare("SELECT * FROM balance WHERE id = ?").get(id) as Row | undefined;
  return r ? toBalance(r) : null;
}

export function createBalance(db: Db, b: BalanceInput, today: string): Balance {
  const r = db
    .prepare("INSERT INTO balance (kind, name, amount, memo, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(b.kind, b.name, b.amount, b.memo, today);
  return getBalance(db, Number(r.lastInsertRowid))!;
}

/** 금액이 바뀔 때만 기준일을 오늘로 옮긴다 (이름·메모만 고치면 그대로) */
export function updateBalance(db: Db, id: number, b: BalanceInput, today: string): Balance | null {
  db.prepare(
    `UPDATE balance SET kind = ?, name = ?, memo = ?,
       updated_at = CASE WHEN amount = ? THEN updated_at ELSE ? END, amount = ? WHERE id = ?`,
  ).run(b.kind, b.name, b.memo, b.amount, today, b.amount, id);
  return getBalance(db, id);
}

export function deleteBalance(db: Db, id: number): boolean {
  return db.prepare("DELETE FROM balance WHERE id = ?").run(id).changes > 0;
}

const toSpend = (r: Row): Spend => ({
  id: Number(r.id),
  date: String(r.date),
  time: r.time == null ? null : String(r.time),
  amount: Number(r.amount),
  category: String(r.category) as SpendCategory,
  merchant: String(r.merchant),
  source: String(r.source),
  ref: r.ref == null ? null : String(r.ref),
  parts: [],
});

const toPart = (r: Row): SpendPart => ({ name: String(r.name), amount: Number(r.amount), category: String(r.category) as SpendCategory });

export function listSpends(db: Db, start: string, end: string): Spend[] {
  const spends = (db.prepare("SELECT * FROM spend WHERE date BETWEEN ? AND ? ORDER BY date, time, id").all(start, end) as Row[]).map(toSpend);
  const byId = new Map(spends.map((s) => [s.id, s]));
  const parts = db
    .prepare(
      `SELECT p.* FROM spend_part p JOIN spend s ON s.id = p.spend_id
       WHERE s.date BETWEEN ? AND ? ORDER BY p.spend_id, p.sort`,
    )
    .all(start, end) as Row[];
  for (const p of parts) byId.get(Number(p.spend_id))?.parts.push(toPart(p));
  return spends;
}

export function getSpend(db: Db, id: number): Spend | null {
  const r = db.prepare("SELECT * FROM spend WHERE id = ?").get(id) as Row | undefined;
  if (!r) return null;
  const s = toSpend(r);
  s.parts = (db.prepare("SELECT * FROM spend_part WHERE spend_id = ? ORDER BY sort").all(id) as Row[]).map(toPart);
  return s;
}

/** 결제 하나의 품목을 통째로 바꾼다 (빈 목록이면 지운다) */
export function setSpendParts(db: Db, id: number, parts: SpendPart[]): void {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM spend_part WHERE spend_id = ?").run(id);
    const ins = db.prepare("INSERT INTO spend_part (spend_id, sort, name, amount, category) VALUES (?, ?, ?, ?, ?)");
    parts.forEach((p, i) => ins.run(id, i, p.name, p.amount, p.category));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** 같은 ref 가 이미 있으면 null (두 번 넣지 않는다) */
export function createSpend(db: Db, s: SpendInput): Spend | null {
  const r = db
    .prepare(
      "INSERT INTO spend (date, time, amount, category, merchant, source, ref) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (ref) DO NOTHING",
    )
    .run(s.date, s.time, s.amount, s.category, s.merchant, s.source, s.ref);
  if (r.changes === 0) return null;
  return toSpend(db.prepare("SELECT * FROM spend WHERE id = ?").get(Number(r.lastInsertRowid)) as Row);
}

export function deleteSpend(db: Db, id: number): boolean {
  return db.prepare("DELETE FROM spend WHERE id = ?").run(id).changes > 0;
}

/** 기간 하나의 생활비 예정액 (모든 통장 합계). 없으면 null */
export function getBudget(db: Db, period: string): number | null {
  const r = db.prepare("SELECT amount FROM budget WHERE period = ?").get(period) as { amount: number } | undefined;
  return r ? Number(r.amount) : null;
}

export function setBudget(db: Db, period: string, amount: number): void {
  db.prepare("INSERT INTO budget (period, amount) VALUES (?, ?) ON CONFLICT (period) DO UPDATE SET amount = excluded.amount").run(period, amount);
}

export function deleteBudget(db: Db, period: string): void {
  db.prepare("DELETE FROM budget WHERE period = ?").run(period);
}
