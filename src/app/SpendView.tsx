// 지출 탭: 그 기간 생활비 거래 — 합계·하루 평균 · 분류별 막대 · 날짜별(누르면 그날 거래)
import { summarizeSpends } from "../core/spend.ts";
import type { Period, Spend } from "../core/types.ts";
import { dayText, todayStr, won } from "./format.ts";

export function SpendView({ spends, period }: { spends: Spend[]; period: Period }) {
  const r = summarizeSpends(spends, period, todayStr());
  const max = Math.max(1, ...r.byCategory.map((c) => c.total));
  return (
    <main class="layout">
      <aside class="summary">
        <p class="caption">이번 기간 생활비</p>
        <p class="total">{won(r.total)}</p>
        {r.daysElapsed > 0 && (
          <p class="put">
            하루 평균 {won(r.dailyAvg)} · {r.daysElapsed}일째
          </p>
        )}
        {r.byCategory.length > 0 && (
          <>
            <h3>분류별</h3>
            <ul class="cats">
              {r.byCategory.map((c) => (
                <li>
                  <span class="cat">{c.category}</span>
                  <span class="bar" aria-hidden="true">
                    <i style={{ width: `${Math.max(0, (c.total / max) * 100)}%` }} />
                  </span>
                  <b>{won(c.total)}</b>
                </li>
              ))}
            </ul>
          </>
        )}
        <p class="note">카드·소액 이체로 쓴 돈입니다. 고정 지출과 내 계좌끼리 옮긴 돈은 빠집니다.</p>
      </aside>

      <div class="detail">
        {r.days.length === 0 ? (
          <section class="acct">
            <p class="empty">이 기간에 기록된 생활비가 없습니다.</p>
          </section>
        ) : (
          <section class="acct days" aria-label="날짜별">
            {r.days.map((d) => (
              <details>
                <summary class="line">
                  <span class="name">{dayText(d.date)}</span>
                  <small class="count">{d.spends.length}건</small>
                  <span class="amt">{won(d.total)}</span>
                </summary>
                <ul class="lines">
                  {d.spends.map((s) => (
                    <li class="line sub">
                      <span class="name">
                        {s.merchant}
                        <small>{[s.time, s.category, s.source].filter(Boolean).join(" · ")}</small>
                      </span>
                      <span class={s.amount < 0 ? "amt refund" : "amt"}>{won(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
