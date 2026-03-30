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
    // Match patterns like: "visit Tokyo", "trip to Tokyo", "flying to Tokyo", "go to Tokyo", "want to go to Tokyo"
    /\b(?:in|visit(?:ing)?|heading\s+to|headed\s+to|go(?:ing)?\s+to|travel(?:ing)?\s+to|flying\s+to|fly\s+to|trip\s+to|want\s+to\s+go\s+to)\s+([A-Za-z][a-zA-Z]+(?:\s+[A-Za-z][a-zA-Z]+)?)/i,
  ];
  const NOT_A_CITY =
    /^(the|a|an|my|our|your|this|that|april|may|june|july|january|february|march|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next|last|this|today|tomorrow|tonight|now|soon|yesterday|morning|afternoon|evening|night|week|month|year|beach|park|lake|ocean|mountain|river|forest|island|town|place|area|land|visa|requirements|information|weather|transportation|accommodations|dining|attractions|restaurants|hotels|flights|booking|tips|guide|advice|help|trip|travel|tour|planning|itinerary|budget|cost|price|payment|currency|language|culture|history|getting|getting|entry|entrance|customs|immigration)$/i;

  // Helper to normalize to title case
  const toTitleCase = (str) =>
    str
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");

  // Helper to remove temporal words from the end of destination
  const stripTemporalWords = (str) => {
    const words = str.split(/\s+/);
    // Filter out individual temporal words and prepositions from the destination
    const temporalWords =
      /^(tomorrow|tonight|today|now|soon|yesterday|morning|afternoon|evening|night|on|at|for)$/i;
    const filtered = words.filter((w) => !temporalWords.test(w));
    return filtered.join(" ").trim();
  };

  // Try pattern matching
  for (const pattern of destPatterns) {
    const match = textStr.match(pattern);
    if (match) {
      let candidate = match[1].trim();
      candidate = stripTemporalWords(candidate);
      // Check if any word in the candidate is not a city
      const words = candidate.split(/\s+/);
      const hasNonCityWord = words.some((w) => NOT_A_CITY.test(w));
      if (!hasNonCityWord) {
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
      /\b(?:for|about|regarding|visit|visiting)\s+([A-Za-z][a-zA-Z]*(?:\s+[A-Za-z][a-zA-Z]*)?)\b/i;
    const prepMatch = textStr.match(prepositionPattern);
    if (prepMatch) {
      let candidate = prepMatch[1].trim();
      candidate = stripTemporalWords(candidate);
      const words = candidate.split(/\s+/);
      const hasNonCityWord = words.some((w) => NOT_A_CITY.test(w));
      if (!hasNonCityWord && candidate.length > 2) {
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
        const words = candidate.split(/\s+/);
        const hasNonCityWord = words.some((w) => NOT_A_CITY.test(w));
        if (!hasNonCityWord && candidate.length > 2) {
          destination = toTitleCase(candidate);
          break;
        }
      }
    }
  }

  console.log("[extractTripInfo] Result:", { destination, date, flightNumber });
  return { destination, date, flightNumber };
}
