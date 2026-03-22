// backend/mcp-server/server.js
// TravelMate MCP Server — stdio transport
// Spawned as a child process by MultiServerMCPClient in researchAgent.js.
// No Express server needed — communication happens via stdin/stdout.

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import weatherTool from "../tools/weatherTool.js";
import attractionsTool from "../tools/attractionsTool.js";
import restaurantTool from "../tools/restaurantTool.js";
import flightTool from "../tools/flightTool.js";

// ============================================================================
// MCP SERVER INSTANCE
// ============================================================================

const server = new McpServer({
  name: "travelmate-tools",
  version: "1.0.0",
});

// ============================================================================
// TOOL REGISTRATIONS
// ============================================================================

server.tool(
  "get_weather",
  "Get current weather and 5-day forecast for a destination city. Use this for any weather, temperature, climate, or packing questions.",
  { city: z.string(), country: z.string().optional() },
  async ({ city, country }) => {
    try {
      const result = await weatherTool.func({ city, country });
      return { content: [{ type: "text", text: String(result) }] };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Tool temporarily unavailable: ${err.message}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "get_attractions",
  "Find top tourist attractions, landmarks, and things to do in a destination city. Returns real venue data from Foursquare.",
  { city: z.string(), category: z.string().optional() },
  async ({ city, category }) => {
    try {
      const result = await attractionsTool.func({ city, category });
      return { content: [{ type: "text", text: String(result) }] };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Tool temporarily unavailable: ${err.message}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "get_restaurants",
  "Find top restaurants and dining options in a destination city. Returns real venue data from Foursquare.",
  { city: z.string(), cuisine: z.string().optional() },
  async ({ city, cuisine }) => {
    try {
      const result = await restaurantTool.func({ city, cuisine });
      return { content: [{ type: "text", text: String(result) }] };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Tool temporarily unavailable: ${err.message}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "get_flight_status",
  "Look up real-time flight status, departure and arrival times, and delay information by flight number.",
  { flightNumber: z.string(), date: z.string().optional() },
  async ({ flightNumber, date }) => {
    try {
      const result = await flightTool.func({ flightNumber, date });
      return { content: [{ type: "text", text: String(result) }] };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Tool temporarily unavailable: ${err.message}`,
          },
        ],
      };
    }
  },
);

// ============================================================================
// STDIO TRANSPORT
// StdioServerTransport communicates via stdin/stdout — no HTTP server needed.
// MultiServerMCPClient in researchAgent.js spawns this file as a child
// process and communicates with it directly.
// ============================================================================

const transport = new StdioServerTransport();
await server.connect(transport);

// Log to stderr only — stdout is reserved for MCP protocol messages
console.error("[mcp-server] TravelMate MCP server started (stdio transport)");
console.error(
  "[mcp-server] Exposed tools: get_weather, get_attractions, get_restaurants, get_flight_status",
);
