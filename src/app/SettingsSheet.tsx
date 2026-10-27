// 설정: 기간 시작일(월급일) · 계좌 추가·이름 바꾸기·삭제
import { useState } from "preact/hooks";
import type { Account } from "../core/types.ts";
import { api } from "./api.ts";
import { Sheet } from "./Sheet.tsx";

export function SettingsSheet(p: { startDay: number; accounts: Account[]; onChanged: () => void; onClose: () => void }) {
  const [startDay, setStartDay] = useState(String(p.startDay));
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");

  async function run(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      p.onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Sheet title="설정" onClose={p.onClose}>
      <div class="form">
        <section class="group">
          <h3>기간 시작일</h3>
          <p class="hint">월급일에 계좌를 나눈다면 월급일로 맞추세요. 25일이면 25일 ~ 다음 달 24일을 한 기간으로 계산합니다.</p>
          <div class="row">
            <label class="field narrow">
              <span>매월</span>
              <div class="money">
                <input
                  inputMode="numeric"
                  value={startDay}
                  onInput={(e) => setStartDay(e.currentTarget.value.replace(/[^\d]/g, "").slice(0, 2))}
                />
                <span>일</span>
              </div>
            </label>
            <button
              type="button"
              class="primary align-end"
              disabled={Number(startDay) === p.startDay}
              onClick={() => run(() => api.setSettings({ startDay: Number(startDay) }))}
            >
              적용
            </button>
          </div>
        </section>

        <section class="group">
          <h3>계좌</h3>
          <ul class="account-edit">
            {p.accounts.map((a) => (
              <AccountRow key={a.id} account={a} run={run} />
            ))}
          </ul>
          <form
            class="row"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api.createAccount(newName, "");
                setNewName("");
              });
            }}
          >
            <label class="field">
              <span>새 계좌</span>
              <input value={newName} onInput={(e) => setNewName(e.currentTarget.value)} placeholder="예: 비상금" maxLength={50} />
            </label>
            <button type="submit" class="align-end" disabled={!newName.trim()}>
              추가
            </button>
          </form>
        </section>

        {error && (
          <p class="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function AccountRow(p: { account: Account; run: (fn: () => Promise<unknown>) => void }) {
  const a = p.account;
  const [name, setName] = useState(a.name);
  const [memo, setMemo] = useState(a.memo);
  const dirty = name !== a.name || memo !== a.memo;
  return (
    <li>
      <input aria-label="계좌 이름" value={name} onInput={(e) => setName(e.currentTarget.value)} maxLength={50} />
      <input aria-label="메모" value={memo} onInput={(e) => setMemo(e.currentTarget.value)} placeholder="은행·끝자리" maxLength={50} />
      {dirty ? (
        <button type="button" class="primary" onClick={() => p.run(() => api.updateAccount(a.id, name, memo))}>
          저장
        </button>
      ) : (
        <button
          type="button"
          class="danger"
          onClick={() => confirm(`"${a.name}" 계좌를 지울까요?`) && p.run(() => api.deleteAccount(a.id))}
        >
          삭제
        </button>
      )}
    </li>
  );
}
