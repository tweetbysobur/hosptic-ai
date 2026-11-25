const { parseFile } = require("../../src/services/file-parser");
const { profileTable, buildQualityReport } = require("../../src/analytics/quality");

describe("CSV parsing and quality report", () => {
  const csv = [
    "Age,Complication,Visit Date,Dup",
    "30,Yes,2024-01-05,a",
    "31,yes ,2024-01-06,b",
    "400,No,05/02/2024,c",
    "abc,No,2024-01-07,d",
    "30,Yes,2024-01-05,a",
    ",No,2024-01-08,e",
  ].join("\n");

  test("parses headers and rows", async () => {
    const table = await parseFile(Buffer.from(csv), "CSV");
    expect(table.headers).toEqual(["Age", "Complication", "Visit Date", "Dup"]);
    expect(table.rowCount).toBe(6);
  });

  test("detects duplicates, invalid numerics, mixed date formats and label variants", async () => {
    const table = await parseFile(Buffer.from(csv), "CSV");
    const columns = profileTable(table);
    const report = buildQualityReport(table, columns);
    const codes = report.issues.map((i) => i.code);
    expect(report.duplicateRows).toBe(1);
    expect(codes).toContain("DUPLICATE_ROWS");
    expect(codes).toContain("INVALID_NUMERIC");
    expect(codes).toContain("INCONSISTENT_DATES");
    expect(codes).toContain("INCONSISTENT_LABELS");
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  test("rejects a file with only a header", async () => {
    await expect(parseFile(Buffer.from("a,b\n"), "CSV")).rejects.toThrow(/at least one data row/);
  });

  test("rejects invalid UTF-8", async () => {
    await expect(parseFile(Buffer.from([0x61, 0x2c, 0x62, 0x0a, 0xff, 0xfe, 0x2c, 0x31]), "CSV")).rejects.toThrow(/UTF-8/);
  });
});

describe("XLSX parsing", () => {
  test("reads the first sheet with a header row", async () => {
    const ExcelJS = require("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Patients");
    ws.addRow(["Ward", "Days"]);
    ws.addRow(["A", 3]);
    ws.addRow(["B", 5]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const table = await parseFile(buffer, "XLSX");
    expect(table.headers).toEqual(["Ward", "Days"]);
    expect(table.rowCount).toBe(2);
    expect(table.df.column("Days").values).toEqual(["3", "5"]);
  });
});
