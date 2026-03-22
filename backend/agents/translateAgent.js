import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

// ===========================
// Create Translate Agent
// ===========================
async function createTranslateAgent() {
  // Return an object with an invoke method
  return {
    invoke: async (rawResearch) => {
      console.log("[translateAgent] Normalizing research output...");

      // Build system prompt
      const systemPrompt = `You are a data normalization agent. Your job is to parse raw travel research text and convert it into clean, structured JSON.

Follow these rules strictly:
1. Match the exact output JSON shape provided below
2. Omit any top-level section (flight, weather, attractions, restaurants) that has no data
3. Clean address formatting — remove zip codes, keep only readable address parts
4. Normalize temperature to always include °F (e.g., "52°F")
5. Normalize forecast entries to "Day TempF conditions" format (e.g., "Sat 52°F cloudy")
6. For flight data: extract number, status, departure, arrival, destination if present
7. Return ONLY valid JSON — no markdown, no backticks, no explanation text

Valid JSON shape (omit any section with no data):
{
  "flight": {
    "number": "AA123",
    "status": "On time",
    "departure": "JFK 2:30pm",
    "arrival": "LAX 5:45pm",
    "destination": "Los Angeles"
  },
  "weather": {
    "temp": "52°F",
    "conditions": "Overcast clouds",
    "humidity": "73%",
    "forecast": [
      "Sat 52°F cloudy",
      "Sun 54°F cloudy",
      "Mon 55°F cloudy"
    ]
  },
  "attractions": [
    {
      "name": "Meiji Jingu Shrine",
      "type": "Shrine",
      "address": "Yoyogi Kamizonocho, Shibuya"
    }
  ],
  "restaurants": [
    {
      "name": "BERG",
      "cuisine": "Pub",
      "address": "Shinjuku 3-38-1"
    }
  ]
}

Return ONLY the JSON object, nothing else.`;

      // Create human message with raw research
      const humanMessage = new HumanMessage(
        `Normalize this raw research text into the JSON structure:\n\n${rawResearch}`,
      );

      // Create ChatOpenAI instance
      const apiKey = process.env.GITHUB_TOKEN || process.env.OPENAI_API_KEY;
      const llm = new ChatOpenAI({
        model: "gpt-4o-mini",
        apiKey,
        configuration: {
          baseURL:
            process.env.GITHUB_MODELS_BASE_URL ||
            "https://models.github.ai/inference",
        },
      });

      // Invoke LLM
      const response = await llm.invoke([
        new SystemMessage(systemPrompt),
        humanMessage,
      ]);

      // Extract text from response
      let jsonText = response.content;

      // Strip markdown fences if present
      jsonText = jsonText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      // Parse JSON
      let normalized = {};
      try {
        normalized = JSON.parse(jsonText);
      } catch (err) {
        console.error(
          "[translateAgent] JSON parse error:",
          err.message,
          "Response was:",
          jsonText,
        );
        // Return best partial result
        normalized = {};
      }

      // Log sections found
      const sections = Object.keys(normalized);
      console.log(`[translateAgent] Sections found: ${sections.join(", ")}`);
      console.log("[translateAgent] Normalization complete");

      return normalized;
    },
  };
}

// ===========================
// Run Translate Function
// ===========================
async function runTranslate(rawResearch) {
  try {
    const agent = await createTranslateAgent();
    const normalized = await agent.invoke(rawResearch);
    return normalized;
  } catch (err) {
    console.error("[translateAgent] Error during normalization:", err.message);
    return {};
  }
}

export default createTranslateAgent;
export { runTranslate };
