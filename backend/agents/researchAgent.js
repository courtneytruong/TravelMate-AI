// backend/agents/researchAgent.js
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
    const {
      destination,
      date,
      flightNumber,
      intent = [],
      userMessage = "",
    } = tripContext;

    console.log(`[researchAgent] Starting research for: ${destination}`);
    console.log(`[researchAgent] Intent:`, intent);
    console.log(`[researchAgent] User message:`, userMessage.slice(0, 80));

    // Determine which tools to call based on detected intent.
    // "flight" intent means ONLY flight — do not add weather/restaurants/attractions.
    // "all" (empty intent) means all three non-flight sources.
    const flightOnly =
      intent.includes("flight") &&
      !intent.includes("weather") &&
      !intent.includes("attractions") &&
      !intent.includes("restaurants");

    const lookupAll = intent.length === 0;
    const lookupWeather =
      !flightOnly && (lookupAll || intent.includes("weather"));
    const lookupAttractions =
      !flightOnly && (lookupAll || intent.includes("attractions"));
    const lookupRestaurants =
      !flightOnly && (lookupAll || intent.includes("restaurants"));
    const lookupFlight = intent.includes("flight");
    const lookupTravelGuide =
      intent.includes("travelGuide") || intent.includes("travelguide");

    console.log(
      `[researchAgent] Tool flags — weather:${lookupWeather} attractions:${lookupAttractions} restaurants:${lookupRestaurants} flight:${lookupFlight} travelGuide:${lookupTravelGuide}`,
    );

    // Build focused prompt so the LLM only calls relevant tools
    let prompt = destination
      ? `Research travel information for ${destination}`
      : `Look up travel information`;
    if (date) prompt += ` on ${date}`;
    prompt += `. Use the available MCP tools to look up ONLY the following:`;
    if (lookupWeather)
      prompt += `\n- Current weather forecast (use get_weather)`;
    if (lookupAttractions)
      prompt += `\n- Top tourist attractions (use get_attractions)`;
    if (lookupRestaurants)
      prompt += `\n- Top restaurants (use get_restaurants)`;
    if (lookupFlight)
      prompt += `\n- Flight status for ${flightNumber} — include whether there are any delays (use get_flight_status)`;
    if (lookupTravelGuide) {
      prompt += `\n- Practical travel guide information for ${destination} (use get_travel_guide with destination="${destination}" and pass the user's actual question as the query: "${userMessage}")`;
    }
    prompt += `\n\nCRITICAL: Do NOT call any tools not listed above. You must call ONLY the tools specified. Return raw results from each tool without summarizing. For get_travel_guide, pass a specific query focused on the most relevant travel advice topic.`;

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
