// Dataset Library checks against a running frontend and backend: empty state, upload with a
// description, search and filter, the dataset page (columns, personal-data notice, preview masking,
// quality report) and phone width. Environment: E2E_BASE_URL, optional E2E_SCREENSHOTS and E2E_PLAYWRIGHT.

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

// Sample register with a personal-data column (patient_name) and some missing values.
function csv() {
  const rows = ["patient_name,ward,age,length_of_stay,readmitted"];
  for (let i = 0; i < 60; i++) {
    const age = i % 10 === 0 ? "" : String(30 + (i % 50));
    rows.push(`Sample Person ${i},${["Medical", "Surgical", "Maternity"][i % 3]},${age},${2 + (i % 7)},${i % 4 === 0 ? "yes" : "no"}`);
  }
  return Buffer.from(rows.join("\n"));
}

const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM, args: ["--no-sandbox"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.fill("#fullName", "Library Tester");
  await page.fill("#email", `library.${stamp}@example.org`);
  await page.fill("#password", "Library-Pass1");
  await page.fill("#confirmPassword", "Library-Pass1");
  await page.fill("#organizationName", "Sample Hospital");
  await page.click("button[type=submit]");
  await page.waitForSelector(".step-card", { timeout: 30000 });
  check("empty library shows the first-use steps", (await page.$$(".step-card")).length === 3);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/lib-1-empty.png` });

  await page.click("text=Upload dataset");
  await page.setInputFiles(".modal input[type=file]", { name: "admissions-q1.csv", mimeType: "text/csv", buffer: csv() });
  await page.fill("#dataset-name", "Admissions Q1");
  await page.fill("#dataset-description", "Sample adult admissions, January to March, all wards.");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/lib-2-upload.png` });
  await page.click(".modal button[type=submit]");
  await page.waitForSelector(".modal-title:has-text('is ready')", { timeout: 60000 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/lib-3-upload-done.png` });
  await page.click(".modal button:has-text('Done')");

  await page.click(".sb-link:has-text('Datasets')");
  await page.waitForSelector(".ds-row-name", { timeout: 20000 });
  const rowText = await page.textContent(".ds-row");
  check("list shows name, description, rows and columns", rowText.includes("Admissions Q1") && rowText.includes("January to March") && rowText.includes("60 rows") && rowText.includes("5 columns"), rowText);
  check("list flags the personal-data column", rowText.includes("1 personal-data column excluded"), rowText);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/lib-4-list.png` });

  await page.fill(".ds-search input", "nothing-matches-this");
  await page.waitForSelector(".ds-none");
  check("search with no match says so and offers to clear", (await page.textContent(".ds-none")).includes("No datasets match"));
  await page.click(".ds-none button");
  await page.fill(".ds-search input", "march");
  check("search matches the description", (await page.$$(".ds-row")).length === 1);
  await page.fill(".ds-search input", "");

  await page.click("button.ds-row-name");
  await page.waitForSelector(".ds-detail-head", { timeout: 20000 });
  const head = await page.textContent(".ds-detail-head");
  check("dataset page shows facts and the original file name", head.includes("Admissions Q1") && head.includes("60") && head.includes("admissions-q1.csv"), head);
  check("dataset page explains the personal-data column", (await page.textContent(".ds-privacy")).includes("patient_name"));
  const cols = await page.$$eval(".ds-cols tbody tr", (trs) => trs.map((t) => t.innerText.replace(/\s+/g, " ")));
  check("columns tab lists every column with its type", cols.length === 5 && cols.some((c) => /^age Number 6 \(10\.0%\)/.test(c)), cols.join(" | "));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/lib-5-columns.png` });

  await page.click("#tab-preview");
  await page.waitForSelector(".ds-preview tbody tr", { timeout: 20000 });
  const masked = await page.$$(".ds-preview .cell-masked");
  check("preview shows rows with the personal-data column masked", (await page.$$(".ds-preview tbody tr")).length === 20 && masked.length === 20, `masked=${masked.length}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/lib-6-preview.png` });

  await page.click("#tab-quality");
  await page.waitForSelector(".ds-quality", { timeout: 20000 });
  const quality = await page.textContent(".ds-quality");
  check("quality tab reports missing values and issues from the backend", /Missing values\s*6/.test(quality) && quality.includes("Issues"), quality.slice(0, 160));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/lib-7-quality.png` });

  await page.click(".ds-back");
  await page.waitForSelector(".ds-list");
  check("back returns to the library", (await page.$$(".ds-row")).length === 1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  check("no horizontal overflow on the library at 390px", !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/lib-8-list-mobile.png` });
  await page.click("button.ds-row-name");
  await page.waitForSelector(".ds-cols", { timeout: 20000 });
  check("no horizontal overflow on the dataset page at 390px", !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/lib-9-detail-mobile.png` });

  check("no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
} finally {
  await browser.close();
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` :: ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
