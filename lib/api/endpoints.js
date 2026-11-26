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
  datasetUpload: { method: "POST", path: "/datasets/upload" },
  datasetList: { method: "GET", path: "/datasets" },
  datasetGet: { method: "GET", path: "/datasets/{id}" },
  datasetDelete: { method: "DELETE", path: "/datasets/{id}" },
  analysisCreate: { method: "POST", path: "/analysis" },
  analysisGet: { method: "GET", path: "/analysis/{id}" },
  analysisRetry: { method: "POST", path: "/analysis/{id}/retry" },
  reportCreate: { method: "POST", path: "/reports" },
  reportList: { method: "GET", path: "/reports" },
  reportDownload: { method: "GET", path: "/reports/{id}/download" },
};

// Fills the {id} placeholder. Only UUID-like ids are accepted, so a value can never add path segments.
export function pathFor(endpoint, id) {
  if (!endpoint.path.includes("{id}")) return endpoint.path;
  if (typeof id !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(id)) throw new Error("Invalid id");
  return endpoint.path.replace("{id}", id);
}
