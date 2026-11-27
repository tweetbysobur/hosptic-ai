// Live analysis flow against a running backend with AI configured: upload, ask, read the answer,
// generate a PDF report and download it. Requires E2E_BASE_URL; skips without Playwright.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require(process.env.E2E_PLAYWRIGHT || "playwright"));
} catch {
  console.log("SKIPPED: playwright is not installed");
  process.exit(0);
}
const BASE = process.env.E2E_BASE_URL;
if (!BASE) {
  console.log("SKIPPED: set E2E_BASE_URL");
  process.exit(0);
}
const SHOTS = process.env.E2E_SCREENSHOTS || null;

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail });
const stamp = Date.now().toString(36);

const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM, args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.fill("#fullName", "Amina Bello");
  await page.fill("#email", `analysis.${stamp}@example.org`);
  await page.fill("#password", "Analysis-Pass1");
  await page.fill("#confirmPassword", "Analysis-Pass1");
  await page.fill("#organizationName", "Ogun General Hospital");
  await page.click("button[type=submit]");
  await page.waitForSelector(".step-card", { timeout: 20000 });
  check("first use shows three numbered steps", (await page.$$(".step-card .step-number")).length === 3);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/a1-first-use.png` });

  const rows = ["admission_date,ward,age,length_of_stay,readmitted_30d"];
  for (let i = 0; i < 150; i++) {
    const ward = ["Medical", "Surgical", "Maternity"][i % 3];
    const los = (ward === "Surgical" ? 6 : ward === "Medical" ? 4 : 3) + (i % 5);
    rows.push(`2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")},${ward},${25 + (i % 60)},${los},${i % 6 === 0 ? "yes" : "no"}`);
  }
  await page.click("text=Upload dataset");
  await page.setInputFiles(".modal input[type=file]", { name: "admissions-2025.csv", mimeType: "text/csv", buffer: Buffer.from(rows.join("\n")) });
  await page.fill("#dataset-name", "Admissions 2025");
  await page.click(".modal button[type=submit]");
  await page.waitForSelector(".modal-title:has-text('is ready')", { timeout: 30000 });
  await page.click(".modal button:has-text('Done')");
  await page.waitForSelector(".starter", { timeout: 20000 });
  check("after the first upload the workspace opens a new analysis", (await page.$$("#ask")).length === 1);

  await page.click(".sb-link:has-text('Datasets')");
  await page.waitForSelector(".ds-table .ds-name", { timeout: 20000 });
  check("dataset table offers Analyse", (await page.$$(".ds-actions button:has-text('Analyse')")).length === 1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/a2-datasets.png` });

  await page.click(".ds-actions button:has-text('Analyse')");
  await page.waitForSelector(".starter", { timeout: 15000 });
  const starters = await page.$$eval(".starter-q", (els) => els.map((e) => e.textContent));
  check("starter questions come from the dataset's own columns", starters.some((q) => /length_of_stay|ward|age/.test(q)), starters.join(" | "));
  const context = await page.textContent(".ds-context");
  check("selected dataset shows its name, rows and columns", context.includes("Admissions 2025") && context.includes("150 rows") && context.includes("length_of_stay"), context);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/a3-new-analysis.png` });

  await page.fill("#ask", "Does length_of_stay differ by ward?");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".progress-card", { timeout: 10000 });
  check("analysis shows a progress state with its steps", (await page.$$(".progress-steps li")).length === 3);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/a4a-progress.png` });
  await page.waitForSelector(".resp-headline", { timeout: 120000 });
  await page.waitForTimeout(800);
  const headline = await page.textContent(".resp-headline");
  check("answer has a computed headline", headline && headline.length > 10, headline);
  check("answer shows a chart", (await page.$$(".resp .recharts-wrapper")).length >= 1);
  check("technical details are available", (await page.$$(".resp .tech")).length === 1);
  const stripLabels = await page.$$eval(".resp .stat-strip dt", (els) => els.map((e) => e.textContent));
  check("statistics show as one strip without repeating the headline's p-value", (await page.$$(".resp .stat-strip")).length === 1 && (await page.$$(".resp .stat")).length === 0 && (!/p [<=]/.test(headline) || !stripLabels.includes("p-value")), stripLabels.join(","));
  const chartTitle = await page.textContent(".resp .chart-title");
  check("chart title names the grouping column", chartTitle === "length_of_stay by ward", chartTitle);
  await page.evaluate(() => { const t = document.querySelector(".thread"); if (t) { t.style.scrollBehavior = "auto"; t.scrollTop = 0; } });
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/a4-answer.png` });

  const next = await page.$$eval(".resp .followups .chip", (els) => els.map((e) => e.textContent));
  check("next questions come from the dataset and skip the one asked", next.length >= 1 && !next.includes("Does length_of_stay differ by ward?"), next.join(" | "));

  // Follow-up on the same dataset, from a suggested question.
  await page.locator(".resp .followups .chip").first().click();
  await page.waitForFunction(() => document.querySelectorAll(".resp-headline").length >= 2, null, { timeout: 120000 });
  check("follow-up adds a second answer to the same conversation", (await page.$$(".resp")).length === 2);
  check("a divider separates the new question from the previous answer", (await page.$$(".thread-inner > .turn-divider + .msg-user")).length >= 1);
  check("the dataset chip is not repeated on the second answer", (await page.$$(".resp .resp-meta")).length === 1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/a4b-follow-up.png` });

  // Too-short question: the rephrase state, without a request.
  await page.fill("#ask", "ward");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".analysis-error", { timeout: 10000 });
  const invalid = await page.textContent(".analysis-error");
  check("a too-short question shows the rephrase state", invalid.includes("more detail") && (await page.$$(".analysis-error button")).length === 1, invalid);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/a4c-invalid.png` });

  const firstAnswer = page.locator(".resp").first();
  await firstAnswer.locator("button", { hasText: "Create PDF report" }).click();
  await page.waitForSelector(".report-row", { timeout: 60000 });
  check("report button produces a one-row confirmation", (await page.textContent(".report-row")).includes("PDF report") && (await page.$$(".report-row button:has-text('Download')")).length === 1);
  check("the analysis now shows its saved report", (await firstAnswer.locator(".report-action").textContent()).includes("saved under Reports"));

  await page.fill("#ask", "Generate a report of this analysis");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll(".report-row").length >= 2, null, { timeout: 60000 });
  check("typing a report request still works", true);

  await page.click(".sb-link:has-text('Reports')");
  await page.waitForSelector(".row-title", { timeout: 15000 });
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click(".row .row-main")]);
  const file = download.suggestedFilename();
  check("report downloads as a PDF", /\.pdf$/i.test(file), file);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/a5-reports.png` });

  // Phone width: the composer note hides once the reader scrolls back into earlier answers.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click(".sb-link:has-text('Conversations')").catch(() => {});
  await page.reload({ waitUntil: "networkidle" });
  await page.click('button[aria-label="Open menu"]');
  await page.locator(".sb-item").first().click();
  await page.waitForSelector(".resp-headline", { timeout: 20000 });
  await page.evaluate(() => { const t = document.querySelector(".thread"); t.style.scrollBehavior = "auto"; t.scrollTop = t.scrollHeight; t.dispatchEvent(new Event("scroll")); });
  await page.waitForTimeout(300);
  const noteShownAtEnd = await page.$eval(".composer-note", (n) => !n.classList.contains("is-hidden"));
  await page.evaluate(() => { const t = document.querySelector(".thread"); t.scrollTop = 0; t.dispatchEvent(new Event("scroll")); });
  await page.waitForTimeout(300);
  const noteHiddenScrolled = await page.$eval(".composer-note", (n) => n.classList.contains("is-hidden"));
  check("mobile composer note hides while reading earlier answers", noteShownAtEnd && noteHiddenScrolled);
  check("no horizontal overflow at 390px", !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.reload({ waitUntil: "networkidle" });
  await page.click(".sb-link:has-text('Conversations')");
  await page.waitForSelector(".row-title", { timeout: 15000 });
  check("conversation is kept after reload", (await page.$$(".row-title")).length >= 1);

  check("no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
} finally {
  await browser.close();
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` :: ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
