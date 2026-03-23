// Graph state definition and trip info extraction
import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import * as chrono from "chrono-node";

export const GraphState = Annotation.Root({
  ...MessagesAnnotation.spec,

  phase: Annotation({
    reducer: (_, update) => update ?? _,
    default: () => "intake",
  }),

  tripContext: Annotation({
    reducer: (current, update) => ({ ...(current ?? {}), ...(update ?? {}) }),
    default: () => ({
      destination: null,
      date: null,
      flightNumber: null,
      resolvedDestination: null,
      flightStatus: null,
      weatherData: null,
      attractionsData: null,
      restaurantData: null,
      flightLookupFailed: false,
      lookupComplete: false,
      intent: [],
      researchOutput: null,
      toolsUsed: [],
      normalizedData: null,
      flightStatusOnly: false,
    }),
  }),

  sessionId: Annotation({
    reducer: (_, update) => update ?? _,
    default: () => "",
  }),
});

export async function extractTripInfo(text) {
  const textStr =
    typeof text === "string" ? text : (text?.content ?? String(text));
  console.log("[extractTripInfo] Extracting from:", textStr.slice(0, 80));

  const flightMatch = textStr.match(/\b([A-Z]{1,3}\d{1,4})\b/);
  const flightNumber = flightMatch ? flightMatch[1].toUpperCase() : null;

  let date = null;
  try {
    const parsed = chrono.parseDate(textStr);
    if (parsed) {
      date = [
        parsed.getFullYear(),
        String(parsed.getMonth() + 1).padStart(2, "0"),
        String(parsed.getDate()).padStart(2, "0"),
      ].join("-");
    }
  } catch (_) {}

  let destination = null;
  const destPatterns = [
    /\b(?:to|in|visit(?:ing)?|heading\s+to|headed\s+to|going\s+to|travel(?:ing)?\s+to|flying\s+to|fly\s+to|trip\s+to)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/,
  ];
  const NOT_A_CITY =
    /^(the|a|an|my|our|your|this|that|april|may|june|july|january|february|march|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next|last|this)$/i;

  for (const pattern of destPatterns) {
    const match = textStr.match(pattern);
    if (match) {
      const candidate = match[1].trim();
      if (!NOT_A_CITY.test(candidate)) {
        destination = candidate;
        break;
      }
    }
  }

  console.log("[extractTripInfo] Result:", { destination, date, flightNumber });
  return { destination, date, flightNumber };
}
