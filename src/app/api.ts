// /api 호출. 실패하면 서버가 준 문구로 Error 를 던진다 (화면이 그대로 보여 줌).
import type { Balance, Item, Plan, Settings, Spend } from "../core/types.ts";

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

// 화면은 보기 전용 — 쓰기 API 는 에이전트가 직접 부른다
export const api = {
  plan: (period: string) => req<Plan>("GET", `/api/plan?period=${period}`),
  items: () => req<Item[]>("GET", "/api/items"),
  balances: () => req<Balance[]>("GET", "/api/balances"),
  spends: (period: string) => req<Spend[]>("GET", `/api/spends?period=${period}`),
  settings: () => req<Settings>("GET", "/api/settings"),
};
