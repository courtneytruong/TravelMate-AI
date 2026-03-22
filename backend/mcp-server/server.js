import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import express from "express";
import weatherTool from "../tools/weatherTool.js";
import attractionsTool from "../tools/attractionsTool.js";
import restaurantTool from "../tools/restaurantTool.js";
import flightTool from "../tools/flightTool.js";

// Create MCP Server instance
const server = new McpServer({
  name: "travelmate-tools",
  version: "1.0.0",
});

// Register Tool 1: get_weather
server.tool(
  "get_weather",
  "Get current weather and 5-day forecast for a destination city. Use this for any weather, temperature, climate, or packing questions.",
  {
    city: z.string(),
    country: z.string().optional(),
  },
  async ({ city, country }) => {
    try {
      const result = await weatherTool.func({ city, country });
      return {
        content: [{ type: "text", text: String(result) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Tool temporarily unavailable: ${err.message}` }],
      };
    }
  }
);

// Register Tool 2: get_attractions
server.tool(
  "get_attractions",
  "Find top tourist attractions, landmarks, and things to do in a destination city. Returns real venue data from Foursquare.",
  {
    city: z.string(),
    category: z.string().optional(),
  },
  async ({ city, category }) => {
    try {
      const result = await attractionsTool.func({ city, category });
      return {
        content: [{ type: "text", text: String(result) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Tool temporarily unavailable: ${err.message}` }],
      };
    }
  }
);

// Register Tool 3: get_restaurants
server.tool(
  "get_restaurants",
  "Find top restaurants and dining options in a destination city. Returns real venue data from Foursquare.",
  {
    city: z.string(),
    cuisine: z.string().optional(),
  },
  async ({ city, cuisine }) => {
    try {
      const result = await restaurantTool.func({ city, cuisine });
      return {
        content: [{ type: "text", text: String(result) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Tool temporarily unavailable: ${err.message}` }],
      };
    }
  }
);

// Register Tool 4: get_flight_status
server.tool(
  "get_flight_status",
  "Look up real-time flight status, departure and arrival times, and delay information by flight number.",
  {
    flightNumber: z.string(),
    date: z.string().optional(),
  },
  async ({ flightNumber, date }) => {
    try {
      const result = await flightTool.func({ flightNumber, date });
      return {
        content: [{ type: "text", text: String(result) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Tool temporarily unavailable: ${err.message}` }],
      };
    }
  }
);

// Create Express app
const app = express();
app.use(express.json());

// Store active SSE transport
let sseTransport = null;

// Health check route
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    server: "travelmate-tools",
    tools: 4,
  });
});

// SSE connection route
app.get("/sse", (req, res) => {
  sseTransport = new SSEServerTransport("/messages", res);
  server.connect(sseTransport);
});

// Message handler route
app.post("/messages", (req, res) => {
  if (sseTransport) {
    sseTransport.handlePostMessage(req, res);
  } else {
    res.status(503).json({ error: "SSE transport not connected" });
  }
});

// Start server
app.listen(8080, () => {
  console.log("TravelMate MCP server running on port 8080");
  console.log("Exposed tools:");
  console.log("  - get_weather");
  console.log("  - get_attractions");
  console.log("  - get_restaurants");
  console.log("  - get_flight_status");
});
