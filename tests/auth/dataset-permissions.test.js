import { test } from "node:test";
import assert from "node:assert/strict";
import { canDeleteDataset } from "../../lib/auth/session.js";

const me = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";
const session = (role) => ({ role, user: { id: me } });
const mine = { id: "d1", uploadedById: me };
const theirs = { id: "d2", uploadedById: other };

test("administrators may delete any dataset", () => {
  assert.equal(canDeleteDataset(session("ORGANIZATION_ADMIN"), mine), true);
  assert.equal(canDeleteDataset(session("ORGANIZATION_ADMIN"), theirs), true);
});

test("researchers may delete only datasets they uploaded", () => {
  assert.equal(canDeleteDataset(session("RESEARCHER"), mine), true);
  assert.equal(canDeleteDataset(session("RESEARCHER"), theirs), false);
});

test("analysts and viewers may not delete datasets", () => {
  for (const role of ["ANALYST", "VIEWER"]) {
    assert.equal(canDeleteDataset(session(role), mine), false, role);
    assert.equal(canDeleteDataset(session(role), theirs), false, role);
  }
});

test("unknown ownership or session hides the action", () => {
  assert.equal(canDeleteDataset(session("RESEARCHER"), { id: "d3" }), false);
  assert.equal(canDeleteDataset({ role: "RESEARCHER", user: {} }, mine), false);
  assert.equal(canDeleteDataset(null, mine), false);
  assert.equal(canDeleteDataset(session("ORGANIZATION_ADMIN"), null), false);
});
