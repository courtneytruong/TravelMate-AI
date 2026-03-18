// backend/agents/restaurantAgent.js
import restaurantTool from "../tools/restaurantTool.js";
import { restaurantAgentPrompt } from "../prompts.js";
import { ChatOpenAI } from "@langchain/openai";
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage } from "@langchain/core/messages";

/**
 * Factory that creates the restaurant specialist agent.
 * Returns an object with both .run() and .invoke() methods.
 *
 * @returns {Promise<{run: Function, invoke: Function, _debug: object}>}
 */
async function createRestaurantAgent() {
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
    SystemMessagePromptTemplate.fromTemplate(restaurantAgentPrompt),
    new MessagesPlaceholder("chat_history"),
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  const llmWithTools = llm.bindTools([restaurantTool]);

  /**
   * Core run logic — accepts { input, tripContext } or a plain string.
   * @param {string|object} userInput
   * @returns {Promise<string>}
   */
  const run = async (userInput) => {
    const systemMessages = await prompt.formatMessages({
      chat_history: [],
      agent_scratchpad: [],
    });

    let humanContent = "";
    if (userInput && typeof userInput === "object") {
      const inp = userInput.input ?? userInput;
      humanContent =
        typeof inp === "string" ? inp : (inp?.content ?? String(inp));

      if (userInput.tripContext) {
        const tc = userInput.tripContext;
        const pieces = [];
        if (tc.destination) pieces.push(`City: ${tc.destination}`);
        if (Array.isArray(tc.preferences) && tc.preferences.length)
          pieces.push(`Preferences: ${tc.preferences.join(", ")}`);
        if (pieces.length)
          humanContent += "\n\nTripContext:\n" + pieces.join("\n");
      }
    } else {
      humanContent = String(userInput ?? "");
    }

    const human = new HumanMessage({ content: humanContent });
    const aiMsg = await llmWithTools.invoke([...systemMessages, human]);

    // If the LLM made a tool call, execute it and return the result
    if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
      const toolCall = aiMsg.tool_calls[0];
      console.log(
        `[restaurantAgent] Executing tool:`,
        toolCall.name,
        toolCall.args,
      );
      try {
        const toolResult = await restaurantTool.func(toolCall.args);
        return String(toolResult ?? "");
      } catch (err) {
        console.error(`[restaurantAgent] Tool execution failed:`, err?.message);
        return `Restaurant data temporarily unavailable: ${err?.message}`;
      }
    }

    // LLM responded with text directly
    const content = aiMsg?.content;
    if (content && typeof content === "string" && content.trim()) {
      return content;
    }

    // Fallback — call tool directly with parsed city from input
    console.log("[restaurantAgent] Empty LLM response — calling tool directly");
    try {
      const city =
        userInput?.tripContext?.destination ||
        (typeof userInput?.input === "string"
          ? userInput.input.split(" ")[0]
          : null) ||
        String(userInput ?? "").split(" ")[0];
      const toolResult = await restaurantTool.func({ city });
      return String(toolResult ?? "");
    } catch (err) {
      return "Restaurant data temporarily unavailable.";
    }
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

    _debug: { llmWithTools, prompt, tools: [restaurantTool] },
  };
}

export default createRestaurantAgent;
