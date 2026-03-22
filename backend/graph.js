// backend/graph.js
// LangGraph state definition and nodes for TravelMate AI chatbot
// Compatible with @langchain/langgraph 1.2.x

import {
  Annotation,
  MessagesAnnotation,
  StateGraph,
  MemorySaver,
  START,
  END,
} from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import * as chrono from "chrono-node";
import { runResearch } from "./agents/researchAgent.js";
import { runTranslate } from "./agents/translateAgent.js";

// ============================================================================
// SHARED LLM
// ============================================================================

let _sharedLLM = null;

function getSharedLLM() {
  if (_sharedLLM) return _sharedLLM;
  const apiKey = process.env.GITHUB_TOKEN || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing LLM credentials");
  _sharedLLM = new ChatOpenAI({
    model: "gpt-4o-mini",
    apiKey,
    configuration: {
      baseURL:
        process.env.GITHUB_MODELS_BASE_URL ||
        "https://models.github.ai/inference",
    },
  });
  console.log(
    "[getSharedLLM] LLM instance created with apiKey ending in:",
    apiKey.slice(-6),
  );
  return _sharedLLM;
}

// ============================================================================
// RETRY HELPER
// ============================================================================

async function callWithRetry(fn, retries = 3, delayMs = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 =
        err?.status === 429 ||
        err?.response?.status === 429 ||
        (err?.message &&
          (err.message.includes("429") ||
            err.message.toLowerCase().includes("rate limit")));
      if (is429 && attempt < retries) {
        const waitMs = delayMs * Math.pow(2, attempt);
        console.warn(
          `[callWithRetry] Attempt ${attempt + 1}: rate limited, waiting ${waitMs}ms`,
        );
        await new Promise((r) => setTimeout(r, waitMs));
      } else {
        throw err;
      }
    }
  }
}

// ============================================================================
// GRAPH STATE
// ============================================================================

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

// ============================================================================
// EXTRACT TRIP INFO
// ============================================================================

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

// ============================================================================
// INTAKE NODE
// ============================================================================

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
  };

  const detectedIntents = Object.entries(intentKeywords)
    .filter(([, regex]) => regex.test(latestText))
    .map(([i]) => i);

  let intent;
  if (detectedIntents.length > 0) {
    intent = detectedIntents;
  } else if (existingContext.flightStatusOnly) {
    intent = ["flight"];
    console.log("[intakeNode] Preserving flight-only intent");
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

// ============================================================================
// RESOLVE NODE
// Calls flightTool directly for raw output — avoids double API call via MCP.
// Passes flight data directly to translateNode, skipping researchNode.
// ============================================================================

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
    const flightToolModule = await import("./tools/flightTool.js");
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
      resolvedDestination = rawDest
        .replace(/\([A-Z]{3,4}\)/g, "")
        .replace(/International|Airport|Intl/gi, "")
        .replace(/\s+/g, " ")
        .trim();
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
          resolvedDestination,
          flightStatus,
          flightLookupFailed: false,
          flightNumber: null, // clear so follow-ups don't re-trigger resolveNode
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
          flightStatus,
          flightLookupFailed: true,
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

// ============================================================================
// RESEARCH NODE
// ============================================================================

export async function researchNode(state) {
  const destination =
    state.tripContext?.resolvedDestination || state.tripContext?.destination;
  const date = state.tripContext?.date;
  const flightNumber = state.tripContext?.flightNumber;
  const intent = state.tripContext?.intent ?? [];

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

  const result = await runResearch({ destination, date, flightNumber, intent });

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

// ============================================================================
// TRANSLATE NODE
// ============================================================================

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

// ============================================================================
// SYNTHESIS NODE
// ============================================================================

export async function synthesisNode(state) {
  const normalized = state.tripContext?.normalizedData ?? {};
  const { weather, attractions, restaurants, flight: flightData } = normalized;
  const destination =
    state.tripContext?.resolvedDestination || state.tripContext?.destination;
  const flightNumber = state.tripContext?.flightNumber;

  console.log("[synthesisNode] Building final response for:", destination);

  const headerMap = {
    flight: `Flight ${flightNumber ?? ""}`,
    weather: `Weather in ${destination}`,
    restaurant: `Top Restaurants in ${destination}`,
    attractions: `Things To Do in ${destination}`,
  };

  const dataSources = [];
  if (flightData) dataSources.push({ type: "flight", data: flightData });
  if (weather) dataSources.push({ type: "weather", data: weather });
  if (restaurants) dataSources.push({ type: "restaurant", data: restaurants });
  if (attractions) dataSources.push({ type: "attractions", data: attractions });

  console.log("[synthesisNode] Valid data sources:", dataSources.length);

  let finalResponse = "";

  if (dataSources.length === 0) {
    finalResponse =
      "I wasn't able to gather travel information at this moment. Could you try again or provide more details about your trip?";
  } else {
    console.log(
      "[synthesisNode] Calling LLM to synthesize",
      dataSources.length,
      "source(s)",
    );

    const dataBlocks = dataSources
      .map(
        (s) =>
          `[${headerMap[s.type].toUpperCase()}]\n${JSON.stringify(s.data, null, 2)}`,
      )
      .join("\n\n");

    const sections = dataSources
      .map((s) => headerMap[s.type])
      .filter(Boolean)
      .join("\n");

    try {
      finalResponse = await callWithRetry(
        async () => {
          const result = await getSharedLLM().invoke([
            new SystemMessage({
              content: `You are TravelMate AI, a friendly travel planning assistant.
Format the following travel data into a clean, natural, human-readable response.
Use these plain text section headers (no symbols, no emojis):
${sections}
Write in a friendly conversational tone.
Do NOT use any emojis whatsoever — no emoji characters of any kind anywhere in your response.
Do NOT output raw JSON or code blocks.
Keep each section concise — 2-4 bullet points or sentences max.
If flight data is present, always clearly state the delay status — either "No delays reported" or "Delayed by X minutes".
End with one warm closing sentence inviting follow-up questions.`,
            }),
            new HumanMessage({ content: dataBlocks }),
          ]);
          return result.content;
        },
        5,
        2000,
      );

      console.log("[synthesisNode] LLM synthesis succeeded");
    } catch (err) {
      console.error(
        "[synthesisNode] LLM synthesis failed — using fallback:",
        err?.message,
      );
      finalResponse =
        dataSources
          .map((s) => {
            const header = headerMap[s.type];
            if (s.type === "weather" && typeof s.data === "object") {
              const w = s.data;
              const forecast = Array.isArray(w.forecast)
                ? w.forecast.join(", ")
                : "";
              return `${header}\n- ${w.temp}, ${w.conditions}\n- Humidity: ${w.humidity}\n- Forecast: ${forecast}`;
            }
            if (
              (s.type === "restaurant" || s.type === "attractions") &&
              Array.isArray(s.data)
            ) {
              return (
                `${header}\n` +
                s.data
                  .map(
                    (item, i) =>
                      `${i + 1}. ${item.name} — ${item.cuisine || item.type || ""} — ${item.address || ""}`,
                  )
                  .join("\n")
              );
            }
            return `${header}\n${JSON.stringify(s.data, null, 2)}`;
          })
          .join("\n\n") + "\n\nFeel free to ask me any follow-up questions!";
    }
  }

  console.log("[synthesisNode] Response length:", finalResponse.length);
  return {
    messages: [new AIMessage({ content: finalResponse })],
    phase: "followup",
  };
}

// ============================================================================
// ROUTERS
// ============================================================================

function resolveRouter(state) {
  const failed = state.tripContext?.flightLookupFailed ?? false;
  console.log("[resolveRouter] flightLookupFailed:", failed);
  if (failed) {
    console.log("[resolveRouter] -> __end__");
    return "__end__";
  }
  // Flight data already in researchOutput — go straight to translate
  console.log("[resolveRouter] -> translate_node");
  return "translate_node";
}

function researchRouter(state) {
  const hasOutput = !!state.tripContext?.researchOutput;
  console.log("[researchRouter] hasOutput:", hasOutput);
  if (hasOutput) {
    console.log("[researchRouter] -> translate_node");
    return "translate_node";
  }
  console.log("[researchRouter] -> __end__");
  return "__end__";
}

function translateRouter(state) {
  const hasData =
    state.tripContext?.normalizedData &&
    Object.keys(state.tripContext.normalizedData).length > 0;
  console.log("[translateRouter] hasData:", hasData);
  if (hasData) {
    console.log("[translateRouter] -> synthesis_node");
    return "synthesis_node";
  }
  console.log("[translateRouter] -> __end__");
  return "__end__";
}

function intakeRouter(state) {
  const phase = state.phase ?? "intake";
  console.log("[intakeRouter] phase:", phase);
  if (phase === "resolving") {
    console.log("[intakeRouter] -> resolve_node");
    return "resolve_node";
  }
  if (phase === "lookup") {
    console.log("[intakeRouter] -> research_node");
    return "research_node";
  }
  if (phase === "translate") {
    console.log("[intakeRouter] -> translate_node");
    return "translate_node";
  }
  return "__end__";
}

// ============================================================================
// GRAPH COMPILATION
// ============================================================================

let _compiledGraphPromise = null;
const checkpointer = new MemorySaver();

export async function compileGraph() {
  if (_compiledGraphPromise) return _compiledGraphPromise;

  _compiledGraphPromise = (async () => {
    const sg = new StateGraph(GraphState);

    sg.addNode("intake_node", intakeNode);
    sg.addNode("resolve_node", resolveNode);
    sg.addNode("research_node", researchNode);
    sg.addNode("translate_node", translateNode);
    sg.addNode("synthesis_node", synthesisNode);

    sg.addEdge(START, "intake_node");

    sg.addConditionalEdges("intake_node", intakeRouter, {
      resolve_node: "resolve_node",
      research_node: "research_node",
      translate_node: "translate_node",
      __end__: END,
    });

    sg.addConditionalEdges("resolve_node", resolveRouter, {
      translate_node: "translate_node",
      __end__: END,
    });

    sg.addConditionalEdges("research_node", researchRouter, {
      translate_node: "translate_node",
      __end__: END,
    });

    sg.addConditionalEdges("translate_node", translateRouter, {
      synthesis_node: "synthesis_node",
      __end__: END,
    });

    sg.addEdge("synthesis_node", END);

    return sg.compile({ checkpointer });
  })().catch((err) => {
    _compiledGraphPromise = null;
    throw err;
  });

  return _compiledGraphPromise;
}

// ============================================================================
// INVOKE GRAPH
// ============================================================================

export async function invokeGraph(sessionId, message) {
  const compiled = await compileGraph();
  const config = { configurable: { thread_id: sessionId } };

  const invokeResult = await compiled.invoke(
    { messages: [new HumanMessage({ content: String(message) })], sessionId },
    config,
  );

  console.log("[invokeGraph] invokeResult type:", typeof invokeResult);

  let finalMessages = invokeResult?.messages;
  let finalTripContext = invokeResult?.tripContext;

  if (!Array.isArray(finalMessages) || finalMessages.length === 0) {
    console.log(
      "[invokeGraph] invoke() returned no messages — trying getState()",
    );
    const savedState = await compiled.getState(config);
    finalMessages = savedState?.values?.messages ?? [];
    finalTripContext = savedState?.values?.tripContext ?? {};
  }

  console.log("[invokeGraph] finalMessages count:", finalMessages?.length);
  const lastMessage = Array.isArray(finalMessages)
    ? finalMessages.at(-1)
    : null;
  console.log(
    "[invokeGraph] lastMessage type:",
    lastMessage?.constructor?.name,
  );

  const reply = lastMessage?.content ?? String(lastMessage ?? "");
  console.log("[invokeGraph] reply:", reply?.slice(0, 80));

  return { reply, tripContext: finalTripContext ?? {} };
}
