// 도메인 타입. 서버(DB 행 ↔ JSON)와 화면이 같이 쓴다. 금액은 원 단위 정수.

/** 돈을 나눠 두는 계좌 (예: 생활비 · 대출·고지서 · 고정 지출) */
export interface Account {
  id: number;
  name: string;
  /** 은행·계좌 끝자리 같은 메모 */
  memo: string;
  sort: number;
}

export type Cycle = "monthly" | "yearly";

/** 반복 지출 항목 */
export interface Item {
  id: number;
  accountId: number;
  name: string;
  /** 기본 금액. 변동 항목이면 예상 금액 */
  amount: number;
  /** 고지서·대출 이자처럼 달마다 금액이 바뀌는 항목 */
  variable: boolean;
  cycle: Cycle;
  /** 나가는 날(1~31). null 이면 날짜 미정 — 기간 시작일로 본다 */
  day: number | null;
  /** cycle 이 yearly 일 때 나가는 달(1~12) */
  month: number | null;
  /** 이 달부터 (YYYY-MM, 포함). null 이면 처음부터 */
  startMonth: string | null;
  /** 이 달까지 (YYYY-MM, 포함). 할부·대출 만기. null 이면 계속 */
  endMonth: string | null;
  memo: string;
}

export type ItemInput = Omit<Item, "id">;

/** 특정 기간에만 쓰는 실제 금액 (고지서 금액이 확정되면) */
export interface Override {
  itemId: number;
  /** 기간 이름 (YYYY-MM) */
  period: string;
  amount: number;
}

/** 계좌에 넣은 돈. 넣은 기간에 묶인다 (월급이 주말이라 하루 일찍 들어와도 그 기간으로 센다) */
export interface Deposit {
  id: number;
  accountId: number;
  /** 기간 이름 (YYYY-MM) */
  period: string;
  /** 넣은 날 (YYYY-MM-DD) */
  date: string;
  amount: number;
  memo: string;
}

export type DepositInput = Omit<Deposit, "id">;

export type BalanceKind = "stock" | "saving" | "loan";

/** 주식·적금·대출 잔액. 추적 없이 지금 얼마인지만 (대출은 남은 원금) */
export interface Balance {
  id: number;
  kind: BalanceKind;
  name: string;
  amount: number;
  memo: string;
  /** 금액을 마지막으로 바꾼 날 (YYYY-MM-DD) */
  updatedAt: string;
}

export type BalanceInput = Pick<Balance, "kind" | "name" | "amount" | "memo">;

export interface Settings {
  /** 기간 시작일(1~28). 1 이면 달력 월, 25 면 25일 ~ 다음 달 24일 (월급일 기준) */
  startDay: number;
}

export interface Period {
  /** YYYY-MM — 기간이 시작하는 달 */
  label: string;
  /** YYYY-MM-DD (포함) */
  start: string;
  /** YYYY-MM-DD (포함) */
  end: string;
}

export interface PlanLine {
  item: Item;
  /** 이번 기간에 나가는 날 (YYYY-MM-DD) */
  due: string;
  amount: number;
  /** 변동 항목인데 실제 금액을 아직 안 넣음 → 예상 금액 */
  estimated: boolean;
}

export interface AccountPlan {
  account: Account;
  lines: PlanLine[];
  /** 나갈 돈 합계 */
  total: number;
  deposits: Deposit[];
  /** 넣은 돈 합계 */
  deposited: number;
}

export interface Plan {
  period: Period;
  accounts: AccountPlan[];
  total: number;
  deposited: number;
}
