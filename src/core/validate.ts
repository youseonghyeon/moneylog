// API 입력 검사. 실패 문구는 화면에 그대로 보이므로 "무엇이 잘못됐고 어떻게 고치나" 를 담는다.
import { isDate, isLabel } from "./period.ts";
import type { DepositInput, BalanceInput, ItemInput } from "./types.ts";

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export const MAX_AMOUNT = 1_000_000_000_000;

export function checkAmount(v: unknown): Checked<number> {
  return isInt(v, 0, MAX_AMOUNT) ? { ok: true, value: v } : fail("금액은 0 이상의 정수(원)로 넣어 주세요.");
}

export function checkName(v: unknown): Checked<string> {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return fail("이름을 넣어 주세요.");
  if (s.length > 50) return fail("이름은 50자 이하로 넣어 주세요.");
  return { ok: true, value: s };
}

export function checkItem(body: unknown): Checked<ItemInput> {
  if (typeof body !== "object" || body === null) return fail("요청 본문이 JSON 객체가 아닙니다.");
  const b = body as Record<string, unknown>;
  const name = checkName(b.name);
  if (!name.ok) return name;
  const amount = checkAmount(b.amount);
  if (!amount.ok) return amount;
  if (!isInt(b.accountId, 1, Number.MAX_SAFE_INTEGER)) return fail("계좌를 골라 주세요.");
  if (b.cycle !== "monthly" && b.cycle !== "yearly") return fail("주기는 매월·매년 중에서 골라 주세요.");
  const day = b.day ?? null;
  if (day !== null && !isInt(day, 1, 31)) return fail("날짜는 1~31 사이로 넣거나 비워 두세요.");
  const month = b.cycle === "yearly" ? (b.month ?? null) : null;
  if (b.cycle === "yearly" && !isInt(month, 1, 12)) return fail("매년 나가는 항목은 몇 월에 나가는지 골라 주세요.");
  const startMonth = b.startMonth || null;
  const endMonth = b.endMonth || null;
  if (startMonth !== null && !isLabel(startMonth)) return fail("시작 달은 YYYY-MM 형식으로 넣어 주세요.");
  if (endMonth !== null && !isLabel(endMonth)) return fail("종료 달은 YYYY-MM 형식으로 넣어 주세요.");
  if (startMonth && endMonth && startMonth > endMonth) return fail("종료 달이 시작 달보다 앞섭니다. 두 달을 확인해 주세요.");
  const memo = typeof b.memo === "string" ? b.memo.trim().slice(0, 200) : "";
  return {
    ok: true,
    value: {
      accountId: b.accountId,
      name: name.value,
      amount: amount.value,
      variable: b.variable === true,
      cycle: b.cycle,
      day,
      month: month as number | null,
      startMonth,
      endMonth,
      memo,
    },
  };
}

const memoOf = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");

export function checkDeposit(body: unknown): Checked<DepositInput> {
  if (typeof body !== "object" || body === null) return fail("요청 본문이 JSON 객체가 아닙니다.");
  const b = body as Record<string, unknown>;
  if (!isInt(b.accountId, 1, Number.MAX_SAFE_INTEGER)) return fail("계좌를 골라 주세요.");
  if (!isLabel(b.period)) return fail("기간은 YYYY-MM 형식이어야 합니다.");
  if (!isDate(b.date)) return fail("넣은 날을 골라 주세요 (YYYY-MM-DD).");
  const amount = checkAmount(b.amount);
  if (!amount.ok) return amount;
  if (amount.value === 0) return fail("넣은 금액을 넣어 주세요 (0원은 받지 않습니다).");
  return { ok: true, value: { accountId: b.accountId, period: b.period, date: b.date, amount: amount.value, memo: memoOf(b.memo) } };
}

export function checkBalance(body: unknown): Checked<BalanceInput> {
  if (typeof body !== "object" || body === null) return fail("요청 본문이 JSON 객체가 아닙니다.");
  const b = body as Record<string, unknown>;
  if (b.kind !== "stock" && b.kind !== "saving" && b.kind !== "loan") return fail("종류는 주식·적금·대출 중에서 골라 주세요.");
  const name = checkName(b.name);
  if (!name.ok) return name;
  const amount = checkAmount(b.amount);
  if (!amount.ok) return amount;
  return { ok: true, value: { kind: b.kind, name: name.value, amount: amount.value, memo: memoOf(b.memo) } };
}
