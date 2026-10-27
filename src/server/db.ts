// SQLite 저장소 (node:sqlite, 파일 하나). 운영에서는 PVC 위 /data/moneylog.db.
// 스키마 변경은 MIGRATIONS 끝에 붙이고 PRAGMA user_version 으로 어디까지 적용했는지 센다.
import { DatabaseSync } from "node:sqlite";
import type { Account, Item, ItemInput, Override, Settings } from "../core/types.ts";

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
  [it.accountId, it.name, it.amount, it.variable ? 1 : 0, it.cycle, it.day, it.month, it.startMonth, it.endMonth, it.memo] as const;

export function createItem(db: Db, it: ItemInput): Item {
  const r = db
    .prepare(
      `INSERT INTO item (account_id, name, amount, variable, cycle, day, month, start_month, end_month, memo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(...itemParams(it));
  return getItem(db, Number(r.lastInsertRowid))!;
}

export function updateItem(db: Db, id: number, it: ItemInput): Item | null {
  db.prepare(
    `UPDATE item SET account_id = ?, name = ?, amount = ?, variable = ?, cycle = ?, day = ?, month = ?,
       start_month = ?, end_month = ?, memo = ? WHERE id = ?`,
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
