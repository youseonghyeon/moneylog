// 브라우저 스모크: 운영과 같은 서버(node src/server/main.ts — dist + /api)를 빈 임시 DB 로 띄워
// 항목 추가·변동 금액·매년 항목·검사 오류·설정·계좌 삭제 거부를 실제 브라우저로 확인한다. 스크린샷은 .shots/.
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

  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  page.setDefaultTimeout(5000);
  page.on("pageerror", (e) => errors.push(String(e)));
  // 검사 오류(400)·계좌 삭제 거부(409)는 일부러 낸다 — 브라우저가 남기는 4xx 리소스 로그는 빼고 센다
  page.on("console", (m) => m.type() === "error" && !/status of 4\d\d/.test(m.text()) && errors.push(m.text()));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(".total");

  const total = () => page.locator(".total").innerText();
  const acct = (name) => page.locator(`section.acct[aria-label="${name}"]`);
  const sheet = page.locator(".sheet");
  async function addItem(account, { name, amount, day, variable, yearlyMonth }) {
    await acct(account).locator("button.add").click();
    await sheet.getByLabel("이름").fill(name);
    await sheet.locator(".money input").first().fill(String(amount));
    if (variable) await sheet.getByText("달마다 금액이 바뀜").click();
    if (yearlyMonth) {
      await sheet.getByRole("radio", { name: "매년" }).click();
      await sheet.getByLabel("월", { exact: true }).selectOption(String(yearlyMonth));
    }
    if (day) await sheet.getByLabel("날짜").fill(String(day));
    await sheet.getByRole("button", { name: "저장" }).click();
    await sheet.waitFor({ state: "detached" });
  }

  check((await page.locator(".transfer li").count()) === 3, "기본 계좌 3개");
  check((await total()) === "0원", "빈 DB 는 0원");
  await page.screenshot({ path: `${OUT}/01-empty-mobile.png` });

  await addItem("고정 지출", { name: "월세", amount: 550000, day: 25 });
  check((await total()) === "550,000원", "월세 추가 → 550,000원");
  await addItem("대출·고지서", { name: "전기", amount: 50000, day: 20, variable: true });
  check((await acct("대출·고지서").locator("em", { hasText: "예상" }).count()) === 1, "변동 항목은 '예상' 표시");
  check((await page.locator(".summary .hint").innerText()).includes("예상 금액 1건"), "요약에 예상 건수");
  await addItem("대출·고지서", { name: "대출 이자", amount: 320000, day: 5 });
  await addItem("생활비", { name: "식비", amount: 600000 });
  check((await total()) === "1,520,000원", "합계 1,520,000원");

  // 변동 항목에 이번 기간 실제 금액
  await acct("대출·고지서").getByText("전기").click();
  await sheet.getByPlaceholder("비우면 예상 금액으로 계산").fill("61230");
  await sheet.getByRole("button", { name: "저장" }).click();
  await sheet.waitFor({ state: "detached" });
  check((await total()) === "1,531,230원", "실제 금액 반영 → 1,531,230원");
  check((await page.locator(".summary .hint").count()) === 0, "예상 건수 안내가 사라진다");

  // 다음 기간엔 예상으로 돌아간다
  await page.getByLabel("다음 기간").click();
  await page.waitForFunction(() => document.querySelector(".total")?.textContent === "1,520,000원");
  check(true, "다음 기간은 예상 금액으로 1,520,000원");
  await page.getByLabel("이전 기간").click();
  await page.waitForFunction(() => document.querySelector(".total")?.textContent === "1,531,230원");

  // 이번 기간이 아닌 매년 항목 → 안 나가는 항목 목록
  const thisMonth = Number((await page.locator(".period h1").innerText()).match(/(\d+)월/)[1]);
  const other = (thisMonth % 12) + 1;
  await addItem("대출·고지서", { name: "자동차보험", amount: 900000, day: 3, yearlyMonth: other });
  check((await page.locator(".idle summary").innerText()).includes("1개"), "다른 달 매년 항목은 '안 나가는 항목'");
  check((await total()) === "1,531,230원", "다른 달 매년 항목은 합계에 안 든다");

  // 입력 오류는 시트 안에 문구로
  await acct("생활비").locator("button.add").click();
  await sheet.getByRole("button", { name: "저장" }).click();
  check((await sheet.locator(".error").innerText()).includes("이름을 넣어 주세요"), "빈 이름 → 오류 문구");
  await sheet.getByLabel("이름").fill("x");
  await sheet.getByRole("button", { name: "저장" }).click();
  check((await sheet.locator(".error").innerText()).includes("금액은"), "빈 금액 → 오류 문구");
  await sheet.getByRole("button", { name: "취소" }).click();

  await page.screenshot({ path: `${OUT}/02-filled-mobile.png`, fullPage: true });
  await acct("대출·고지서").getByText("전기").click();
  await page.screenshot({ path: `${OUT}/03-item-sheet-mobile.png` });
  await sheet.getByRole("button", { name: "취소" }).click();

  // 설정: 기간 시작일 · 항목 있는 계좌 삭제 거부
  await page.getByLabel("설정").click();
  await sheet.locator(".group").first().locator("input").fill("25");
  await sheet.getByRole("button", { name: "적용" }).click();
  await page.waitForFunction(() => document.querySelector(".period span")?.textContent?.includes(".25 –"));
  check(true, "시작일 25 → 기간이 25일부터");
  await sheet.locator(".account-edit li").nth(2).getByRole("button", { name: "삭제" }).click();
  check((await sheet.locator(".error").innerText()).includes("항목이 1개"), "항목 있는 계좌 삭제 → 409 문구");
  await page.screenshot({ path: `${OUT}/04-settings-mobile.png` });
  await sheet.getByLabel("닫기").click();

  // 넓은 화면 · 다크
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.screenshot({ path: `${OUT}/05-desktop.png` });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: `${OUT}/06-desktop-dark.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${OUT}/07-mobile-dark.png` });

  // 가로 넘침 없음 (모바일)
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
