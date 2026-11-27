// Reports page checks against a running frontend and backend: empty state, a real report from a
// real analysis, list details, search, date filter, row menu, report page, download and phone
// width. Environment: E2E_BASE_URL, optional E2E_SCREENSHOTS and E2E_PLAYWRIGHT.

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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.fill("#fullName", "Reports Tester");
  await page.fill("#email", `reports.${stamp}@example.org`);
  await page.fill("#password", "Reports-Pass1");
  await page.fill("#confirmPassword", "Reports-Pass1");
  await page.fill("#organizationName", "Sample Hospital");
  await page.click("button[type=submit]");
  await page.waitForSelector(".step-card", { timeout: 30000 });

  await page.click(".sb-link:has-text('Reports')");
  await page.waitForSelector(".rp-empty", { timeout: 20000 });
  check("empty state explains how to create a report", (await page.textContent(".rp-empty")).includes("Create PDF report"));
  check("empty state offers a working route to a new analysis", (await page.$$(".rp-empty button:has-text('New analysis')")).length === 1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/rp-1-empty.png` });

  // A real report: upload, analyse, create the PDF.
  await page.click(".rp-empty button:has-text('New analysis')");
  await page.waitForSelector(".live-empty, .ds-context", { timeout: 20000 });
  check("New analysis leads to the workspace", true);
  const rows = ["ward,length_of_stay"];
  for (let i = 0; i < 90; i++) rows.push(`${["Medical", "Surgical", "Maternity"][i % 3]},${(i % 3 === 1 ? 6 : 3) + (i % 4)}`);
  await page.click("text=Upload dataset");
  await page.setInputFiles(".modal input[type=file]", { name: "ward-stays.csv", mimeType: "text/csv", buffer: Buffer.from(rows.join("\n")) });
  await page.fill("#dataset-name", "Ward Stays");
  await page.click(".modal button[type=submit]");
  await page.waitForSelector(".modal-title:has-text('is ready')", { timeout: 60000 });
  await page.click(".modal button:has-text('Done')");
  await page.waitForSelector("#ask", { timeout: 20000 });
  await page.fill("#ask", "Does length_of_stay differ by ward?");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".resp-headline", { timeout: 200000 });
  await page.locator(".resp").first().locator("button", { hasText: "Create PDF report" }).click();
  await page.waitForSelector(".report-row", { timeout: 120000 });

  await page.click(".sb-link:has-text('Reports')");
  await page.waitForSelector(".ds-row-name", { timeout: 30000 });
  const row = await page.textContent(".ds-row");
  check("row shows title, method, dataset, status, file type and date", row.includes("Ward Stays") && row.includes("Ready") && row.includes("PDF") && row.includes("Created"), row);
  const totals = await page.textContent(".ds-totals");
  check("overview totals reports and datasets", totals.includes("1 report from 1 dataset") && totals.includes("latest"), totals);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/rp-2-list.png` });

  await page.fill(".ds-search input", "ward stays");
  check("search matches the dataset name", (await page.$$(".ds-row")).length === 1);
  await page.fill(".ds-search input", "nothing-matches");
  await page.waitForSelector(".ds-none");
  check("no-match search says so and offers to clear", (await page.textContent(".ds-none")).includes("No reports match"));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/rp-3-no-match.png` });
  await page.click(".ds-none button");
  await page.selectOption(".ds-select select >> nth=0", "7");
  check("date filter keeps a report created today", (await page.$$(".ds-row")).length === 1);

  // Row menu: open the dataset from the report.
  await page.locator(".ds-row .row-menu .icon-btn").first().click();
  const items = await page.$$eval(".row-menu-item", (els) => els.map((e) => e.textContent.trim()));
  check("row menu offers view, download, dataset and analysis", ["View PDF", "Download PDF", "Open dataset", "Open analysis"].every((x) => items.includes(x)), items.join(", "));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/rp-4-menu.png` });
  await page.click(".row-menu-item:has-text('Open dataset')");
  await page.waitForSelector(".ds-detail-head", { timeout: 20000 });
  check("Open dataset lands on the dataset page", (await page.textContent(".ds-detail-head h1")) === "Ward Stays");

  // Report page and download from the list.
  await page.click(".sb-link:has-text('Reports')");
  await page.waitForSelector(".ds-row-name", { timeout: 20000 });
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click(".ds-row-actions button:has-text('Download')")]);
  check("download from the list saves a PDF", /\.pdf$/i.test(dl.suggestedFilename()), dl.suggestedFilename());
  await page.click("button.ds-row-name");
  await page.waitForSelector(".rp-pdf, .rp-compact, .rp-viewer .notice", { timeout: 30000 });
  check("report page loads the PDF without an error", (await page.$$(".rp-viewer .notice")).length === 0);
  check("report page links back to its analysis and dataset", (await page.$$(".ds-detail-actions button:has-text('Open analysis')")).length === 1 && (await page.$$(".ds-detail-actions button:has-text('Open dataset')")).length === 1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/rp-5-report.png` });

  for (const [w, h, label] of [[820, 1180, "tablet"], [390, 844, "mobile"]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.click('button[aria-label="Open menu"]');
    await page.click(".sb-link:has-text('Reports')");
    await page.waitForSelector(".ds-row-name", { timeout: 20000 });
    check(`no horizontal overflow on Reports at ${w}px`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/rp-6-${label}.png` });
  }

  check("no page or console errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
} finally {
  await browser.close();
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` :: ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
