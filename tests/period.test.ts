import { describe, expect, it } from "vitest";
import { dueIn, labelOf, periodOf, shiftLabel } from "../src/core/period.ts";
import type { Item } from "../src/core/types.ts";

const item = (p: Partial<Item>): Item => ({
  id: 1,
  accountId: 1,
  name: "x",
  amount: 1000,
  variable: false,
  cycle: "monthly",
  day: 1,
  month: null,
  startMonth: null,
  endMonth: null,
  memo: "",
  ...p,
});

describe("periodOf", () => {
  it("startDay 1 은 달력 월", () => {
    expect(periodOf("2026-10", 1)).toEqual({ label: "2026-10", start: "2026-10-01", end: "2026-10-31" });
    expect(periodOf("2026-02", 1).end).toBe("2026-02-28");
    expect(periodOf("2028-02", 1).end).toBe("2028-02-29");
  });
  it("월급일 기준은 다음 달 전날까지, 연말을 넘긴다", () => {
    expect(periodOf("2026-12", 25)).toEqual({ label: "2026-12", start: "2026-12-25", end: "2027-01-24" });
    expect(periodOf("2026-01", 28)).toEqual({ label: "2026-01", start: "2026-01-28", end: "2026-02-27" });
  });
});

describe("labelOf · shiftLabel", () => {
  it("오늘이 시작일 전이면 앞 기간", () => {
    expect(labelOf("2026-10-24", 25)).toBe("2026-09");
    expect(labelOf("2026-10-25", 25)).toBe("2026-10");
    expect(labelOf("2026-01-05", 25)).toBe("2025-12");
    expect(labelOf("2026-01-01", 1)).toBe("2026-01");
  });
  it("연도를 넘긴다", () => {
    expect(shiftLabel("2026-12", 1)).toBe("2027-01");
    expect(shiftLabel("2026-01", -1)).toBe("2025-12");
    expect(shiftLabel("2026-05", -17)).toBe("2024-12");
  });
});

describe("dueIn", () => {
  it("31일 항목은 짧은 달에 말일로", () => {
    expect(dueIn(item({ day: 31 }), periodOf("2026-02", 1), 1)).toBe("2026-02-28");
    expect(dueIn(item({ day: 31 }), periodOf("2026-04", 1), 1)).toBe("2026-04-30");
  });
  it("시작일보다 앞선 날은 다음 달 날짜", () => {
    expect(dueIn(item({ day: 10 }), periodOf("2026-10", 25), 25)).toBe("2026-11-10");
    expect(dueIn(item({ day: 27 }), periodOf("2026-10", 25), 25)).toBe("2026-10-27");
  });
  it("날짜 미정은 기간 시작일", () => {
    expect(dueIn(item({ day: null }), periodOf("2026-10", 25), 25)).toBe("2026-10-25");
  });
  it("매월 항목은 어떤 시작일·날짜에서도 기간마다 정확히 한 번, 기간 안에", () => {
    for (let startDay = 1; startDay <= 28; startDay++) {
      for (let day = 1; day <= 31; day++) {
        let prev = "";
        for (let i = 0; i < 26; i++) {
          const p = periodOf(shiftLabel("2026-01", i), startDay);
          const d = dueIn(item({ day }), p, startDay);
          expect(d, `startDay=${startDay} day=${day} ${p.label}`).not.toBeNull();
          expect(d! >= p.start && d! <= p.end, `${d} ∉ ${p.start}~${p.end}`).toBe(true);
          expect(d! > prev).toBe(true);
          prev = d!;
        }
      }
    }
  });
  it("매년 항목은 그 달이 든 기간에만 (연말 넘김 포함)", () => {
    const tax = item({ cycle: "yearly", month: 1, day: 10 });
    expect(dueIn(tax, periodOf("2025-12", 25), 25)).toBe("2026-01-10");
    expect(dueIn(tax, periodOf("2026-01", 25), 25)).toBeNull();
    expect(dueIn(tax, periodOf("2026-01", 1), 1)).toBe("2026-01-10");
    expect(dueIn(tax, periodOf("2026-02", 1), 1)).toBeNull();
    const hits = Array.from({ length: 24 }, (_, i) => dueIn(tax, periodOf(shiftLabel("2026-01", i), 25), 25)).filter(
      Boolean,
    );
    expect(hits).toEqual(["2027-01-10", "2028-01-10"].slice(0, hits.length));
    expect(hits.length).toBe(2);
  });
  it("시작·종료 달은 나가는 날의 달 기준, 양끝 포함", () => {
    const loan = item({ day: 10, startMonth: "2026-11", endMonth: "2027-02" });
    // 25일 시작 2026-10 기간의 10일은 2026-11-10 → 시작 달에 든다
    expect(dueIn(loan, periodOf("2026-10", 25), 25)).toBe("2026-11-10");
    expect(dueIn(loan, periodOf("2026-09", 25), 25)).toBeNull();
    expect(dueIn(loan, periodOf("2027-02", 1), 1)).toBe("2027-02-10");
    expect(dueIn(loan, periodOf("2027-03", 1), 1)).toBeNull();
  });
});
