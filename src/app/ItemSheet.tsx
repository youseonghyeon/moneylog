// 항목 추가·수정. 변동 항목은 이번 기간 실제 금액도 여기서 넣는다.
import { useState } from "preact/hooks";
import type { Account, Cycle, Item, ItemInput } from "../core/types.ts";
import { api } from "./api.ts";
import { digits, labelText, withCommas } from "./format.ts";
import { Sheet } from "./Sheet.tsx";

export interface ItemSheetProps {
  /** 없으면 새 항목 */
  item: Item | null;
  accounts: Account[];
  defaultAccountId: number;
  period: string;
  /** 이번 기간에 넣어 둔 실제 금액 (없으면 null) */
  actual: number | null;
  onDone: () => void;
  onClose: () => void;
}

export function ItemSheet(p: ItemSheetProps) {
  const it = p.item;
  const [name, setName] = useState(it?.name ?? "");
  const [amount, setAmount] = useState(it ? withCommas(String(it.amount)) : "");
  const [accountId, setAccountId] = useState(it?.accountId ?? p.defaultAccountId);
  const [cycle, setCycle] = useState<Cycle>(it?.cycle ?? "monthly");
  const [month, setMonth] = useState(String(it?.month ?? Number(p.period.slice(5, 7))));
  const [day, setDay] = useState(it?.day ? String(it.day) : "");
  const [variable, setVariable] = useState(it?.variable ?? false);
  const [startMonth, setStartMonth] = useState(it?.startMonth ?? "");
  const [endMonth, setEndMonth] = useState(it?.endMonth ?? "");
  const [memo, setMemo] = useState(it?.memo ?? "");
  const [actual, setActual] = useState(p.actual == null ? "" : withCommas(String(p.actual)));
  const [more, setMore] = useState(Boolean(it?.startMonth || it?.endMonth || it?.memo));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // 새 항목을 만든 뒤 실제 금액 저장이 실패하면 다시 저장할 때 또 만들지 않고 고친다
  const [savedId, setSavedId] = useState(it?.id ?? null);

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
    const input: ItemInput = {
      accountId,
      name,
      amount: digits(amount) ? Number(digits(amount)) : NaN,
      variable,
      cycle,
      day: day ? Number(day) : null,
      month: cycle === "yearly" ? Number(month) : null,
      startMonth: startMonth || null,
      endMonth: endMonth || null,
      memo,
    };
    run(async () => {
      const saved = savedId ? await api.updateItem(savedId, input) : await api.createItem(input);
      setSavedId(saved.id);
      // 변동을 끄면 넣어 둔 실제 금액도 지운다 (남으면 고정 금액 대신 계산된다)
      const a = variable ? digits(actual) : "";
      if (a) await api.setActual(saved.id, p.period, Number(a));
      else if (p.actual != null) await api.clearActual(saved.id, p.period);
    });
  }

  function remove() {
    if (!it || !confirm(`"${it.name}" 항목을 지울까요? 넣어 둔 실제 금액도 같이 지워집니다.`)) return;
    run(() => api.deleteItem(it.id));
  }

  return (
    <Sheet title={it ? "항목 수정" : "항목 추가"} onClose={p.onClose}>
      <form class="form" onSubmit={save}>
        <label class="field">
          <span>이름</span>
          <input value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="예: 월세, 통신비" maxLength={50} autoFocus={!it} />
        </label>
        <label class="field">
          <span>{variable ? "예상 금액" : "금액"}</span>
          <div class="money">
            <input
              inputMode="numeric"
              value={amount}
              onInput={(e) => setAmount(withCommas(e.currentTarget.value))}
              placeholder="0"
            />
            <span>원</span>
          </div>
        </label>
        <label class="check">
          <input type="checkbox" checked={variable} onChange={(e) => setVariable(e.currentTarget.checked)} />
          <span>달마다 금액이 바뀜 (고지서·대출 이자)</span>
        </label>
        {variable && (
          <label class="field">
            <span>{labelText(p.period)} 실제 금액 · 고지서가 오면</span>
            <div class="money">
              <input
                inputMode="numeric"
                value={actual}
                onInput={(e) => setActual(withCommas(e.currentTarget.value))}
                placeholder="비우면 예상 금액으로 계산"
              />
              <span>원</span>
            </div>
          </label>
        )}
        <label class="field">
          <span>계좌</span>
          <select value={accountId} onChange={(e) => setAccountId(Number(e.currentTarget.value))}>
            {p.accounts.map((a) => (
              <option value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <div class="row">
          <div class="field">
            <span>주기</span>
            <div class="seg" role="radiogroup">
              {(["monthly", "yearly"] as const).map((c) => (
                <button type="button" role="radio" aria-checked={cycle === c} class={cycle === c ? "on" : ""} onClick={() => setCycle(c)}>
                  {c === "monthly" ? "매월" : "매년"}
                </button>
              ))}
            </div>
          </div>
          {cycle === "yearly" && (
            <label class="field narrow">
              <span>월</span>
              <select aria-label="월" value={month} onChange={(e) => setMonth(e.currentTarget.value)}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option value={i + 1}>{i + 1}월</option>
                ))}
              </select>
            </label>
          )}
          <label class="field narrow">
            <span>날짜</span>
            <div class="money">
              <input inputMode="numeric" value={day} onInput={(e) => setDay(digits(e.currentTarget.value).slice(0, 2))} placeholder="미정" />
              <span>일</span>
            </div>
          </label>
        </div>
        {more ? (
          <>
            <div class="row">
              <label class="field">
                <span>시작 달</span>
                <input type="month" value={startMonth} onInput={(e) => setStartMonth(e.currentTarget.value)} />
              </label>
              <label class="field">
                <span>종료 달 · 할부·만기</span>
                <input type="month" value={endMonth} onInput={(e) => setEndMonth(e.currentTarget.value)} />
              </label>
            </div>
            <label class="field">
              <span>메모</span>
              <input value={memo} onInput={(e) => setMemo(e.currentTarget.value)} maxLength={200} />
            </label>
          </>
        ) : (
          <button type="button" class="link" onClick={() => setMore(true)}>
            시작·종료 달, 메모
          </button>
        )}
        {error && (
          <p class="error" role="alert">
            {error}
          </p>
        )}
        <footer class="actions">
          {it && (
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
