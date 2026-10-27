import type { BalanceKind, Item } from "../core/types.ts";

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 2026-10-25 → 10.25 */
export const shortDate = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;

/** 2026-10-27 → 10.27 (화) */
export const dayText = (d: string) =>
  `${shortDate(d)} (${"일월화수목금토"[new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))).getUTCDay()]})`;

/** 올해면 10.25, 아니면 2025.10.25 (잔액 기준일처럼 오래 묵을 수 있는 날짜) */
export const dateText = (d: string) =>
  d.slice(0, 4) === todayStr().slice(0, 4) ? shortDate(d) : `${d.slice(0, 4)}.${shortDate(d)}`;

/** 넣은 돈 − 나갈 돈 → "남음 …" / "부족 …" */
export const leftText = (left: number) => (left < 0 ? `부족 ${won(-left)}` : `남음 ${won(left)}`);

export const KIND_NAMES: Record<BalanceKind, string> = { stock: "주식", saving: "적금", loan: "대출" };

/** 2026-10 → 2026년 10월 */
export const labelText = (label: string) => `${label.slice(0, 4)}년 ${Number(label.slice(5, 7))}월`;

/** 오늘 (브라우저 시간대) YYYY-MM-DD */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 항목이 언제 나가는지 한 줄 (이번 기간에 안 나가는 항목 목록용) */
export function scheduleText(it: Item): string {
  const day = it.day ? `${it.day}일` : "날짜 미정";
  const when = it.cycle === "yearly" ? `매년 ${it.month}월 ${day}` : `매월 ${day}`;
  const range = [it.startMonth && `${it.startMonth}부터`, it.endMonth && `${it.endMonth}까지`].filter(Boolean).join(" ");
  return range ? `${when} · ${range}` : when;
}
