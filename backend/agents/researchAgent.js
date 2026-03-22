import "dotenv/config";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// SHARED MCP CLIENT
// Uses stdio transport — spawns mcp-server/server.js as a child process.
// No separate server process needed — client manages the lifecycle.
// ============================================================================

const mcpClient = new MultiServerMCPClient({
  travelTools: {
    transport: "stdio",
    command: "node",
    args: [join(__dirname, "../mcp-server/server.js")],
    env: { ...process.env },
  },
});

export { mcpClient };

// ============================================================================
// CREATE RESEARCH AGENT
// ============================================================================

async function createResearchAgent() {
  const tools = await mcpClient.getTools();
  console.log(
    "[researchAgent] Available MCP tools:",
    tools.map((t) => t.name),
  );

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

  // createReactAgent returns a compiled LangGraph StateGraph
  // invoke with { messages } not { input }
  const agent = createReactAgent({ llm, tools });
  return { agent, tools };
}

// ============================================================================
// RUN RESEARCH
// Dynamically decides which MCP tools to call based on tripContext.
// Returns raw tool output — TranslateAgent handles normalization.
// ============================================================================

export async function runResearch(tripContext) {
  try {
    const { destination, date, flightNumber } = tripContext;

    console.log(`[researchAgent] Starting research for: ${destination}`);

    // Build dynamic prompt — LLM decides which tools to call
    let prompt = `Research travel information for ${destination}`;
    if (date) prompt += ` on ${date}`;
    prompt += `. Use available tools to look up: current weather forecast, top tourist attractions, and top restaurants.`;
    if (flightNumber) {
      prompt += ` Also look up the status of flight ${flightNumber}.`;
    }
    prompt += ` Call only the tools that are relevant to this request. Return all raw results from each tool you called — do not summarize or format the output.`;

    const { agent, tools } = await createResearchAgent();

    // LangGraph ReAct agent — invoke with messages array
    const result = await agent.invoke({
      messages: [new HumanMessage(prompt)],
    });

    // Extract final response from last message
    const lastMessage = result.messages?.at(-1);
    const output = lastMessage?.content ?? "";

    // Extract tool names from tool messages in the response
    const toolsUsed =
      result.messages
        ?.filter((m) => m?.name && tools.some((t) => t.name === m.name))
        .map((m) => m.name) ?? [];

    console.log(
      `[researchAgent] Tools called: ${toolsUsed.join(", ") || "none"}`,
    );
    console.log(
      `[researchAgent] Research complete, output length: ${String(output).length}`,
    );

    return { output: String(output), toolsUsed };
  } catch (err) {
    console.error(`[researchAgent] Error:`, err.message);
    return { output: "", toolsUsed: [], error: err.message };
  }
}

export default createResearchAgent;
