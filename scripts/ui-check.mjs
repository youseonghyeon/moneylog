// 브라우저 스모크: 운영과 같은 서버(node src/server/main.ts — dist + /api)를 빈 임시 DB 로 띄우고,
// 에이전트가 하듯 API 로 데이터를 넣은 뒤 보기 전용 화면(예정·지출 탭)을 실제 브라우저로 확인한다. 스크린샷은 .shots/.
// 실행: npm run ui-check   (포트 5299 — 사용자의 5173·8787 과 겹치지 않게)
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { build } from "vite";

const PORT = 5299;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = ".shots";
mkdirSync(OUT, { recursive: true });

let failed = 0;
function check(ok, what) {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed++;
}

await build({ logLevel: "warn" });

const dir = mkdtempSync(join(tmpdir(), "moneylog-ui-"));
const server = spawn(process.execPath, ["src/server/main.ts"], {
  env: { ...process.env, PORT: String(PORT), DB_PATH: join(dir, "ui.db") },
  stdio: ["ignore", "inherit", "inherit"],
});
for (let i = 0; ; i++) {
  if (await fetch(`${BASE}/healthz`).then((r) => r.ok, () => false)) break;
  if (i > 50) throw new Error(`서버가 5초 안에 뜨지 않았습니다.\n해결: node src/server/main.ts 를 직접 실행해 오류를 보세요.\n참조: scripts/ui-check.mjs`);
  await new Promise((r) => setTimeout(r, 100));
}

let browser;
const errors = [];
try {
  browser = await chromium.launch();
  // 서버: 정적 서빙·캐시·SPA 폴백·API 404
  const idx = await fetch(`${BASE}/some/deep/link`);
  check(idx.ok && (await idx.text()).includes('id="root"'), "없는 경로는 index.html (SPA 폴백)");
  check(idx.headers.get("cache-control") === "no-cache", "index.html 은 no-cache");
  const html = await (await fetch(BASE)).text();
  const asset = html.match(/\/assets\/[^"]+\.js/)?.[0];
  const a = await fetch(BASE + asset);
  check(a.ok && a.headers.get("cache-control")?.includes("immutable"), `번들은 영구 캐시 (${asset})`);
  const nope = await fetch(`${BASE}/api/nope`);
  check(nope.status === 404 && (await nope.json()).error?.includes("없는 API"), "없는 API 는 JSON 404");

  // 에이전트처럼 API 로 넣는다 (화면에는 입력 수단이 없다)
  async function post(method, path, body) {
    const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok && r.status !== 204) throw new Error(`${method} ${path} → ${r.status} ${await r.text()}`);
    return r.status === 204 ? null : r.json();
  }
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; // 시작일 1 → 이번 기간 = 이번 달
  const today = `${ym}-${String(now.getDate()).padStart(2, "0")}`;
  const first = `${ym}-01`;
  const other = (now.getMonth() + 1) % 12 + 1;
  await post("POST", "/api/items", { accountId: 3, name: "월세", amount: 550000, cycle: "monthly", day: 25 });
  const elec = await post("POST", "/api/items", { accountId: 2, name: "전기", amount: 50000, variable: true, cycle: "monthly", day: 20 });
  await post("POST", "/api/items", { accountId: 2, name: "대출 이자", amount: 320000, cycle: "monthly", day: 5 });
  await post("POST", "/api/items", { accountId: 1, name: "식비", amount: 600000, variable: true, cycle: "monthly", day: null, living: true });
  await post("POST", "/api/items", { accountId: 2, name: "자동차보험", amount: 900000, cycle: "yearly", month: other, day: 3 });
  await post("PUT", `/api/items/${elec.id}/actual/${ym}`, { amount: 61230 });
  await post("POST", "/api/deposits", { accountId: 1, period: ym, date: first, amount: 800000, memo: "월급" });
  await post("POST", "/api/deposits", { accountId: 2, period: ym, date: first, amount: 300000 });
  await post("POST", "/api/balances", { kind: "stock", name: "토스증권", amount: 3200000 });
  await post("POST", "/api/balances", { kind: "loan", name: "전세대출", amount: 120000000 });
  await post("POST", "/api/balances", { kind: "saving", name: "청년미래적금", amount: 1500000, memo: "2027-06 만기" });
  const sp = (date, time, amount, category, merchant, ref) => post("POST", "/api/spends", { date, time, amount, category, merchant, source: "신한카드 신용", ref });
  await sp(today, "12:05", 9600, "식비", "왓더버거", "t1");
  await sp(today, "09:35", 3300, "카페·간식", "메가커피", "t2");
  await sp(first, "20:00", 50000, "쇼핑", "쿠팡", "t3");
  await sp(first, "20:10", -20000, "쇼핑", "쿠팡", "t4");
  check((await fetch(BASE + "/api/spends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: today, amount: 1, category: "식비", merchant: "x", ref: "t1" }) })).status === 409, "같은 ref 거래는 409");

  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  page.setDefaultTimeout(5000);
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".total");
  const total = () => page.locator(".total").innerText();
  const acct = (name) => page.locator(`section.acct[aria-label="${name}"]`);

  // 예정 탭 — 날짜별로 빠져나갈 돈만. 생활비 예상 항목(식비, living)·입금·잔액·남음/부족은 안 보인다
  // 휴대폰: 처음엔 요약만, 줄을 누르면 그 줄 아래로 펼쳐진다 (한 번에 하나)
  const pick = (name) => page.locator(".pick", { hasText: name });
  check((await total()) === "931,230원", "입금 필요 금액 931,230원 (생활비 항목 600,000 은 뺀다)");
  check((await page.locator(".pick").count()) === 3, "요약 줄 = 빠져나갈 돈 있는 계좌 2 + 안 나가는 항목 (생활비 계좌는 없음)");
  check((await page.locator("section.acct").count()) === 0, "휴대폰은 처음엔 다 접혀 있다");
  check((await pick("대출·고지서").locator("b").innerText()) === "381,230원", "계좌 줄에 그 계좌 입금 필요 금액");
  await pick("대출·고지서").click();
  check((await pick("대출·고지서").getAttribute("aria-expanded")) === "true", "누른 줄은 열림 표시");
  check((await page.locator(".summary .unfold section.acct").count()) === 1, "누른 줄 바로 아래로 펼쳐진다");
  const sched = acct("대출·고지서");
  check((await sched.locator("header .sum").innerText()) === "입금 필요 381,230원", "계좌 머리에 입금 필요 금액");
  check(
    (await sched.locator(".rest").allInnerTexts()).join("|") === "남은 61,230원|남은 0원",
    "날짜순으로 빼고 남은 금액 — 마지막 줄에서 0원",
  );
  check((await page.locator("main").getByText(/입금$|넣은 돈|남음|부족/).count()) === 0, "입금·넣은 돈·남음·부족 표시 없음");
  await page.screenshot({ path: `${OUT}/01-plan-mobile-open.png`, fullPage: true });
  await pick("대출·고지서").click();
  check((await page.locator("section.acct").count()) === 0, "열린 줄을 다시 누르면 접힌다");
  // 날짜가 지났고 금액이 확정된 줄만 "나감" (대출 이자 5일 · 전기 20일(실제 금액) · 월세 25일)
  const gone = [5, 20, 25].filter((d) => d <= now.getDate());
  let goneSeen = 0;
  for (const n of ["대출·고지서", "고정 지출"]) {
    await pick(n).click();
    goneSeen += await acct(n).locator("em", { hasText: "나감" }).count();
  }
  check(goneSeen === gone.length, `지난 확정 항목은 '나감' (${gone.length}건)`);
  await pick("안 나가는 항목").click();
  check((await page.locator('section.acct[aria-label="이번 기간에 안 나가는 항목"] .line').count()) === 1, "다른 달 매년 항목은 '안 나가는 항목' (생활비 항목은 여기도 없음)");
  await pick("안 나가는 항목").click();
  await page.screenshot({ path: `${OUT}/01-plan-mobile.png`, fullPage: true });
  // 보기 전용: 입력 수단이 없다
  // 요약 줄·분류·정렬·달력 칸은 볼 것을 고르는 버튼이라 뺀다
  const inputs = await page.locator("main button:not(.cal-cell):not(.pick):not(.cat-pick):not(.sort-btn), main input, main select, main textarea, [aria-label='설정']").count();
  check(inputs === 0, `입력 버튼·입력칸 없음 (${inputs})`);
  check((await page.getByText(/항목 추가|\+ 입금|추가$/).count()) === 0, "'추가'·'입금' 버튼 문구 없음");
  await page.screenshot({ path: `${OUT}/01-plan-mobile.png`, fullPage: true });

  await page.getByLabel("다음 기간").click();
  // 다음 달: 전기는 예상 50,000 으로, 자동차보험(다음 달 매년)이 더해진다 → 550,000 + 50,000 + 320,000 + 900,000
  await page.waitForFunction(() => document.querySelector(".total")?.textContent === "1,820,000원");
  check(true, "다음 기간: 전기는 예상 금액으로, 매년 항목은 그 달에 → 1,820,000원");
  check((await page.locator(".summary .hint").innerText()).includes("예상 금액 1건"), "실제 금액 없는 변동 항목은 예상");
  await page.getByLabel("이전 기간").click();
  await page.waitForFunction(() => document.querySelector(".total")?.textContent === "931,230원");

  // 지출 탭
  await page.getByRole("tab", { name: "생활비" }).click();
  check((await total()) === "42,900원", "지출 합계 42,900원 (환불 −20,000 반영)");
  check((await page.locator(".summary .put").innerText()).includes(`${now.getDate()}일째`), "하루 평균 · N일째");
  check(
    (await page.locator(".cats .cat").allInnerTexts()).join(",") === "쇼핑,식비,카페·간식",
    "분류는 큰 것부터 (쇼핑 30,000 · 식비 9,600 · 카페 3,300)",
  );
  const cells = page.locator(".cal-cell:not(.out)");
  const monthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  check((await cells.count()) === monthDays, `달력은 기간 날 수만큼 (${monthDays}칸)`);
  check((await page.locator(".cal-cell.on.today").count()) === 1, "처음엔 오늘이 골라져 있다");
  const picked = page.locator('section[aria-label="고른 날"]');
  check((await picked.locator(".line .name").first().innerText()).startsWith("왓더버거"), "고른 날 거래는 늦은 시각부터");
  if (today !== first) {
    check((await page.locator(".cal-cell.today .cal-amt").innerText()) === "12,900", "오늘 칸에 그날 합계");
    await cells.first().click();
    check((await picked.locator(".sum").innerText()) === "30,000원", "1일 칸을 누르면 그날 합계 30,000원 (환불 반영)");
    check((await picked.locator(".amt.refund").count()) === 1, "환불은 흐리게");
    await page.locator(".cal-cell.today").click();
  }
  // 분류를 누르면 그 분류 거래 — 금액 큰 순, 날짜순으로 바꿀 수 있다
  const catList = page.locator('section[aria-label="고른 분류"]');
  await page.locator(".cat-pick", { hasText: "쇼핑" }).click();
  check((await catList.locator("header .sum").innerText()) === "30,000원", "쇼핑을 누르면 쇼핑 거래 목록 (합계 30,000원)");
  check((await catList.locator(".amt").allInnerTexts()).join("|") === "50,000원|-20,000원", "처음엔 금액 큰 순");
  await catList.getByRole("button", { name: "날짜순" }).click();
  check((await catList.locator(".amt").allInnerTexts()).join("|") === "-20,000원|50,000원", "날짜순: 같은 날이면 늦은 시각부터");
  await page.screenshot({ path: `${OUT}/02b-spend-category-mobile.png`, fullPage: true });
  await page.locator(".cat-pick", { hasText: "쇼핑" }).click();
  check((await catList.count()) === 0 && (await page.locator('section[aria-label="고른 날"]').count()) === 1, "같은 분류를 다시 누르면 날짜 보기로");
  await page.locator(".cat-pick", { hasText: "식비" }).click();
  await page.locator(".cal-cell.today").click();
  check((await catList.count()) === 0, "달력 날짜를 누르면 날짜 보기로");
  await page.screenshot({ path: `${OUT}/02-spend-mobile.png`, fullPage: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".cats");
  check(page.url().endsWith("#spend"), "새로 고쳐도 지출 탭 유지 (#spend)");
  await page.getByRole("tab", { name: "예정" }).click();
  check(!page.url().includes("#"), "예정 탭으로 돌아가면 주소에서 #spend 가 빠진다");

  // 잔액 탭
  await page.getByRole("tab", { name: "잔액" }).click();
  check(page.url().endsWith("#balance"), "잔액 탭 주소 #balance");
  check(
    (await page.locator(".summary .kv").allInnerTexts()).join("|").replace(/\s+/g, " ") === "주식 3,200,000원|적금 1,500,000원|대출 120,000,000원",
    "잔액 탭 요약: 종류별 합계",
  );
  const bal = acct("주식·적금·대출");
  check((await bal.locator(".kind h3").count()) === 3, "잔액은 주식·적금·대출로 묶인다");
  check((await bal.locator(".kind").nth(1).locator("small").innerText()).includes("2027-06 만기 ·"), "잔액 메모·기준일");
  await page.screenshot({ path: `${OUT}/07-balance-mobile.png`, fullPage: true });
  await page.getByRole("tab", { name: "예정" }).click();

  // 넓은 화면 · 다크
  await page.setViewportSize({ width: 1280, height: 860 });
  // PC: 오른쪽에 하나만, 처음엔 첫 계좌. 줄을 누르면 바뀐다(접히지는 않는다)
  await page.waitForSelector(".detail section.acct");
  check((await page.locator(".detail section.acct").count()) === 1 && (await page.locator(".detail section.acct").getAttribute("aria-label")) === "대출·고지서", "PC: 오른쪽에 첫 계좌 하나만");
  check((await page.locator(".summary .unfold").count()) === 0, "PC: 요약 안에는 펼치지 않는다");
  await pick("고정 지출").click();
  await pick("고정 지출").click();
  check((await page.locator(".detail section.acct").getAttribute("aria-label")) === "고정 지출", "PC: 누른 계좌로 바뀌고 다시 눌러도 닫히지 않는다");
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  check(h <= 860, `PC: 한 화면 안에 들어온다 (${h}px)`);
  await page.screenshot({ path: `${OUT}/03-plan-desktop.png` });
  await page.getByRole("tab", { name: "생활비" }).click();
  await page.screenshot({ path: `${OUT}/04-spend-desktop.png` });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: `${OUT}/05-spend-desktop-dark.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "예정" }).click();
  await page.screenshot({ path: `${OUT}/06-plan-mobile-dark.png` });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, "모바일 가로 스크롤 없음");

  check(errors.length === 0, `브라우저 오류 없음${errors.length ? `: ${errors.join(" | ")}` : ""}`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  rmSync(dir, { recursive: true, force: true });
}

console.log(failed ? `\n${failed}개 실패` : "\n모두 통과 — 스크린샷은 .shots/");
process.exit(failed ? 1 : 0);
