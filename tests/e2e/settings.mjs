// Settings checks against a running frontend and backend: organisation profile, members, roles and
// account. Uses two real accounts. Environment: E2E_BASE_URL, optional E2E_SCREENSHOTS, E2E_PLAYWRIGHT.

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
const ADMIN = `settings.admin.${stamp}@example.org`;
const COLLEAGUE = `settings.colleague.${stamp}@example.org`;

async function register(ctx, { name, email, org }) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.fill("#fullName", name);
  await page.fill("#email", email);
  await page.fill("#password", "Settings-Pass1");
  await page.fill("#confirmPassword", "Settings-Pass1");
  await page.fill("#organizationName", org);
  await page.click("button[type=submit]");
  await page.waitForSelector(".sb-org-name", { timeout: 30000 });
  return page;
}

const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM, args: ["--no-sandbox"] });
try {
  // The colleague needs an account before an administrator can add them.
  const other = await browser.newContext();
  await register(other, { name: "Colleague Sample", email: COLLEAGUE, org: "Colleague Clinic" });
  await other.close();

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const page = await register(ctx, { name: "Settings Admin", email: ADMIN, org: "Sample Hospital" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

  await page.click(".sb-link:has-text('Settings')");
  await page.waitForSelector("#org-name", { timeout: 20000 });
  check("organisation section shows the current name", (await page.inputValue("#org-name")) === "Sample Hospital");
  check("save is disabled until something changes", await page.isDisabled(".st-actions button[type=submit]"));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/st-1-organisation.png` });

  await page.fill("#org-name", "S");
  await page.click(".st-actions button[type=submit]");
  check("a one-character name is rejected before saving", (await page.textContent("#org-name-err")).includes("2 to 160"));
  await page.fill("#org-email", "not-an-email");
  await page.fill("#org-name", "Sample Hospital Trust");
  await page.click(".st-actions button[type=submit]");
  check("an invalid contact email is rejected", (await page.textContent("#org-email-err")).includes("valid email"));
  await page.fill("#org-email", "research@example.org");
  await page.click(".st-actions button[type=submit]");
  await page.waitForSelector(".st-ok", { timeout: 20000 });
  check("saving shows success", (await page.textContent(".st-ok")).includes("Changes saved"));
  check("the sidebar shows the new organisation name", (await page.textContent(".sb-org-name")) === "Sample Hospital Trust");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/st-2-organisation-saved.png` });
  await page.reload({ waitUntil: "networkidle" });
  await page.click(".sb-link:has-text('Settings')");
  await page.waitForSelector("#org-name", { timeout: 20000 });
  check("the new name and email are stored by the backend", (await page.inputValue("#org-name")) === "Sample Hospital Trust" && (await page.inputValue("#org-email")) === "research@example.org");

  // Members
  await page.click(".st-nav-item:has-text('Members')");
  await page.waitForSelector(".st-members .ds-row", { timeout: 20000 });
  check("the only administrator is locked against changes", (await page.textContent(".st-members .ds-row")).includes("Last administrator"));
  check("a lone member sees how to add colleagues", (await page.$$(".st-note")).length === 1);
  await page.fill("#add-email", `nobody.${stamp}@example.org`);
  await page.click(".st-add button[type=submit]");
  await page.waitForSelector(".st-err", { timeout: 20000 });
  check("adding an email with no account explains why it failed", (await page.textContent(".st-err")).includes("No Hosptic account"));
  await page.fill("#add-email", COLLEAGUE);
  await page.selectOption(".st-add select", "ANALYST");
  await page.click(".st-add button[type=submit]");
  await page.waitForSelector(".st-inline.st-ok", { timeout: 20000 });
  check("adding an existing account works", (await page.$$(".st-members .ds-row")).length === 2 && (await page.textContent(".st-members")).includes("Colleague Sample"));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/st-3-members.png` });

  const colleague = page.locator(".st-members .ds-row", { hasText: "Colleague Sample" });
  await colleague.locator(".row-menu .icon-btn").click();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/st-4-member-menu.png` });
  await page.click(".row-menu-item:has-text('Researcher')");
  await page.waitForFunction(() => [...document.querySelectorAll(".st-members .ds-row")].some((r) => r.textContent.includes("Colleague Sample") && r.textContent.includes("Researcher") && r.textContent.includes("Role changed")), null, { timeout: 20000 });
  check("changing a role is saved", true);

  await colleague.locator(".row-menu .icon-btn").click();
  await page.click(".row-menu-item:has-text('Suspend access')");
  await page.waitForSelector(".confirm, [role=alertdialog], .modal", { timeout: 5000 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/st-5-confirm.png` });
  await page.click(".modal button:has-text('Suspend access')");
  await page.waitForFunction(() => [...document.querySelectorAll(".st-members .ds-row")].some((r) => r.textContent.includes("Suspended")), null, { timeout: 20000 });
  check("suspending asks first, then shows Suspended", true);
  await colleague.locator(".row-menu .icon-btn").click();
  await page.click(".row-menu-item:has-text('Reactivate')");
  await page.waitForFunction(() => [...document.querySelectorAll(".st-members .ds-row")].some((r) => r.textContent.includes("Access restored")), null, { timeout: 20000 });
  check("reactivating restores access", true);
  await colleague.locator(".row-menu .icon-btn").click();
  await page.click(".row-menu-item:has-text('Remove from organisation')");
  await page.click(".modal button:has-text('Remove member')");
  await page.waitForFunction(() => document.querySelectorAll(".st-members .ds-row").length === 1, null, { timeout: 20000 });
  check("removing a member asks first, then removes them", true);

  // Roles and account
  await page.click(".st-nav-item:has-text('Roles and permissions')");
  await page.waitForSelector(".st-matrix");
  check("roles table lists all four roles and marks yours", (await page.$$(".st-matrix thead th.c")).length === 4 && (await page.textContent(".st-matrix thead th.is-current")) === "Administrator");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/st-6-roles.png` });
  await page.click(".st-nav-item:has-text('Account')");
  await page.waitForSelector(".st-account");
  const account = await page.textContent(".st-account");
  check("account shows your name, email, role and organisation", account.includes("Settings Admin") && account.includes(ADMIN) && account.includes("Administrator") && account.includes("Sample Hospital Trust"), account);
  check("account offers sign out and is honest about missing controls", (await page.$$(".st-signout button:has-text('Sign out')")).length === 1 && (await page.textContent(".st-note")).includes("not available yet"));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/st-7-account.png` });

  for (const [w, h, label] of [[820, 1180, "tablet"], [390, 844, "mobile"]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.click(".st-nav-item:has-text('Members')");
    await page.waitForSelector(".st-members .ds-row");
    check(`no horizontal overflow in Settings at ${w}px`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/st-8-${label}.png` });
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
