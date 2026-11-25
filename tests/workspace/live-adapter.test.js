import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApiClient } from "../../lib/api/client.js";
import { pathFor, ENDPOINTS } from "../../lib/api/endpoints.js";

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the live workspace never loads synthetic data or the demo engine", () => {
  for (const file of ["lib/workspace/live-adapter.js", "lib/workspace/live-mapping.js"]) {
    const code = source(file);
    for (const forbidden of ["engine.js", "datasets.js", "demo-", "hosptic.demo", "/api/datasets", "/api/analyze"]) {
      assert.equal(code.includes(forbidden), false, `${file} contains ${forbidden}`);
    }
  }
});

test("ids are checked before they are put in a path", () => {
  assert.equal(pathFor(ENDPOINTS.datasetGet, "a3129a87-22b7-4a0f-8ca7-e480f8cd2f3d"), "/datasets/a3129a87-22b7-4a0f-8ca7-e480f8cd2f3d");
  assert.throws(() => pathFor(ENDPOINTS.datasetGet, "../auth/me"));
  assert.throws(() => pathFor(ENDPOINTS.datasetGet, ""));
});

function harness(responses, cookies = { csrf_token: "tok" }) {
  const calls = [];
  const queue = [...responses];
  const client = createApiClient({
    fetchImpl: async (url, init) => { calls.push({ url, ...init }); return queue.shift(); },
    readCookie: (n) => cookies[n] ?? null,
  });
  return { client, calls };
}
const ok = (data) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { "Content-Type": "application/json" } });

test("upload sends multipart form data with the CSRF header and no JSON content type", async () => {
  const { client, calls } = harness([ok({ id: "d1" })]);
  const file = new File(["a,b\n1,2\n"], "data.csv", { type: "text/csv" });
  await client.datasets.upload({ file, name: "My data" });
  assert.equal(calls[0].url, "/api/v1/datasets/upload");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers["X-CSRF-Token"], "tok");
  assert.equal(calls[0].headers["Content-Type"], undefined, "the browser sets the multipart boundary");
  assert.ok(calls[0].body instanceof FormData);
  assert.equal(calls[0].body.get("file").name, "data.csv");
  assert.equal(calls[0].body.get("name"), "My data");
});

test("analysis posts the dataset and question only, never an organisation id", async () => {
  const { client, calls } = harness([ok({ id: "a1", status: "COMPLETED" })]);
  await client.analysis.create({ datasetId: "d1", question: "Summarise BMI" });
  assert.deepEqual(JSON.parse(calls[0].body), { datasetId: "d1", question: "Summarise BMI" });
});

test("report download returns the PDF as a blob with its file name", async () => {
  const pdf = new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="report-1.pdf"' } });
  const { client, calls } = harness([pdf]);
  const { blob, fileName } = await client.reports.download("r1");
  assert.equal(calls[0].url, "/api/v1/reports/r1/download");
  assert.equal(fileName, "report-1.pdf");
  assert.equal(blob.size, 4);
});

test("lists ask for one page of up to 100 items", async () => {
  const { client, calls } = harness([ok({ items: [] }), ok({ items: [] })]);
  await client.datasets.list();
  await client.reports.list();
  assert.equal(calls[0].url, "/api/v1/datasets?page=1&pageSize=100");
  assert.equal(calls[1].url, "/api/v1/reports?page=1&pageSize=100");
});
