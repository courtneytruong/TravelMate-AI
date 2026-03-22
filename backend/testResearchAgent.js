import "dotenv/config";
import { runResearch } from "./agents/researchAgent.js";

const result = await runResearch({
  destination: "Tokyo",
  date: "2026-04-15",
  flightNumber: null,
});

console.log("Tools used:", result.toolsUsed);
console.log("Output length:", result.output.length);
console.log("Output preview:", result.output.slice(0, 300));
