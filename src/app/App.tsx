// 한 화면, 탭 셋. 보기 전용 — 입력은 사용자 대신 에이전트가 API 로 넣는다(사용자 결정 2026-10-27).
// 예정: 계좌별 입금 필요 금액 · 날짜별로 빠져나갈 돈과 남은 금액(마지막에 0원). 생활비 항목·입금·잔액은 안 보인다
// 생활비: 그 기간 생활비 거래 — 분류별 · 달력 / 잔액: 주식·적금·대출
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { labelOf, shiftLabel } from "../core/period.ts";
import type { Balance, Item, Plan, PlanLine, Settings, Spend } from "../core/types.ts";
import { api } from "./api.ts";
import { dateText, KIND_NAMES, labelText, scheduleText, shortDate, todayStr, won } from "./format.ts";
import { SpendView } from "./SpendView.tsx";

type Tab = "plan" | "spend" | "balance";
const TABS: [Tab, string][] = [
  ["plan", "예정"],
  ["spend", "생활비"],
  ["balance", "잔액"],
];
const tabOf = (): Tab => (location.hash === "#spend" ? "spend" : location.hash === "#balance" ? "balance" : "plan");

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [spends, setSpends] = useState<Spend[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(tabOf);

  async function load(label?: string) {
    try {
      const s = await api.settings();
      const l = label ?? labelOf(todayStr(), s.startDay);
      const [p, its, bs, sp] = await Promise.all([api.plan(l), api.items(), api.balances(), api.spends(l)]);
      setSettings(s);
      setPlan(p);
      setItems(its);
      setBalances(bs);
      setSpends(sp);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
    const onHash = () => setTab(tabOf());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (!plan || !settings) {
    return <div class="boot">{error ? <p class="error">{error}</p> : <p class="hint">불러오는 중…</p>}</div>;
  }

  const label = plan.period.label;
  const go = (t: Tab) => {
    history.replaceState(null, "", t === "plan" ? location.pathname : `#${t}`);
    setTab(t);
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
      </header>

      <nav class="tabs" role="tablist">
        {TABS.map(([t, name]) => (
          <button type="button" role="tab" aria-selected={tab === t} class={tab === t ? "on" : ""} onClick={() => go(t)}>
            {name}
          </button>
        ))}
      </nav>

      {error && (
        <p class="error banner" role="alert">
          {error}
        </p>
      )}

      {tab === "plan" && <PlanView plan={plan} items={items} />}
      {tab === "spend" && <SpendView spends={spends} period={plan.period} />}
      {tab === "balance" && <BalanceView balances={balances} />}
    </div>
  );
}

/** 요약의 줄 하나 = 버튼. 누르면 그 내용을 연다 (PC: 오른쪽, 휴대폰: 줄 바로 아래) */
type Pick = number | "balances" | "idle";
const WIDE = "(min-width: 860px)";

function useWide(): boolean {
  const [wide, setWide] = useState(() => matchMedia(WIDE).matches);
  useEffect(() => {
    const on = () => setWide(matchMedia(WIDE).matches);
    window.addEventListener("resize", on);
    // 그린 뒤 리스너를 붙이기 전에 화면 폭이 바뀌었을 수 있다 — 붙이자마자 한 번 다시 잰다
    on();
    return () => window.removeEventListener("resize", on);
  }, []);
  return wide;
}

function PlanView({ plan, items }: { plan: Plan; items: Item[] }) {
  const today = todayStr();
  const wide = useWide();
  // 예정 탭은 날짜가 정해져 빠져나가는 돈만 — 생활비 예상 항목은 뺀다
  const accounts = plan.accounts
    .map((a) => {
      const lines = a.lines.filter((l) => !l.item.living);
      return { account: a.account, lines, total: lines.reduce((s, l) => s + l.amount, 0) };
    })
    .filter((a) => a.lines.length > 0);
  const lines = accounts.flatMap((a) => a.lines);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const estimated = lines.filter((l) => l.estimated).length;
  const due = new Set(plan.accounts.flatMap((a) => a.lines.map((l) => l.item.id)));
  const idle = items.filter((it) => !due.has(it.id) && !it.living);
  const accountName = new Map(plan.accounts.map((a) => [a.account.id, a.account.name]));
  // PC 는 늘 하나가 열려 있고(처음엔 첫 계좌), 휴대폰은 처음엔 다 접혀 있다
  const [picked, setPicked] = useState<Pick | null>(null);
  const first: Pick = accounts[0]?.account.id ?? "idle";
  const open: Pick | null = wide ? (picked ?? first) : picked;
  const toggle = (k: Pick) => setPicked(!wide && open === k ? null : k);

  const detail = (k: Pick) => {
    if (k === "idle") return <IdleDetail idle={idle} accountName={accountName} />;
    const a = accounts.find((x) => x.account.id === k);
    return a ? <Schedule name={a.account.name} lines={a.lines} total={a.total} today={today} /> : null;
  };
  const row = (k: Pick, label: ComponentChildren, right: ComponentChildren) => (
    <li>
      <button type="button" class={open === k ? "pick on" : "pick"} aria-expanded={open === k} onClick={() => toggle(k)}>
        {label}
        <span class="need">{right}</span>
      </button>
      {!wide && open === k && <div class="unfold">{detail(k)}</div>}
    </li>
  );

  return (
    <main class="layout">
      <aside class="summary">
        <p class="caption">이번 기간 입금 필요 금액</p>
        <p class="total">{won(total)}</p>
        {estimated > 0 && <p class="hint">예상 금액 {estimated}건 포함</p>}
        <h3>계좌별</h3>
        <ul class="transfer">
          {accounts.map((a) => row(a.account.id, <span>{a.account.name}</span>, <b>{won(a.total)}</b>))}
          {idle.length > 0 && row("idle", <span>이번 기간에 안 나가는 항목</span>, <small>{idle.length}개</small>)}
        </ul>
      </aside>

      {wide && open !== null && <div class="detail unfold">{detail(open)}</div>}
    </main>
  );
}

/** 한 계좌: 날짜순으로 빠져나갈 돈과, 그걸 빼고 남은 금액 (입금 필요 금액에서 시작해 마지막에 0원) */
function Schedule({ name, lines, total, today }: { name: string; lines: PlanLine[]; total: number; today: string }) {
  let left = total;
  return (
    <section class="acct" aria-label={name}>
      <header>
        <h2>{name}</h2>
        <span class="sum">입금 필요 {won(total)}</span>
      </header>
      <ul class="lines">
        {lines.map((l) => {
          left -= l.amount;
          return (
            <li class={l.due < today ? "line past" : "line"}>
              <span class="date">{shortDate(l.due)}</span>
              <span class="name">
                {l.item.name}
                {l.estimated && <em>예상</em>}
                {l.due <= today && !l.estimated && <em class="muted">나감</em>}
                {l.item.cycle === "yearly" && <em class="muted">매년</em>}
              </span>
              <span class="amt">
                {won(l.amount)}
                <small class="rest">남은 {won(left)}</small>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function IdleDetail({ idle, accountName }: { idle: Item[]; accountName: Map<number, string> }) {
  return (
    <section class="acct" aria-label="이번 기간에 안 나가는 항목">
      <header>
        <h2>이번 기간에 안 나가는 항목</h2>
      </header>
      <ul class="lines">
        {idle.map((it) => (
          <li class="line">
            <span class="name">
              {it.name}
              <small>
                {accountName.get(it.accountId)} · {scheduleText(it)}
              </small>
            </span>
            <span class="amt">{won(it.amount)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BalancesDetail({ balances }: { balances: Balance[] }) {
  return (
    <section class="acct" aria-label="주식·적금·대출">
      <header>
        <h2>주식·적금·대출</h2>
      </header>
      {balances.length === 0 ? (
        <p class="empty">아직 적어 둔 잔액이 없습니다.</p>
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
                  <li class="line">
                    <span class="name">
                      {b.name}
                      <small>{[b.memo, `${dateText(b.updatedAt)} 기준`].filter(Boolean).join(" · ")}</small>
                    </span>
                    <span class="amt">{won(b.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}

function BalanceView({ balances }: { balances: Balance[] }) {
  const sum = (k: Balance["kind"]) => balances.filter((b) => b.kind === k).reduce((s, b) => s + b.amount, 0);
  return (
    <main class="layout">
      <aside class="summary">
        <p class="caption">주식·적금·대출</p>
        <ul class="transfer">
          {(["stock", "saving", "loan"] as const).map((k) => (
            <li class="kv">
              <span>{KIND_NAMES[k]}</span>
              <b>{won(sum(k))}</b>
            </li>
          ))}
        </ul>
        <p class="note">기간과 상관없이 지금 얼마인지만 적어 둡니다(대출은 남은 원금).</p>
      </aside>
      <div class="detail">
        <BalancesDetail balances={balances} />
      </div>
    </main>
  );
}
