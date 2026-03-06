const HUGGING_FACE_URL = "https://router.huggingface.co/v1/chat/completions";
const DEFAULT_MODEL = "Qwen/Qwen3.5-27B:novita";
const REQUEST_TIMEOUT_MS = 30000;

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

async function parseRequestBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      throw new Error("Invalid JSON body.");
    }
  }
  return req.body;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed. Use POST." });
  }

  const token = process.env.HUGGINGFACE_TOKEN;
  const model = process.env.HF_MODEL || DEFAULT_MODEL;

  if (!token) {
    return sendJson(res, 500, {
      error: "Server misconfiguration: HUGGINGFACE_TOKEN is not set.",
    });
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message || "Invalid request body." });
  }

  const userMessage = typeof body.message === "string" ? body.message.trim() : "";
  if (!userMessage) {
    return sendJson(res, 400, { error: "Message is required." });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let hfResponse;
  let rawText = "";

  try {
    hfResponse = await fetch(HUGGING_FACE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 60,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: "You are a concise assistant. Reply in 1-2 short sentences.",
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
      }),
    });

    rawText = await hfResponse.text();
  } catch (error) {
    if (error.name === "AbortError") {
      return sendJson(res, 504, { error: "Upstream request timed out." });
    }
    return sendJson(res, 502, { error: "Failed to reach Hugging Face API." });
  } finally {
    clearTimeout(timeoutId);
  }

  let parsed;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = null;
  }

  if (!hfResponse.ok) {
    const upstreamMessage =
      (parsed && (parsed.error || parsed.message)) || rawText || "Unknown upstream error.";

    return sendJson(res, hfResponse.status, {
      error: `Hugging Face API error: ${upstreamMessage}`,
    });
  }

  const reply = parsed?.choices?.[0]?.message?.content;
  if (!reply || typeof reply !== "string") {
    return sendJson(res, 502, {
      error: "Invalid response format from Hugging Face API.",
    });
  }

  return sendJson(res, 200, { reply });
};