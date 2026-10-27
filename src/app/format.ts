import type { Item } from "../core/types.ts";

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 금액 입력칸: 숫자만 남겨 쉼표를 붙인다 */
export const digits = (s: string) => s.replace(/[^\d]/g, "");
export const withCommas = (s: string) => (digits(s) ? Number(digits(s)).toLocaleString("ko-KR") : "");

/** 2026-10-25 → 10.25 */
export const shortDate = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;

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
