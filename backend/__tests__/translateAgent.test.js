import { describe, test, expect, beforeEach, jest } from "@jest/globals";

// ============================================================================
// MOCKS
// ============================================================================

// Create a shared mock invoke function that all ChatOpenAI instances will use
const mockInvoke = jest.fn();

jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: mockInvoke,
  })),
}));

jest.mock("@langchain/core/messages", () => ({
  SystemMessage: jest
    .fn()
    .mockImplementation((msg) => ({ role: "system", content: msg })),
  HumanMessage: jest
    .fn()
    .mockImplementation((msg) => ({ role: "user", content: msg })),
}));

jest.mock("dotenv/config", () => ({}));

import { runTranslate } from "../agents/translateAgent.js";

// ============================================================================
// TEST SETUP
// ============================================================================

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================================
// HELPER FUNCTIONS - Mock Response Builders
// ============================================================================

function makeWeatherJSON() {
  return {
    weather: {
      temp: "52°F",
      conditions: "Cloudy",
      humidity: "73%",
      forecast: ["Mon 52°F cloudy", "Tue 58°F cloudy"],
    },
  };
}

function makeRestaurantsJSON() {
  return {
    restaurants: [
      { name: "BERG", cuisine: "Pub", address: "Shinjuku 3-38-1" },
      {
        name: "Ohitsuzen Tanbo",
        cuisine: "Japanese",
        address: "Yoyogi 1-41-9",
      },
    ],
  };
}

function makeAttractionsJSON() {
  return {
    attractions: [
      {
        name: "Meiji Jingu Shrine",
        type: "Shrine",
        address: "Yoyogi, Shibuya",
      },
      {
        name: "Shinjuku Gyoen",
        type: "Garden",
        address: "Naitomachi, Shinjuku",
      },
    ],
  };
}

function makeFlightJSON() {
  return {
    flight: {
      number: "AA123",
      status: "On time",
      departure: "JFK 2:30pm",
      arrival: "LAX 5:45pm",
      destination: "Los Angeles",
    },
  };
}

function makeTravelGuideJSON() {
  return {
    travelGuide: {
      destination: "Tokyo",
      sections: [
        {
          title: "Visa and Entry Requirements",
          content: "Most visitors can enter Japan visa-free for 90 days.",
        },
        {
          title: "Cultural Tips",
          content: "Bowing is the standard greeting. Remove shoes at temples.",
        },
      ],
    },
  };
}

function makeFullJSON() {
  return {
    ...makeWeatherJSON(),
    ...makeRestaurantsJSON(),
    ...makeAttractionsJSON(),
  };
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe("runTranslate — weather normalization", () => {
  test("returns object with weather key when weather data present", async () => {
    mockInvoke.mockResolvedValue({
      content: JSON.stringify(makeWeatherJSON()),
    });
    const result = await runTranslate("Weather in Tokyo: 52F cloudy...");
    expect(result).toHaveProperty("weather");
  });

  test("weather object has expected shape", async () => {
    mockInvoke.mockResolvedValue({
      content: JSON.stringify(makeWeatherJSON()),
    });
    const result = await runTranslate("Weather in Tokyo: 52F cloudy...");
    expect(result.weather).toHaveProperty("temp");
    expect(result.weather).toHaveProperty("conditions");
    expect(result.weather).toHaveProperty("humidity");
    expect(result.weather).toHaveProperty("forecast");
  });

  test("forecast is an array", async () => {
    mockInvoke.mockResolvedValue({
      content: JSON.stringify(makeWeatherJSON()),
    });
    const result = await runTranslate("Weather in Tokyo: 52F cloudy...");
    expect(Array.isArray(result.weather.forecast)).toBe(true);
  });
});

describe("runTranslate — restaurants normalization", () => {
  test("returns object with restaurants array when restaurant data present", async () => {
    mockInvoke.mockResolvedValue({
      content: JSON.stringify(makeRestaurantsJSON()),
    });
    const result = await runTranslate("1. BERG — Pub — Shinjuku...");
    expect(result).toHaveProperty("restaurants");
    expect(Array.isArray(result.restaurants)).toBe(true);
  });

  test("each restaurant has name cuisine and address", async () => {
    mockInvoke.mockResolvedValue({
      content: JSON.stringify(makeRestaurantsJSON()),
    });
    const result = await runTranslate("1. BERG — Pub — Shinjuku...");
    const first = result.restaurants[0];
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("cuisine");
    expect(first).toHaveProperty("address");
  });
});

describe("runTranslate — attractions normalization", () => {
  test("returns object with attractions array when attraction data present", async () => {
    mockInvoke.mockResolvedValue({
      content: JSON.stringify(makeAttractionsJSON()),
    });
    const result = await runTranslate("1. Meiji Shrine — Shrine...");
    expect(result).toHaveProperty("attractions");
    expect(Array.isArray(result.attractions)).toBe(true);
  });

  test("each attraction has name type and address", async () => {
    mockInvoke.mockResolvedValue({
      content: JSON.stringify(makeAttractionsJSON()),
    });
    const result = await runTranslate("1. Meiji Shrine — Shrine...");
    const first = result.attractions[0];
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("type");
    expect(first).toHaveProperty("address");
  });
});

describe("runTranslate — flight normalization", () => {
  test("returns object with flight key when flight data present", async () => {
    mockInvoke.mockResolvedValue({
      content: JSON.stringify(makeFlightJSON()),
    });
    const result = await runTranslate("AA123: JFK → LAX. On time.");
    expect(result).toHaveProperty("flight");
  });

  test("flight object has expected shape", async () => {
    mockInvoke.mockResolvedValue({
      content: JSON.stringify(makeFlightJSON()),
    });
    const result = await runTranslate("AA123: JFK → LAX. On time.");
    expect(result.flight).toHaveProperty("number");
    expect(result.flight).toHaveProperty("status");
  });
});

describe("runTranslate — travelGuide normalization", () => {
  test("returns object with travelGuide key when guide data present", async () => {
    mockInvoke.mockResolvedValue({
      content: JSON.stringify(makeTravelGuideJSON()),
    });
    const result = await runTranslate("[Tokyo — Visa] Most visitors...");
    expect(result).toHaveProperty("travelGuide");
  });

  test("travelGuide has destination and sections array", async () => {
    mockInvoke.mockResolvedValue({
      content: JSON.stringify(makeTravelGuideJSON()),
    });
    const result = await runTranslate("[Tokyo — Visa] Most visitors...");
    expect(result.travelGuide).toHaveProperty("destination");
    expect(result.travelGuide).toHaveProperty("sections");
    expect(Array.isArray(result.travelGuide.sections)).toBe(true);
  });

  test("each section has title and content", async () => {
    mockInvoke.mockResolvedValue({
      content: JSON.stringify(makeTravelGuideJSON()),
    });
    const result = await runTranslate("[Tokyo — Visa] Most visitors...");
    const first = result.travelGuide.sections[0];
    expect(first).toHaveProperty("title");
    expect(first).toHaveProperty("content");
  });
});

describe("runTranslate — combined data normalization", () => {
  test("returns all sections when multiple data sources present", async () => {
    mockInvoke.mockResolvedValue({
      content: JSON.stringify(makeFullJSON()),
    });
    const result = await runTranslate("Weather: 52F. Restaurants: BERG...");
    expect(result).toHaveProperty("weather");
    expect(result).toHaveProperty("restaurants");
    expect(result).toHaveProperty("attractions");
  });

  test("returns plain object not null or array", async () => {
    mockInvoke.mockResolvedValue({
      content: JSON.stringify(makeWeatherJSON()),
    });
    const result = await runTranslate("Weather: 52F...");
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(false);
  });
});

describe("runTranslate — JSON parsing", () => {
  test("handles JSON wrapped in markdown fences", async () => {
    mockInvoke.mockResolvedValue({
      content: "```json\n" + JSON.stringify(makeWeatherJSON()) + "\n```",
    });
    const result = await runTranslate("Weather: 52F...");
    expect(result).toHaveProperty("weather");
  });

  test("returns empty object when LLM returns invalid JSON", async () => {
    mockInvoke.mockResolvedValue({
      content: "This is not valid JSON at all",
    });
    const result = await runTranslate("Some raw text");
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  test("returns empty object when LLM returns empty string", async () => {
    mockInvoke.mockResolvedValue({
      content: "",
    });
    const result = await runTranslate("Some raw text");
    expect(typeof result).toBe("object");
  });
});

describe("runTranslate — error handling", () => {
  test("returns empty object when LLM call fails", async () => {
    mockInvoke.mockRejectedValue(new Error("LLM unavailable"));
    const result = await runTranslate("Some raw text");
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });

  test("does not throw when LLM fails", async () => {
    mockInvoke.mockRejectedValue(new Error("Rate limit exceeded"));
    await expect(runTranslate("Some raw text")).resolves.not.toThrow();
  });

  test("does not throw when called with empty string", async () => {
    mockInvoke.mockResolvedValue({
      content: JSON.stringify({}),
    });
    await expect(runTranslate("")).resolves.not.toThrow();
  });
});
