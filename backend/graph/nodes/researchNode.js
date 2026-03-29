// Research node for destination research
import { AIMessage } from "@langchain/core/messages";
import { runResearch } from "../../agents/researchAgent.js";

export async function researchNode(state) {
  const destination =
    state.tripContext?.resolvedDestination || state.tripContext?.destination;
  const date = state.tripContext?.date;
  const flightNumber = state.tripContext?.flightNumber;
  const intent = state.tripContext?.intent ?? [];
  const userMessage = state.tripContext?.userMessage ?? "";

  console.log("[researchNode] Starting research for:", destination);
  console.log("[researchNode] Intent:", intent);

  if (!destination) {
    return {
      messages: [
        new AIMessage({
          content:
            "I need a destination to look up travel information. Please provide one.",
        }),
      ],
      phase: "intake",
    };
  }

  const result = await runResearch({
    destination,
    date,
    flightNumber,
    intent,
    userMessage,
  });

  if (!result.output || result.error) {
    console.error("[researchNode] Research failed:", result.error);
    return {
      tripContext: { researchOutput: "", toolsUsed: [] },
      phase: "translate",
    };
  }

  console.log("[researchNode] Tools used:", result.toolsUsed);
  console.log("[researchNode] Output length:", result.output.length);

  return {
    tripContext: { researchOutput: result.output, toolsUsed: result.toolsUsed },
    phase: "translate",
  };
}
