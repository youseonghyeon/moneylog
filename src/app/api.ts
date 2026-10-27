// /api 호출. 실패하면 서버가 준 문구로 Error 를 던진다 (화면이 그대로 보여 줌).
import type { Account, Balance, BalanceInput, Deposit, DepositInput, Item, ItemInput, Plan, Settings } from "../core/types.ts";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("서버에 연결하지 못했습니다. wg 연결을 확인해 주세요.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `요청이 실패했습니다 (${res.status}).`);
  return data as T;
}

export const api = {
  plan: (period: string) => req<Plan>("GET", `/api/plan?period=${period}`),
  accounts: () => req<Account[]>("GET", "/api/accounts"),
  createAccount: (name: string, memo: string) => req<Account>("POST", "/api/accounts", { name, memo }),
  updateAccount: (id: number, name: string, memo: string) => req<Account>("PUT", `/api/accounts/${id}`, { name, memo }),
  deleteAccount: (id: number) => req<void>("DELETE", `/api/accounts/${id}`),
  items: () => req<Item[]>("GET", "/api/items"),
  createItem: (it: ItemInput) => req<Item>("POST", "/api/items", it),
  updateItem: (id: number, it: ItemInput) => req<Item>("PUT", `/api/items/${id}`, it),
  deleteItem: (id: number) => req<void>("DELETE", `/api/items/${id}`),
  setActual: (id: number, period: string, amount: number) => req<void>("PUT", `/api/items/${id}/actual/${period}`, { amount }),
  clearActual: (id: number, period: string) => req<void>("DELETE", `/api/items/${id}/actual/${period}`),
  createDeposit: (d: DepositInput) => req<Deposit>("POST", "/api/deposits", d),
  updateDeposit: (id: number, d: DepositInput) => req<Deposit>("PUT", `/api/deposits/${id}`, d),
  deleteDeposit: (id: number) => req<void>("DELETE", `/api/deposits/${id}`),
  balances: () => req<Balance[]>("GET", "/api/balances"),
  createBalance: (b: BalanceInput) => req<Balance>("POST", "/api/balances", b),
  updateBalance: (id: number, b: BalanceInput) => req<Balance>("PUT", `/api/balances/${id}`, b),
  deleteBalance: (id: number) => req<void>("DELETE", `/api/balances/${id}`),
  settings: () => req<Settings>("GET", "/api/settings"),
  setSettings: (s: Settings) => req<Settings>("PUT", "/api/settings", s),
};
