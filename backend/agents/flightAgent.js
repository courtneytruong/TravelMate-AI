// backend/agents/flightAgent.js
import flightTool from "../tools/flightTool.js";
import { flightAgentPrompt } from "../prompts.js";
import { ChatOpenAI } from "@langchain/openai";
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage } from "@langchain/core/messages";

/**
 * Factory that creates the flight specialist agent.
 * Returns an object with both .run() and .invoke() methods.
 * The flight agent handles tool_calls manually since it needs to
 * inspect the result for destination extraction.
 *
 * @returns {Promise<{run: Function, invoke: Function, _debug: object}>}
 */
async function createFlightAgent() {
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
    SystemMessagePromptTemplate.fromTemplate(flightAgentPrompt),
    new MessagesPlaceholder("chat_history"),
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  const llmWithTools = llm.bindTools([flightTool]);

  /**
   * Core run logic — accepts { input, tripContext } or a plain string.
   * Handles tool_calls manually so flight data can be inspected before returning.
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
        if (tc.flightNumber) pieces.push(`FlightNumber: ${tc.flightNumber}`);
        if (tc.departDate) pieces.push(`Date: ${tc.departDate}`);
        if (tc.destination) pieces.push(`Destination: ${tc.destination}`);
        if (pieces.length)
          humanContent += "\n\nTripContext:\n" + pieces.join("\n");
      }
    } else {
      humanContent = String(userInput ?? "");
    }

    const human = new HumanMessage({ content: humanContent });
    const aiMsg = await llmWithTools.invoke([...systemMessages, human]);

    // If the LLM decided to call a tool, execute it and return the result
    if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
      const toolCall = aiMsg.tool_calls[0];
      const requestedFlightNumber = toolCall.args?.flightNumber;
      console.log(
        `[flightAgent] Tool call: ${toolCall.name} with args:`,
        toolCall.args,
      );

      try {
        const toolResult = await flightTool.func(toolCall.args);
        console.log(
          `[flightAgent] Tool result:`,
          String(toolResult).slice(0, 100),
        );

        const resultStr = String(toolResult || "");
        if (
          resultStr.includes("No flights found") ||
          resultStr.includes("Not found")
        ) {
          return `Flight ${requestedFlightNumber} not found for the requested date. Please verify the flight number and date.`;
        }

        return toolResult;
      } catch (err) {
        console.error(`[flightAgent] Tool execution failed:`, err?.message);
        return `Error querying flight status: ${err?.message ?? err}`;
      }
    }

    return aiMsg?.content ?? String(aiMsg);
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

    _debug: { llmWithTools, prompt, tools: [flightTool] },
  };
}

export default createFlightAgent;
