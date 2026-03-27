import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { intakeNode } from "../graph/nodes/intakeNode.js";

jest.mock("../graph/state.js", () => ({
  extractTripInfo: jest.fn(),
}));

import { extractTripInfo } from "../graph/state.js";

function makeState(messages = [], tripContext = {}) {
  return {
    messages,
    tripContext: {
      destination: null,
      date: null,
      flightNumber: null,
      resolvedDestination: null,
      flightLookupFailed: false,
      flightStatusOnly: false,
      intent: [],
      ...tripContext,
    },
  };
}

describe("intakeNode — welcome message", () => {
  test("empty messages array returns welcome message", async () => {
    extractTripInfo.mockResolvedValue({
      destination: null,
      date: null,
      flightNumber: null,
    });

    const state = makeState([]);
    const result = await intakeNode(state);

    expect(result.messages[0].content).toContain("Welcome to TravelMate AI");
    expect(result.phase).toBe("intake");
  });

  test("messages with no AIMessage returns welcome message", async () => {
    extractTripInfo.mockResolvedValue({
      destination: null,
      date: null,
      flightNumber: null,
    });

    const state = makeState([new HumanMessage("hello")]);
    const result = await intakeNode(state);

    expect(result.messages[0].content).toContain("Welcome to TravelMate AI");
    expect(result.phase).toBe("intake");
  });

  test("greeting 'hi' returns welcome message", async () => {
    extractTripInfo.mockResolvedValue({
      destination: null,
      date: null,
      flightNumber: null,
    });

    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("hi"),
    ]);
    const result = await intakeNode(state);

    expect(result.messages[0].content).toContain("Welcome to TravelMate AI");
  });

  test("greeting 'hello' returns welcome message", async () => {
    extractTripInfo.mockResolvedValue({
      destination: null,
      date: null,
      flightNumber: null,
    });

    const state = makeState([
      new HumanMessage("hello"),
      new AIMessage("Welcome..."),
      new HumanMessage("hello"),
    ]);
    const result = await intakeNode(state);

    expect(result.messages[0].content).toContain("Welcome to TravelMate AI");
  });

  test("greeting 'hey' returns welcome message", async () => {
    extractTripInfo.mockResolvedValue({
      destination: null,
      date: null,
      flightNumber: null,
    });

    const state = makeState([
      new HumanMessage("hey"),
      new AIMessage("Welcome..."),
      new HumanMessage("hey"),
    ]);
    const result = await intakeNode(state);

    expect(result.messages[0].content).toContain("Welcome to TravelMate AI");
  });

  test("welcome return has phase 'intake'", async () => {
    extractTripInfo.mockResolvedValue({
      destination: null,
      date: null,
      flightNumber: null,
    });

    const state = makeState([]);
    const result = await intakeNode(state);

    expect(result.phase).toBe("intake");
  });
});

describe("intakeNode — destination + date routing", () => {
  beforeEach(() => {
    extractTripInfo.mockResolvedValue({
      destination: "Tokyo",
      date: "2026-04-15",
      flightNumber: null,
    });
  });

  test("returns phase 'lookup' when destination and date found", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("I want to go to Tokyo on April 15th"),
    ]);
    const result = await intakeNode(state);

    expect(result.phase).toBe("lookup");
  });

  test("reply content contains destination name", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("I want to go to Tokyo on April 15th"),
    ]);
    const result = await intakeNode(state);

    expect(result.messages[0].content).toContain("Tokyo");
  });

  test("tripContext contains destination", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("I want to go to Tokyo on April 15th"),
    ]);
    const result = await intakeNode(state);

    expect(result.tripContext.destination).toBe("Tokyo");
  });

  test("tripContext contains date", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("I want to go to Tokyo on April 15th"),
    ]);
    const result = await intakeNode(state);

    expect(result.tripContext.date).toBe("2026-04-15");
  });
});

describe("intakeNode — destination only routing", () => {
  beforeEach(() => {
    extractTripInfo.mockResolvedValue({
      destination: "Tokyo",
      date: null,
      flightNumber: null,
    });
  });

  test("returns phase 'lookup' when only destination found", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("I want to go to Tokyo"),
    ]);
    const result = await intakeNode(state);

    expect(result.phase).toBe("lookup");
  });

  test("reply content contains destination name", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("I want to go to Tokyo"),
    ]);
    const result = await intakeNode(state);

    expect(result.messages[0].content).toContain("Tokyo");
  });

  test("reply asks for a date", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("I want to go to Tokyo"),
    ]);
    const result = await intakeNode(state);

    expect(result.messages[0].content).toMatch("Tokyo");
  });
});

describe("intakeNode — flight number routing", () => {
  beforeEach(() => {
    extractTripInfo.mockResolvedValue({
      destination: null,
      date: null,
      flightNumber: "AA123",
    });
  });

  test("returns phase 'resolving' when flight number found", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("AA123 on April 15th"),
    ]);
    const result = await intakeNode(state);

    expect(result.phase).toBe("resolving");
  });

  test("reply content contains flight number", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("AA123 on April 15th"),
    ]);
    const result = await intakeNode(state);

    expect(result.messages[0].content).toContain("AA123");
  });

  test("tripContext contains flight number", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("AA123 on April 15th"),
    ]);
    const result = await intakeNode(state);

    expect(result.tripContext.flightNumber).toBe("AA123");
  });
});

describe("intakeNode — intent detection", () => {
  beforeEach(() => {
    extractTripInfo.mockResolvedValue({
      destination: "Tokyo",
      date: "2026-04-15",
      flightNumber: null,
    });
  });

  test("weather keyword detected in message", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("What is the weather in Tokyo on April 15th"),
    ]);
    const result = await intakeNode(state);

    expect(result.tripContext.intent).toContain("weather");
  });

  test("restaurants keyword detected in message", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("Find restaurants in Tokyo"),
    ]);
    const result = await intakeNode(state);

    expect(result.tripContext.intent).toContain("restaurants");
  });

  test("attractions keyword detected in message", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("Things to do in Tokyo"),
    ]);
    const result = await intakeNode(state);

    expect(result.tripContext.intent).toContain("attractions");
  });

  test("travelGuide keyword detected in message", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("What should I know before visiting Tokyo"),
    ]);
    const result = await intakeNode(state);

    expect(result.tripContext.intent).toContain("travelGuide");
  });

  test("default intent is all three when no keywords", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("I want to go to Tokyo on April 15th"),
    ]);
    const result = await intakeNode(state);

    expect(result.tripContext.intent).toEqual(
      expect.arrayContaining(["weather", "restaurants", "attractions"]),
    );
  });
});

describe("intakeNode — nothing extracted re-prompt", () => {
  beforeEach(() => {
    extractTripInfo.mockResolvedValue({
      destination: null,
      date: null,
      flightNumber: null,
    });
  });

  test("returns phase 'intake' when nothing extracted", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("1234"),
    ]);
    const result = await intakeNode(state);

    expect(result.phase).toBe("intake");
  });

  test("reply contains instruction about what to share", async () => {
    const state = makeState([
      new HumanMessage("hi"),
      new AIMessage("Welcome..."),
      new HumanMessage("???"),
    ]);
    const result = await intakeNode(state);

    expect(result.messages[0].content).toMatch(
      /didn't quite catch|flight number|destination/i,
    );
  });
});
