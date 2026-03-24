import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { Document } from "@langchain/core/documents";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Convert filename to destination name
 * "tokyo.md" → "Tokyo"
 * "new-york.md" → "New York"
 * "san-diego.md" → "San Diego"
 */
function destinationFromFilename(filename) {
  return filename
    .replace(".md", "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Extract section name from chunk text
 * Scans for a line starting with "## "
 * Returns section name without the "## " prefix
 * If no section header found returns "General"
 */
function extractSection(text) {
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("## ")) {
      return line.replace("## ", "").trim();
    }
  }
  return "General";
}

async function ingestDocs() {
  try {
    console.log("[ingest] Starting document ingestion...");

    // Step 1: Read all markdown files
    const knowledgeBasePath = path.join(__dirname, "../knowledge-base");
    const files = fs
      .readdirSync(knowledgeBasePath)
      .filter((file) => file.endsWith(".md"));

    const allChunks = [];

    // Step 2-4: Process each file
    for (const file of files) {
      console.log(`[ingest] Reading file: ${file}`);

      const filePath = path.join(knowledgeBasePath, file);
      const fileContent = fs.readFileSync(filePath, "utf-8");

      const destination = destinationFromFilename(file);

      // Step 4: Chunk each document
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 100,
        separators: ["## ", "\n\n", "\n", " "],
      });

      const chunks = await splitter.splitText(fileContent);

      // Create Document objects with metadata
      const documents = chunks.map((chunkText, index) => {
        return new Document({
          pageContent: chunkText,
          metadata: {
            source: file,
            destination: destination,
            section: extractSection(chunkText),
            chunkIndex: index,
          },
        });
      });

      allChunks.push(...documents);
      console.log(`[ingest] ${file} → ${chunks.length} chunks`);
    }

    console.log(`[ingest] Total chunks across all files: ${allChunks.length}`);

    // Step 5: Create embeddings using GitHub Models
    console.log("[ingest] Creating embeddings via GitHub Models...");
    const embeddings = new OpenAIEmbeddings({
      apiKey: process.env.GITHUB_TOKEN,
      configuration: {
        baseURL:
          process.env.GITHUB_MODELS_BASE_URL ||
          "https://models.github.ai/inference",
      },
      model: "text-embedding-3-small",
    });

    console.log("[ingest] Embedding model: text-embedding-3-small");

    // Step 6: Create and save the HNSWLib vector store
    const vectorStorePath = path.join(__dirname, "../vector-store");
    const vectorStore = await HNSWLib.fromDocuments(allChunks, embeddings);

    await vectorStore.save(vectorStorePath);

    console.log(`[ingest] Vector store saved to ${vectorStorePath}`);
    console.log(
      `[ingest] Done! ${allChunks.length} chunks stored in ./vector-store`,
    );
  } catch (err) {
    if (err.message.includes("GITHUB_TOKEN")) {
      console.error("[ingest] Error: GITHUB_TOKEN not set in .env");
    } else {
      console.error(`[ingest] Error: ${err.message}`);
    }
    process.exit(1);
  }
}

ingestDocs();
