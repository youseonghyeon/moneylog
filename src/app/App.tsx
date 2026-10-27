// 한 화면, 탭 둘(예정 · 지출). 보기 전용 — 입력은 사용자 대신 에이전트가 API 로 넣는다(사용자 결정 2026-10-27).
// 예정: 기간 이동 · 계좌별 넣어 둘 금액(줄을 누르면 그 계좌 입금·항목 — PC 는 오른쪽, 휴대폰은 줄 아래) · 주식·적금·대출 · 안 나가는 항목
// 지출: 그 기간 생활비 거래 — 분류별·날짜별
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { labelOf, shiftLabel } from "../core/period.ts";
import type { Balance, Item, Plan, PlanLine, Settings, Spend } from "../core/types.ts";
import { api } from "./api.ts";
import { dateText, KIND_NAMES, labelText, leftText, scheduleText, shortDate, todayStr, won } from "./format.ts";
import { SpendView } from "./SpendView.tsx";

type Tab = "plan" | "spend";
const tabOf = (): Tab => (location.hash === "#spend" ? "spend" : "plan");

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
    history.replaceState(null, "", t === "spend" ? "#spend" : location.pathname);
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
        {(["plan", "spend"] as const).map((t) => (
          <button type="button" role="tab" aria-selected={tab === t} class={tab === t ? "on" : ""} onClick={() => go(t)}>
            {t === "plan" ? "예정" : "지출"}
          </button>
        ))}
      </nav>

      {error && (
        <p class="error banner" role="alert">
          {error}
        </p>
      )}

      {tab === "plan" ? (
        <PlanView plan={plan} items={items} balances={balances} />
      ) : (
        <SpendView spends={spends} period={plan.period} />
      )}
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

function PlanView({ plan, items, balances }: { plan: Plan; items: Item[]; balances: Balance[] }) {
  const today = todayStr();
  const wide = useWide();
  const lines = plan.accounts.flatMap((a) => a.lines);
  const estimated = lines.filter((l) => l.estimated).length;
  // 날짜가 지났고 금액이 확정된 줄 = 이미 나간 돈 (예상 금액은 아직 확정이 아니라 나갔다고 보지 않는다)
  const gone = (l: PlanLine) => l.due <= today && !l.estimated;
  const goneTotal = lines.filter(gone).reduce((s, l) => s + l.amount, 0);
  const due = new Set(lines.map((l) => l.item.id));
  const idle = items.filter((it) => !due.has(it.id));
  const accountName = new Map(plan.accounts.map((a) => [a.account.id, a.account.name]));
  // PC 는 늘 하나가 열려 있고(처음엔 첫 계좌), 휴대폰은 처음엔 다 접혀 있다
  const [picked, setPicked] = useState<Pick | null>(null);
  const first = plan.accounts[0]?.account.id ?? "balances";
  const open: Pick | null = wide ? (picked ?? first) : picked;
  const toggle = (k: Pick) => setPicked(!wide && open === k ? null : k);

  const detail = (k: Pick) => {
    if (k === "balances") return <BalancesDetail balances={balances} />;
    if (k === "idle") return <IdleDetail idle={idle} accountName={accountName} />;
    const a = plan.accounts.find((x) => x.account.id === k);
    return a ? <AccountDetail a={a} today={today} gone={gone} /> : null;
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
        <p class="caption">이번 기간에 필요한 돈</p>
        <p class="total">{won(plan.total)}</p>
        {goneTotal > 0 && (
          <p class="put">
            이미 나간 돈 {won(goneTotal)} · 앞으로 {won(plan.total - goneTotal)}
          </p>
        )}
        {estimated > 0 && <p class="hint">예상 금액 {estimated}건 포함</p>}
        {plan.deposited > 0 && (
          <p class="put">
            넣은 돈 {won(plan.deposited)} · <Left value={plan.deposited - plan.total} />
          </p>
        )}
        <h3>계좌별로 넣어 둘 금액</h3>
        <ul class="transfer">
          {plan.accounts.map((a) =>
            row(
              a.account.id,
              <span>
                {a.account.name}
                {a.account.memo && <small>{a.account.memo}</small>}
              </span>,
              <>
                <b>{won(a.total)}</b>
                {a.deposits.length > 0 && (
                  <small>
                    넣음 {won(a.deposited)} · <Left value={a.deposited - a.total} />
                  </small>
                )}
              </>,
            ),
          )}
          {row("balances", <span>주식·적금·대출</span>, <small>{balances.length}건</small>)}
          {idle.length > 0 && row("idle", <span>이번 기간에 안 나가는 항목</span>, <small>{idle.length}개</small>)}
        </ul>
      </aside>

      {wide && open !== null && <div class="detail unfold">{detail(open)}</div>}
    </main>
  );
}

function AccountDetail({ a, today, gone }: { a: Plan["accounts"][number]; today: string; gone: (l: PlanLine) => boolean }) {
  return (
    <section class="acct" aria-label={a.account.name}>
      <header>
        <h2>{a.account.name}</h2>
        <span class="sum">{won(a.total)}</span>
      </header>
      {a.deposits.length > 0 && (
        <ul class="lines deposits">
          {a.deposits.map((d) => (
            <li class="line">
              <span class="date">{shortDate(d.date)}</span>
              <span class="name">
                입금
                {d.memo && <small>{d.memo}</small>}
              </span>
              <span class="amt">+{won(d.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {a.lines.length === 0 ? (
        <p class="empty">이번 기간에 나가는 항목이 없습니다.</p>
      ) : (
        <ul class="lines">
          {a.lines.map((l) => (
            <li class={l.due < today ? "line past" : "line"}>
              <span class="date">{shortDate(l.due)}</span>
              <span class="name">
                {l.item.name}
                {l.estimated && <em>예상</em>}
                {gone(l) && <em class="muted">나감</em>}
                {l.item.cycle === "yearly" && <em class="muted">매년</em>}
              </span>
              <span class="amt">{won(l.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {a.deposits.length > 0 && (
        <p class="left">
          <span>
            넣은 돈 {won(a.deposited)} − 나갈 돈 {won(a.total)}
          </span>
          <Left value={a.deposited - a.total} />
        </p>
      )}
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

/** 넣은 돈 − 나갈 돈. 모자라면 오류색 */
function Left(p: { value: number }) {
  return <span class={p.value < 0 ? "short" : undefined}>{leftText(p.value)}</span>;
}
