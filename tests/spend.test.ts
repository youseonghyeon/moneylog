import { describe, expect, it } from "vitest";
import { periodOf } from "../src/core/period.ts";
import { budgetLeft, summarizeSpends } from "../src/core/spend.ts";
import { calAmount } from "../src/app/format.ts";
import type { Spend } from "../src/core/types.ts";

const p = periodOf("2026-10", 20); // 10.20 ~ 11.19
let id = 0;
const s = (date: string, amount: number, category: Spend["category"], time: string | null = null): Spend =>
  ({ id: ++id, date, time, amount, category, merchant: "m", source: "", ref: null });
const spends = [
  s("2026-10-20", 9600, "식비", "12:05"),
  s("2026-10-20", 3300, "카페·간식", "09:35"),
  s("2026-10-21", 15900, "식비"),
  s("2026-10-22", 50000, "쇼핑"),
  s("2026-10-22", -20000, "쇼핑"),
  s("2026-10-19", 999, "식비"), // 앞 기간
];

describe("summarizeSpends", () => {
  it("기간 안만, 분류는 큰 것부터, 날짜는 최근부터·같은 날은 늦은 시각부터", () => {
    const r = summarizeSpends(spends, p, "2026-10-22");
    expect(r.total).toBe(58_800);
    expect(r.byCategory).toEqual([
      { category: "쇼핑", total: 30_000 },
      { category: "식비", total: 25_500 },
      { category: "카페·간식", total: 3_300 },
    ]);
    expect(r.days.map((d) => [d.date, d.total])).toEqual([
      ["2026-10-22", 30_000],
      ["2026-10-21", 15_900],
      ["2026-10-20", 12_900],
    ]);
    expect(r.days[2]!.spends.map((x) => x.time)).toEqual(["12:05", "09:35"]);
    expect([r.daysElapsed, r.dailyAvg]).toEqual([3, 19_600]);
  });
  it("지난 기간은 기간 전체 날 수, 오지 않은 기간은 0", () => {
    expect(summarizeSpends(spends, p, "2026-12-01").daysElapsed).toBe(31);
    expect(summarizeSpends(spends, p, "2026-10-01")).toMatchObject({ daysElapsed: 0, dailyAvg: 0 });
  });
  it("거래가 없으면 0", () => {
    expect(summarizeSpends([], p, "2026-10-22")).toMatchObject({ total: 0, byCategory: [], days: [], dailyAvg: 0 });
  });
});

describe("calAmount (달력 칸)", () => {
  it("10만 미만은 그대로, 이상은 만 단위 소수 한 자리", () => {
    expect([99_999, 100_000, 134_727, 327_300, 1_234_567, -20_000].map(calAmount)).toEqual(["99,999", "10만", "13.5만", "32.7만", "123.5만", "-20,000"]);
  });
});

describe("budgetLeft (생활비 예정액)", () => {
  // 기간 10.20 ~ 11.19 (31일)
  it("오늘 포함 남은 날로 나눈다 — 안 쓰면 하루 사용 가능 금액이 커진다", () => {
    expect(budgetLeft(600_000, 315_520, p, "2026-10-27")).toEqual({ left: 284_480, daysLeft: 24, perDay: 11_853 });
    expect(budgetLeft(600_000, 315_520, p, "2026-10-28").perDay).toBe(12_368);
    expect(budgetLeft(600_000, 0, p, "2026-11-19")).toEqual({ left: 600_000, daysLeft: 1, perDay: 600_000 });
  });
  it("넘게 쓰면 음수·하루 0, 지난 기간은 남은 날 0, 오지 않은 기간은 기간 전체", () => {
    expect(budgetLeft(600_000, 650_000, p, "2026-11-01")).toEqual({ left: -50_000, daysLeft: 19, perDay: 0 });
    expect(budgetLeft(600_000, 100_000, p, "2026-12-01")).toEqual({ left: 500_000, daysLeft: 0, perDay: 0 });
    expect(budgetLeft(600_000, 0, p, "2026-10-01")).toEqual({ left: 600_000, daysLeft: 31, perDay: 19_354 });
  });
});
