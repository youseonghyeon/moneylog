import type { BalanceKind } from "../core/types.ts";

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 2026-10-25 → 10.25 */
export const shortDate = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;

/** 달력 칸 금액: 휴대폰 칸 폭에 맞게 10만 이상은 "13.5만" (정확한 금액은 날을 눌러 본다) */
export const calAmount = (n: number) =>
  Math.abs(n) >= 100_000 ? `${(Math.round(n / 1_000) / 10).toLocaleString("ko-KR")}만` : n.toLocaleString("ko-KR");

/** 2026-10-27 + n일 → YYYY-MM-DD */
export function addDays(d: string, n: number): string {
  const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n));
  return t.toISOString().slice(0, 10);
}

/** 2026-10-27 → 10.27 (화) */
export const dayText = (d: string) =>
  `${shortDate(d)} (${"일월화수목금토"[new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))).getUTCDay()]})`;

/** 올해면 10.25, 아니면 2025.10.25 (잔액 기준일처럼 오래 묵을 수 있는 날짜) */
export const dateText = (d: string) =>
  d.slice(0, 4) === todayStr().slice(0, 4) ? shortDate(d) : `${d.slice(0, 4)}.${shortDate(d)}`;

export const KIND_NAMES: Record<BalanceKind, string> = { stock: "주식", saving: "적금", loan: "대출" };

/** 2026-10 → 2026년 10월 */
export const labelText = (label: string) => `${label.slice(0, 4)}년 ${Number(label.slice(5, 7))}월`;

/** 오늘 (브라우저 시간대) YYYY-MM-DD */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
