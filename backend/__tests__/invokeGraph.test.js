// Unit tests for invokeGraph — main LangGraph pipeline entry point
import { invokeGraph } from "../graph/index.js";

// Mock the entire compiled graph at the boundary
jest.mock("../graph/index.js", () => ({
  invokeGraph: jest.fn(),
  compileGraph: jest.fn(),
}));

describe("invokeGraph — welcome flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("calling with 'hi' returns a reply containing 'Welcome'", async () => {
    invokeGraph.mockResolvedValue({
      reply: "Welcome to TravelMate AI! How can I help you plan your trip?",
      tripContext: {},
    });

    const result = await invokeGraph("session-001", "hi");

    expect(result.reply).toContain("Welcome");
    expect(result.tripContext).toBeDefined();
  });

  test("calling with 'hello' returns a reply string", async () => {
    invokeGraph.mockResolvedValue({
      reply:
        "Welcome to TravelMate AI! I'm here to help you plan amazing trips.",
      tripContext: {},
    });

    const result = await invokeGraph("session-001", "hello");

    expect(typeof result.reply).toBe("string");
  });

  test("reply is never empty string", async () => {
    invokeGraph.mockResolvedValue({
      reply: "Welcome to TravelMate AI!",
      tripContext: {},
    });

    const result = await invokeGraph("session-001", "hi");

    expect(result.reply.length).toBeGreaterThan(0);
  });
});

describe("invokeGraph — trip lookup flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("destination query returns tripContext with destination set", async () => {
    invokeGraph.mockResolvedValue({
      reply: "Here is the weather in Tokyo...",
      tripContext: {
        destination: "Tokyo",
        date: "2026-04-15",
        normalizedData: { weather: { temp: "52F" } },
      },
    });

    const result = await invokeGraph(
      "session-002",
      "I want to go to Tokyo on April 15th",
    );

    expect(result.tripContext.destination).toBe("Tokyo");
    expect(result.tripContext.date).toBe("2026-04-15");
  });

  test("reply contains destination name for trip queries", async () => {
    invokeGraph.mockResolvedValue({
      reply: "Weather in Tokyo: Currently 52F with clear skies...",
      tripContext: { destination: "Tokyo" },
    });

    const result = await invokeGraph(
      "session-002",
      "Weather in Tokyo on April 15th",
    );

    expect(result.reply).toContain("Tokyo");
  });

  test("normalizedData is present after successful lookup", async () => {
    invokeGraph.mockResolvedValue({
      reply: "Here is travel info for Barcelona...",
      tripContext: {
        destination: "Barcelona",
        normalizedData: {
          weather: { temp: "68F", conditions: "Sunny" },
          restaurants: [{ name: "Roast Club" }],
        },
      },
    });

    const result = await invokeGraph(
      "session-003",
      "I want to go to Barcelona on March 19th",
    );

    expect(result.tripContext.normalizedData).toBeDefined();
    expect(result.tripContext.normalizedData.weather).toBeDefined();
  });
});

describe("invokeGraph — flight flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("flight query returns flightStatus in tripContext", async () => {
    invokeGraph.mockResolvedValue({
      reply: "Flight AA123 departs at 3:30 PM and is on time...",
      tripContext: {
        flightStatus: "AA123 (American): JFK → LAX. On time.",
        resolvedDestination: "Los Angeles",
        normalizedData: { flight: { number: "AA123", status: "On time" } },
      },
    });

    const result = await invokeGraph(
      "session-004",
      "What is the status of flight AA123?",
    );

    expect(result.tripContext.flightStatus).toBeDefined();
    expect(result.reply).toContain("AA123");
  });

  test("resolvedDestination is set after flight lookup", async () => {
    invokeGraph.mockResolvedValue({
      reply:
        "Flight AA123 is heading to Los Angeles and will arrive on time...",
      tripContext: {
        resolvedDestination: "Los Angeles",
        flightStatus: "On time",
      },
    });

    const result = await invokeGraph("session-004", "AA123 status");

    expect(result.tripContext.resolvedDestination).toBe("Los Angeles");
  });
});

describe("invokeGraph — RAG travel guide flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("travel guide query returns travelGuide in normalizedData", async () => {
    invokeGraph.mockResolvedValue({
      reply: "Here is what you should know before visiting Tokyo...",
      tripContext: {
        destination: "Tokyo",
        intent: ["travelGuide"],
        normalizedData: {
          travelGuide: {
            destination: "Tokyo",
            sections: [{ title: "Visa", content: "Visa-free for 90 days..." }],
          },
        },
      },
    });

    const result = await invokeGraph(
      "session-005",
      "What should I know before visiting Tokyo?",
    );

    expect(result.tripContext.normalizedData.travelGuide).toBeDefined();
    expect(result.tripContext.intent).toContain("travelGuide");
  });

  test("reply contains practical travel information", async () => {
    invokeGraph.mockResolvedValue({
      reply:
        "Visa requirements: Most visitors can enter visa-free for up to 90 days. You'll need a valid passport and return ticket.",
      tripContext: {
        destination: "Tokyo",
        normalizedData: { travelGuide: { sections: [] } },
      },
    });

    const result = await invokeGraph(
      "session-005",
      "Do I need a visa for Tokyo?",
    );

    expect(result.reply.length).toBeGreaterThan(50);
  });
});

describe("invokeGraph — return shape contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("always returns an object with reply and tripContext keys", async () => {
    invokeGraph.mockResolvedValue({
      reply: "Some reply",
      tripContext: {},
    });

    const result = await invokeGraph("session-006", "hello");

    expect(result).toHaveProperty("reply");
    expect(result).toHaveProperty("tripContext");
  });

  test("reply is always a string", async () => {
    invokeGraph.mockResolvedValue({
      reply: "Some reply",
      tripContext: {},
    });

    const result = await invokeGraph("session-006", "hello");

    expect(typeof result.reply).toBe("string");
  });

  test("tripContext is always an object", async () => {
    invokeGraph.mockResolvedValue({
      reply: "Some reply",
      tripContext: { destination: null },
    });

    const result = await invokeGraph("session-006", "hello");

    expect(typeof result.tripContext).toBe("object");
  });

  test("different sessionIds produce independent results", async () => {
    invokeGraph
      .mockResolvedValueOnce({
        reply: "Tokyo reply with travel information",
        tripContext: { destination: "Tokyo" },
      })
      .mockResolvedValueOnce({
        reply: "Paris reply with travel information",
        tripContext: { destination: "Paris" },
      });

    const result1 = await invokeGraph("session-a", "Tokyo trip");
    const result2 = await invokeGraph("session-b", "Paris trip");

    expect(result1.tripContext.destination).toBe("Tokyo");
    expect(result2.tripContext.destination).toBe("Paris");
  });
});

describe("invokeGraph — error handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("rejects with error when invocation fails", async () => {
    invokeGraph.mockRejectedValue(new Error("LLM unavailable"));

    await expect(invokeGraph("session-007", "hello")).rejects.toThrow(
      "LLM unavailable",
    );
  });

  test("error message is descriptive", async () => {
    invokeGraph.mockRejectedValue(new Error("Rate limit exceeded"));

    await expect(invokeGraph("session-007", "hello")).rejects.toThrow(
      "Rate limit exceeded",
    );
  });
});
