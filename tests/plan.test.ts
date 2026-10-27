import { describe, expect, it } from "vitest";
import { buildPlan } from "../src/core/plan.ts";
import type { Account, Item } from "../src/core/types.ts";

const accounts: Account[] = [
  { id: 2, name: "대출·고지서", memo: "", sort: 1 },
  { id: 1, name: "생활비", memo: "", sort: 0 },
];
const base = { variable: false, cycle: "monthly" as const, month: null, startMonth: null, endMonth: null, memo: "", living: false };
const items: Item[] = [
  { ...base, id: 1, accountId: 1, name: "식비", amount: 600_000, day: null },
  { ...base, id: 2, accountId: 2, name: "전기", amount: 50_000, day: 20, variable: true },
  { ...base, id: 3, accountId: 2, name: "대출 이자", amount: 320_000, day: 5 },
  { ...base, id: 4, accountId: 2, name: "자동차보험", amount: 900_000, day: 3, cycle: "yearly", month: 3 },
];

describe("buildPlan", () => {
  it("계좌 순서·날짜 순, 계좌별·전체 합계", () => {
    const p = buildPlan("2026-10", 1, accounts, items, []);
    expect(p.accounts.map((a) => a.account.name)).toEqual(["생활비", "대출·고지서"]);
    expect(p.accounts[1]!.lines.map((l) => l.item.name)).toEqual(["대출 이자", "전기"]);
    expect(p.accounts.map((a) => a.total)).toEqual([600_000, 370_000]);
    expect(p.total).toBe(970_000);
  });
  it("매년 항목은 그 달에만 더한다", () => {
    expect(buildPlan("2027-03", 1, accounts, items, []).accounts[1]!.total).toBe(1_270_000);
  });
  it("실제 금액은 그 기간에만, 변동 항목은 실제 금액 전까지 예상", () => {
    const o = [{ itemId: 2, period: "2026-10", amount: 61_230 }];
    const oct = buildPlan("2026-10", 1, accounts, items, o).accounts[1]!.lines.find((l) => l.item.id === 2)!;
    expect(oct).toMatchObject({ amount: 61_230, estimated: false });
    const nov = buildPlan("2026-11", 1, accounts, items, o).accounts[1]!.lines.find((l) => l.item.id === 2)!;
    expect(nov).toMatchObject({ amount: 50_000, estimated: true });
  });
  it("항목 없는 계좌도 0원으로 나온다", () => {
    const p = buildPlan("2026-10", 1, [...accounts, { id: 3, name: "비상금", memo: "", sort: 2 }], items, []);
    expect(p.accounts[2]).toMatchObject({ total: 0, lines: [] });
  });
  it("입금은 그 기간·그 계좌에만, 넣은 날 순", () => {
    const d = (id: number, accountId: number, period: string, date: string, amount: number) =>
      ({ id, accountId, period, date, amount, memo: "" });
    const ds = [d(1, 1, "2026-10", "2026-10-26", 100_000), d(2, 1, "2026-10", "2026-10-25", 800_000), d(3, 2, "2026-10", "2026-10-25", 400_000), d(4, 1, "2026-11", "2026-11-25", 1)];
    const p = buildPlan("2026-10", 25, accounts, items, [], ds);
    expect(p.accounts[0]!.deposits.map((x) => x.id)).toEqual([2, 1]);
    expect(p.accounts.map((a) => a.deposited)).toEqual([900_000, 400_000]);
    expect(p.deposited).toBe(1_300_000);
    expect(buildPlan("2026-10", 25, accounts, items, []).deposited).toBe(0);
  });
});
