// 투자 탭 (시안, 사용자 요청 2026-10-30): 자산군(주식·채권·금·현금) → 세부 항목의 목표 비율과 지금 비율, 이번 달 넣을 돈 나누기
// 아직 예시 데이터다 — 목표 비율·보유 종목이 정해지면 API 데이터로 바꾼다
import { won } from "./format.ts";

interface Holding { name: string; fund: string; qty: number | null; value: number; target: number }
interface Group { name: string; target: number; items: Holding[] }

/** 목표 = 자산군 비율(전체 대비) × 세부 비율(자산군 안에서) */
const SAMPLE: Group[] = [
  { name: "주식", target: 60, items: [
    { name: "미국 대형주", fund: "S&P500 ETF", qty: 38, value: 900000, target: 60 },
    { name: "미국 기술주", fund: "나스닥100 ETF", qty: 14, value: 420000, target: 25 },
    { name: "국내 주식", fund: "코스피200 ETF", qty: 4, value: 150000, target: 15 },
  ] },
  { name: "채권", target: 20, items: [
    { name: "미국 국채", fund: "미국채 10년 ETF", qty: 18, value: 200000, target: 70 },
    { name: "국내 단기채", fund: "단기채권 ETF", qty: 1, value: 50000, target: 30 },
  ] },
  { name: "금", target: 10, items: [{ name: "금", fund: "KRX 금현물", qty: null, value: 180000, target: 100 }] },
  { name: "현금", target: 10, items: [{ name: "예수금", fund: "증권 계좌 현금", qty: null, value: 116965, target: 100 }] },
];
const ADD = 500000;
const SCALE = 80; // 막대 잣대 0~80%

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const pct = (n: number) => `${n.toFixed(1)}%`;
const gapText = (d: number) => (Math.abs(d) < 0.5 ? "목표와 같음" : d > 0 ? `${d.toFixed(1)}%p 많음` : `${(-d).toFixed(1)}%p 모자람`);

/** 넣을 돈 나누기: 세부 항목마다 목표 금액에서 모자란 만큼, 모자란 합이 넣을 돈보다 크면 비율대로 줄인다(천 원 단위, 끝수는 가장 많이 넣는 곳에) */
function split(groups: Group[], add: number): Map<Holding, number> {
  const after = sum(groups.flatMap((g) => g.items.map((i) => i.value))) + add;
  const leaves = groups.flatMap((g) => g.items.map((i) => ({ i, short: Math.max(0, (after * g.target * i.target) / 10000 - i.value) })));
  const k = Math.min(1, add / Math.max(1, sum(leaves.map((l) => l.short))));
  const buy = new Map(leaves.map((l) => [l.i, Math.floor((l.short * k) / 1000) * 1000]));
  const most = leaves.reduce((a, b) => ((buy.get(b.i) ?? 0) > (buy.get(a.i) ?? 0) ? b : a));
  buy.set(most.i, (buy.get(most.i) ?? 0) + add - sum([...buy.values()]));
  return buy;
}

export function InvestView() {
  const groups = SAMPLE;
  const gValue = (g: Group) => sum(g.items.map((i) => i.value));
  const total = sum(groups.map(gValue));
  const after = total + ADD;
  const buy = split(groups, ADD);
  return (
    <main class="layout invest">
      <aside class="summary">
        <p class="caption">
          투자 평가금액 <span class="mock">예시 데이터</span>
        </p>
        <p class="total">{won(total)}</p>
        <p class="put">
          신한투자증권 · 매달 21일 <b>{won(ADD)}</b>
        </p>
        <h3>자산 배분 · 지금 / 목표</h3>
        <ul class="alloc">
          {groups.map((g) => {
            const v = gValue(g);
            const now = (v / total) * 100;
            return (
              <li>
                <div class="row">
                  <span>{g.name}</span>
                  <span>
                    <span class="pct">{pct(now)}</span> <small>/ 목표 {g.target}%</small>
                  </span>
                </div>
                <div class="tbar" aria-hidden="true">
                  <i style={{ width: `${Math.min(100, (now / SCALE) * 100)}%` }} />
                  <b style={{ left: `${(g.target / SCALE) * 100}%` }} />
                </div>
                <small>
                  {won(v)} · {gapText(now - g.target)}
                </small>
                {g.items.length > 1 && (
                  <div class="sub">
                    {g.items.map((i) => (
                      <div class="row">
                        <span>{i.name}</span>
                        <small>
                          {pct((i.value / v) * 100)} / {i.target}%
                        </small>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p class="legend">
          <span>지금</span>
          <span class="t">목표</span>
        </p>
        <p class="note">목표 비율은 정해 주시면 넣습니다. 지금 비율은 평가금액으로 계산합니다.</p>
      </aside>

      <div class="detail">
        <section class="acct" aria-label="넣을 돈 나누기">
          <header>
            <h2>넣을 {won(ADD)} 나누기</h2>
            <span class="sum">목표에서 모자란 곳부터</span>
          </header>
          <ul class="lines">
            {groups.map((g) => [
              <li class="grp">
                <span>{g.name}</span>
                <b>{won(sum(g.items.map((i) => buy.get(i) ?? 0)))}</b>
              </li>,
              ...g.items.map((i) => (
                <li class="line">
                  <span class="name">
                    {i.name}
                    <small>{i.fund}</small>
                  </span>
                  <span class="amt">
                    {won(buy.get(i) ?? 0)}
                    <span class="after">
                      넣은 뒤 전체의 {pct(((i.value + (buy.get(i) ?? 0)) / after) * 100)} · 목표 {pct((g.target * i.target) / 100)}
                    </span>
                  </span>
                </li>
              )),
            ])}
          </ul>
        </section>
        <section class="acct" aria-label="세부 항목">
          <header>
            <h2>세부 항목</h2>
            <span class="sum">{won(total)}</span>
          </header>
          <ul class="lines">
            {groups.map((g) => [
              <li class="grp">
                <span>{g.name}</span>
                <b>{won(gValue(g))}</b>
              </li>,
              ...g.items.map((i) => (
                <li class="line">
                  <span class="name">
                    {i.fund}
                    <small>{[i.name, i.qty && `${i.qty}주`].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span class="amt">
                    {won(i.value)}
                    <span class="after">
                      {g.name} 안 {pct((i.value / gValue(g)) * 100)} · 전체 {pct((i.value / total) * 100)}
                    </span>
                  </span>
                </li>
              )),
            ])}
          </ul>
        </section>
      </div>
    </main>
  );
}
