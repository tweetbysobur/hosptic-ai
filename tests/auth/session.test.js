import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionFromMe, permissionsFor, loadSession } from "../../lib/auth/session.js";
import { ApiError } from "../../lib/api/errors.js";

const me = {
  user: { id: "u1", fullName: "Amina Bello", email: "amina@hospital.org" },
  organization: { id: "o1", name: "Ogun General Hospital", slug: "ogun-general" },
  role: "RESEARCHER",
};

test("sessionFromMe keeps only the fields the UI uses", () => {
  const s = sessionFromMe({ ...me, accessToken: "must-not-be-kept" });
  assert.deepEqual(s, me);
  assert.equal(JSON.stringify(s).includes("must-not-be-kept"), false);
});

test("sessionFromMe rejects incomplete or unknown-role responses", () => {
  assert.equal(sessionFromMe({ user: me.user, organization: me.organization, role: "SUPERUSER" }), null);
  assert.equal(sessionFromMe({ user: me.user, role: "VIEWER" }), null);
});

test("permissions match the backend role table", () => {
  const admin = permissionsFor("ORGANIZATION_ADMIN");
  assert.equal(admin.manageMembers && admin.uploadDatasets && admin.generateReports && admin.runAnalyses, true);
  const researcher = permissionsFor("RESEARCHER");
  assert.equal(researcher.uploadDatasets && researcher.generateReports, true);
  assert.equal(researcher.manageMembers, false);
  const analyst = permissionsFor("ANALYST");
  assert.equal(analyst.runAnalyses && analyst.previewRows, true);
  assert.equal(analyst.uploadDatasets || analyst.generateReports, false);
  const viewer = permissionsFor("VIEWER");
  assert.equal(viewer.viewAnalyses, true);
  assert.equal(viewer.runAnalyses || viewer.previewRows || viewer.uploadDatasets, false);
});

test("loadSession returns the authenticated session from /auth/me", async () => {
  const out = await loadSession({ auth: { me: async () => me } });
  assert.equal(out.state, "authenticated");
  assert.equal(out.session.organization.name, "Ogun General Hospital");
});

test("loadSession reports an expired session after the client's refresh attempt fails", async () => {
  const out = await loadSession({ auth: { me: async () => { throw new ApiError({ status: 401, code: "UNAUTHORIZED", sessionExpired: true }); } } });
  assert.equal(out.state, "expired");
});

test("loadSession reports an unreachable or failing service as unavailable, never as signed in", async () => {
  const network = await loadSession({ auth: { me: async () => { throw new ApiError({ code: "NETWORK_ERROR" }); } } });
  assert.equal(network.state, "unavailable");
  const server = await loadSession({ auth: { me: async () => { throw new ApiError({ status: 500, code: "SERVER_ERROR" }); } } });
  assert.equal(server.state, "unavailable");
  const malformed = await loadSession({ auth: { me: async () => ({ unexpected: true }) } });
  assert.equal(malformed.state, "unavailable");
});
