// Writes the OpenAPI document to shared/contracts/openapi.json so the
// frontend can generate clients or check request shapes.
process.env.NODE_ENV ||= "development";
const fs = require("fs");
const path = require("path");
const spec = require("../src/docs/openapi");

const out = path.resolve(__dirname, "../../shared/contracts/openapi.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(spec, null, 2) + "\n");
console.log(`Wrote ${path.relative(process.cwd(), out)}`);
