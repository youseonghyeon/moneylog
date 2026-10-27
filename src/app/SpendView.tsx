// 생활비 탭: 그 기간 생활비 거래 — 합계·하루 평균 · 분류별 막대(누르면 그 분류 거래, 금액순/날짜순) · 달력(날마다 합계, 누르면 그날 거래)
import { useEffect, useRef, useState } from "preact/hooks";
import { summarizeSpends } from "../core/spend.ts";
import type { Period, Spend, SpendCategory } from "../core/types.ts";
import { addDays, calAmount, dayText, shortDate, todayStr, won } from "./format.ts";
import { useWide } from "./useWide.ts";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const weekday = (d: string) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))).getUTCDay();

/** 기간을 덮는 주(일~토) 목록. 기간 밖 칸은 null */
function weeksOf(p: Period): (string | null)[][] {
  const weeks: (string | null)[][] = [];
  let d = addDays(p.start, -weekday(p.start));
  while (d <= p.end) {
    const w: (string | null)[] = [];
    for (let i = 0; i < 7; i++, d = addDays(d, 1)) w.push(d >= p.start && d <= p.end ? d : null);
    weeks.push(w);
  }
  return weeks;
}

export function SpendView({ spends, period }: { spends: Spend[]; period: Period }) {
  const today = todayStr();
  const r = summarizeSpends(spends, period, today);
  const byDay = new Map(r.days.map((d) => [d.date, d]));
  const max = Math.max(1, ...r.byCategory.map((c) => c.total));
  const dayMax = Math.max(1, ...r.days.map((d) => d.total));
  // 처음엔 오늘(기간 안이면), 아니면 가장 최근에 쓴 날
  const initial = today >= period.start && today <= period.end ? today : (r.days[0]?.date ?? period.start);
  const [picked, setPicked] = useState<string | null>(null);
  const sel = picked && picked >= period.start && picked <= period.end ? picked : initial;
  const day = byDay.get(sel);
  // 분류를 누르면 아래 목록이 그 분류 거래로 바뀐다 (다시 누르거나 날짜를 누르면 날짜 보기로)
  const [cat, setCat] = useState<SpendCategory | null>(null);
  const [sort, setSort] = useState<"amount" | "date">("amount");
  const catSpends = cat ? r.days.flatMap((d) => d.spends).filter((s) => s.category === cat) : [];
  if (sort === "amount") catSpends.sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date));
  else catSpends.sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? "").localeCompare(a.time ?? ""));
  const pickCat = (c: SpendCategory) => {
    setCat(cat === c ? null : c);
    setSort("amount");
  };
  const pickDay = (d: string) => {
    setPicked(d);
    setCat(null);
  };
  // 휴대폰은 목록이 달력 아래라 분류를 눌러도 안 보인다 — 목록으로 내려 준다
  const wide = useWide();
  const listRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (cat && !wide) listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [cat]);

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
                  <button type="button" class={cat === c.category ? "cat-pick on" : "cat-pick"} aria-pressed={cat === c.category} onClick={() => pickCat(c.category)}>
                    <span class="cat">{c.category}</span>
                    <span class="bar" aria-hidden="true">
                      <i style={{ width: `${Math.max(0, (c.total / max) * 100)}%` }} />
                    </span>
                    <b>{won(c.total)}</b>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p class="note">카드·소액 이체로 쓴 돈입니다. 고정 지출과 내 계좌끼리 옮긴 돈은 빠집니다.</p>
      </aside>

      <div class="detail">
        <section class="acct cal" aria-label="달력">
          <div class="cal-grid" role="grid">
            {WEEK.map((w) => (
              <span class="cal-head">{w}</span>
            ))}
            {weeksOf(period).flat().map((d) => {
              if (!d) return <span class="cal-cell out" />;
              const t = byDay.get(d)?.total ?? 0;
              const cls = ["cal-cell", d === sel && "on", d === today && "today", d > today && "future"].filter(Boolean).join(" ");
              // 그날 쓴 돈이 많을수록 진하게 (기간 안 최대 대비)
              const shade = t > 0 ? `color-mix(in srgb, var(--ink-2) ${Math.round(8 + (t / dayMax) * 32)}%, transparent)` : undefined;
              return (
                <button type="button" class={cls} style={shade && { background: shade }} aria-label={`${dayText(d)} ${won(t)}`} onClick={() => pickDay(d)}>
                  <span class="cal-day">{d.slice(8) === "01" || d === period.start ? `${+d.slice(5, 7)}.${+d.slice(8)}` : +d.slice(8)}</span>
                  {t !== 0 && <span class="cal-amt">{calAmount(t)}</span>}
                </button>
              );
            })}
          </div>
        </section>

        {cat ? (
          <section class="acct unfold" aria-label="고른 분류" ref={listRef}>
            <header>
              <h2>
                {cat} <small class="count">{catSpends.length}건</small>
              </h2>
              <span class="sum">{won(catSpends.reduce((n, s) => n + s.amount, 0))}</span>
            </header>
            <div class="sort" role="group" aria-label="정렬">
              {(["amount", "date"] as const).map((k) => (
                <button type="button" class={sort === k ? "sort-btn on" : "sort-btn"} aria-pressed={sort === k} onClick={() => setSort(k)}>
                  {k === "amount" ? "금액순" : "날짜순"}
                </button>
              ))}
            </div>
            <ul class="lines">
              {catSpends.map((s) => (
                <li class="line">
                  <span class="date">{shortDate(s.date)}</span>
                  <span class="name">
                    {s.merchant}
                    <small>{[s.time, s.source].filter(Boolean).join(" · ")}</small>
                  </span>
                  <span class={s.amount < 0 ? "amt refund" : "amt"}>{won(s.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section class="acct" aria-label="고른 날">
            <header>
              <h2>{dayText(sel)}</h2>
              <span class="sum">{won(day?.total ?? 0)}</span>
            </header>
            {day ? (
              <ul class="lines">
                {day.spends.map((s) => (
                  <li class="line">
                    <span class="name">
                      {s.merchant}
                      <small>{[s.time, s.category, s.source].filter(Boolean).join(" · ")}</small>
                    </span>
                    <span class={s.amount < 0 ? "amt refund" : "amt"}>{won(s.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p class="empty">이날은 쓴 돈이 없습니다.</p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
