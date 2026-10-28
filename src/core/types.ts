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
  /** 생활비 예상 항목 — 예정 탭(날짜별로 빠져나갈 돈)에서 뺀다. 생활비는 생활비 탭에서 실제 거래로 본다 */
  living: boolean;
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

/** 주식 · 적금 · 보증금(월세·전세) · 대출 */
export type BalanceKind = "stock" | "saving" | "deposit" | "loan";
export const BALANCE_KINDS: BalanceKind[] = ["stock", "saving", "deposit", "loan"];

/** 주식·적금·보증금·대출 잔액. 추적 없이 지금 얼마인지만 (대출은 남은 원금) */
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

/** 생활비 거래 한 건 (보기 전용 — "필요한 돈" 계산에 안 들어간다). 환불·취소는 음수 */
export interface Spend {
  id: number;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, 모르면 null */
  time: string | null;
  amount: number;
  category: SpendCategory;
  merchant: string;
  /** 어디서 나갔나 (예: 신한카드 신용, 토스) */
  source: string;
  /** 같은 거래를 두 번 넣지 않게 하는 키 (파일의 승인번호·시각 등) */
  ref: string | null;
  /** 한 결제를 품목별로 나눈 것 (예: 쿠팡페이 80,000 → 삼겹살 10,000 · 식비 …). 없으면 [] */
  parts: SpendPart[];
}

/** 결제 안의 품목 하나. 분류별 합계는 나눈 결제를 품목의 분류로 센다 */
export interface SpendPart {
  name: string;
  amount: number;
  category: SpendCategory;
}

export type SpendInput = Omit<Spend, "id" | "parts">;

export const SPEND_CATEGORIES = [
  "식비", "유흥비", "카페·간식", "편의점", "담배", "쇼핑", "세탁", "미용", "구독·IT", "게임", "병원", "교통", "밥값 송금", "기타",
] as const;
export type SpendCategory = (typeof SPEND_CATEGORIES)[number];

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
