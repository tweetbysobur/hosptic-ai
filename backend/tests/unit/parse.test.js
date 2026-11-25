const fs = require("fs");
const path = require("path");
const { detectFileType, parseCsv, parseXlsx, toCsv } = require("../../src/analytics/parse");

const FIX = path.join(__dirname, "..", "fixtures");

// Minimal zip with one stored entry per name, enough for central-directory checks.
function fakeZip(names) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const n of names) {
    const name = Buffer.from(n);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(0, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name);
    centrals.push(central, name);
    offset += 30 + name.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

describe("file validation", () => {
  test("accepts a real CSV and a real XLSX", () => {
    expect(detectFileType(fs.readFileSync(path.join(FIX, "maternal.csv")), "maternal.csv")).toBe("csv");
    expect(detectFileType(fs.readFileSync(path.join(FIX, "admissions.xlsx")), "admissions.xlsx")).toBe("xlsx");
  });

  test("rejects unsupported extensions", () => {
    expect(() => detectFileType(Buffer.from("a,b\n1,2"), "notes.txt")).toThrow(/Only .csv and .xlsx/);
  });

  test("rejects a PDF renamed to .csv", () => {
    expect(() => detectFileType(fs.readFileSync(path.join(FIX, "fake.csv")), "fake.csv")).toThrow(/not a CSV or XLSX/);
  });

  test("rejects an xlsx renamed to .csv and a csv renamed to .xlsx", () => {
    expect(() => detectFileType(fs.readFileSync(path.join(FIX, "admissions.xlsx")), "a.csv")).toThrow(/does not match/);
    expect(() => detectFileType(Buffer.from("a,b\n1,2\n"), "a.xlsx")).toThrow(/does not match/);
  });

  test("rejects macro-enabled workbooks", () => {
    const zip = fakeZip(["[Content_Types].xml", "xl/workbook.xml", "xl/vbaProject.bin"]);
    expect(() => detectFileType(zip, "m.xlsx")).toThrow(/macros/);
  });

  test("rejects zips that are not workbooks", () => {
    expect(() => detectFileType(fakeZip(["readme.txt"]), "x.xlsx")).toThrow(/not an Excel workbook/);
  });

  test("rejects binary content and empty files", () => {
    expect(() => detectFileType(Buffer.from([0x61, 0x00, 0x62]), "x.csv")).toThrow(/binary/);
    expect(() => detectFileType(Buffer.alloc(0), "x.csv")).toThrow(/empty/);
  });
});

describe("parsing", () => {
  test("CSV: makes duplicate and empty headers unique", () => {
    const t = parseCsv(Buffer.from("age,age,,x\n1,2,3,4\n"));
    expect(t.columns).toEqual(["age", "age_2", "column_3", "x"]);
    expect(t.warnings.renamedHeaders).toHaveLength(2);
  });

  test("CSV: header with no rows is rejected", () => {
    expect(() => parseCsv(Buffer.from("a,b\n"))).toThrow(/no data rows/);
  });

  test("CSV: Windows-1252 text is decoded", () => {
    const t = parseCsv(Buffer.from([0x6e, 0x61, 0x6d, 0x65, 0x0a, 0x43, 0x61, 0x66, 0xe9, 0x0a]));
    expect(t.rows[0][0]).toBe("Café");
  });

  test("XLSX: reads values, dates and formula results only", async () => {
    const t = await parseXlsx(fs.readFileSync(path.join(FIX, "admissions.xlsx")));
    expect(t.columns).toEqual(["ward", "age", "length_of_stay", "admitted_on"]);
    expect(t.rows[0]).toEqual(["Medical", "67", "5", "2026-01-03"]);
    expect(t.rows[4][2]).toBe("4");
  });

  test("CSV export neutralises spreadsheet formulas but keeps negative numbers", () => {
    const csv = toCsv({ columns: ["a", "b", "c"], rows: [["=SUM(A1)", "-5", "@cmd"], ["+234 803", "-x", "ok"]] });
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain(",-5,");
    expect(csv).toContain("'@cmd");
    expect(csv).toContain("'-x");
  });
});
