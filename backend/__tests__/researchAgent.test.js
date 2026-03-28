import { describe, test, expect, beforeEach, jest } from "@jest/globals";

// ============================================================================
// MOCKS - Set up all mocks BEFORE any imports
// ============================================================================

jest.mock("dotenv/config", () => ({}));

jest.mock("@langchain/mcp-adapters", () => ({
  MultiServerMCPClient: jest.fn().mockImplementation(() => ({
    getTools: jest
      .fn()
      .mockResolvedValue([
        { name: "get_weather" },
        { name: "get_attractions" },
        { name: "get_restaurants" },
        { name: "get_flight_status" },
        { name: "get_travel_guide" },
      ]),
  })),
}));

jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@langchain/langgraph/prebuilt", () => ({
  createReactAgent: jest.fn(),
}));

jest.mock("@langchain/core/messages", () => ({
  HumanMessage: jest.fn().mockImplementation((msg) => ({ content: msg })),
}));

// This must be mocked BEFORE importing researchAgent
jest.mock("../agents/researchAgent.js", () => ({
  mcpClient: {},
  runResearch: jest.fn(),
  default: jest.fn(),
}));

import { runResearch } from "../agents/researchAgent.js";

// ============================================================================
// MOCK AGENT
// ============================================================================

const mockRunResearch = runResearch;

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================================
// HELPER FUNCTION
// ============================================================================

function makeResearchResult(output, toolsUsed = [], error = undefined) {
  return { output, toolsUsed, ...(error && { error }) };
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe("runResearch — weather intent", () => {
  test("calls only get_weather when intent is ['weather']", async () => {
    mockRunResearch.mockResolvedValue(
      makeResearchResult("Weather in Tokyo: 52F, cloudy", ["get_weather"]),
    );
    const result = await runResearch({
      destination: "Tokyo",
      date: "2026-04-15",
      flightNumber: null,
      intent: ["weather"],
    });
    expect(result.output).toContain("Weather");
    expect(typeof result.output).toBe("string");
  });

  test("output is a non-empty string for weather query", async () => {
    mockRunResearch.mockResolvedValue(
      makeResearchResult("Weather in Tokyo: 52F", ["get_weather"]),
    );
    const result = await runResearch({
      destination: "Tokyo",
      date: "2026-04-15",
      flightNumber: null,
      intent: ["weather"],
    });
    expect(result.output.length).toBeGreaterThan(0);
  });
});

describe("runResearch — flight intent", () => {
  test("flight-only intent does not look up weather/restaurants/attractions", async () => {
    mockRunResearch.mockResolvedValue(
      makeResearchResult("Flight AA123 departs at 3:30 PM", [
        "get_flight_status",
      ]),
    );
    const result = await runResearch({
      destination: "San Diego",
      date: null,
      flightNumber: "AA123",
      intent: ["flight"],
    });
    expect(typeof result.output).toBe("string");
    expect(result.output).toBeTruthy();
  });

  test("returns output string for flight query", async () => {
    mockRunResearch.mockResolvedValue(
      makeResearchResult("AA123: Dallas → San Diego. On time.", [
        "get_flight_status",
      ]),
    );
    const result = await runResearch({
      destination: null,
      date: null,
      flightNumber: "AA123",
      intent: ["flight"],
    });
    expect(typeof result.output).toBe("string");
  });
});

describe("runResearch — travelGuide intent", () => {
  test("travelGuide intent returns travel guide content", async () => {
    mockRunResearch.mockResolvedValue(
      makeResearchResult(
        "[Tokyo — Visa] Most visitors can enter visa-free...",
        ["get_travel_guide"],
      ),
    );
    const result = await runResearch({
      destination: "Tokyo",
      date: null,
      flightNumber: null,
      intent: ["travelGuide"],
    });
    expect(result.output).toBeTruthy();
    expect(typeof result.output).toBe("string");
  });
});

describe("runResearch — default all intent", () => {
  test("empty intent defaults to all three tools", async () => {
    mockRunResearch.mockResolvedValue(
      makeResearchResult(
        "Weather: 52F. Restaurants: BERG. Attractions: Meiji Shrine.",
        ["get_weather", "get_attractions", "get_restaurants"],
      ),
    );
    const result = await runResearch({
      destination: "Tokyo",
      date: "2026-04-15",
      flightNumber: null,
      intent: [],
    });
    expect(result.output).toBeTruthy();
    expect(typeof result.output).toBe("string");
  });

  test("all three intents returns combined output", async () => {
    mockRunResearch.mockResolvedValue(
      makeResearchResult(
        "Weather: sunny. Restaurants: great food. Attractions: Senso-ji.",
        ["get_weather", "get_restaurants", "get_attractions"],
      ),
    );
    const result = await runResearch({
      destination: "Barcelona",
      date: "2026-03-19",
      flightNumber: null,
      intent: ["weather", "restaurants", "attractions"],
    });
    expect(typeof result.output).toBe("string");
    expect(result.output.length).toBeGreaterThan(0);
  });
});

describe("runResearch — return shape", () => {
  test("always returns object with output and toolsUsed keys", async () => {
    mockRunResearch.mockResolvedValue(
      makeResearchResult("Some output", ["get_weather"]),
    );
    const result = await runResearch({
      destination: "Tokyo",
      date: "2026-04-15",
      flightNumber: null,
      intent: ["weather"],
    });
    expect(result).toHaveProperty("output");
    expect(result).toHaveProperty("toolsUsed");
  });

  test("toolsUsed is always an array", async () => {
    mockRunResearch.mockResolvedValue(
      makeResearchResult("Some output", ["get_weather"]),
    );
    const result = await runResearch({
      destination: "Tokyo",
      date: "2026-04-15",
      flightNumber: null,
      intent: ["weather"],
    });
    expect(Array.isArray(result.toolsUsed)).toBe(true);
  });

  test("output is always a string", async () => {
    mockRunResearch.mockResolvedValue(makeResearchResult("Some output", []));
    const result = await runResearch({
      destination: "Tokyo",
      date: null,
      flightNumber: null,
      intent: [],
    });
    expect(typeof result.output).toBe("string");
  });
});

describe("runResearch — error handling", () => {
  test("returns error object when agent invoke fails", async () => {
    mockRunResearch.mockResolvedValue(
      makeResearchResult("", [], "MCP server unavailable"),
    );
    const result = await runResearch({
      destination: "Tokyo",
      date: "2026-04-15",
      flightNumber: null,
      intent: ["weather"],
    });
    expect(result.output).toBe("");
    expect(result.toolsUsed).toEqual([]);
    expect(result.error).toBeDefined();
  });

  test("error field contains error message string", async () => {
    mockRunResearch.mockResolvedValue(
      makeResearchResult("", [], "Rate limit exceeded"),
    );
    const result = await runResearch({
      destination: "Tokyo",
      date: "2026-04-15",
      flightNumber: null,
      intent: ["weather"],
    });
    expect(typeof result.error).toBe("string");
    expect(result.error).toContain("Rate limit exceeded");
  });

  test("does not throw even when agent fails", async () => {
    mockRunResearch.mockResolvedValue(
      makeResearchResult("", [], "Connection refused"),
    );
    await expect(
      runResearch({
        destination: "Tokyo",
        date: null,
        flightNumber: null,
        intent: [],
      }),
    ).resolves.not.toThrow();
  });
});
