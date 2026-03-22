// backend/testTranslateAgent.js
import "dotenv/config";
import { runResearch } from "./agents/researchAgent.js";
import { runTranslate } from "./agents/translateAgent.js";

const research = await runResearch({
  destination: "Tokyo",
  date: "2026-04-15",
  flightNumber: null,
});

console.log("\n--- RAW RESEARCH OUTPUT ---");
console.log(research.output.slice(0, 200));

const normalized = await runTranslate(research.output);

console.log("\n--- NORMALIZED JSON ---");
console.log(JSON.stringify(normalized, null, 2));
