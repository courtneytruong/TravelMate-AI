import "dotenv/config";
import { mcpClient } from "./agents/researchAgent.js";

const tools = await mcpClient.getTools();
const ragTool = tools.find((t) => t.name === "get_travel_guide");

console.log("RAG tool found via MCP:", !!ragTool);
console.log("Tool description:", ragTool?.description?.slice(0, 80));

const result = await ragTool.invoke({
  destination: "Tokyo",
  query: "what should I know before visiting",
});

console.log("Raw result type:", typeof result);
console.log("Raw result:", JSON.stringify(result).slice(0, 300));
