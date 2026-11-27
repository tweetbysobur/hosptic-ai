// What each role can do, from the role table in backend/README.md. The backend enforces these on
// every request; this table only explains them. "own" means only items the person created.

export const ROLE_ORDER = ["ORGANIZATION_ADMIN", "RESEARCHER", "ANALYST", "VIEWER"];

export const ROLE_SUMMARY = {
  ORGANIZATION_ADMIN: "Manages the organisation and its members, and can do everything else.",
  RESEARCHER: "Uploads datasets, runs analyses and creates reports.",
  ANALYST: "Previews data and runs analyses.",
  VIEWER: "Reads datasets, analyses and reports.",
};

// [action, ADMIN, RESEARCHER, ANALYST, VIEWER]; true, false or a short qualifier.
export const ROLE_MATRIX = [
  ["View the organisation", true, true, true, true],
  ["Update the organisation and manage members", true, false, false, false],
  ["See datasets and their quality reports", true, true, true, true],
  ["Upload datasets", true, true, false, false],
  ["Preview rows and download original files", true, true, true, false],
  ["Delete datasets", true, "Own uploads", false, false],
  ["Run analyses", true, true, true, false],
  ["View analyses and reports", true, true, true, true],
  ["Create PDF reports", true, true, false, false],
];
