// Role checks with real accounts: an administrator, a researcher and a viewer in one organisation.
// Registration always makes a new administrator, so the researcher and viewer are added to the
// administrator's organisation and then sign in to that membership through POST /auth/login with
// organizationId (a documented contract field the sign-in form does not send).
// Environment: E2E_BASE_URL, optional E2E_SCREENSHOTS and E2E_PLAYWRIGHT.

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
const PASSWORD = "Roles-Check-Pass1";
const people = {
  admin: { name: "Ada Admin", email: `roles.admin.${stamp}@example.org`, org: "Sample Hospital" },
  researcher: { name: "Rae Researcher", email: `roles.researcher.${stamp}@example.org`, org: "Rae Own Clinic" },
  viewer: { name: "Vic Viewer", email: `roles.viewer.${stamp}@example.org`, org: "Vic Own Clinic" },
};
const csv = (rows) => Buffer.from(rows.join("\n"));
const sampleRows = (label) => ["ward,length_of_stay", ...Array.from({ length: 30 }, (_, i) => `${label}${i % 3},${2 + (i % 5)}`)];

async function register(browser, p) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.fill("#fullName", p.name);
  await page.fill("#email", p.email);
  await page.fill("#password", PASSWORD);
  await page.fill("#confirmPassword", PASSWORD);
  await page.fill("#organizationName", p.org);
  await page.click("button[type=submit]");
  await page.waitForSelector(".sb-org-name", { timeout: 30000 });
  return { ctx, page };
}

const csrf = async (ctx) => (await ctx.cookies()).find((c) => c.name === "csrf_token")?.value;

async function upload(page, name, rows) {
  await page.click(".sb-link:has-text('Datasets')");
  await page.waitForSelector(".page-head, .live-empty", { timeout: 20000 });
  await page.click("text=Upload dataset");
  await page.setInputFiles(".modal input[type=file]", { name: `${name.toLowerCase().replace(/\s+/g, "-")}.csv`, mimeType: "text/csv", buffer: csv(rows) });
  await page.fill("#dataset-name", name);
  await page.click(".modal button[type=submit]");
  await page.waitForSelector(".modal-title:has-text('is ready')", { timeout: 60000 });
  await page.click(".modal button:has-text('Done')");
}

// Opens the row menu for a dataset and returns its items.
async function menuFor(page, name) {
  await page.click(".sb-link:has-text('Datasets')");
  await page.waitForSelector(".ds-row-name", { timeout: 20000 });
  const row = page.locator(".ds-row", { hasText: name });
  await row.locator(".row-menu .icon-btn").click();
  const items = await page.$$eval(".row-menu-item", (els) => els.map((e) => e.textContent.trim()));
  await page.keyboard.press("Escape");
  return items;
}

async function signInAs(browser, p, organizationId) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const res = await ctx.request.post(`${BASE}/api/v1/auth/login`, { data: { email: p.email, password: PASSWORD, organizationId } });
  const body = await res.json();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.waitForSelector(".sb-org-name", { timeout: 30000 });
  return { ctx, page, errors, role: body?.data?.role };
}

const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM, args: ["--no-sandbox"] });
try {
  // Accounts. The researcher and viewer exist first, so the administrator can add them.
  for (const key of ["researcher", "viewer"]) { const { ctx } = await register(browser, people[key]); await ctx.close(); }
  const admin = await register(browser, people.admin);
  const orgId = (await (await admin.ctx.request.get(`${BASE}/api/v1/auth/me`)).json()).data.organization.id;
  await upload(admin.page, "Admin Upload", sampleRows("A"));

  await admin.page.click(".sb-link:has-text('Settings')");
  await admin.page.click(".st-nav-item:has-text('Members')");
  for (const [key, role] of [["researcher", "RESEARCHER"], ["viewer", "VIEWER"]]) {
    await admin.page.fill("#add-email", people[key].email);
    await admin.page.selectOption(".st-add select", role);
    await admin.page.click(".st-add button[type=submit]");
    await admin.page.waitForFunction((n) => document.querySelector(".st-members")?.textContent.includes(n), people[key].name, { timeout: 20000 });
  }
  check("administrator adds a researcher and a viewer", (await admin.page.$$(".st-member")).length === 3);

  // ---- Researcher
  const r = await signInAs(browser, people.researcher, orgId);
  check("researcher session is for the administrator's organisation", r.role === "RESEARCHER" && (await r.page.textContent(".sb-org-name")) === "Sample Hospital", r.role);
  await upload(r.page, "Researcher Upload", sampleRows("R"));
  const own = await menuFor(r.page, "Researcher Upload");
  const others = await menuFor(r.page, "Admin Upload");
  check("researcher sees Delete on their own dataset", own.includes("Delete dataset"), own.join(", "));
  check("researcher does not see Delete on another person's dataset", !others.includes("Delete dataset"), others.join(", "));
  if (SHOTS) {
    await r.page.locator(".ds-row", { hasText: "Admin Upload" }).locator(".row-menu .icon-btn").click();
    await r.page.screenshot({ path: `${SHOTS}/roles-1-researcher-other-menu.png` });
    await r.page.keyboard.press("Escape");
  }
  await r.page.locator("button.ds-row-name", { hasText: "Admin Upload" }).click();
  await r.page.waitForSelector(".ds-detail-head", { timeout: 20000 });
  check("researcher's dataset page for another person's upload has no Delete", (await r.page.$$(".ds-detail-actions button[aria-label^='Delete']")).length === 0);

  // The backend still refuses, whatever the interface shows.
  const list = (await (await r.ctx.request.get(`${BASE}/api/v1/datasets?page=1&pageSize=100`)).json()).data.items;
  const adminSet = list.find((d) => d.name === "Admin Upload");
  const ownSet = list.find((d) => d.name === "Researcher Upload");
  const refused = await r.ctx.request.delete(`${BASE}/api/v1/datasets/${adminSet.id}`, { headers: { "X-CSRF-Token": await csrf(r.ctx) } });
  check("backend refuses a researcher deleting another person's dataset", refused.status() === 403, `status=${refused.status()}`);
  const members = await r.ctx.request.get(`${BASE}/api/v1/organization/members`);
  check("backend refuses member management for a researcher", members.status() === 403, `status=${members.status()}`);

  // Settings as a researcher
  await r.page.click(".sb-link:has-text('Settings')");
  await r.page.waitForSelector("#org-name", { timeout: 20000 });
  const navR = await r.page.$$eval(".st-nav-item", (els) => els.map((e) => e.textContent.trim()));
  check("researcher sees no Members section", !navR.includes("Members"), navR.join(", "));
  check("organisation fields are visible and read-only", (await r.page.inputValue("#org-name")) === "Sample Hospital" && (await r.page.isDisabled("#org-name")) && (await r.page.isDisabled("#org-email")));
  check("the administrator-only notice appears", (await r.page.textContent("#st-org-title + .st-lead")).includes("Only administrators"));
  check("no Save or Cancel controls for a researcher", (await r.page.$$(".st-card-foot")).length === 0);
  if (SHOTS) await r.page.screenshot({ path: `${SHOTS}/roles-2-researcher-organisation.png` });
  await r.page.click(".st-nav-item:has-text('Roles and permissions')");
  check("roles table highlights Researcher", (await r.page.textContent(".st-matrix thead th.is-current")) === "Researcher");
  const deleteRow = await r.page.$$eval(".st-matrix tbody tr", (trs) => trs.map((t) => t.innerText.replace(/\s+/g, " ")).find((t) => t.startsWith("Delete datasets")));
  check("roles table states researchers delete only their own uploads", /Own uploads/.test(deleteRow || ""), deleteRow);
  await r.page.click(".st-nav-item:has-text('Account')");
  const accR = await r.page.textContent(".st-rows");
  check("researcher's account shows their role and organisation", accR.includes("Researcher") && accR.includes("Sample Hospital") && accR.includes(people.researcher.email));
  if (SHOTS) await r.page.screenshot({ path: `${SHOTS}/roles-3-researcher-account.png` });

  // Authorised deletion still works, with the confirmation dialog.
  await r.page.click(".sb-link:has-text('Datasets')");
  await r.page.waitForSelector(".ds-row-name");
  await r.page.locator(".ds-row", { hasText: "Researcher Upload" }).locator(".row-menu .icon-btn").click();
  await r.page.click(".row-menu-item:has-text('Delete dataset')");
  await r.page.waitForSelector(".modal");
  await r.page.click(".modal button:has-text('Delete dataset')");
  await r.page.waitForFunction(() => ![...document.querySelectorAll(".ds-row-name")].some((e) => e.textContent === "Researcher Upload"), null, { timeout: 20000 });
  check("researcher deletes their own dataset after confirming", true);

  for (const [w, h, label] of [[820, 1180, "tablet"], [390, 844, "mobile"]]) {
    await r.page.setViewportSize({ width: w, height: h });
    await r.page.click('button[aria-label="Open menu"]');
    await r.page.click(".sb-link:has-text('Settings')");
    await r.page.waitForSelector("#org-name");
    check(`researcher Settings has no horizontal overflow at ${w}px`, !(await r.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
    if (SHOTS) await r.page.screenshot({ path: `${SHOTS}/roles-4-researcher-${label}.png` });
  }
  check("no console errors for the researcher", r.errors.length === 0, r.errors.join(" | "));

  // Sign out from Settings
  await r.page.setViewportSize({ width: 1440, height: 900 });
  await r.page.click(".st-nav-item:has-text('Account')");
  await r.page.click(".st-signout button");
  await r.page.waitForURL(/\/login/, { timeout: 20000 });
  check("sign-out from Settings ends the session", (await r.ctx.request.get(`${BASE}/api/v1/auth/me`)).status() === 401);
  await r.ctx.close();

  // ---- Viewer
  const v = await signInAs(browser, people.viewer, orgId);
  check("viewer session is for the administrator's organisation", v.role === "VIEWER", v.role);
  await v.page.click(".sb-link:has-text('Datasets')");
  await v.page.waitForSelector(".ds-row-name", { timeout: 20000 });
  check("viewer sees no Upload button", (await v.page.$$("button:has-text('Upload dataset')")).length === 0);
  const vItems = await menuFor(v.page, "Admin Upload");
  check("viewer sees no Delete action", !vItems.includes("Delete dataset"), vItems.join(", "));
  await v.page.click(".sb-link:has-text('Settings')");
  await v.page.waitForSelector("#org-name");
  const navV = await v.page.$$eval(".st-nav-item", (els) => els.map((e) => e.textContent.trim()));
  check("viewer sees no Members section and read-only organisation", !navV.includes("Members") && (await v.page.isDisabled("#org-name")) && (await v.page.$$(".st-card-foot")).length === 0);
  await v.page.click(".st-nav-item:has-text('Roles and permissions')");
  check("roles table highlights Viewer", (await v.page.textContent(".st-matrix thead th.is-current")) === "Viewer");
  const vDelete = await v.ctx.request.delete(`${BASE}/api/v1/datasets/${adminSet.id}`, { headers: { "X-CSRF-Token": await csrf(v.ctx) } });
  check("backend refuses a viewer deleting a dataset", vDelete.status() === 403, `status=${vDelete.status()}`);
  if (SHOTS) await v.page.screenshot({ path: `${SHOTS}/roles-5-viewer-roles.png` });
  check("no console errors for the viewer", v.errors.length === 0, v.errors.join(" | "));
  await v.ctx.close();

  // ---- Administrator keeps Delete on everyone's datasets, and it works.
  const aItems = await menuFor(admin.page, "Admin Upload");
  check("administrator sees Delete", aItems.includes("Delete dataset"), aItems.join(", "));
  await admin.page.locator(".ds-row", { hasText: "Admin Upload" }).locator(".row-menu .icon-btn").click();
  await admin.page.click(".row-menu-item:has-text('Delete dataset')");
  await admin.page.click(".modal button:has-text('Delete dataset')");
  await admin.page.waitForSelector(".live-empty, .ds-none", { timeout: 20000 });
  check("administrator deletes a dataset after confirming", true);
  void ownSet;
  await admin.ctx.close();
} finally {
  await browser.close();
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` :: ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
