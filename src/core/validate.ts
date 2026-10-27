// API 입력 검사. 실패 문구는 화면에 그대로 보이므로 "무엇이 잘못됐고 어떻게 고치나" 를 담는다.
import { isDate, isLabel } from "./period.ts";
import { BALANCE_KINDS, SPEND_CATEGORIES } from "./types.ts";
import type { BalanceInput, BalanceKind, DepositInput, ItemInput, SpendCategory, SpendInput } from "./types.ts";

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
      living: b.living === true,
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
  if (!BALANCE_KINDS.includes(b.kind as BalanceKind)) return fail("종류는 stock(주식)·saving(적금)·deposit(보증금)·loan(대출) 중에서 골라 주세요.");
  const name = checkName(b.name);
  if (!name.ok) return name;
  const amount = checkAmount(b.amount);
  if (!amount.ok) return amount;
  return { ok: true, value: { kind: b.kind as BalanceKind, name: name.value, amount: amount.value, memo: memoOf(b.memo) } };
}

export function checkSpend(body: unknown): Checked<SpendInput> {
  if (typeof body !== "object" || body === null) return fail("요청 본문이 JSON 객체가 아닙니다.");
  const b = body as Record<string, unknown>;
  if (!isDate(b.date)) return fail("거래 날짜는 YYYY-MM-DD 로 넣어 주세요.");
  const time = b.time ?? null;
  if (time !== null && !(typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return fail("거래 시각은 HH:MM 으로 넣거나 비워 두세요.");
  // 환불·취소는 음수로 받는다
  if (!isInt(b.amount, -MAX_AMOUNT, MAX_AMOUNT) || b.amount === 0) return fail("금액은 0 이 아닌 정수(원)로 넣어 주세요. 환불·취소는 음수.");
  if (!SPEND_CATEGORIES.includes(b.category as SpendCategory)) return fail(`분류는 ${SPEND_CATEGORIES.join("·")} 중 하나로 넣어 주세요.`);
  const merchant = checkName(b.merchant);
  if (!merchant.ok) return fail("가맹점(어디서 썼나)을 50자 이하로 넣어 주세요.");
  const source = typeof b.source === "string" ? b.source.trim().slice(0, 30) : "";
  const ref = typeof b.ref === "string" && b.ref.trim() ? b.ref.trim().slice(0, 100) : null;
  return {
    ok: true,
    value: { date: b.date, time, amount: b.amount, category: b.category as SpendCategory, merchant: merchant.value, source, ref },
  };
}
