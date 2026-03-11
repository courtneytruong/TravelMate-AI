// backend/server.js
import express from "express";
import { buildGraph } from "./graph.js";
import { systemPrompt } from "./prompts.js";
import * as memory from "./memory.js";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/graph", (req, res) => {
  res.json(buildGraph());
});

app.get("/memory", (req, res) => {
  res.json(memory.getAllMemory());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`TravelMate AI backend listening on ${PORT}`),
);
