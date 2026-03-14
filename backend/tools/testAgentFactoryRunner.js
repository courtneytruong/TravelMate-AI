import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load env like other tests
const cwdEnv = path.resolve(process.cwd(), ".env");
const repoRootEnv = path.resolve(process.cwd(), "..", ".env");
const repoRootExample = path.resolve(process.cwd(), "..", ".env.example");
const envPath = fs.existsSync(cwdEnv)
  ? cwdEnv
  : fs.existsSync(repoRootEnv)
    ? repoRootEnv
    : fs.existsSync(repoRootExample)
      ? repoRootExample
      : null;
if (envPath) dotenv.config({ path: envPath });

const agentName = process.argv[2] || "weather"; // weather, restaurant, flight, attractions
const userPrompt =
  process.argv[3] ||
  (agentName === "restaurant"
    ? "Find top 3 Italian restaurants in Rome and return a numbered list with name, cuisine, rating, price tier, and address."
    : agentName === "flight"
      ? "Find flights from JFK to LHR on 2026-04-01 and list the top options with airline, departure, arrival, duration, and price."
      : agentName === "attractions"
        ? "List 5 must-see attractions in Tokyo with a one-sentence description each."
        : "What's the weather in Paris today in Celsius? Please include current conditions and a short forecast.");

const agentModuleMap = {
  weather: "../agents/weatherAgent.js",
  restaurant: "../agents/restaurantAgent.js",
  flight: "../agents/flightAgent.js",
  attractions: "../agents/attractionsAgent.js",
};

(async () => {
  try {
    const modPath = agentModuleMap[agentName];
    if (!modPath) throw new Error(`Unknown agent: ${agentName}`);

    const createAgent = (await import(modPath)).default;
    const exec = await createAgent();

    const { HumanMessage, ToolMessage } =
      await import("@langchain/core/messages");

    const systemMessages = await exec._debug.prompt.formatMessages({
      chat_history: [],
      agent_scratchpad: [],
    });

    const human = new HumanMessage({ content: String(userPrompt) });
    const messages = [...systemMessages, human];

    // Invoke LLM with tools bound
    const aiMsg = await exec._debug.llmWithTools.invoke(messages);

    console.log("=== RAW LLM RESPONSE ===");
    try {
      console.log(JSON.stringify(aiMsg, null, 2));
    } catch (e) {
      console.log(String(aiMsg));
    }

    console.log("\n=== TOOL CALLS (if any) ===");
    const toolCalls =
      aiMsg.kwargs?.tool_calls ??
      aiMsg.tool_calls ??
      aiMsg.kwargs?.additional_kwargs?.tool_calls;
    console.log(toolCalls ?? "No tool calls detected");

    console.log("\n=== FINAL CONTENT ===");
    console.log(aiMsg?.content ?? String(aiMsg));

    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      const toolCall = toolCalls[0];
      let toolArgs = toolCall.args ?? null;
      if (!toolArgs && toolCall.function && toolCall.function.arguments) {
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          toolArgs = toolCall.function.arguments;
        }
      }
      const toolName = toolCall.name ?? toolCall.function?.name;
      console.log(`\n=== EXECUTING TOOL: ${toolName} ===`);

      const tool = exec._debug.tools.find(
        (t) => t.name === toolName || t.id === toolName,
      );
      if (!tool) {
        console.warn("Tool not found on agent:", toolName);
        process.exitCode = 1;
        return;
      }

      const toolResult = await tool.func(toolArgs ?? {});
      console.log("=== TOOL RESULT ===");
      console.log(String(toolResult));

      const toolMsg = new ToolMessage({
        name: toolName,
        content: String(toolResult),
        tool_call_id: toolCall.id,
      });
      const followUp = await exec._debug.llmWithTools.invoke([
        ...messages,
        aiMsg,
        toolMsg,
      ]);

      console.log("\n=== FINAL MODEL RESPONSE ===");
      try {
        console.log(JSON.stringify(followUp, null, 2));
      } catch (e) {
        console.log(String(followUp));
      }

      console.log("\n=== FINAL MODEL CONTENT ===");
      console.log(followUp?.content ?? String(followUp));
    }
  } catch (err) {
    console.error("Agent runner failed:", err?.message ?? err);
    process.exitCode = 1;
  }
})();
