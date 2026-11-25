import { analyze } from "@/lib/engine";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { message, datasetIds, context, history } = body || {};
  if (!message || typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "A question is required" }, { status: 400 });
  }
  const result = analyze({
    message: message.trim().slice(0, 1000),
    datasetIds: Array.isArray(datasetIds) ? datasetIds : [],
    context: context || {},
    history: Array.isArray(history) ? history : [],
  });
  return Response.json(result);
}
