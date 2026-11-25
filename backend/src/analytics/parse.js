// File validation and parsing for CSV and XLSX uploads.
// Content is checked by its bytes, not its name or the browser's MIME type.
const Papa = require("papaparse");
const ExcelJS = require("exceljs");
const env = require("../config/env");
const { unprocessable } = require("../utils/errors");

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const MAX_UNCOMPRESSED_BYTES = 150 * 1024 * 1024;
// Byte signatures of formats that must never be accepted as a dataset.
const FORBIDDEN_MAGIC = [
  [0x25, 0x50, 0x44, 0x46], // %PDF
  [0x4d, 0x5a], // MZ (Windows executable)
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0xd0, 0xcf, 0x11, 0xe0], // legacy OLE (xls, doc)
  [0x1f, 0x8b], // gzip
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
];

const startsWith = (buf, bytes) => bytes.every((b, i) => buf[i] === b);

// Reads the zip central directory without decompressing anything.
function zipEntries(buf) {
  const min = Math.max(0, buf.length - 65557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw unprocessable("The Excel file is damaged or not a real .xlsx file");
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) {
      throw unprocessable("The Excel file is damaged or not a real .xlsx file");
    }
    const size = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const name = buf.slice(offset + 46, offset + 46 + nameLen).toString("utf8");
    entries.push({ name, size });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// Returns "csv" or "xlsx", or throws with a clear reason.
function detectFileType(buffer, originalName) {
  if (!buffer || buffer.length === 0) throw unprocessable("The file is empty");
  const ext = (originalName.split(".").pop() || "").toLowerCase();
  if (!["csv", "xlsx"].includes(ext)) throw unprocessable("Only .csv and .xlsx files are supported");

  if (startsWith(buffer, ZIP_MAGIC)) {
    if (ext !== "xlsx") throw unprocessable("File content does not match the .csv extension");
    const entries = zipEntries(buffer);
    const names = new Set(entries.map((e) => e.name));
    if (!names.has("[Content_Types].xml") || !names.has("xl/workbook.xml")) {
      throw unprocessable("The file is a zip archive but not an Excel workbook");
    }
    if ([...names].some((n) => /vbaProject\.bin$/i.test(n) || /\.(exe|dll|js|vbs|ps1|bat)$/i.test(n))) {
      throw unprocessable("Workbooks containing macros or embedded programs are not accepted");
    }
    const total = entries.reduce((s, e) => s + e.size, 0);
    if (total > MAX_UNCOMPRESSED_BYTES) throw unprocessable("The workbook expands to an unsafe size");
    return "xlsx";
  }

  if (FORBIDDEN_MAGIC.some((m) => startsWith(buffer, m))) {
    throw unprocessable("File content is not a CSV or XLSX dataset");
  }
  if (ext !== "csv") throw unprocessable("File content does not match the .xlsx extension");
  if (buffer.includes(0x00)) throw unprocessable("The CSV contains binary data");
  return "csv";
}

function decodeText(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // Excel on Windows often saves CSV as Windows-1252.
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

// Makes header names unique and non-empty. Returns the names and any renames.
function normaliseHeaders(raw) {
  const seen = new Map();
  const renamed = [];
  const columns = raw.map((h, i) => {
    let name = String(h ?? "").replace(/^﻿/, "").trim().replace(/\s+/g, " ");
    if (!name) {
      name = `column_${i + 1}`;
      renamed.push({ position: i, from: "", to: name });
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      const n = seen.get(key) + 1;
      seen.set(key, n);
      const next = `${name}_${n}`;
      renamed.push({ position: i, from: name, to: next });
      name = next;
    } else {
      seen.set(key, 1);
    }
    return name.slice(0, 120);
  });
  return { columns, renamed };
}

function checkLimits(columns, rows) {
  if (!columns.length) throw unprocessable("No header row found");
  if (columns.length > env.MAX_DATASET_COLUMNS) {
    throw unprocessable(`The dataset has ${columns.length} columns. The limit is ${env.MAX_DATASET_COLUMNS}`);
  }
  if (rows.length === 0) throw unprocessable("The dataset has a header but no data rows");
  if (rows.length > env.MAX_DATASET_ROWS) {
    throw unprocessable(`The dataset has more than ${env.MAX_DATASET_ROWS} rows`);
  }
}

function parseCsv(buffer) {
  const text = decodeText(buffer);
  const out = Papa.parse(text, { skipEmptyLines: "greedy", dynamicTyping: false });
  const fatal = out.errors.filter((e) => e.type === "Quotes");
  if (fatal.length) throw unprocessable(`CSV could not be parsed near row ${fatal[0].row + 1}: ${fatal[0].message}`);

  const [header = [], ...body] = out.data;
  const { columns, renamed } = normaliseHeaders(header);
  const width = columns.length;
  let raggedRows = 0;
  const rows = body.map((r) => {
    if (r.length !== width) raggedRows++;
    const row = new Array(width);
    for (let i = 0; i < width; i++) row[i] = r[i] === undefined ? "" : String(r[i]);
    return row;
  });
  checkLimits(columns, rows);
  return { columns, rows, warnings: { renamedHeaders: renamed, raggedRows } };
}

function cellToString(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isNaN(v) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellToString(v.result); // formula: keep the computed value only
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    if ("error" in v) return "";
    return "";
  }
  return String(v);
}

async function parseXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw unprocessable("The Excel file could not be read");
  }
  const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
  if (!ws) throw unprocessable("The workbook has no data");
  if (ws.actualRowCount - 1 > env.MAX_DATASET_ROWS) {
    throw unprocessable(`The dataset has more than ${env.MAX_DATASET_ROWS} rows`);
  }

  const all = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = [];
    for (let c = 1; c <= ws.actualColumnCount; c++) values.push(cellToString(row.getCell(c).value));
    all.push(values);
  });
  const [header = [], ...body] = all;
  let lastCol = header.length;
  while (lastCol > 0 && !String(header[lastCol - 1]).trim()) lastCol--;
  const { columns, renamed } = normaliseHeaders(header.slice(0, lastCol));
  const rows = body
    .map((r) => r.slice(0, lastCol))
    .filter((r) => r.some((v) => v.trim() !== ""));
  checkLimits(columns, rows);
  return {
    columns,
    rows,
    warnings: { renamedHeaders: renamed, raggedRows: 0, sheet: ws.name, otherSheetsIgnored: wb.worksheets.length - 1 },
  };
}

async function parseDataset(buffer, fileType) {
  return fileType === "xlsx" ? parseXlsx(buffer) : parseCsv(buffer);
}

// Serialises a table to CSV. Text cells that start with = + - @ are prefixed
// with an apostrophe so spreadsheet apps do not run them as formulas.
function toCsv({ columns, rows }) {
  const safe = (v) => {
    const s = v == null ? "" : String(v);
    if (/^[=@\t\r]/.test(s)) return `'${s}`;
    if (/^[+-]/.test(s) && !Number.isFinite(Number(s))) return `'${s}`;
    return s;
  };
  return Papa.unparse({ fields: columns.map(safe), data: rows.map((r) => r.map(safe)) });
}

module.exports = { detectFileType, parseDataset, parseCsv, parseXlsx, toCsv, zipEntries };
