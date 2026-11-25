// Completed sample analyses for the demo workspace. Each answer is produced by the same engine
// that powers the workspace, so every figure is computed from the synthetic demonstration datasets.

import { analyze } from "../engine.js";

const QUESTIONS = {
  maternal: "Compare maternal complication rates across the four quarters",
  los: "Show the distribution of length of stay",
  readmissions: "Which factors are associated with readmissions?",
};

let counter = 0;
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

function run(message, datasetIds, context = {}, history = []) {
  return analyze({ message, datasetIds, context, history });
}

function titleFrom(text) {
  const t = text.trim().replace(/\s+/g, " ").replace(/[?.!]+$/, "");
  return t.length > 60 ? t.slice(0, 57).trimEnd() + "…" : t;
}

export function buildDemoSeed(now = new Date()) {
  const base = now.getTime();
  const at = (minutesAgo) => new Date(base - minutesAgo * 60000).toISOString();

  // Conversation 1: analysis followed by a generated report.
  const maternal = run(QUESTIONS.maternal, ["maternal"]);
  const maternalReport = run("Generate a report of this analysis", ["maternal"], maternal.context, [maternal]);

  // Conversation 2: length of stay distribution.
  const los = run(QUESTIONS.los, ["admissions"]);

  // Conversation 3: readmission drivers.
  const readmissions = run(QUESTIONS.readmissions, ["admissions"]);

  const reportId = newId("report");
  const conv1Id = newId("conv");
  const conv2Id = newId("conv");
  const conv3Id = newId("conv");

  const conversations = [
    {
      id: conv1Id,
      title: titleFrom(QUESTIONS.maternal),
      createdAt: at(42),
      updatedAt: at(8),
      datasetIds: ["maternal"],
      context: maternal.context || {},
      messages: [
        { id: newId("msg"), role: "user", text: QUESTIONS.maternal, at: at(42) },
        { id: newId("msg"), role: "assistant", response: maternal, at: at(42) },
        { id: newId("msg"), role: "user", text: "Generate a report of this analysis", at: at(8) },
        { id: newId("msg"), role: "assistant", response: maternalReport, at: at(8) },
      ],
    },
    {
      id: conv2Id,
      title: titleFrom(QUESTIONS.los),
      createdAt: at(120),
      updatedAt: at(120),
      datasetIds: ["admissions"],
      context: los.context || {},
      messages: [
        { id: newId("msg"), role: "user", text: QUESTIONS.los, at: at(120) },
        { id: newId("msg"), role: "assistant", response: los, at: at(120) },
      ],
    },
    {
      id: conv3Id,
      title: titleFrom(QUESTIONS.readmissions),
      createdAt: at(260),
      updatedAt: at(260),
      datasetIds: ["admissions"],
      context: readmissions.context || {},
      messages: [
        { id: newId("msg"), role: "user", text: QUESTIONS.readmissions, at: at(260) },
        { id: newId("msg"), role: "assistant", response: readmissions, at: at(260) },
      ],
    },
  ];

  const reports = maternalReport.report
    ? [{ id: reportId, conversationId: conv1Id, ...maternalReport.report }]
    : [];

  return { conversations, reports };
}
