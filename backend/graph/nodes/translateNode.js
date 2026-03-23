// Translate node for data normalization
import { runTranslate } from "../../agents/translateAgent.js";

export async function translateNode(state) {
  const rawResearch = state.tripContext?.researchOutput ?? "";
  console.log("[translateNode] Starting normalization...");

  if (!rawResearch) {
    return { tripContext: { normalizedData: {} }, phase: "response" };
  }

  const normalized = await runTranslate(rawResearch);
  console.log("[translateNode] Normalized sections:", Object.keys(normalized));

  return { tripContext: { normalizedData: normalized }, phase: "response" };
}
