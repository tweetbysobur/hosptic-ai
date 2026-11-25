// Backend authentication contract.
//
// UNCONFIRMED: the paths and payload fields below are placeholders until the backend
// developer confirms them. The frontend never assumes a call succeeds. Each call reaches
// the configured backend or fails with an explicit, user-facing reason.
//
// Set HOSPTIC_API_URL on the server (not NEXT_PUBLIC_*) to the backend base URL.

export const AUTH_ENDPOINTS = {
  register: "/auth/register",
  login: "/auth/login",
  logout: "/auth/logout",
  session: "/auth/session",
  createOrganisation: "/organisations",
  joinOrganisation: "/organisations/join",
};

export const ORGANISATION_TYPES = [
  { value: "hospital", label: "Hospital" },
  { value: "clinic", label: "Clinic" },
  { value: "research", label: "Research unit" },
  { value: "public_health", label: "Public health agency" },
  { value: "other", label: "Other" },
];

export function backendUrl(path) {
  const base = process.env.HOSPTIC_API_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}${path}`;
}
