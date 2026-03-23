// Shared LLM instance and retry logic
import { ChatOpenAI } from "@langchain/openai";

let _sharedLLM = null;

export function getSharedLLM() {
  if (_sharedLLM) return _sharedLLM;
  const apiKey = process.env.GITHUB_TOKEN || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing LLM credentials");
  _sharedLLM = new ChatOpenAI({
    model: "gpt-4o-mini",
    apiKey,
    configuration: {
      baseURL:
        process.env.GITHUB_MODELS_BASE_URL ||
        "https://models.github.ai/inference",
    },
  });
  console.log(
    "[getSharedLLM] LLM instance created with apiKey ending in:",
    apiKey.slice(-6),
  );
  return _sharedLLM;
}

export async function callWithRetry(fn, retries = 3, delayMs = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 =
        err?.status === 429 ||
        err?.response?.status === 429 ||
        (err?.message &&
          (err.message.includes("429") ||
            err.message.toLowerCase().includes("rate limit")));
      if (is429 && attempt < retries) {
        const waitMs = delayMs * Math.pow(2, attempt);
        console.warn(
          `[callWithRetry] Attempt ${attempt + 1}: rate limited, waiting ${waitMs}ms`,
        );
        await new Promise((r) => setTimeout(r, waitMs));
      } else {
        throw err;
      }
    }
  }
}
