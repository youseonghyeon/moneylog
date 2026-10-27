// 한 화면: 기간 이동 · 계좌별 넣어 둘 금액 · 계좌마다 입금·항목 목록 · 이번 기간에 안 나가는 항목 · 주식·적금·대출 잔액
import { useEffect, useState } from "preact/hooks";
import { labelOf, shiftLabel } from "../core/period.ts";
import type { Balance, BalanceKind, Deposit, Item, Plan, PlanLine, Settings } from "../core/types.ts";
import { api } from "./api.ts";
import { BalanceSheet } from "./BalanceSheet.tsx";
import { DepositSheet } from "./DepositSheet.tsx";
import { dateText, KIND_NAMES, labelText, leftText, scheduleText, shortDate, todayStr, won } from "./format.ts";
import { ItemSheet } from "./ItemSheet.tsx";
import { SettingsSheet } from "./SettingsSheet.tsx";

type Open =
  | { kind: "item"; item: Item | null; accountId: number; actual: number | null }
  | { kind: "deposit"; deposit: Deposit | null; accountId: number }
  | { kind: "balance"; balance: Balance | null; balanceKind: BalanceKind }
  | { kind: "settings" }
  | null;

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Open>(null);

  async function load(label?: string) {
    try {
      const s = await api.settings();
      const [p, its, bs] = await Promise.all([
        api.plan(label ?? labelOf(todayStr(), s.startDay)),
        api.items(),
        api.balances(),
      ]);
      setSettings(s);
      setPlan(p);
      setItems(its);
      setBalances(bs);
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
          {plan.deposited > 0 && (
            <p class="put">
              넣은 돈 {won(plan.deposited)} · <Left value={plan.deposited - plan.total} />
            </p>
          )}
          <h3>계좌별로 넣어 둘 금액</h3>
          <ul class="transfer">
            {plan.accounts.map((a) => (
              <li>
                <span>
                  {a.account.name}
                  {a.account.memo && <small>{a.account.memo}</small>}
                </span>
                <span class="need">
                  <b>{won(a.total)}</b>
                  {a.deposits.length > 0 && (
                    <small>
                      넣음 {won(a.deposited)} · <Left value={a.deposited - a.total} />
                    </small>
                  )}
                </span>
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
              {a.deposits.length > 0 && (
                <ul class="lines deposits">
                  {a.deposits.map((d) => (
                    <li>
                      <button
                        type="button"
                        class="line"
                        onClick={() => setOpen({ kind: "deposit", deposit: d, accountId: d.accountId })}
                      >
                        <span class="date">{shortDate(d.date)}</span>
                        <span class="name">
                          입금
                          {d.memo && <small>{d.memo}</small>}
                        </span>
                        <span class="amt">+{won(d.amount)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
              {a.deposits.length > 0 && (
                <p class="left">
                  <span>넣은 돈 {won(a.deposited)} − 나갈 돈 {won(a.total)}</span>
                  <Left value={a.deposited - a.total} />
                </p>
              )}
              <div class="adds">
                <button
                  type="button"
                  class="add"
                  onClick={() => setOpen({ kind: "item", item: null, accountId: a.account.id, actual: null })}
                >
                  + {a.account.name}에 항목 추가
                </button>
                <button
                  type="button"
                  class="add"
                  onClick={() => setOpen({ kind: "deposit", deposit: null, accountId: a.account.id })}
                >
                  + 입금
                </button>
              </div>
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

          <section class="acct" aria-label="주식·적금·대출">
            <header>
              <h2>주식·적금·대출</h2>
            </header>
            {balances.length === 0 ? (
              <p class="empty">지금 얼마 들어 있는지(대출은 남은 원금) 적어 두면 여기 모입니다.</p>
            ) : (
              (["stock", "saving", "loan"] as const).map((k) => {
                const bs = balances.filter((b) => b.kind === k);
                if (bs.length === 0) return null;
                return (
                  <div class="kind" aria-label={KIND_NAMES[k]}>
                    <h3>
                      <span>{KIND_NAMES[k]}</span>
                      <span class="sum">{won(bs.reduce((s, b) => s + b.amount, 0))}</span>
                    </h3>
                    <ul class="lines">
                      {bs.map((b) => (
                        <li>
                          <button
                            type="button"
                            class="line"
                            onClick={() => setOpen({ kind: "balance", balance: b, balanceKind: b.kind })}
                          >
                            <span class="name">
                              {b.name}
                              <small>{[b.memo, `${dateText(b.updatedAt)} 기준`].filter(Boolean).join(" · ")}</small>
                            </span>
                            <span class="amt">{won(b.amount)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
            <button
              type="button"
              class="add"
              onClick={() => setOpen({ kind: "balance", balance: null, balanceKind: "stock" })}
            >
              + 주식·적금·대출 추가
            </button>
          </section>
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
      {open?.kind === "deposit" && (
        <DepositSheet
          deposit={open.deposit}
          accounts={accounts}
          defaultAccountId={open.accountId}
          period={plan.period}
          onDone={reload}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === "balance" && (
        <BalanceSheet balance={open.balance} kind={open.balanceKind} onDone={reload} onClose={() => setOpen(null)} />
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

/** 넣은 돈 − 나갈 돈. 모자라면 오류색 */
function Left(p: { value: number }) {
  return <span class={p.value < 0 ? "short" : undefined}>{leftText(p.value)}</span>;
}
