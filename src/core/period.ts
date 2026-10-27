// 기간 계산. 기간 이름(YYYY-MM)은 기간이 시작하는 달이다.
// startDay 가 1 이면 달력 월, 25 면 그달 25일 ~ 다음 달 24일 (월급일에 계좌를 나누는 경우).
import type { Item, Period } from "./types.ts";

const pad = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 넘치는 달은 연도로 넘긴다: (2026, 13) → (2027, 1) */
function norm(y: number, m: number): [number, number] {
  const i = y * 12 + (m - 1);
  return [Math.floor(i / 12), (i % 12) + 1];
}

export function dateStr(y: number, m: number, d: number): string {
  const [ny, nm] = norm(y, m);
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}

export function parseLabel(label: string): [number, number] {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (!m) throw new Error(`기간 형식이 아닙니다: ${label} (YYYY-MM)`);
  return [Number(m[1]), Number(m[2])];
}

export function isLabel(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function shiftLabel(label: string, delta: number): string {
  const [y, m] = parseLabel(label);
  const [ny, nm] = norm(y, m + delta);
  return `${ny}-${pad(nm)}`;
}

export function periodOf(label: string, startDay: number): Period {
  const [y, m] = parseLabel(label);
  const [ny, nm] = norm(y, m + 1);
  const next = new Date(Date.UTC(ny, nm - 1, startDay));
  next.setUTCDate(next.getUTCDate() - 1);
  return {
    label,
    start: dateStr(y, m, startDay),
    end: dateStr(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()),
  };
}

/** 오늘(YYYY-MM-DD)이 속한 기간 이름 */
export function labelOf(today: string, startDay: number): string {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  return d >= startDay ? `${y}-${pad(m)}` : shiftLabel(`${y}-${pad(m)}`, -1);
}

/** 이 기간에 항목이 나가는 날. 안 나가면 null */
export function dueIn(item: Item, period: Period, startDay: number): string | null {
  const [y, m] = parseLabel(period.label);
  const day = item.day ?? startDay;
  let due: string | null = null;
  if (item.cycle === "monthly") {
    // 기간 시작일보다 앞선 날은 다음 달 쪽에 있다 (25일 시작이면 10일은 다음 달 10일)
    due = day >= startDay ? dateStr(y, m, day) : dateStr(y, m + 1, day);
  } else if (item.month != null) {
    for (const year of [y, y + 1]) {
      const d = dateStr(year, item.month, day);
      if (d >= period.start && d <= period.end) due = d;
    }
  }
  if (!due) return null;
  // 시작·종료 달은 실제로 나가는 날의 달 기준
  const dueMonth = due.slice(0, 7);
  if (item.startMonth && dueMonth < item.startMonth) return null;
  if (item.endMonth && dueMonth > item.endMonth) return null;
  return due;
}
