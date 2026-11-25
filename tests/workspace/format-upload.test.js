import { test } from "node:test";
import assert from "node:assert/strict";
import { plural, initialsFrom, fileSizeLabel } from "../../lib/format.js";
import { validateUploadFile, validateDatasetName, summariseQuality, UPLOAD_MAX_MB } from "../../lib/workspace/upload.js";

test("plural uses the singular only for exactly one", () => {
  assert.equal(plural(1, "section", "sections"), "1 section");
  assert.equal(plural(0, "section", "sections"), "0 sections");
  assert.equal(plural(2565, "row", "rows"), "2,565 rows");
});

test("initials come from the organisation name", () => {
  assert.equal(initialsFrom("Demo workspace"), "DW");
  assert.equal(initialsFrom("Ogun General Hospital"), "OG");
  assert.equal(initialsFrom("The Royal Infirmary"), "RI");
  assert.equal(initialsFrom("Lagoon"), "LA");
  assert.equal(initialsFrom(""), "?");
});

test("file sizes read naturally", () => {
  assert.equal(fileSizeLabel(512), "512 B");
  assert.equal(fileSizeLabel(2048), "2 KB");
  assert.equal(fileSizeLabel(3 * 1024 * 1024), "3.0 MB");
});

test("only CSV and XLSX files within the limit can be uploaded", () => {
  assert.match(validateUploadFile(null), /Choose/);
  assert.match(validateUploadFile({ name: "data.xls", size: 10 }), /CSV|Excel/);
  assert.match(validateUploadFile({ name: "macro.xlsm", size: 10 }), /CSV|Excel/);
  assert.match(validateUploadFile({ name: "empty.csv", size: 0 }), /empty/);
  assert.match(validateUploadFile({ name: "big.csv", size: (UPLOAD_MAX_MB + 1) * 1024 * 1024 }), /up to/);
  assert.equal(validateUploadFile({ name: "Admissions.CSV", size: 2048 }), null);
  assert.equal(validateUploadFile({ name: "ward.xlsx", size: 2048 }), null);
});

test("dataset name is optional and bounded", () => {
  assert.equal(validateDatasetName(""), null);
  assert.match(validateDatasetName("x".repeat(161)), /160/);
});

test("quality summary counts issues by severity", () => {
  const s = summariseQuality({ issues: [{ severity: "warning" }, { severity: "critical" }, { severity: "warning" }, { severity: "info" }] });
  assert.deepEqual(s.counts, { critical: 1, warning: 2, info: 1 });
  assert.equal(summariseQuality(undefined).issues.length, 0);
});
