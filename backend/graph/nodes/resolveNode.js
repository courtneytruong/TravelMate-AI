// Resolve node for flight status lookup
import { AIMessage } from "@langchain/core/messages";

export async function resolveNode(state) {
  const flightNumber = state.tripContext?.flightNumber;
  console.log("[resolveNode] Resolving flight:", flightNumber);

  if (!flightNumber) {
    return {
      messages: [
        new AIMessage({
          content:
            "I couldn't find a flight number. Please provide a destination city and date instead.",
        }),
      ],
      tripContext: { flightLookupFailed: true },
      phase: "intake",
    };
  }

  try {
    console.log(
      "[resolveNode] Invoking flight tool directly for:",
      flightNumber,
    );
    const flightToolModule = await import("../../tools/flightTool.js");
    const flightTool = flightToolModule.default;
    const date =
      state.tripContext?.date ?? new Date().toISOString().split("T")[0];

    const rawToolOutput = await flightTool.func({ flightNumber, date });
    console.log("[resolveNode] Raw flight tool output:", rawToolOutput);

    const flightOutput = String(rawToolOutput || "");
    const flightStatus = flightOutput;

    // Extract destination from "Origin → Destination" format
    let resolvedDestination = null;
    const arrowMatch = flightOutput.match(
      /→\s*([A-Za-z][A-Za-z\s\/]+?)(?:\.|,|\s+\(|$)/,
    );
    const keywordMatch = flightOutput.match(
      /(?:to|destination|arriving at|going to)\s+([A-Z][a-zA-Z\s]+?)(?:\.|,|$)/i,
    );
    const rawDest = arrowMatch?.[1] ?? keywordMatch?.[1] ?? null;
    console.log("[resolveNode] rawDest extracted:", rawDest);

    if (rawDest) {
      // The flight tool now provides clean city names (without airport codes).
      // Just trim whitespace and normalize spacing.
      resolvedDestination = rawDest.replace(/\s+/g, " ").trim();
    }

    console.log("[resolveNode] Resolved destination:", resolvedDestination);

    if (resolvedDestination) {
      console.log(
        "[resolveNode] -> translate_node directly (flight data already fetched)",
      );
      return {
        messages: [
          new AIMessage({
            content: `Got it! I found your flight to ${resolvedDestination}. Looking up flight status now...`,
          }),
        ],
        tripContext: {
          flightNumber: state.tripContext?.flightNumber, // preserve flightNumber
          resolvedDestination,
          flightStatus,
          flightLookupFailed: false,
          intent: ["flight"],
          researchOutput: flightOutput,
          toolsUsed: ["get_flight_status"],
        },
        phase: "translate",
      };
    } else {
      console.log("[resolveNode] Flight found but destination not extracted");
      return {
        messages: [
          new AIMessage({
            content:
              "I found information about your flight, but couldn't determine the destination city. Could you tell me which city you're traveling to?",
          }),
        ],
        tripContext: {
          flightNumber: state.tripContext?.flightNumber, // preserve flightNumber
          flightStatus,
          flightLookupFailed: false,
          flightStatusOnly: true,
        },
        phase: "intake",
      };
    }
  } catch (err) {
    console.error("[resolveNode] Flight error:", err?.message);
    return {
      messages: [
        new AIMessage({
          content:
            "I had trouble looking up that flight. Could you provide a destination city and date instead?",
        }),
      ],
      tripContext: { flightLookupFailed: true },
      phase: "intake",
    };
  }
}
