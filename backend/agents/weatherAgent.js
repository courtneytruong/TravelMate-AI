// backend/agents/weatherAgent.js
import weatherTool from "../tools/weatherTool.js";
import { weatherAgentPrompt } from "../prompts.js";
import { ChatOpenAI } from "@langchain/openai";
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage } from "@langchain/core/messages";

/**
 * Factory that creates the weather specialist agent.
 * Returns an object with both .run() and .invoke() methods.
 *
 * @returns {Promise<{run: Function, invoke: Function, _debug: object}>}
 */
async function createWeatherAgent() {
  const apiKey = process.env.GITHUB_TOKEN || process.env.OPENAI_API_KEY;
  if (!apiKey)
    console.warn(
      "No GITHUB_TOKEN or OPENAI_API_KEY found; LLM calls may fail.",
    );

  const llm = new ChatOpenAI({
    model: "gpt-4o-mini",
    apiKey,
    configuration: {
      baseURL:
        process.env.GITHUB_MODELS_BASE_URL ||
        "https://models.github.ai/inference",
    },
  });

  const prompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(weatherAgentPrompt),
    new MessagesPlaceholder("chat_history"),
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  const llmWithTools = llm.bindTools([weatherTool]);

  /**
   * Extracts the city name from various input shapes.
   * @param {string|object} userInput
   * @returns {string}
   */
  const extractCity = (userInput) => {
    if (!userInput) return "";
    // From tripContext
    if (userInput?.tripContext?.destination)
      return userInput.tripContext.destination;
    // From { input: "Tokyo on April 15th" } — take first capitalised word
    if (typeof userInput?.input === "string") {
      const match = userInput.input.match(/([A-Z][a-zA-Z]+)/);
      if (match) return match[1];
      return userInput.input.split(" ")[0];
    }
    // Plain string input
    if (typeof userInput === "string") {
      const match = userInput.match(/([A-Z][a-zA-Z]+)/);
      if (match) return match[1];
      return userInput.split(" ")[0];
    }
    return "";
  };

  /**
   * Core run logic — accepts { input, tripContext } or a plain string.
   * NOTE: Never passes a date to the weather tool — OpenWeatherMap's free
   * tier only supports a 5-day forecast window so future travel dates will
   * always return "No forecast available". The current 5-day forecast is
   * more useful for trip planning anyway.
   *
   * @param {string|object} userInput
   * @returns {Promise<string>}
   */
  const run = async (userInput) => {
    const city = extractCity(userInput);

    // Always call the tool directly without a date.
    // The 5-day forecast is accurate and doesn't hit the date-range limitation.
    if (city) {
      console.log(
        `[weatherAgent] Calling weather tool directly for city: ${city}`,
      );
      try {
        const toolResult = await weatherTool.func({ city });
        const result = String(toolResult ?? "");
        if (result && !result.includes("temporarily unavailable")) {
          return result;
        }
      } catch (err) {
        console.error("[weatherAgent] Direct tool call failed:", err?.message);
      }
    }

    // Fallback to LLM if direct tool call fails or city not found
    console.log("[weatherAgent] Falling back to LLM");
    const systemMessages = await prompt.formatMessages({
      chat_history: [],
      agent_scratchpad: [],
    });

    let humanContent = city
      ? `Get the current weather forecast for ${city}.`
      : String(userInput ?? "");

    const human = new HumanMessage({ content: humanContent });
    const aiMsg = await llmWithTools.invoke([...systemMessages, human]);

    if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
      const toolCall = aiMsg.tool_calls[0];
      // Ensure city is always set even if LLM omitted it
      const args = { city, ...toolCall.args };
      // Never pass a date — avoids future date range errors
      delete args.date;
      console.log(`[weatherAgent] LLM tool call with args:`, args);
      try {
        const toolResult = await weatherTool.func(args);
        return String(toolResult ?? "");
      } catch (err) {
        console.error(
          `[weatherAgent] LLM tool execution failed:`,
          err?.message,
        );
      }
    }

    const content = aiMsg?.content;
    if (content && typeof content === "string" && content.trim()) {
      return content;
    }

    return `Weather data temporarily unavailable for ${city || "your destination"}.`;
  };

  return {
    run,

    /**
     * invoke() — compatible with LangChain AgentExecutor interface.
     * @param {{ input: string, tripContext?: object }} args
     * @returns {Promise<{ output: string }>}
     */
    invoke: async (args) => {
      const output = await run(args);
      return { output: String(output ?? "") };
    },

    _debug: { llmWithTools, prompt, tools: [weatherTool] },
  };
}

export default createWeatherAgent;
