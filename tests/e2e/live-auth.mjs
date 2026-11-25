// Live integration checks for registration, sign-in, session restoration, expiry, sign-out and
// failure states. Requires a running backend and frontend (see docs/integration/phase-1-report.md).
//
// Environment:
//   E2E_BASE_URL          frontend connected to the backend, e.g. http://localhost:3010
//   E2E_UNCONFIGURED_URL  frontend without HOSPTIC_API_URL (optional)
//   E2E_UNREACHABLE_URL   frontend whose backend URL points nowhere (optional)
//   E2E_PLAYWRIGHT        path to the Playwright package (optional)
// Skips with exit code 0 when Playwright is not installed.

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

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail });
const unique = Date.now().toString(36);
const EMAIL = `e2e.${unique}@example.org`;
const PASSWORD = "E2e-Password1";
const ORG = `E2E Hospital ${unique}`;

async function fill(page, id, value) {
  await page.fill(`#${id}`, value);
}

async function registerAccount(page) {
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await fill(page, "fullName", "E2E Administrator");
  await fill(page, "email", EMAIL);
  await fill(page, "password", PASSWORD);
  await fill(page, "confirmPassword", PASSWORD);
  await fill(page, "organizationName", ORG);
  await page.click("button[type=submit]");
  await page.waitForURL(`${BASE}/app`, { timeout: 15000 });
  await page.waitForSelector(".sb-org-name", { timeout: 15000 });
}

const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM, args: ["--no-sandbox"] });

try {
  // ---- Live backend: full account lifecycle in one browser context
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const apiRequests = [];
  page.on("request", (r) => { const p = new URL(r.url()).pathname; if (p.startsWith("/api/")) apiRequests.push(`${r.method()} ${p}`); });

  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  check("anonymous /app redirects to sign-in with next", new URL(page.url()).pathname === "/login" && new URL(page.url()).searchParams.get("next") === "/app", page.url());

  // Client-side validation blocks a short password before any request
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  apiRequests.length = 0;
  await fill(page, "fullName", "E2E Administrator");
  await fill(page, "email", EMAIL);
  await fill(page, "password", "short");
  await fill(page, "confirmPassword", "short");
  await fill(page, "organizationName", ORG);
  await page.click("button[type=submit]");
  await page.waitForSelector("#password-error");
  check("short password shows an inline error", (await page.textContent("#password-error")).includes("at least 10"));
  check("validation makes no API request", apiRequests.length === 0, apiRequests.join(","));

  await registerAccount(page);
  check("registration signs in and opens the workspace", new URL(page.url()).pathname === "/app");
  check("workspace shows the real organisation name", (await page.textContent(".sb-org-name")) === ORG);
  check("workspace shows the administrator role", (await page.textContent(".sb-org-meta")).includes("Administrator"));

  // Honest empty workspace: upload-first, and no sample data presented as the hospital's own.
  await page.waitForSelector(".live-empty", { timeout: 15000 });
  check("empty workspace leads with upload", (await page.textContent(".live-empty h1")).includes("first dataset") && (await page.$$("text=Upload dataset")).length >= 1);
  const appText = await page.innerText("body");
  check("no synthetic dataset names in the signed-in workspace", !/Maternal Outcomes|Hospital Admissions 2025|Demo workspace/.test(appText));
  check("workspace avatar uses organisation initials", (await page.textContent(".sb-org-avatar")).trim() === "EH");

  // Upload a real CSV through the dialog; the backend profiles it.
  const rows = ["age,ward,length_of_stay,readmitted"];
  for (let i = 0; i < 40; i++) rows.push(`${30 + (i % 40)},${["A", "B", "C"][i % 3]},${2 + (i % 9)},${i % 5 === 0 ? "yes" : "no"}`);
  await page.click("text=Upload dataset");
  await page.waitForSelector(".modal");
  await page.setInputFiles(".modal input[type=file]", { name: "ward-stays.csv", mimeType: "text/csv", buffer: Buffer.from(rows.join("\n")) });
  await page.click(".modal button[type=submit]");
  await page.waitForSelector(".modal-title:has-text('is ready')", { timeout: 30000 });
  const uploadSummary = await page.textContent(".modal-body");
  check("upload confirms rows and columns from the backend", uploadSummary.includes("40 rows") && uploadSummary.includes("4 columns"), uploadSummary);
  await page.click(".modal button:has-text('Done')");
  await page.waitForSelector(".row-title", { timeout: 15000 });
  check("uploaded dataset appears in the workspace list", (await page.textContent(".row-title")) === "ward-stays");

  // Wrong file type is caught before upload
  apiRequests.length = 0;
  await page.click("text=Upload dataset");
  await page.setInputFiles(".modal input[type=file]", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await page.click(".modal button[type=submit]");
  await page.waitForSelector(".modal .field-error");
  check("unsupported file type is rejected without a request", apiRequests.filter((r) => r.includes("/datasets/upload")).length === 0);
  await page.click(".modal button:has-text('Cancel')");

  const cookies = await ctx.cookies();
  const access = cookies.find((c) => c.name === "access_token");
  const refresh = cookies.find((c) => c.name === "refresh_token");
  check("access token cookie is HTTP-only", access?.httpOnly === true);
  check("refresh token cookie is HTTP-only", refresh?.httpOnly === true);
  const visibleToScript = await page.evaluate(() => document.cookie);
  check("tokens are not readable by page scripts", !visibleToScript.includes("access_token") && !visibleToScript.includes("refresh_token"));
  const stored = await page.evaluate(() => Object.keys(window.localStorage).join(","));
  check("no token-like keys in localStorage", !/token|access|refresh|jwt/i.test(stored), stored);

  await page.reload({ waitUntil: "networkidle" });
  check("session is restored after reload", (await page.textContent(".sb-org-name")) === ORG);

  // Simulate the 15-minute access token expiring: the client should refresh and continue.
  await ctx.clearCookies({ name: "access_token" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".sb-org-name", { timeout: 15000 });
  check("expired access token is refreshed transparently", new URL(page.url()).pathname === "/app" && (await page.textContent(".sb-org-name")) === ORG);

  // Sign out: backend session ends, device data is cleared, user lands on sign-in.
  await page.click('button[aria-label="Sign out"]');
  await page.waitForURL(/\/login\?signedOut=1/, { timeout: 15000 });
  check("sign-out lands on sign-in with confirmation", (await page.textContent("body")).includes("You have signed out"));
  const afterLogout = await ctx.cookies();
  check("sign-out clears the access token cookie", !afterLogout.some((c) => c.name === "access_token" && c.value));

  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  check("after sign-out /app requires sign-in again", new URL(page.url()).pathname === "/login");

  // Wrong password: the server's message is shown, and no session is created.
  await fill(page, "email", EMAIL);
  await fill(page, "password", "Wrong-Password9");
  await page.click("button[type=submit]");
  await page.waitForFunction(() => document.body.innerText.includes("Invalid email or password"), null, { timeout: 15000 });
  check("wrong password shows the invalid-credentials message", true);

  // Double submit: a second click while pending must not send a second request.
  await fill(page, "password", PASSWORD);
  apiRequests.length = 0;
  await page.dblclick("button[type=submit]");
  await page.waitForURL(`${BASE}/app`, { timeout: 15000 });
  const loginCalls = apiRequests.filter((r) => r === "POST /api/v1/auth/login").length;
  check("double submit sends exactly one sign-in request", loginCalls === 1, `calls=${loginCalls}`);
  await page.waitForSelector(".sb-org-name");

  // Duplicate registration: conflict message from the backend
  const dup = await browser.newContext();
  const dupPage = await dup.newPage();
  await dupPage.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await fill(dupPage, "fullName", "Someone Else");
  await fill(dupPage, "email", EMAIL);
  await fill(dupPage, "password", PASSWORD);
  await fill(dupPage, "confirmPassword", PASSWORD);
  await fill(dupPage, "organizationName", "Another Hospital");
  await dupPage.click("button[type=submit]");
  await dupPage.waitForFunction(() => document.body.innerText.includes("already exists"), null, { timeout: 15000 });
  check("duplicate email shows the conflict message", true);
  await dup.close();

  // Missing CSRF token: sign-out still clears this device and says so.
  await ctx.clearCookies({ name: "csrf_token" });
  await page.click('button[aria-label="Sign out"]');
  await page.waitForURL(/\/login\?signedOut=local/, { timeout: 15000 });
  check("sign-out without a CSRF token falls back to local sign-out", (await page.textContent("body")).includes("Signed out on this device"));

  // Demo mode makes no API calls. Checked in a fresh context, so only the demo page's requests count.
  await ctx.close();
  const demoCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const demo = await demoCtx.newPage();
  const demoRequests = [];
  demo.on("request", (r) => { const p = new URL(r.url()).pathname; if (p.startsWith("/api/")) demoRequests.push(`${r.method()} ${p}`); });
  await demo.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
  await demo.waitForSelector(".sb-item", { timeout: 15000 });
  check("demo workspace makes no API calls", demoRequests.length === 0, demoRequests.join(","));
  await demoCtx.close();

  // ---- Backend not configured
  if (process.env.E2E_UNCONFIGURED_URL) {
    const u = process.env.E2E_UNCONFIGURED_URL;
    const c = await browser.newContext();
    const p = await c.newPage();
    await p.goto(`${u}/login`, { waitUntil: "networkidle" });
    check("unconfigured: sign-in shows not-connected banner", (await p.textContent("body")).includes("Sign-in is not connected"));
    await fill(p, "email", EMAIL);
    await fill(p, "password", PASSWORD);
    await p.click("button[type=submit]");
    await p.waitForFunction(() => document.body.innerText.includes("not connected yet"), null, { timeout: 15000 });
    check("unconfigured: sign-in explains the service is not connected", true);
    await p.goto(`${u}/app`, { waitUntil: "networkidle" });
    await p.waitForFunction(() => document.body.innerText.includes("could not be opened"), null, { timeout: 15000 });
    check("unconfigured: workspace shows an error, not a sign-in loop", new URL(p.url()).pathname === "/app");
    await c.close();
  }

  // ---- Backend unreachable
  if (process.env.E2E_UNREACHABLE_URL) {
    const u = process.env.E2E_UNREACHABLE_URL;
    const c = await browser.newContext();
    const p = await c.newPage();
    await p.goto(`${u}/login`, { waitUntil: "networkidle" });
    await fill(p, "email", EMAIL);
    await fill(p, "password", PASSWORD);
    await p.click("button[type=submit]");
    await p.waitForFunction(() => document.body.innerText.includes("temporarily unavailable"), null, { timeout: 15000 });
    check("unreachable backend shows a service-unavailable message", true);
    await c.close();
  }
} finally {
  await browser.close();
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` :: ${r.detail}` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
