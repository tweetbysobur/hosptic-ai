// Z.ai chat completions client. Endpoint and Bearer auth follow the Z.ai API reference:
// POST {ZAI_API_BASE_URL}/chat/completions with the model named in the request body.
const { env } = require("../config/env");
const { AppError } = require("../utils/AppError");
const logger = require("../utils/logger");

function extractJsonObject(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new AppError(502, "AI service returned a response that is not JSON", "AI_INVALID_RESPONSE");
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new AppError(502, "AI service returned malformed JSON", "AI_INVALID_RESPONSE");
  }
}

class ZaiClient {
  constructor({ apiKey, baseUrl, model, timeoutMs, fetchImpl }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl || globalThis.fetch;
  }

  /** Sends a system and user message. Returns the model text. Never logs the prompt or response. */
  async complete({ system, user }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.1,
          stream: false,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      logger.warn("Z.ai request failed", { reason: err && err.name });
      throw new AppError(502, "The AI service is unavailable. Try again later.", "AI_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      logger.warn("Z.ai returned an error status", { status: response.status });
      throw new AppError(502, "The AI service rejected the request", "AI_UNAVAILABLE");
    }
    const data = await response.json().catch(() => null);
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new AppError(502, "The AI service returned an empty response", "AI_INVALID_RESPONSE");
    }
    return content;
  }

  async completeJson(args) {
    return extractJsonObject(await this.complete(args));
  }
}

let instance;
let override = null;

/** Test-only hook. Replaces the Z.ai client with a fake. Pass null to restore the real client. */
function setZaiClientForTesting(client) {
  override = client;
}

/** Returns the client, or null when AI is not configured. Callers must handle null. */
function getZaiClient() {
  if (override) return override;
  if (!env.AI_ENABLED) return null;
  if (!instance) {
    instance = new ZaiClient({
      apiKey: env.ZAI_API_KEY,
      baseUrl: env.ZAI_API_BASE_URL,
      model: env.ZAI_MODEL,
      timeoutMs: env.ZAI_TIMEOUT_MS,
    });
  }
  return instance;
}

module.exports = { ZaiClient, getZaiClient, extractJsonObject, setZaiClientForTesting };
