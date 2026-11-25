const request = require("supertest");
const crypto = require("crypto");
const ExcelJS = require("exceljs");
const { createApp } = require("../../src/app");
const { disconnectPrisma, getPrisma } = require("../../src/db/prisma");

const app = createApp();
const uniq = () => crypto.randomBytes(5).toString("hex");
const PASSWORD = "Strong-pass-123";

async function registerOrg(label = "Org") {
  const email = `admin-${uniq()}@example.test`;
  const res = await request(app).post("/api/v1/auth/register").send({
    fullName: `${label} Admin`,
    email,
    password: PASSWORD,
    organizationName: `${label} Hospital ${uniq()}`,
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    email,
    token: res.body.data.accessToken,
    userId: res.body.data.user.id,
    organizationId: res.body.data.organization.id,
  };
}

async function registerUser(label = "User") {
  const email = `user-${uniq()}@example.test`;
  const res = await request(app).post("/api/v1/auth/register").send({
    fullName: `${label} Person`,
    email,
    password: PASSWORD,
    organizationName: `Personal ${uniq()}`,
  });
  return { email, token: res.body.data.accessToken, userId: res.body.data.user.id };
}

async function inviteAs(adminToken, email, role) {
  return request(app)
    .post("/api/v1/organization/members/invite")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ email, role });
}

function csvBuffer(rows) {
  return Buffer.from(rows.join("\n"), "utf8");
}

const SAMPLE_CSV = [
  "Ward,Days,Outcome",
  "A,3,ok",
  "A,4,ok",
  "A,5,ok",
  "A,4,ok",
  "B,8,complication",
  "B,9,complication",
  "B,7,ok",
  "B,10,complication",
];

async function uploadCsv(token, lines = SAMPLE_CSV, name = "Stay data") {
  return request(app)
    .post("/api/v1/datasets/upload")
    .set("Authorization", `Bearer ${token}`)
    .field("name", name)
    .attach("file", csvBuffer(lines), { filename: "stays.csv", contentType: "text/csv" });
}

async function xlsxBuffer() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  ws.addRow(["Age", "Parity"]);
  [[30, 1], [35, 2], [41, 3], [28, 0], [39, 2]].forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A fake Z.ai client that returns fixed JSON. It stands in for the network call only. */
function fakeAi({ intent, interpretation }) {
  return {
    completeJson: async ({ system }) => {
      if (system.includes("statistical method selector")) return intent;
      return { interpretation };
    },
  };
}

module.exports = {
  app,
  request,
  registerOrg,
  registerUser,
  inviteAs,
  uploadCsv,
  xlsxBuffer,
  fakeAi,
  csvBuffer,
  uniq,
  PASSWORD,
  SAMPLE_CSV,
  disconnectPrisma,
  getPrisma,
};
