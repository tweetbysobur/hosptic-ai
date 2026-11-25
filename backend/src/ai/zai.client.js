// Z.ai chat completions client.
// Endpoint, auth and body follow https://docs.z.ai/api-reference/llm/chat-completion:
//   POST {ZAI_API_BASE_URL}/chat/completions, Authorization: Bearer <key>,
//   { model, messages, response_format: { type: "json_object" }, thinking, temperature, max_tokens }
// Prompts and responses are never logged.
const env = require("../config/env");
const logger = require("../utils/logger");

class AiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function extractJson(text) {
  if (typeof text !== "string") throw new AiError("AI_BAD_RESPONSE", "Empty AI response");
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new AiError("AI_BAD_RESPONSE", "AI response was not valid JSON");
  }
}

// Injected in tests to avoid network calls.
let transport = (url, init) => fetch(url, init);
const setTransport = (fn) => {
  transport = fn || ((url, init) => fetch(url, init));
};

async function chatJson({ system, user, maxTokens = 1500, temperature = 0.1 }) {
  if (!env.aiConfigured) throw new AiError("AI_NOT_CONFIGURED", "Z.ai is not configured on this server");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.ZAI_TIMEOUT_MS);
  const started = Date.now();
  let res;
  try {
    res = await transport(`${env.ZAI_API_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.ZAI_API_KEY}`, "Content-Type": "application/json", "Accept-Language": "en-US,en" },
      body: JSON.stringify({
        model: env.ZAI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new AiError("AI_UNAVAILABLE", err.name === "AbortError" ? "Z.ai request timed out" : "Could not reach Z.ai");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    logger.warn("zai_http_error", { status: res.status, ms: Date.now() - started });
    throw new AiError("AI_UNAVAILABLE", `Z.ai returned HTTP ${res.status}`);
  }
  const body = await res.json().catch(() => null);
  const choice = body?.choices?.[0];
  if (!choice) throw new AiError("AI_BAD_RESPONSE", "Z.ai returned no choices");
  if (choice.finish_reason === "sensitive") throw new AiError("AI_REFUSED", "Z.ai declined to process this request");
  if (choice.finish_reason === "length") throw new AiError("AI_BAD_RESPONSE", "Z.ai response was cut off");
  logger.info("zai_call", { ms: Date.now() - started, tokens: body.usage?.total_tokens });
  return extractJson(choice.message?.content);
}

module.exports = { chatJson, AiError, setTransport, extractJson };
