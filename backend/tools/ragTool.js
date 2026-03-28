import "dotenv/config";
import path from "path";
import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { OpenAIEmbeddings } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Module-level embeddings instance (lazy, created once)
 */
let _embeddings = null;

function getEmbeddings() {
  if (_embeddings) return _embeddings;

  _embeddings = new OpenAIEmbeddings({
    apiKey: process.env.GITHUB_TOKEN,
    configuration: {
      baseURL:
        process.env.GITHUB_MODELS_BASE_URL ||
        "https://models.github.ai/inference",
    },
    model: "text-embedding-3-small",
  });

  return _embeddings;
}

/**
 * Module-level vector store loader (lazy, loaded once)
 */
let _vectorStore = null;

async function getVectorStore() {
  if (_vectorStore) return _vectorStore;

  const storePath = path.join(process.cwd(), "vector-store");
  console.log("[ragTool] Loading vector store from:", storePath);

  _vectorStore = await HNSWLib.load(storePath, getEmbeddings());
  console.log("[ragTool] Vector store loaded from:", storePath);
  return _vectorStore;
}

/**
 * RAG Tool for querying travel guides
 */
const ragTool = new DynamicStructuredTool({
  name: "get_travel_guide",
  description:
    "Search curated travel guides for destination-specific tips covering visa requirements, cultural etiquette, seasonal advice, neighborhood guides, transportation, packing suggestions, currency, language, safety, and tipping customs. Use this tool when the user asks about practical travel advice, what to know before visiting, cultural tips, visa info, best time to visit, what to pack, or how to get around.",
  schema: z.object({
    destination: z.string().describe("The destination city to search"),
    query: z.string().describe("The specific question or topic to search for"),
  }),
  func: async ({ destination, query }) => {
    try {
      console.log(`[ragTool] Searching for: "${query}" in ${destination}`);

      const store = await getVectorStore();

      // Build a combined search query for better relevance
      const searchQuery = `${destination} ${query}`;

      // Retrieve top 5 most relevant chunks
      const results = await store.similaritySearch(searchQuery, 8);

      if (!results || results.length === 0) {
        return `No travel guide information found for ${destination}.`;
      }

      // Filter results to prioritize chunks matching the destination
      const destinationResults = results.filter(
        (r) =>
          r.metadata?.destination?.toLowerCase() === destination.toLowerCase(),
      );

      // Use destination-filtered results if available, otherwise use all
      const finalResults =
        destinationResults.length > 0 ? destinationResults : results;

      // After getting finalResults, filter out header-only chunks
      const contentResults = finalResults.filter(
        (r) => r.pageContent.trim().length > 100,
      );

      // Use content results if available, otherwise fall back
      const outputResults =
        contentResults.length > 0 ? contentResults : finalResults;

      // Format results with section context
      const formatted = outputResults
        .map((r) => {
          const section = r.metadata?.section ?? "General";
          const dest = r.metadata?.destination ?? destination;
          return `[${dest} — ${section}]\n${r.pageContent}`;
        })
        .join("\n\n---\n\n");

      console.log(
        `[ragTool] Found ${outputResults.length} relevant chunks for ${destination}`,
      );
      return formatted;
    } catch (err) {
      console.error("[ragTool] Error:", err.message);
      return `Travel guide information temporarily unavailable for ${destination}.`;
    }
  },
});

export default ragTool;
