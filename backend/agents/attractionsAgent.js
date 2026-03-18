// backend/agents/attractionsAgent.js
import attractionsTool from "../tools/attractionsTool.js";
import { attractionsAgentPrompt } from "../prompts.js";
import { ChatOpenAI } from "@langchain/openai";
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage } from "@langchain/core/messages";

/**
 * Factory that creates the attractions specialist agent.
 * Returns an object with both .run() and .invoke() methods.
 *
 * @returns {Promise<{run: Function, invoke: Function, _debug: object}>}
 */
async function createAttractionsAgent() {
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
    SystemMessagePromptTemplate.fromTemplate(attractionsAgentPrompt),
    new MessagesPlaceholder("chat_history"),
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  const llmWithTools = llm.bindTools([attractionsTool]);

  /**
   * Extracts the city name from various input shapes.
   * @param {string|object} userInput
   * @returns {string}
   */
  const extractCity = (userInput) => {
    if (!userInput) return "";
    if (userInput?.tripContext?.destination)
      return userInput.tripContext.destination;
    if (typeof userInput?.input === "string") {
      const match = userInput.input.match(/([A-Z][a-zA-Z]+)/);
      if (match) return match[1];
      return userInput.input.split(" ")[0];
    }
    if (typeof userInput === "string") {
      const match = userInput.match(/([A-Z][a-zA-Z]+)/);
      if (match) return match[1];
      return userInput.split(" ")[0];
    }
    return "";
  };

  /**
   * Core run logic — accepts { input, tripContext } or a plain string.
   * Always passes city explicitly to the tool to avoid empty-args failures.
   *
   * @param {string|object} userInput
   * @returns {Promise<string>}
   */
  const run = async (userInput) => {
    const city = extractCity(userInput);

    // Always call the tool directly with the city to avoid LLM omitting args
    if (city) {
      console.log(
        `[attractionsAgent] Calling attractions tool directly for city: ${city}`,
      );
      try {
        const toolResult = await attractionsTool.func({ city });
        const result = String(toolResult ?? "");
        if (
          result &&
          !result.includes("temporarily unavailable") &&
          !result.includes("Please provide")
        ) {
          return result;
        }
      } catch (err) {
        console.error(
          "[attractionsAgent] Direct tool call failed:",
          err?.message,
        );
      }
    }

    // Fallback to LLM
    console.log("[attractionsAgent] Falling back to LLM");
    const systemMessages = await prompt.formatMessages({
      chat_history: [],
      agent_scratchpad: [],
    });

    const humanContent = city
      ? `Find top attractions in ${city}.`
      : String(userInput ?? "");

    const human = new HumanMessage({ content: humanContent });
    const aiMsg = await llmWithTools.invoke([...systemMessages, human]);

    if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
      const toolCall = aiMsg.tool_calls[0];
      // Ensure city is always set even if LLM omitted it
      const args = { city, ...toolCall.args };
      console.log(`[attractionsAgent] LLM tool call with args:`, args);
      try {
        const toolResult = await attractionsTool.func(args);
        return String(toolResult ?? "");
      } catch (err) {
        console.error(
          `[attractionsAgent] LLM tool execution failed:`,
          err?.message,
        );
      }
    }

    const content = aiMsg?.content;
    if (content && typeof content === "string" && content.trim()) {
      return content;
    }

    return `Attractions data temporarily unavailable for ${city || "your destination"}.`;
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

    _debug: { llmWithTools, prompt, tools: [attractionsTool] },
  };
}

export default createAttractionsAgent;
