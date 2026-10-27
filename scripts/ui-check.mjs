// 브라우저 스모크: 운영과 같은 서버(node src/server/main.ts — dist + /api)를 빈 임시 DB 로 띄우고,
// 에이전트가 하듯 API 로 데이터를 넣은 뒤 보기 전용 화면(계획·지출 탭)을 실제 브라우저로 확인한다. 스크린샷은 .shots/.
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
  await post("POST", "/api/items", { accountId: 1, name: "식비", amount: 600000, variable: true, cycle: "monthly", day: null });
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

  // 계획 탭
  check((await page.locator(".transfer li").count()) === 3, "기본 계좌 3개");
  check((await total()) === "1,531,230원", "합계 1,531,230원 (전기 실제 금액 반영)");
  check((await page.locator(".summary .hint").innerText()).includes("예상 금액 1건"), "변동 항목 실제 금액 없으면 예상 1건");
  check((await acct("생활비").locator("em", { hasText: "예상" }).count()) === 1, "식비에 '예상' 표시");
  check((await acct("생활비").locator(".left").innerText()).includes("남음 200,000원"), "생활비 800,000 − 600,000 → 남음 200,000원");
  check((await acct("대출·고지서").locator(".left .short").innerText()) === "부족 81,230원", "대출·고지서 300,000 − 381,230 → 부족 81,230원");
  check((await page.locator(".summary .put").innerText()).includes("넣은 돈 1,100,000원 · 부족 431,230원"), "요약: 넣은 돈·부족");
  check((await page.locator(".idle summary").innerText()).includes("1개"), "다른 달 매년 항목은 '안 나가는 항목'");
  const bal = acct("주식·적금·대출");
  check(
    (await bal.locator(".kind h3").allInnerTexts()).join("|").replace(/\s+/g, " ") === "주식 3,200,000원|적금 1,500,000원|대출 120,000,000원",
    "잔액은 주식·적금·대출 순으로 묶인다",
  );
  check((await bal.locator(".kind").nth(1).locator("small").innerText()).includes("2027-06 만기 ·"), "잔액 메모·기준일");
  // 보기 전용: 입력 수단이 없다
  const inputs = await page.locator("main button, main input, main select, main textarea, [aria-label='설정']").count();
  check(inputs === 0, `입력 버튼·입력칸 없음 (${inputs})`);
  check((await page.getByText(/항목 추가|\+ 입금|추가$/).count()) === 0, "'추가'·'입금' 버튼 문구 없음");
  await page.screenshot({ path: `${OUT}/01-plan-mobile.png`, fullPage: true });

  await page.getByLabel("다음 기간").click();
  // 다음 달: 전기는 예상 50,000 으로, 자동차보험(다음 달 매년)이 더해진다 → 550,000 + 50,000 + 320,000 + 600,000 + 900,000
  await page.waitForFunction(() => document.querySelector(".total")?.textContent === "2,420,000원");
  check(true, "다음 기간: 전기는 예상 금액으로, 매년 항목은 그 달에 → 2,420,000원");
  check((await page.locator(".summary .put").count()) === 0, "다음 기간엔 이번 기간 입금이 안 보인다");
  await page.getByLabel("이전 기간").click();
  await page.waitForFunction(() => document.querySelector(".total")?.textContent === "1,531,230원");

  // 지출 탭
  await page.getByRole("tab", { name: "지출" }).click();
  check((await total()) === "42,900원", "지출 합계 42,900원 (환불 −20,000 반영)");
  check((await page.locator(".summary .put").innerText()).includes(`${now.getDate()}일째`), "하루 평균 · N일째");
  check(
    (await page.locator(".cats .cat").allInnerTexts()).join(",") === "쇼핑,식비,카페·간식",
    "분류는 큰 것부터 (쇼핑 30,000 · 식비 9,600 · 카페 3,300)",
  );
  const days = page.locator(".days details");
  check((await days.count()) === (today === first ? 1 : 2), "날짜별 묶음");
  await days.first().locator("summary").click();
  const firstDay = await days.first().locator(".line.sub .name").allInnerTexts();
  check(firstDay[0].startsWith("왓더버거"), "그날 거래는 늦은 시각부터");
  await page.screenshot({ path: `${OUT}/02-spend-mobile.png`, fullPage: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".cats");
  check(page.url().endsWith("#spend"), "새로 고쳐도 지출 탭 유지 (#spend)");
  await page.getByRole("tab", { name: "계획" }).click();
  check(!page.url().includes("#"), "계획 탭으로 돌아가면 주소에서 #spend 가 빠진다");

  // 넓은 화면 · 다크
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.screenshot({ path: `${OUT}/03-plan-desktop.png` });
  await page.getByRole("tab", { name: "지출" }).click();
  await page.screenshot({ path: `${OUT}/04-spend-desktop.png` });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: `${OUT}/05-spend-desktop-dark.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "계획" }).click();
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
