// 기간 하나의 계좌별 필요 금액 — "이 계좌에 얼마를 넣어 둬야 하나" 의 답.
import { dueIn, periodOf } from "./period.ts";
import type { Account, Deposit, Item, Override, Plan } from "./types.ts";

export function buildPlan(
  label: string,
  startDay: number,
  accounts: Account[],
  items: Item[],
  overrides: Override[],
  deposits: Deposit[] = [],
): Plan {
  const period = periodOf(label, startDay);
  const actual = new Map(overrides.filter((o) => o.period === label).map((o) => [o.itemId, o.amount]));
  const sorted = [...accounts].sort((a, b) => a.sort - b.sort || a.id - b.id);
  const plans = sorted.map((account) => {
    const lines = items
      .filter((it) => it.accountId === account.id)
      .flatMap((item) => {
        const due = dueIn(item, period, startDay);
        if (!due) return [];
        const a = actual.get(item.id);
        return [{ item, due, amount: a ?? item.amount, estimated: item.variable && a === undefined }];
      })
      .sort((x, y) => x.due.localeCompare(y.due) || x.item.name.localeCompare(y.item.name));
    const ds = deposits
      .filter((d) => d.period === label && d.accountId === account.id)
      .sort((x, y) => x.date.localeCompare(y.date) || x.id - y.id);
    return {
      account,
      lines,
      total: lines.reduce((s, l) => s + l.amount, 0),
      deposits: ds,
      deposited: ds.reduce((s, d) => s + d.amount, 0),
    };
  });
  return {
    period,
    accounts: plans,
    total: plans.reduce((s, p) => s + p.total, 0),
    deposited: plans.reduce((s, p) => s + p.deposited, 0),
  };
}
