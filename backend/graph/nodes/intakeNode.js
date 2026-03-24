// Intake node for initial trip information gathering
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import * as chrono from "chrono-node";
import { extractTripInfo } from "../state.js";

export async function intakeNode(state) {
  const msgs = Array.isArray(state.messages) ? state.messages : [];
  const lastMessage = msgs.at(-1);
  const lastText = lastMessage?.content ?? "";

  const isGreeting =
    /^(hi|hello|hey|howdy|sup|greetings|start|begin|help)[\s!?.]*$/i.test(
      lastText.trim(),
    );
  const hasAIMessageAlready = msgs.some((m) => m instanceof AIMessage);

  if (!hasAIMessageAlready || isGreeting) {
    console.log("[intakeNode] Sending welcome message");
    return {
      messages: [
        new AIMessage({
          content:
            'Welcome to TravelMate AI! I can help you plan your trip with live weather, restaurant recommendations, and things to do.\n\nTo get started, please share either:\n- A flight number and travel date (e.g. "AA123 on April 15th")\n- A destination city and travel date (e.g. "Tokyo on April 15th")',
        }),
      ],
      phase: "intake",
    };
  }

  const latestText = lastText;
  const extracted = await extractTripInfo(latestText);
  console.log("[intakeNode] Extracted:", extracted);

  const existingContext = state.tripContext ?? {};

  // Default date to today if no date has ever been provided.
  // This handles follow-ups like "what is the weather in the area?" after a
  // flight lookup where the user never explicitly stated a travel date.
  const todayDate = new Date().toISOString().split("T")[0];

  const mergedContext = {
    destination: extracted.destination ?? existingContext.destination ?? null,
    date: extracted.date ?? existingContext.date ?? todayDate,
    flightNumber:
      extracted.flightNumber ?? existingContext.flightNumber ?? null,
    // Preserve resolvedDestination from previous turns so follow-up questions
    // like "what is the weather in the area?" still have a destination to use.
    resolvedDestination: existingContext.resolvedDestination ?? null,
  };

  if (!extracted.destination && !extracted.date && !extracted.flightNumber) {
    if (!mergedContext.date) {
      try {
        const parsed = chrono.parseDate(latestText);
        if (parsed) {
          mergedContext.date = [
            parsed.getFullYear(),
            String(parsed.getMonth() + 1).padStart(2, "0"),
            String(parsed.getDate()).padStart(2, "0"),
          ].join("-");
          console.log(
            "[intakeNode] Standalone date parsed:",
            mergedContext.date,
          );
        }
      } catch (_) {}
    }
    if (!mergedContext.destination) {
      const cityGuess = latestText.trim();
      if (
        cityGuess.length > 0 &&
        cityGuess.length < 40 &&
        /^[A-Za-z\s\-]+$/.test(cityGuess)
      ) {
        mergedContext.destination = cityGuess;
        console.log(
          "[intakeNode] Treating message as destination:",
          mergedContext.destination,
        );
      }
    }
  }

  if (existingContext.flightLookupFailed && mergedContext.flightNumber) {
    const cityGuess = latestText.trim();
    if (
      cityGuess.length > 0 &&
      cityGuess.length < 40 &&
      /^[A-Za-z\s\-]+$/.test(cityGuess)
    ) {
      mergedContext.destination = cityGuess;
      mergedContext.flightNumber = null;
      console.log(
        "[intakeNode] Flight lookup previously failed — using user input as destination:",
        mergedContext.destination,
      );
    }
  }

  // ── INTENT DETECTION ─────────────────────────────────────────────────────
  // Always detect from current message first so follow-up questions like
  // "what is the weather in the area?" work correctly after a flight lookup.
  const intentKeywords = {
    weather:
      /\b(weather|forecast|temperature|climate|rain|rainy|sunny|cold|hot|warm|pack|packing|umbrella)\b/i,
    restaurants:
      /\b(restaurant|restaurants|food|dining|cuisine|lunch|dinner|breakfast|cafe|where to eat)\b/i,
    attractions:
      /\b(attraction|attractions|things to do|sightseeing|visit|landmark|museum|tour|sight|activity|activities)\b/i,
    travelGuide:
      /\b(visa|entry requirements|passport|customs|etiquette|culture|cultural|tradition|tip|tips|advice|neighborhood|neighbourhoods|district|area|transport|getting around|packing|what to pack|what to bring|best time|when to visit|season|safety|currency|language|tipping|sim card|wifi|what should i know|before i visit|before visiting|local customs|dress code|electric|plug|adapter)\b/i,
  };

  const detectedIntents = Object.entries(intentKeywords)
    .filter(([, regex]) => regex.test(latestText))
    .map(([i]) => i);

  // if travelGuide detected alongside destination+date,
  // also include live data tools for a complete response
  let intent;
  if (detectedIntents.length > 0) {
    intent = detectedIntents;
    // If user provided destination + date AND asked what to know,
    // also pull live weather/restaurants/attractions
    if (
      detectedIntents.includes("travelGuide") &&
      mergedContext.destination &&
      mergedContext.date
    ) {
      if (!intent.includes("weather")) intent.push("weather");
      if (!intent.includes("restaurants")) intent.push("restaurants");
      if (!intent.includes("attractions")) intent.push("attractions");
    }
  } else {
    intent = ["weather", "restaurants", "attractions"];
  }
  console.log("[intakeNode] Detected intent:", intent);
  console.log("[intakeNode] Merged context:", mergedContext);

  // Skip resolving if flight was already resolved in a previous turn
  const alreadyResolved = !!existingContext.resolvedDestination;

  if (mergedContext.flightNumber && !alreadyResolved) {
    console.log("[intakeNode] Flight number found — phase -> resolving");
    return {
      messages: [
        new AIMessage({
          content: `Got it! Let me look up flight **${mergedContext.flightNumber}** and find travel info for your destination. One moment...`,
        }),
      ],
      tripContext: { ...mergedContext, intent },
      phase: "resolving",
    };
  }

  // Use resolvedDestination as fallback when destination is null
  // This handles follow-up questions after a flight lookup resolved the city
  const effectiveDestination =
    mergedContext.destination ?? mergedContext.resolvedDestination ?? null;
  if (effectiveDestination && !mergedContext.destination) {
    mergedContext.destination = effectiveDestination;
  }

  if (mergedContext.destination && mergedContext.date) {
    console.log("[intakeNode] Destination + date found — phase -> lookup");
    let ackMessage = "";
    if (intent.length === 1 && intent[0] === "weather") {
      ackMessage = `Got it! Let me check the weather in **${mergedContext.destination}** for you. One moment...`;
    } else if (intent.length === 1 && intent[0] === "restaurants") {
      ackMessage = `Got it! Let me find top restaurants in **${mergedContext.destination}** for you. One moment...`;
    } else if (intent.length === 1 && intent[0] === "attractions") {
      ackMessage = `Got it! Let me find things to do in **${mergedContext.destination}** for you. One moment...`;
    } else {
      ackMessage = `Got it! Let me look up weather, restaurants, and things to do in **${mergedContext.destination}** for **${mergedContext.date}**. One moment...`;
    }
    return {
      messages: [new AIMessage({ content: ackMessage })],
      tripContext: { ...mergedContext, intent },
      phase: "lookup",
    };
  }

  if (mergedContext.destination && !mergedContext.date) {
    console.log("[intakeNode] Destination found, no date — asking for date");
    return {
      messages: [
        new AIMessage({
          content: `Great! What date are you planning to travel to ${mergedContext.destination}?`,
        }),
      ],
      tripContext: { ...mergedContext, intent },
      phase: "intake",
    };
  }

  console.log("[intakeNode] Nothing extracted — re-prompt");
  return {
    messages: [
      new AIMessage({
        content:
          'I didn\'t quite catch that! Please share one of the following:\n- A flight number and travel date (e.g. "AA123 on April 15th")\n- A destination city and travel date (e.g. "Tokyo on April 15th")',
      }),
    ],
    phase: "intake",
  };
}
