import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ENDPOINTS } from "../../lib/api/endpoints.js";
import { API_PREFIX } from "../../lib/api/config.js";

// Reads the path and method table from the copied OpenAPI contract. A simple line scan is enough
// for this file's layout, and it avoids a YAML dependency.
function contractOperations() {
  const text = readFileSync(new URL("../../shared/contracts/openapi.yaml", import.meta.url), "utf8");
  const operations = new Map();
  let current = null;
  for (const line of text.split("\n")) {
    const pathMatch = line.match(/^ {2}(\/api\/v1\S*):\s*$/);
    if (pathMatch) { current = pathMatch[1]; operations.set(current, new Set()); continue; }
    const methodMatch = line.match(/^ {4}(get|post|patch|put|delete):\s*$/);
    if (methodMatch && current) operations.get(current).add(methodMatch[1].toUpperCase());
  }
  return operations;
}

test("every endpoint the frontend calls exists in the backend contract", () => {
  const operations = contractOperations();
  for (const [name, { method, path }] of Object.entries(ENDPOINTS)) {
    const fullPath = `${API_PREFIX}${path}`;
    assert.ok(operations.has(fullPath), `${name}: ${fullPath} is not in openapi.yaml`);
    assert.ok(operations.get(fullPath).has(method), `${name}: ${method} ${fullPath} is not in openapi.yaml`);
  }
});

test("the API prefix matches the contract base path", () => {
  assert.equal(API_PREFIX, "/api/v1");
  assert.ok(contractOperations().size > 0);
});

test("the contract still defines the auth endpoints the frontend depends on", () => {
  const operations = contractOperations();
  for (const p of ["/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/auth/logout", "/api/v1/auth/refresh", "/api/v1/auth/me"]) {
    assert.ok(operations.has(p), p);
  }
});
