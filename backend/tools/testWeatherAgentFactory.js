import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import createWeatherAgent from "../agents/weatherAgent.js";

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

(async () => {
  try {
    const exec = await createWeatherAgent();
    const userPrompt =
      process.argv[2] ||
      "What's the weather in Paris today in Celsius? Please include current conditions and a short forecast.";

    // Build messages using the agent's prompt so we can inspect the exact LLM input
    const systemMessages = await exec._debug.prompt.formatMessages({
      chat_history: [],
      agent_scratchpad: [],
    });
    const { HumanMessage, ToolMessage } =
      await import("@langchain/core/messages");
    const human = new HumanMessage({ content: String(userPrompt) });
    const messages = [...systemMessages, human];

    // Invoke the bound LLM directly to capture the raw response and tool calls
    const aiMsg = await exec._debug.llmWithTools.invoke(messages);

    console.log("=== RAW LLM RESPONSE ===");
    try {
      console.log(JSON.stringify(aiMsg, null, 2));
    } catch (e) {
      console.log(String(aiMsg));
    }

    console.log("\n=== TOOL CALLS (if any) ===");
    // Many LLM responses include a tool_calls array or tool_calls property
    console.log(
      aiMsg.tool_calls ?? aiMsg.tool_calls_json ?? "No tool calls detected",
    );

    console.log("\n=== FINAL CONTENT ===");
    console.log(aiMsg?.content ?? String(aiMsg));

    // If the model returned a tool call, execute the tool and re-invoke the LLM
    const toolCalls =
      aiMsg.kwargs?.tool_calls ??
      aiMsg.tool_calls ??
      aiMsg.kwargs?.additional_kwargs?.tool_calls;
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      const toolCall = toolCalls[0];
      // Extract args robustly
      let toolArgs = toolCall.args ?? null;
      if (!toolArgs && toolCall.function && toolCall.function.arguments) {
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          toolArgs = toolCall.function.arguments;
        }
      }

      const toolName =
        toolCall.name ?? toolCall.function?.name ?? toolCall.function?.name;
      console.log(`\n=== EXECUTING TOOL: ${toolName} ===`);

      const tool = exec._debug.tools.find(
        (t) => t.name === toolName || t.id === toolName,
      );
      if (!tool) {
        console.warn("Tool not found on agent:", toolName);
      } else {
        const toolResult = await tool.func(toolArgs ?? {});
        console.log("=== TOOL RESULT ===");
        console.log(String(toolResult));

        // Send tool result back to model as a tool message and get final reply
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
    }
  } catch (err) {
    console.error("Agent factory smoke test failed:", err?.message ?? err);
    process.exitCode = 1;
  }
})();
