process.env.TF_CPP_MIN_LOG_LEVEL = process.env.TF_CPP_MIN_LOG_LEVEL || "3";
const Papa = require("papaparse");
const ExcelJS = require("exceljs");
const dfd = require("danfojs-node");
const { badRequest, unprocessable } = require("../utils/AppError");

const MAX_ROWS = 100000;
const MAX_COLUMNS = 200;
const MAX_HEADER_LENGTH = 128;
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** Confirms the actual bytes match the claimed format. The file extension alone is not trusted. */
function detectFileType(buffer, originalName) {
  const ext = String(originalName || "").toLowerCase().split(".").pop();
  if (ext === "csv") {
    if (buffer.subarray(0, 4).equals(ZIP_MAGIC)) {
      throw unprocessable("File named .csv contains binary archive data");
    }
    if (buffer.includes(0x00)) {
      throw unprocessable("CSV file contains binary data");
    }
    return "CSV";
  }
  if (ext === "xlsx") {
    if (!buffer.subarray(0, 4).equals(ZIP_MAGIC)) {
      throw unprocessable("File named .xlsx is not a valid Excel workbook");
    }
    // Macro-enabled workbooks and embedded binaries are rejected.
    if (buffer.includes("vbaProject.bin") || buffer.includes("xl/embeddings/")) {
      throw unprocessable("Macro-enabled or embedded-object workbooks are not accepted");
    }
    return "XLSX";
  }
  throw badRequest("Unsupported file type. Upload a .csv or .xlsx file.");
}

function decodeUtf8(buffer) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch {
    throw unprocessable("CSV files must be UTF-8 encoded");
  }
}

function cleanHeaders(rawHeaders) {
  const seen = new Map();
  return rawHeaders.map((raw, index) => {
    let name = String(raw ?? "").trim().slice(0, MAX_HEADER_LENGTH);
    if (!name) name = `column_${index + 1}`;
    const count = seen.get(name) || 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}_${count + 1}`;
  });
}

function cellToString(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "object") {
    if ("result" in value) return cellToString(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return cellToString(value.text);
    if ("hyperlink" in value) return cellToString(value.text || value.hyperlink);
    return null;
  }
  return String(value);
}

function parseCsv(buffer) {
  const text = decodeUtf8(buffer);
  const result = Papa.parse(text, { header: false, skipEmptyLines: "greedy" });
  const matrix = result.data;
  if (matrix.length < 2) {
    throw unprocessable("The file must contain a header row and at least one data row");
  }
  const headers = cleanHeaders(matrix[0]);
  return buildTable(headers, matrix.slice(1));
}

async function parseXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw unprocessable("The Excel workbook could not be read");
  }
  const sheet = workbook.worksheets.find((ws) => ws.rowCount > 1);
  if (!sheet) {
    throw unprocessable("The workbook must contain a header row and at least one data row");
  }
  const headerRow = sheet.getRow(1).values.slice(1);
  const headers = cleanHeaders(headerRow.map(cellToString));
  const rows = [];
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const values = sheet.getRow(r).values.slice(1);
    if (values.every((v) => v === null || v === undefined || v === "")) continue;
    rows.push(values.map(cellToString));
    if (rows.length > MAX_ROWS) break;
  }
  return buildTable(headers, rows);
}

function buildTable(headers, matrix) {
  if (headers.length === 0 || headers.length > MAX_COLUMNS) {
    throw unprocessable(`The file must contain between 1 and ${MAX_COLUMNS} columns`);
  }
  if (matrix.length === 0) {
    throw unprocessable("The file must contain at least one data row");
  }
  if (matrix.length > MAX_ROWS) {
    throw unprocessable(`The file exceeds the ${MAX_ROWS} row limit`);
  }
  let malformedRows = 0;
  const data = matrix.map((row) => {
    if (row.length !== headers.length) malformedRows += 1;
    return headers.map((_, i) => {
      const value = row[i];
      if (value === undefined || value === null) return null;
      return typeof value === "string" ? value.trim() : String(value);
    });
  });
  // Danfo.js holds the tabular data; columns are read from it by name for profiling and analysis.
  const df = new dfd.DataFrame(data, { columns: headers });
  return { headers, df, rowCount: data.length, columnCount: headers.length, malformedRows };
}

/** Parses an uploaded or stored file. Used both at upload time and when analyses run. */
async function parseFile(buffer, fileType) {
  if (fileType === "CSV") return parseCsv(buffer);
  if (fileType === "XLSX") return parseXlsx(buffer);
  throw badRequest("Unsupported file type");
}

module.exports = { detectFileType, parseFile, MAX_ROWS, MAX_COLUMNS };
