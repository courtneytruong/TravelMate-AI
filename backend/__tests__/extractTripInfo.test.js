import { extractTripInfo } from "../graph/state.js";

describe("extractTripInfo — flight numbers", () => {
  test("extracts uppercase flight number AA123", async () => {
    const result = await extractTripInfo("AA123");
    expect(result.flightNumber).toBe("AA123");
    expect(result.destination).toBeNull();
  });

  test("extracts uppercase flight number DL4052", async () => {
    const result = await extractTripInfo("DL4052");
    expect(result.flightNumber).toBe("DL4052");
  });

  test("extracts flight number from mixed text UA1 on April 15th", async () => {
    const result = await extractTripInfo("UA1 on April 15th");
    expect(result.flightNumber).toBe("UA1");
  });

  test("returns null for text with no flight number", async () => {
    const result = await extractTripInfo("no flight number");
    expect(result.flightNumber).toBeNull();
  });

  test("returns null for lowercase flight number aa123", async () => {
    const result = await extractTripInfo("aa123");
    expect(result.flightNumber).toBeNull();
  });
});

describe("extractTripInfo — destinations", () => {
  test("extracts destination from 'I want to go to Tokyo'", async () => {
    const result = await extractTripInfo("I want to go to Tokyo");
    expect(result.destination).toBe("Tokyo");
  });

  test("extracts destination from 'flying to Barcelona'", async () => {
    const result = await extractTripInfo("flying to Barcelona");
    expect(result.destination).toBe("Barcelona");
  });

  test("extracts destination from 'trip to New York'", async () => {
    const result = await extractTripInfo("trip to New York");
    expect(result.destination).toBe("New York");
  });

  test("extracts destination from 'visiting Paris on June 1st'", async () => {
    const result = await extractTripInfo("visiting Paris on June 1st");
    expect(result.destination).toBe("Paris");
  });

  test("returns null for 'I want to go to the beach' (the is filtered)", async () => {
    const result = await extractTripInfo("I want to go to the beach");
    expect(result.destination).toBeNull();
  });

  test("returns null for plain string 'hello'", async () => {
    const result = await extractTripInfo("hello");
    expect(result.destination).toBeNull();
  });
});

describe("extractTripInfo — dates", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-01"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("extracts date from 'April 15th'", async () => {
    const result = await extractTripInfo("April 15th");
    expect(result.date).toBe("2026-04-15");
  });

  test("extracts date from 'March 19 2026'", async () => {
    const result = await extractTripInfo("March 19 2026");
    expect(result.date).toBe("2026-03-19");
  });

  test("returns null when no date mentioned", async () => {
    const result = await extractTripInfo("no date mentioned");
    expect(result.date).toBeNull();
  });

  test("extracts date from ISO format '2026-04-15'", async () => {
    const result = await extractTripInfo("2026-04-15");
    expect(result.date).toBe("2026-04-15");
  });
});

describe("extractTripInfo — combined inputs", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-01"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("extracts destination and date from 'I want to go to Tokyo on April 15th'", async () => {
    const result = await extractTripInfo("I want to go to Tokyo on April 15th");
    expect(result.destination).toBe("Tokyo");
    expect(result.date).toBe("2026-04-15");
    expect(result.flightNumber).toBeNull();
  });

  test("extracts flight number and date from 'AA123 on April 15th'", async () => {
    const result = await extractTripInfo("AA123 on April 15th");
    expect(result.flightNumber).toBe("AA123");
    expect(result.date).toBe("2026-04-15");
    expect(result.destination).toBeNull();
  });

  test("extracts destination and date from 'flying to Barcelona on March 19 2026'", async () => {
    const result = await extractTripInfo(
      "flying to Barcelona on March 19 2026",
    );
    expect(result.destination).toBe("Barcelona");
    expect(result.date).toBe("2026-03-19");
    expect(result.flightNumber).toBeNull();
  });
});

describe("extractTripInfo — message object input", () => {
  test("accepts LangChain message object with content property", async () => {
    const messageObj = { content: "I want to go to Tokyo" };
    const result = await extractTripInfo(messageObj);
    expect(result.destination).toBe("Tokyo");
  });
});
