// 계좌에 넣은 돈 추가·수정. 보고 있는 기간에 묶인다 (넣은 날이 기간 밖이어도 — 월급이 하루 일찍 들어온 경우).
import { useState } from "preact/hooks";
import type { Account, Deposit, Period } from "../core/types.ts";
import { api } from "./api.ts";
import { digits, labelText, todayStr, withCommas } from "./format.ts";
import { Sheet } from "./Sheet.tsx";

export interface DepositSheetProps {
  /** 없으면 새 입금 */
  deposit: Deposit | null;
  accounts: Account[];
  defaultAccountId: number;
  period: Period;
  onDone: () => void;
  onClose: () => void;
}

export function DepositSheet(p: DepositSheetProps) {
  const d = p.deposit;
  const today = todayStr();
  const inPeriod = today >= p.period.start && today <= p.period.end;
  const [accountId, setAccountId] = useState(d?.accountId ?? p.defaultAccountId);
  const [date, setDate] = useState(d?.date ?? (inPeriod ? today : p.period.start));
  const [amount, setAmount] = useState(d ? withCommas(String(d.amount)) : "");
  const [memo, setMemo] = useState(d?.memo ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      p.onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function save(e: Event) {
    e.preventDefault();
    const input = {
      accountId,
      period: d?.period ?? p.period.label,
      date,
      amount: digits(amount) ? Number(digits(amount)) : NaN,
      memo,
    };
    run(() => (d ? api.updateDeposit(d.id, input) : api.createDeposit(input)));
  }

  function remove() {
    if (!d || !confirm("이 입금 기록을 지울까요?")) return;
    run(() => api.deleteDeposit(d.id));
  }

  return (
    <Sheet title={d ? "입금 수정" : "입금"} onClose={p.onClose}>
      <form class="form" onSubmit={save}>
        <p class="hint">{labelText(d?.period ?? p.period.label)} 기간에 넣은 돈으로 셉니다.</p>
        <label class="field">
          <span>계좌</span>
          <select value={accountId} onChange={(e) => setAccountId(Number(e.currentTarget.value))}>
            {p.accounts.map((a) => (
              <option value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <div class="row">
          <label class="field">
            <span>넣은 날</span>
            <input type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
          </label>
          <label class="field">
            <span>금액</span>
            <div class="money">
              <input
                inputMode="numeric"
                value={amount}
                onInput={(e) => setAmount(withCommas(e.currentTarget.value))}
                placeholder="0"
                autoFocus={!d}
              />
              <span>원</span>
            </div>
          </label>
        </div>
        <label class="field">
          <span>메모</span>
          <input value={memo} onInput={(e) => setMemo(e.currentTarget.value)} placeholder="예: 10월 월급" maxLength={200} />
        </label>
        {error && (
          <p class="error" role="alert">
            {error}
          </p>
        )}
        <footer class="actions">
          {d && (
            <button type="button" class="danger" disabled={busy} onClick={remove}>
              삭제
            </button>
          )}
          <span class="grow" />
          <button type="button" onClick={p.onClose}>
            취소
          </button>
          <button type="submit" class="primary" disabled={busy}>
            저장
          </button>
        </footer>
      </form>
    </Sheet>
  );
}
