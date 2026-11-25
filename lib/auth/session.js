// Session model. The authoritative check is GET /api/v1/auth/me. Role permissions mirror the
// role table in backend/README.md, and the backend enforces them again on every request.

import { ApiError } from "../api/errors.js";

export const ROLE_LABELS = {
  ORGANIZATION_ADMIN: "Administrator",
  RESEARCHER: "Researcher",
  ANALYST: "Analyst",
  VIEWER: "Viewer",
};

export function sessionFromMe(data) {
  if (!data?.user?.id || !data?.organization?.id || !ROLE_LABELS[data?.role]) return null;
  return {
    user: { id: data.user.id, fullName: data.user.fullName ?? "", email: data.user.email ?? "" },
    organization: { id: data.organization.id, name: data.organization.name ?? "", slug: data.organization.slug ?? "" },
    role: data.role,
  };
}

export function permissionsFor(role) {
  return {
    viewAnalyses: ["ORGANIZATION_ADMIN", "RESEARCHER", "ANALYST", "VIEWER"].includes(role),
    uploadDatasets: ["ORGANIZATION_ADMIN", "RESEARCHER"].includes(role),
    previewRows: ["ORGANIZATION_ADMIN", "RESEARCHER", "ANALYST"].includes(role),
    runAnalyses: ["ORGANIZATION_ADMIN", "RESEARCHER", "ANALYST"].includes(role),
    generateReports: ["ORGANIZATION_ADMIN", "RESEARCHER"].includes(role),
    manageMembers: role === "ORGANIZATION_ADMIN",
  };
}

// Resolves the browser session. Returns one of:
//   { state: "authenticated", session }  the backend accepted the session (refreshing if needed)
//   { state: "expired" }                 no valid session; the user must sign in
//   { state: "unavailable", error }      the service is unreachable, unconfigured or failing
export async function loadSession(api) {
  try {
    const session = sessionFromMe(await api.auth.me());
    if (session) return { state: "authenticated", session };
    return { state: "unavailable", error: new ApiError({ code: "INVALID_RESPONSE" }) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return { state: "expired" };
    return { state: "unavailable", error };
  }
}
