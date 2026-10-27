// 기간 하나의 생활비 요약 — 분류별 합계 · 날짜별 합계 · 하루 평균.
import type { Period, Spend, SpendCategory } from "./types.ts";

export interface SpendDay {
  date: string;
  total: number;
  spends: Spend[];
}

export interface SpendSummary {
  total: number;
  /** 큰 분류부터 */
  byCategory: { category: SpendCategory; total: number }[];
  /** 최근 날짜부터 */
  days: SpendDay[];
  /** 기간 시작부터 오늘까지 날 수 (지난 기간이면 기간 전체, 오지 않은 기간이면 0) */
  daysElapsed: number;
  dailyAvg: number;
}

const dayNo = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;

export function summarizeSpends(spends: Spend[], period: Period, today: string): SpendSummary {
  const inPeriod = spends.filter((s) => s.date >= period.start && s.date <= period.end);
  const cat = new Map<SpendCategory, number>();
  const day = new Map<string, Spend[]>();
  for (const s of inPeriod) {
    cat.set(s.category, (cat.get(s.category) ?? 0) + s.amount);
    day.set(s.date, [...(day.get(s.date) ?? []), s]);
  }
  const total = inPeriod.reduce((n, s) => n + s.amount, 0);
  const last = today < period.end ? today : period.end;
  const daysElapsed = today < period.start ? 0 : dayNo(last) - dayNo(period.start) + 1;
  return {
    total,
    byCategory: [...cat].map(([category, t]) => ({ category, total: t })).sort((a, b) => b.total - a.total),
    days: [...day]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, ss]) => ({
        date,
        total: ss.reduce((n, s) => n + s.amount, 0),
        spends: ss.sort((a, b) => (b.time ?? "").localeCompare(a.time ?? "") || b.id - a.id),
      })),
    daysElapsed,
    dailyAvg: daysElapsed ? Math.round(total / daysElapsed) : 0,
  };
}
