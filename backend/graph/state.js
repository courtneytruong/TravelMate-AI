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
    /\b(?:in|visit(?:ing)?|heading\s+to|headed\s+to|going\s+to|travel(?:ing)?\s+to|flying\s+to|fly\s+to|trip\s+to)\s+([A-Za-z][a-zA-Z]+(?:\s+[A-Za-z][a-zA-Z]+)?)/i,
  ];
  const NOT_A_CITY =
    /^(the|a|an|my|our|your|this|that|april|may|june|july|january|february|march|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next|last|this|today|tomorrow|tonight|now|soon|yesterday|morning|afternoon|evening|night|week|month|year)$/i;

  // Helper to normalize to title case
  const toTitleCase = (str) =>
    str
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

  // Helper to remove temporal words from the end of destination
  const stripTemporalWords = (str) => {
    const words = str.split(/\s+/);
    // Filter out individual temporal words from the destination
    const temporalWords =
      /^(tomorrow|tonight|today|now|soon|yesterday|morning|afternoon|evening|night)$/i;
    const filtered = words.filter((w) => !temporalWords.test(w));
    return filtered.join(" ").trim();
  };

  // Try pattern matching
  for (const pattern of destPatterns) {
    const match = textStr.match(pattern);
    if (match) {
      let candidate = match[1].trim();
      candidate = stripTemporalWords(candidate);
      if (!NOT_A_CITY.test(candidate)) {
        destination = toTitleCase(candidate);
        break;
      }
    }
  }

  // Fallback: look for words after prepositions like "for", "about", "regarding", "in"
  // or capitalized words (proper nouns) that could be city names
  if (!destination) {
    // First, try prepositions that commonly precede city names
    const prepositionPattern =
      /\b(?:for|about|regarding|in|visit|visiting)\s+([A-Za-z][a-zA-Z]*(?:\s+[A-Za-z][a-zA-Z]*)?)\b/i;
    const prepMatch = textStr.match(prepositionPattern);
    if (prepMatch) {
      let candidate = prepMatch[1].trim();
      candidate = stripTemporalWords(candidate);
      if (!NOT_A_CITY.test(candidate) && candidate.length > 2) {
        destination = toTitleCase(candidate);
      }
    }
  }

  // Final fallback: look for capitalized words (proper nouns) that aren't at sentence start
  if (!destination) {
    const capitalizedWords = textStr.match(
      /(?:^|\s)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g,
    );
    if (capitalizedWords) {
      // Skip the first word (likely sentence start), try the rest
      for (const word of capitalizedWords.slice(1)) {
        let candidate = word.trim();
        candidate = stripTemporalWords(candidate);
        if (!NOT_A_CITY.test(candidate) && candidate.length > 2) {
          destination = toTitleCase(candidate);
          break;
        }
      }
    }
  }

  console.log("[extractTripInfo] Result:", { destination, date, flightNumber });
  return { destination, date, flightNumber };
}
