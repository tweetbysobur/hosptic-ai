// Backend endpoints used by the frontend. Every entry is taken from shared/contracts/openapi.yaml.
// tests/api/contract.test.js checks each entry against the contract file, so drift fails the build.

export const ENDPOINTS = {
  health: { method: "GET", path: "/health" },
  register: { method: "POST", path: "/auth/register" },
  login: { method: "POST", path: "/auth/login" },
  logout: { method: "POST", path: "/auth/logout" },
  refresh: { method: "POST", path: "/auth/refresh" },
  me: { method: "GET", path: "/auth/me" },
  organization: { method: "GET", path: "/organization" },
};
