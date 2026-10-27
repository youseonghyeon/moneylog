// 주식·적금·대출 잔액 추가·수정. 추적 없이 지금 얼마인지만 적어 둔다.
import { useState } from "preact/hooks";
import type { Balance, BalanceKind } from "../core/types.ts";
import { api } from "./api.ts";
import { digits, KIND_NAMES, withCommas } from "./format.ts";
import { Sheet } from "./Sheet.tsx";

const PLACEHOLDER: Record<BalanceKind, string> = { stock: "예: 토스증권", saving: "예: 신한 적금", loan: "예: 전세대출" };

export function BalanceSheet(p: { balance: Balance | null; kind: BalanceKind; onDone: () => void; onClose: () => void }) {
  const b = p.balance;
  const [kind, setKind] = useState<BalanceKind>(b?.kind ?? p.kind);
  const [name, setName] = useState(b?.name ?? "");
  const [amount, setAmount] = useState(b ? withCommas(String(b.amount)) : "");
  const [memo, setMemo] = useState(b?.memo ?? "");
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
    const input = { kind, name, amount: digits(amount) ? Number(digits(amount)) : NaN, memo };
    run(() => (b ? api.updateBalance(b.id, input) : api.createBalance(input)));
  }

  function remove() {
    if (!b || !confirm(`"${b.name}" 을(를) 지울까요?`)) return;
    run(() => api.deleteBalance(b.id));
  }

  return (
    <Sheet title={b ? `${KIND_NAMES[kind]} 수정` : `${KIND_NAMES[kind]} 추가`} onClose={p.onClose}>
      <form class="form" onSubmit={save}>
        <div class="field">
          <span>종류</span>
          <div class="seg" role="radiogroup">
            {(["stock", "saving", "loan"] as const).map((k) => (
              <button type="button" role="radio" aria-checked={kind === k} class={kind === k ? "on" : ""} onClick={() => setKind(k)}>
                {KIND_NAMES[k]}
              </button>
            ))}
          </div>
        </div>
        <label class="field">
          <span>이름</span>
          <input value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder={PLACEHOLDER[kind]} maxLength={50} autoFocus={!b} />
        </label>
        <label class="field">
          <span>{kind === "loan" ? "남은 원금" : "들어 있는 금액"}</span>
          <div class="money">
            <input inputMode="numeric" value={amount} onInput={(e) => setAmount(withCommas(e.currentTarget.value))} placeholder="0" />
            <span>원</span>
          </div>
        </label>
        <label class="field">
          <span>메모</span>
          <input
            value={memo}
            onInput={(e) => setMemo(e.currentTarget.value)}
            placeholder={kind === "loan" ? "예: 금리 4.1%, 2028-03 만기" : kind === "saving" ? "예: 2027-06 만기" : ""}
            maxLength={200}
          />
        </label>
        {kind !== "stock" && <p class="hint">매달 내는 이자·납입금은 계좌에 항목으로 넣어야 필요한 돈에 더해집니다.</p>}
        {error && (
          <p class="error" role="alert">
            {error}
          </p>
        )}
        <footer class="actions">
          {b && (
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
