// 한 화면: 기간 이동 · 계좌별 넣어 둘 금액 · 계좌마다 항목 목록 · 이번 기간에 안 나가는 항목
import { useEffect, useState } from "preact/hooks";
import { labelOf, shiftLabel } from "../core/period.ts";
import type { Item, Plan, PlanLine, Settings } from "../core/types.ts";
import { api } from "./api.ts";
import { labelText, scheduleText, shortDate, todayStr, won } from "./format.ts";
import { ItemSheet } from "./ItemSheet.tsx";
import { SettingsSheet } from "./SettingsSheet.tsx";

type Open = { kind: "item"; item: Item | null; accountId: number; actual: number | null } | { kind: "settings" } | null;

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Open>(null);

  async function load(label?: string) {
    try {
      const s = await api.settings();
      const [p, its] = await Promise.all([api.plan(label ?? labelOf(todayStr(), s.startDay)), api.items()]);
      setSettings(s);
      setPlan(p);
      setItems(its);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (!plan || !settings) {
    return <div class="boot">{error ? <p class="error">{error}</p> : <p class="hint">불러오는 중…</p>}</div>;
  }

  const label = plan.period.label;
  const accounts = plan.accounts.map((a) => a.account);
  const today = todayStr();
  const estimated = plan.accounts.flatMap((a) => a.lines).filter((l) => l.estimated).length;
  const due = new Set(plan.accounts.flatMap((a) => a.lines.map((l) => l.item.id)));
  const idle = items.filter((it) => !due.has(it.id));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  const editLine = (l: PlanLine) =>
    setOpen({ kind: "item", item: l.item, accountId: l.item.accountId, actual: l.estimated || !l.item.variable ? null : l.amount });
  const reload = () => {
    setOpen(null);
    load(label);
  };

  return (
    <div class="app">
      <header class="top">
        <button type="button" class="icon" aria-label="이전 기간" onClick={() => load(shiftLabel(label, -1))}>
          ‹
        </button>
        <div class="period">
          <h1>{labelText(label)}</h1>
          <span>
            {shortDate(plan.period.start)} – {shortDate(plan.period.end)}
          </span>
        </div>
        <button type="button" class="icon" aria-label="다음 기간" onClick={() => load(shiftLabel(label, 1))}>
          ›
        </button>
        <button type="button" class="icon settings" aria-label="설정" onClick={() => setOpen({ kind: "settings" })}>
          설정
        </button>
      </header>

      {error && (
        <p class="error banner" role="alert">
          {error}
        </p>
      )}

      <main class="layout">
        <aside class="summary">
          <p class="caption">이번 기간에 필요한 돈</p>
          <p class="total">{won(plan.total)}</p>
          {estimated > 0 && <p class="hint">예상 금액 {estimated}건 포함 — 고지서가 오면 실제 금액을 넣어 주세요</p>}
          <h3>계좌별로 넣어 둘 금액</h3>
          <ul class="transfer">
            {plan.accounts.map((a) => (
              <li>
                <span>
                  {a.account.name}
                  {a.account.memo && <small>{a.account.memo}</small>}
                </span>
                <b>{won(a.total)}</b>
              </li>
            ))}
          </ul>
        </aside>

        <div class="detail">
          {plan.accounts.map((a) => (
            <section class="acct" aria-label={a.account.name}>
              <header>
                <h2>{a.account.name}</h2>
                <span class="sum">{won(a.total)}</span>
              </header>
              {a.lines.length === 0 ? (
                <p class="empty">이번 기간에 나가는 항목이 없습니다.</p>
              ) : (
                <ul class="lines">
                  {a.lines.map((l) => (
                    <li>
                      <button type="button" class={l.due < today ? "line past" : "line"} onClick={() => editLine(l)}>
                        <span class="date">{shortDate(l.due)}</span>
                        <span class="name">
                          {l.item.name}
                          {l.estimated && <em>예상</em>}
                          {l.item.cycle === "yearly" && <em class="muted">매년</em>}
                        </span>
                        <span class="amt">{won(l.amount)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                class="add"
                onClick={() => setOpen({ kind: "item", item: null, accountId: a.account.id, actual: null })}
              >
                + {a.account.name}에 항목 추가
              </button>
            </section>
          ))}

          {idle.length > 0 && (
            <details class="idle">
              <summary>이번 기간에 안 나가는 항목 {idle.length}개</summary>
              <ul class="lines">
                {idle.map((it) => (
                  <li>
                    <button
                      type="button"
                      class="line"
                      onClick={() => setOpen({ kind: "item", item: it, accountId: it.accountId, actual: null })}
                    >
                      <span class="name">
                        {it.name}
                        <small>
                          {accountName.get(it.accountId)} · {scheduleText(it)}
                        </small>
                      </span>
                      <span class="amt">{won(it.amount)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </main>

      {open?.kind === "item" && (
        <ItemSheet
          item={open.item}
          accounts={accounts}
          defaultAccountId={open.accountId}
          period={label}
          actual={open.actual}
          onDone={reload}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === "settings" && (
        <SettingsSheet
          startDay={settings.startDay}
          accounts={accounts}
          onChanged={() => load(label)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
