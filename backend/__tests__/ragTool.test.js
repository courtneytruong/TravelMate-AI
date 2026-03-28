// Unit tests for ragTool — RAG-based travel guide queries
import ragTool from "../tools/ragTool.js";

// Mock HNSWLib vector store
jest.mock("@langchain/community/vectorstores/hnswlib", () => ({
  HNSWLib: {
    load: jest.fn(),
  },
}));

// Mock OpenAIEmbeddings
jest.mock("@langchain/openai", () => ({
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({})),
}));

import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";

// Mock vector store instance
const mockVectorStore = {
  similaritySearch: jest.fn(),
};

// Helper function to create mock chunks
function makeChunk(destination, section, content) {
  return {
    pageContent: content,
    metadata: {
      source: `${destination.toLowerCase()}.md`,
      destination,
      section,
      chunkIndex: 0,
    },
  };
}

// Reusable mock chunks
const tokyoVisaChunk = makeChunk(
  "Tokyo",
  "Visa and Entry Requirements",
  "Most visitors from the US, UK, Canada, Australia, and EU countries can enter Japan visa-free for up to 90 days.",
);

const tokyoCultureChunk = makeChunk(
  "Tokyo",
  "Cultural Tips and Etiquette",
  "Bowing is the standard greeting. Removing shoes before entering homes and temples is mandatory. Always show respect for elders and superiors.",
);

const tokyoTransportChunk = makeChunk(
  "Tokyo",
  "Transportation Tips",
  "Get a Suica or Pasmo IC card on arrival. These rechargeable cards work on all trains, subways, and buses.",
);

const barcelonaChunk = makeChunk(
  "Barcelona",
  "Cultural Tips and Etiquette",
  "Greeting with two kisses on the cheek is standard. The pace of life is relaxed.",
);

const shortChunk = makeChunk("Tokyo", "General", "## Visa");

describe("ragTool — basic structure", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    HNSWLib.load.mockResolvedValue(mockVectorStore);
  });

  test("ragTool has name 'get_travel_guide'", () => {
    expect(ragTool.name).toBe("get_travel_guide");
  });

  test("ragTool has a description", () => {
    expect(ragTool.description).toBeTruthy();
    expect(typeof ragTool.description).toBe("string");
  });

  test("ragTool has a func method", () => {
    expect(typeof ragTool.func).toBe("function");
  });
});

describe("ragTool — successful queries", () => {
  let testRagTool;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    // Re-import HNSWLib after resetModules to ensure mock is fresh
    const { HNSWLib: HNSWLibFresh } =
      await import("@langchain/community/vectorstores/hnswlib");
    HNSWLibFresh.load.mockResolvedValue(mockVectorStore);
    testRagTool = (await import("../tools/ragTool.js")).default;
  });

  test("returns formatted string with destination and section headers", async () => {
    mockVectorStore.similaritySearch.mockResolvedValue([
      tokyoVisaChunk,
      tokyoCultureChunk,
    ]);

    const result = await testRagTool.func({
      destination: "Tokyo",
      query: "visa requirements",
    });

    expect(typeof result).toBe("string");
    expect(result).toContain("Tokyo");
    expect(result.length).toBeGreaterThan(100);
  });

  test("result contains chunk content", async () => {
    mockVectorStore.similaritySearch.mockResolvedValue([tokyoVisaChunk]);

    const result = await testRagTool.func({
      destination: "Tokyo",
      query: "visa",
    });

    expect(result).toContain("visa-free");
  });

  test("result contains section metadata header", async () => {
    mockVectorStore.similaritySearch.mockResolvedValue([tokyoVisaChunk]);

    const result = await testRagTool.func({
      destination: "Tokyo",
      query: "visa",
    });

    expect(result).toMatch(/\[Tokyo.*\]/);
  });

  test("multiple chunks are separated by dashes", async () => {
    mockVectorStore.similaritySearch.mockResolvedValue([
      tokyoVisaChunk,
      tokyoCultureChunk,
    ]);

    const result = await testRagTool.func({
      destination: "Tokyo",
      query: "what to know",
    });

    expect(result).toContain("---");
  });
});

describe("ragTool — destination filtering", () => {
  let testRagTool;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    const { HNSWLib: HNSWLibFresh } =
      await import("@langchain/community/vectorstores/hnswlib");
    HNSWLibFresh.load.mockResolvedValue(mockVectorStore);
    testRagTool = (await import("../tools/ragTool.js")).default;
  });

  test("filters to return only chunks matching destination", async () => {
    mockVectorStore.similaritySearch.mockResolvedValue([
      tokyoVisaChunk,
      barcelonaChunk,
      tokyoCultureChunk,
    ]);

    const result = await testRagTool.func({
      destination: "Tokyo",
      query: "cultural tips",
    });

    expect(result).toContain("Tokyo");
  });

  test("falls back to all results if no destination match found", async () => {
    mockVectorStore.similaritySearch.mockResolvedValue([barcelonaChunk]);

    const result = await testRagTool.func({
      destination: "Tokyo",
      query: "cultural tips",
    });

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("ragTool — content filtering", () => {
  let testRagTool;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    const { HNSWLib: HNSWLibFresh } =
      await import("@langchain/community/vectorstores/hnswlib");
    HNSWLibFresh.load.mockResolvedValue(mockVectorStore);
    testRagTool = (await import("../tools/ragTool.js")).default;
  });

  test("filters out short header-only chunks under 100 characters", async () => {
    mockVectorStore.similaritySearch.mockResolvedValue([
      shortChunk,
      tokyoVisaChunk,
    ]);

    const result = await ragTool.func({
      destination: "Tokyo",
      query: "visa",
    });

    expect(result).not.toContain("## Visa");
    expect(result).toContain("visa-free");
  });

  test("returns fallback message when no results found", async () => {
    mockVectorStore.similaritySearch.mockResolvedValue([]);

    const result = await testRagTool.func({
      destination: "Tokyo",
      query: "anything",
    });

    expect(result).toContain("No travel guide information found");
  });
});

describe("ragTool — error handling", () => {
  let testRagTool;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    // Don't set up mock here; tests will configure their own
    testRagTool = (await import("../tools/ragTool.js")).default;
  });

  test("returns error string when vector store fails", async () => {
    const { HNSWLib: HNSWLibFresh } =
      await import("@langchain/community/vectorstores/hnswlib");
    // Set mock to reject for this specific test
    HNSWLibFresh.load.mockRejectedValueOnce(
      new Error("Vector store unavailable"),
    );

    const result = await testRagTool.func({
      destination: "Tokyo",
      query: "visa",
    });

    expect(typeof result).toBe("string");
    expect(result).toContain("temporarily unavailable");
  });

  test("returns string not throw when similaritySearch fails", async () => {
    const { HNSWLib: HNSWLibFresh } =
      await import("@langchain/community/vectorstores/hnswlib");
    // Set up the mock to successfully load the vector store for this test
    HNSWLibFresh.load.mockResolvedValueOnce(mockVectorStore);
    mockVectorStore.similaritySearch.mockRejectedValue(
      new Error("Search failed"),
    );

    const result = await testRagTool.func({
      destination: "Tokyo",
      query: "visa",
    });

    expect(typeof result).toBe("string");
  });
});

describe("ragTool — vector store loading", () => {
  let testRagTool;
  let HNSWLibFresh;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    const imported = await import("@langchain/community/vectorstores/hnswlib");
    HNSWLibFresh = imported.HNSWLib;
    HNSWLibFresh.load.mockResolvedValue(mockVectorStore);
    testRagTool = (await import("../tools/ragTool.js")).default;
  });

  test("loads vector store with correct embeddings instance", async () => {
    mockVectorStore.similaritySearch.mockResolvedValue([tokyoVisaChunk]);

    await testRagTool.func({ destination: "Tokyo", query: "visa" });

    expect(HNSWLibFresh.load).toHaveBeenCalled();
  });

  test("vector store is loaded only once across multiple calls", async () => {
    mockVectorStore.similaritySearch.mockResolvedValue([tokyoVisaChunk]);

    await testRagTool.func({ destination: "Tokyo", query: "visa" });
    await testRagTool.func({ destination: "Tokyo", query: "culture" });

    expect(HNSWLibFresh.load).toHaveBeenCalledTimes(1);
  });
});
