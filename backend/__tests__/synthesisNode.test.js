import { describe, test, expect, beforeEach, jest } from "@jest/globals";

// ============================================================================
// MOCKS
// ============================================================================

// Create a shared mock invoke function
const mockInvoke = jest.fn();

jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: mockInvoke,
  })),
}));

jest.mock("@langchain/core/messages", () => ({
  AIMessage: jest.fn().mockImplementation((obj) => ({
    content: obj.content,
    type: "AIMessage",
  })),
  HumanMessage: jest.fn().mockImplementation((obj) => ({
    content: obj.content,
    type: "HumanMessage",
  })),
  SystemMessage: jest.fn().mockImplementation((obj) => ({
    content: obj.content,
    type: "SystemMessage",
  })),
}));

jest.mock("../graph/llm.js", () => ({
  getSharedLLM: jest.fn(() => ({
    invoke: mockInvoke,
  })),
  callWithRetry: jest.fn((fn, maxRetries, delay) => fn()),
}));

jest.mock("dotenv/config", () => ({}));

import { synthesisNode } from "../graph/nodes/synthesisNode.js";

// ============================================================================
// TEST SETUP
// ============================================================================

beforeEach(() => {
  jest.clearAllMocks();
  mockInvoke.mockResolvedValue({
    content: "Here is your travel information.",
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function makeState(tripContext = {}) {
  return {
    messages: [],
    tripContext: {
      destination: "Tokyo",
      date: "2026-04-15",
      flightNumber: null,
      resolvedDestination: null,
      flightStatus: null,
      normalizedData: null,
      intent: [],
      ...tripContext,
    },
  };
}

function makeWeatherData() {
  return {
    temp: "52°F",
    conditions: "Cloudy",
    humidity: "73%",
    forecast: ["Mon 52°F cloudy", "Tue 58°F rainy"],
  };
}

function makeRestaurantsData() {
  return [
    { name: "BERG", cuisine: "Pub", address: "Shinjuku 3-38-1" },
    { name: "Ohitsuzen Tanbo", cuisine: "Japanese", address: "Yoyogi 1-41-9" },
  ];
}

function makeAttractionsData() {
  return [
    { name: "Meiji Jingu Shrine", type: "Shrine", address: "Yoyogi, Shibuya" },
    { name: "Shinjuku Gyoen", type: "Garden", address: "Naitomachi, Shinjuku" },
  ];
}

function makeFlightData() {
  return {
    number: "AA123",
    status: "On time",
    departure: "JFK 2:30pm",
    arrival: "LAX 5:45pm",
    destination: "Los Angeles",
  };
}

function makeTravelGuideData() {
  return {
    destination: "Tokyo",
    sections: [
      { title: "Visa", content: "Visa-free for 90 days." },
      { title: "Culture", content: "Bow as a greeting." },
    ],
  };
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe("synthesisNode — return shape", () => {
  test("always returns object with messages array", async () => {
    const state = makeState({
      normalizedData: { weather: makeWeatherData() },
    });
    const result = await synthesisNode(state);
    expect(result).toHaveProperty("messages");
    expect(Array.isArray(result.messages)).toBe(true);
  });

  test("always returns phase 'followup'", async () => {
    const state = makeState({
      normalizedData: { weather: makeWeatherData() },
    });
    const result = await synthesisNode(state);
    expect(result.phase).toBe("followup");
  });

  test("messages array contains exactly one message", async () => {
    const state = makeState({
      normalizedData: { weather: makeWeatherData() },
    });
    const result = await synthesisNode(state);
    expect(result.messages.length).toBe(1);
  });

  test("message content is a non-empty string", async () => {
    const state = makeState({
      normalizedData: { weather: makeWeatherData() },
    });
    const result = await synthesisNode(state);
    expect(typeof result.messages[0].content).toBe("string");
    expect(result.messages[0].content.length).toBeGreaterThan(0);
  });
});

describe("synthesisNode — no data handling", () => {
  test("returns fallback message when normalizedData is null", async () => {
    const state = makeState({ normalizedData: null });
    const result = await synthesisNode(state);
    expect(result.messages[0].content).toBeTruthy();
    expect(typeof result.messages[0].content).toBe("string");
  });

  test("returns fallback message when normalizedData is empty object", async () => {
    const state = makeState({ normalizedData: {} });
    const result = await synthesisNode(state);
    expect(result.messages[0].content).toBeTruthy();
  });

  test("fallback message does not throw", async () => {
    const state = makeState({ normalizedData: null });
    await expect(synthesisNode(state)).resolves.not.toThrow();
  });

  test("phase is still 'followup' even with no data", async () => {
    const state = makeState({ normalizedData: null });
    const result = await synthesisNode(state);
    expect(result.phase).toBe("followup");
  });
});

describe("synthesisNode — weather data", () => {
  test("calls LLM when weather data is present", async () => {
    const state = makeState({
      normalizedData: { weather: makeWeatherData() },
    });
    await synthesisNode(state);
    expect(mockInvoke).toHaveBeenCalled();
  });

  test("LLM is called with a system message and human message", async () => {
    const state = makeState({
      normalizedData: { weather: makeWeatherData() },
    });
    await synthesisNode(state);
    const callArgs = mockInvoke.mock.calls[0][0];
    expect(Array.isArray(callArgs)).toBe(true);
    expect(callArgs.length).toBe(2);
  });

  test("returns LLM response content as message", async () => {
    mockInvoke.mockResolvedValue({
      content: "Weather in Tokyo: 52°F with cloudy skies.",
    });
    const state = makeState({
      normalizedData: { weather: makeWeatherData() },
    });
    const result = await synthesisNode(state);
    expect(result.messages[0].content).toBe(
      "Weather in Tokyo: 52°F with cloudy skies.",
    );
  });
});

describe("synthesisNode — restaurants data", () => {
  test("calls LLM when restaurant data is present", async () => {
    const state = makeState({
      normalizedData: { restaurants: makeRestaurantsData() },
    });
    await synthesisNode(state);
    expect(mockInvoke).toHaveBeenCalled();
  });

  test("returns LLM synthesized response for restaurants", async () => {
    mockInvoke.mockResolvedValue({
      content: "Top restaurants in Tokyo include BERG and Ohitsuzen Tanbo.",
    });
    const state = makeState({
      normalizedData: { restaurants: makeRestaurantsData() },
    });
    const result = await synthesisNode(state);
    expect(result.messages[0].content).toContain("BERG");
  });
});

describe("synthesisNode — flight data", () => {
  test("calls LLM when flight data is present", async () => {
    const state = makeState({
      destination: "Los Angeles",
      resolvedDestination: "Los Angeles",
      normalizedData: { flight: makeFlightData() },
    });
    await synthesisNode(state);
    expect(mockInvoke).toHaveBeenCalled();
  });

  test("returns LLM response for flight status", async () => {
    mockInvoke.mockResolvedValue({
      content: "Flight AA123 departs JFK at 2:30pm. No delays.",
    });
    const state = makeState({
      destination: "Los Angeles",
      resolvedDestination: "Los Angeles",
      normalizedData: { flight: makeFlightData() },
    });
    const result = await synthesisNode(state);
    expect(result.messages[0].content).toContain("AA123");
  });
});

describe("synthesisNode — travelGuide data", () => {
  test("calls LLM when travelGuide data is present", async () => {
    const state = makeState({
      normalizedData: { travelGuide: makeTravelGuideData() },
    });
    await synthesisNode(state);
    expect(mockInvoke).toHaveBeenCalled();
  });

  test("returns LLM response for travel guide", async () => {
    mockInvoke.mockResolvedValue({
      content: "Visa: Most visitors can enter Japan visa-free for 90 days.",
    });
    const state = makeState({
      normalizedData: { travelGuide: makeTravelGuideData() },
    });
    const result = await synthesisNode(state);
    expect(result.messages[0].content).toContain("visa");
  });
});

describe("synthesisNode — combined data sources", () => {
  test("calls LLM once for multiple data sources", async () => {
    const state = makeState({
      normalizedData: {
        weather: makeWeatherData(),
        restaurants: makeRestaurantsData(),
        attractions: makeAttractionsData(),
      },
    });
    await synthesisNode(state);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  test("returns synthesized response combining all sources", async () => {
    mockInvoke.mockResolvedValue({
      content: "Weather: 52°F. Restaurants: BERG. Attractions: Meiji Shrine.",
    });
    const state = makeState({
      normalizedData: {
        weather: makeWeatherData(),
        restaurants: makeRestaurantsData(),
        attractions: makeAttractionsData(),
      },
    });
    const result = await synthesisNode(state);
    expect(result.messages[0].content.length).toBeGreaterThan(0);
  });
});

describe("synthesisNode — LLM failure fallback", () => {
  test("returns fallback response when LLM fails", async () => {
    mockInvoke.mockRejectedValue(new Error("Rate limit exceeded"));
    const state = makeState({
      normalizedData: { weather: makeWeatherData() },
    });
    const result = await synthesisNode(state);
    expect(typeof result.messages[0].content).toBe("string");
    expect(result.messages[0].content.length).toBeGreaterThan(0);
  });

  test("does not throw when LLM fails", async () => {
    mockInvoke.mockRejectedValue(new Error("LLM unavailable"));
    const state = makeState({
      normalizedData: { weather: makeWeatherData() },
    });
    await expect(synthesisNode(state)).resolves.not.toThrow();
  });

  test("phase is still followup even when LLM fails", async () => {
    mockInvoke.mockRejectedValue(new Error("Connection error"));
    const state = makeState({
      normalizedData: { weather: makeWeatherData() },
    });
    const result = await synthesisNode(state);
    expect(result.phase).toBe("followup");
  });
});
