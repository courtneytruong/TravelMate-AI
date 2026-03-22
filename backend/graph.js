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
import { setMaxListeners } from "events";

// Increase max listeners to suppress EventTarget memory leak warning
// caused by multiple simultaneous LLM calls each registering abort listeners.
setMaxListeners(25);

// ============================================================================
// SHARED LLM — lazy getter
// Defined before all node functions so every reference resolves correctly.
// Created on first use so dotenv has loaded before the API key is read.
// ============================================================================

let _sharedLLM = null;

function getSharedLLM() {
  if (_sharedLLM) return _sharedLLM;

  const apiKey = process.env.GITHUB_TOKEN || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing LLM credentials — set GITHUB_TOKEN or OPENAI_API_KEY in your .env file",
    );
  }

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
// Wraps any async fn() with exponential backoff on 429 rate limit errors.
// ============================================================================

/**
 * Calls fn() with exponential backoff retry on 429 rate limit errors.
 * @param {Function} fn - Async function to call
 * @param {number} retries - Max retry attempts (default 3)
 * @param {number} delayMs - Base delay in ms, doubles each retry (default 1000)
 * @returns {Promise<any>}
 */
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
// TRAVEL KEYWORDS REGEX
// Expanded to catch common phrasings like "go to", "want to go", "traveling to"
// ============================================================================

const TRAVEL_KEYWORDS =
  /\b(fly|flying|flight|hotel|trip|travel|traveling|travelling|go\s+to|going\s+to|want\s+to\s+go|visiting|visit|heading\s+to|headed\s+to|depart|arrive|arriving|restaurant|food|eat|eating|weather|temperature|climate|book|booking|vacation|holiday|attraction|activity|activities|things\s+to\s+do|sightseeing|tour|destination|airport|airline|return|pack|packing|luggage|passport|visa)\b/i;

// ============================================================================
// GRAPH STATE
// Uses MessagesAnnotation.spec — the confirmed working pattern for langgraph
// 1.x that ensures invoke() returns messages correctly.
// ============================================================================

export const GraphState = Annotation.Root({
  // Spread MessagesAnnotation.spec for correct 1.x message handling
  ...MessagesAnnotation.spec,

  // phase drives conditional routing — values:
  // "intake" | "resolving" | "lookup" | "synthesis" | "followup"
  phase: Annotation({
    reducer: (_, update) => update ?? _,
    default: () => "intake",
  }),

  // tripContext merged shallowly — only updated fields overwrite existing ones
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
      researchOutput: null,
      toolsUsed: [],
      normalizedData: null,
    }),
  }),

  // sessionId replaced entirely when updated
  sessionId: Annotation({
    reducer: (_, update) => update ?? _,
    default: () => "",
  }),
});

// ============================================================================
// EXTRACT TRIP INFO HELPER
// Pure regex + chrono — zero LLM calls to preserve GitHub Models rate limit
// quota for the synthesis step where LLM output actually matters.
// ============================================================================

/**
 * Extracts destination, date, and flightNumber from a user message.
 * Uses regex and chrono — no LLM call needed.
 *
 * @param {string|object} text - User message string or LangChain message object
 * @returns {Promise<{destination: string|null, date: string|null, flightNumber: string|null}>}
 */
export async function extractTripInfo(text) {
  const textStr =
    typeof text === "string" ? text : (text?.content ?? String(text));

  console.log("[extractTripInfo] Extracting from:", textStr.slice(0, 80));

  // Extract flight number — patterns like AA123, DL4052, UA1 etc.
  // Requires uppercase letters to avoid false positives on lowercase words.
  const flightMatch = textStr.match(/\b([A-Z]{1,3}\d{1,4})\b/);
  const flightNumber = flightMatch ? flightMatch[1].toUpperCase() : null;

  // Extract date using chrono natural language parsing — no LLM needed
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

  // Extract destination city — matches capitalised word/phrase after a
  // travel keyword. Case-sensitive pattern prevents keyword capture.
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
// Welcome and re-prompt are hardcoded — no LLM calls — to preserve quota.
// Routes forward by setting state.phase for intakeRouter to read.
// ============================================================================

/**
 * Intake node: sends welcome on first turn, then extracts travel info.
 * Sets state.phase to drive routing via intakeRouter.
 *
 * @param {object} state - Current graph state
 * @returns {Promise<object>} Partial state update
 */
export async function intakeNode(state) {
  const msgs = Array.isArray(state.messages) ? state.messages : [];
  const lastMessage = msgs.at(-1);
  const lastText = lastMessage?.content ?? "";

  // Detect greeting messages like "hi", "hello", "hey" etc.
  // These should always trigger the welcome message regardless of
  // whether there is a prior AI message in history. This ensures that
  // a page reload (which sends "hi" via initChat) always gets a
  // friendly welcome rather than the re-prompt fallback.
  const isGreeting =
    /^(hi|hello|hey|howdy|sup|greetings|start|begin|help)[\s!?.]*$/i.test(
      lastText.trim(),
    );

  // Send welcome when: no AI message yet OR message is a greeting
  const hasAIMessageAlready = msgs.some((m) => m instanceof AIMessage);

  if (!hasAIMessageAlready || isGreeting) {
    console.log(
      "[intakeNode] Sending welcome message (greeting or first turn)",
    );
    return {
      messages: [
        new AIMessage({
          content:
            '👋 Welcome to TravelMate AI! I can help you plan your trip with live weather, restaurant recommendations, and things to do.\n\nTo get started, please share either:\n- ✈️ A **flight number** and travel date (e.g. "AA123 on April 15th")\n- 📍 A **destination city** and travel date (e.g. "Tokyo on April 15th")',
        }),
      ],
      phase: "intake",
    };
  }

  // AI has already spoken and message is not a greeting —
  // extract travel info from the latest human message
  const latestText = lastText;
  const extracted = await extractTripInfo(latestText);
  console.log("[intakeNode] Extracted:", extracted);

  // Merge extracted info with existing tripContext so partial follow-up
  // answers like "3/19/2026" or "Kahului" are understood in context.
  // This fixes the bug where the bot asks for a date or destination and
  // the user answers with just that piece of info.
  const existingContext = state.tripContext ?? {};

  // BUG FIX: Once we have an established trip date, don't overwrite it with
  // dates extracted from follow-up messages. The extractTripInfo function uses
  // chrono.parseDate which matches any date reference (including "today"),
  // causing user follow-up messages to overwrite the actual travel date.
  // Only use extracted.date if we don't already have a trip date.
  const mergedContext = {
    destination: extracted.destination ?? existingContext.destination ?? null,
    date: existingContext.date ?? extracted.date ?? null,
    flightNumber:
      extracted.flightNumber ?? existingContext.flightNumber ?? null,
  };

  // If extraction found nothing at all, try to infer from context
  if (!extracted.destination && !extracted.date && !extracted.flightNumber) {
    // Try parsing the whole message as a standalone date
    // Handles cases like "3/19/2026" or "March 19th" as follow-up answers
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

    // Try treating the message as a city name if we have no destination yet
    // and the message looks like a place name (short, letters and spaces only)
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

  // Bug fix: if flight lookup previously failed, the user is now providing
  // a destination manually. Don't re-trigger flight resolution — instead
  // use their message as the destination and clear the flight number so
  // the graph routes to lookup instead of resolving again.
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

  console.log("[intakeNode] Merged context:", mergedContext);

  if (mergedContext.flightNumber) {
    console.log("[intakeNode] Flight number found — phase -> resolving");
    return {
      messages: [
        new AIMessage({
          content: `Got it! Let me look up flight **${mergedContext.flightNumber}** and find travel info for your destination. One moment... ✈️`,
        }),
      ],
      tripContext: mergedContext,
      phase: "resolving",
    };
  }

  if (mergedContext.destination && mergedContext.date) {
    console.log("[intakeNode] Destination + date found — phase -> lookup");
    return {
      messages: [
        new AIMessage({
          content: `Got it! Let me look up weather, restaurants, and things to do in **${mergedContext.destination}** for **${mergedContext.date}**. One moment... 🔍`,
        }),
      ],
      tripContext: mergedContext,
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
      tripContext: mergedContext,
      phase: "intake",
    };
  }

  // Nothing useful extracted even after context merging — re-prompt
  console.log("[intakeNode] Nothing extracted — sending hardcoded re-prompt");
  return {
    messages: [
      new AIMessage({
        content:
          'I didn\'t quite catch that! Please share one of the following:\n- ✈️ A **flight number** and travel date (e.g. "AA123 on April 15th")\n- 📍 A **destination city** and travel date (e.g. "Tokyo on April 15th")',
      }),
    ],
    phase: "intake",
  };
}

// ============================================================================
// RESOLVE NODE
// Calls the flight agent to look up flight info and extract the destination.
// On success sets resolvedDestination and routes to lookup.
// On failure sets flightLookupFailed and returns to intake for re-entry.
// ============================================================================

/**
 * Resolve node: calls the flight agent to look up flight number and destination.
 * @param {object} state - Current graph state
 * @returns {Promise<object>} Partial state update
 */
export async function resolveNode(state) {
  const flightNumber = state.tripContext?.flightNumber;
  console.log("[resolveNode] Resolving flight:", flightNumber);

  if (!flightNumber) {
    console.log("[resolveNode] No flight number — cannot resolve");
    return {
      messages: [
        new AIMessage({
          content:
            "I couldn't find a flight number. Please provide a destination city and date instead, or try sharing your flight number again.",
        }),
      ],
      tripContext: { flightLookupFailed: true },
      phase: "intake",
    };
  }

  try {
    console.log(
      "[resolveNode] Invoking flight research via MCP for:",
      flightNumber,
    );

    const result = await runResearch({
      destination: null,
      date: state.tripContext?.date ?? null,
      flightNumber,
    });

    const flightOutput = result.output || "";
    const flightStatus = flightOutput;

    // Attempt to extract destination city from the research output
    let resolvedDestination = null;
    const destMatch = flightOutput.match(
      /(?:to|destination|arriving at|going to)\s+([A-Z][a-zA-Z\s]+?)(?:\.|,|$)/i,
    );
    if (destMatch) {
      resolvedDestination = destMatch[1].trim();
    }

    console.log("[resolveNode] Resolved destination:", resolvedDestination);

    if (resolvedDestination) {
      console.log("[resolveNode] -> lookup_node");
      return {
        messages: [
          new AIMessage({
            content: `Perfect! I found your flight to **${resolvedDestination}**. Now let me look up travel info for you... 🔍`,
          }),
        ],
        tripContext: {
          resolvedDestination,
          flightStatus,
          flightLookupFailed: false,
        },
        phase: "lookup",
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
        tripContext: { flightStatus, flightLookupFailed: true },
        phase: "intake",
      };
    }
  } catch (err) {
    console.error("[resolveNode] Flight research error:", err?.message);
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
// Calls the ResearchAgent to gather travel information via MCP tools.
// ============================================================================

/**
 * Research node: calls the ResearchAgent to look up travel info via MCP.
 * @param {object} state - Current graph state
 * @returns {Promise<object>} Partial state update
 */
export async function researchNode(state) {
  const destination =
    state.tripContext?.resolvedDestination || state.tripContext?.destination;
  const date = state.tripContext?.date;
  const flightNumber = state.tripContext?.flightNumber;

  console.log("[researchNode] Starting research for:", destination);

  if (!destination) {
    console.log("[researchNode] No destination — returning to intake");
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

  const result = await runResearch({ destination, date, flightNumber });

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
    tripContext: {
      researchOutput: result.output,
      toolsUsed: result.toolsUsed,
    },
    phase: "translate",
  };
}

// ============================================================================
// TRANSLATE NODE
// Calls the TranslateAgent to normalize raw research output to JSON.
// ============================================================================

/**
 * Translate node: normalizes raw research output to structured JSON.
 * @param {object} state - Current graph state
 * @returns {Promise<object>} Partial state update
 */
export async function translateNode(state) {
  const rawResearch = state.tripContext?.researchOutput ?? "";

  console.log("[translateNode] Starting normalization...");

  if (!rawResearch) {
    console.log("[translateNode] No research output to translate");
    return {
      tripContext: { normalizedData: {} },
      phase: "response",
    };
  }

  const normalized = await runTranslate(rawResearch);

  console.log("[translateNode] Normalized sections:", Object.keys(normalized));

  return {
    tripContext: { normalizedData: normalized },
    phase: "response",
  };
}

// ============================================================================
// SYNTHESIS NODE
// Combines all agent results into one clean LLM-generated response.
// Uses a concise prompt to minimize token usage against GitHub Models limits.
// Falls back to structured formatting only if LLM fails after all retries.
// ============================================================================

/**
 * Synthesis node: uses the LLM to combine all travel data into one response.
 * LLM is called with 5 retries and 2s base delay to handle rate limit spikes.
 * Falls back to structured plain text only if LLM genuinely fails.
 *
 * @param {object} state - Current graph state
 * @returns {Promise<object>} Partial state update with final AI response
 */
export async function synthesisNode(state) {
  const { flightStatus } = state.tripContext ?? {};
  const destination =
    state.tripContext?.resolvedDestination || state.tripContext?.destination;
  const flightNumber = state.tripContext?.flightNumber;

  console.log("[synthesisNode] Building final response for:", destination);

  // Get normalized data from translateNode
  const normalized = state.tripContext?.normalizedData ?? {};
  const { weather, attractions, restaurants, flight: flightData } = normalized;

  // Collect non-empty data sources from normalized data
  const dataSources = [];
  if (flightData) dataSources.push({ type: "flight", data: flightData });
  if (weather) dataSources.push({ type: "weather", data: weather });
  if (restaurants) dataSources.push({ type: "restaurant", data: restaurants });
  if (attractions) dataSources.push({ type: "attractions", data: attractions });

  console.log("[synthesisNode] Valid data sources:", dataSources.length);

  // Header map for consistent section labelling
  const headerMap = {
    flight: `✈️ Flight ${flightNumber ?? ""}`,
    weather: `🌤️ Weather in ${destination}`,
    restaurant: `🍜 Top Restaurants in ${destination}`,
    attractions: `🗼 Things To Do in ${destination}`,
  };

  let finalResponse = "";

  if (dataSources.length === 0) {
    console.log("[synthesisNode] No valid data");
    finalResponse =
      "I wasn't able to gather travel information at this moment. Could you try again or provide more details about your trip?";
  } else if (dataSources.length === 1) {
    // Single source — no LLM needed, format directly
    console.log("[synthesisNode] Single source — formatting directly");
    const s = dataSources[0];
    finalResponse =
      `${headerMap[s.type]}\n${JSON.stringify(s.data, null, 2)}` +
      "\n\n💬 Feel free to ask me any follow-up questions about your trip!";
  } else {
    // Multiple sources — use LLM to produce a coherent synthesized response.
    // This is the core generative AI step of the capstone.
    console.log("[synthesisNode] Multiple sources — calling LLM to synthesize");

    const dataBlocks = dataSources
      .map(
        (s) =>
          `[${headerMap[s.type].toUpperCase()}]\n${JSON.stringify(s.data, null, 2)}`,
      )
      .join("\n\n");

    try {
      // 5 retries with 2s base delay — gives up to ~62s total wait time,
      // appropriate for synthesis which only fires once per conversation.
      finalResponse = await callWithRetry(
        async () => {
          const result = await getSharedLLM().invoke([
            new SystemMessage({
              content: `You are TravelMate AI, a friendly travel planning assistant.
Combine the following travel data into one clean, well-formatted response.
Use these exact emoji section headers in order (omit any section not present):
${flightNumber ? `✈️ Flight ${flightNumber} — flight status\n` : ""}🌤️ Weather in ${destination} — weather forecast
🍜 Top Restaurants in ${destination} — dining recommendations
🗼 Things To Do in ${destination} — attractions and activities
Keep each section concise — 2-4 bullet points or sentences max.
End with one warm closing sentence inviting follow-up questions.
Do not add any sections not listed above.`,
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
      // LLM failed after all retries — fall back to structured plain text.
      // This is a last resort — the LLM path is always attempted first.
      console.error(
        "[synthesisNode] LLM synthesis failed after retries — using fallback:",
        err?.message,
      );
      finalResponse =
        dataSources
          .map(
            (s) => `${headerMap[s.type]}\n${JSON.stringify(s.data, null, 2)}`,
          )
          .join("\n\n") +
        "\n\n💬 Feel free to ask me any follow-up questions about your trip!";
    }
  }

  console.log("[synthesisNode] Response length:", finalResponse.length);

  return {
    messages: [new AIMessage({ content: finalResponse })],
    phase: "followup",
  };
}

// ============================================================================
// RESEARCH ROUTER
// Routes after researchNode based on whether research succeeded.
// ============================================================================

/**
 * @param {object} state - Current graph state
 * @returns {string} "translate_node" or "__end__"
 */
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

// ============================================================================
// TRANSLATE ROUTER
// Routes after translateNode based on whether normalization succeeded.
// ============================================================================

/**
 * @param {object} state - Current graph state
 * @returns {string} "synthesis_node" or "__end__"
 */
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

// ============================================================================
// RESOLVE ROUTER
// Routes after resolveNode based on whether the flight lookup succeeded.
// ============================================================================

/**
 * @param {object} state - Current graph state
 * @returns {string} "lookup_node" or "__end__"
 */
function resolveRouter(state) {
  const failed = state.tripContext?.flightLookupFailed ?? false;
  console.log("[resolveRouter] flightLookupFailed:", failed);
  if (failed) {
    console.log("[resolveRouter] -> __end__ (user must re-enter destination)");
    return "__end__";
  }
  console.log("[resolveRouter] -> research_node");
  return "research_node";
}

// ============================================================================
// INTAKE ROUTER
// Reads state.phase after intakeNode and returns the next node name.
// ============================================================================

/**
 * @param {object} state - Current graph state
 * @returns {string} Next node name or "__end__"
 */
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
  return "__end__";
}

// ============================================================================
// GRAPH COMPILATION
// ============================================================================

let _compiledGraphPromise = null;

// Module-level MemorySaver — reused across compilations so session memory
// persists correctly between invokeGraph calls.
const checkpointer = new MemorySaver();

/**
 * Compiles and caches the LangGraph StateGraph.
 * Resets cache on failure so next call can retry cleanly.
 *
 * @returns {Promise<CompiledGraph>}
 */
export async function compileGraph() {
  if (_compiledGraphPromise) return _compiledGraphPromise;

  _compiledGraphPromise = (async () => {
    const sg = new StateGraph(GraphState);

    // ── Nodes ──────────────────────────────────────────────────────────────
    sg.addNode("intake_node", intakeNode);
    sg.addNode("resolve_node", resolveNode);
    sg.addNode("research_node", researchNode);
    sg.addNode("translate_node", translateNode);
    sg.addNode("synthesis_node", synthesisNode);

    // ── Entry point ────────────────────────────────────────────────────────
    sg.addEdge(START, "intake_node");

    // ── Intake routing ─────────────────────────────────────────────────────
    sg.addConditionalEdges("intake_node", intakeRouter, {
      resolve_node: "resolve_node",
      research_node: "research_node",
      __end__: END,
    });

    // ── Resolve routing ────────────────────────────────────────────────────
    sg.addConditionalEdges("resolve_node", resolveRouter, {
      research_node: "research_node",
      __end__: END,
    });

    // ── Research routing ───────────────────────────────────────────────────
    sg.addConditionalEdges("research_node", researchRouter, {
      translate_node: "translate_node",
      __end__: END,
    });

    // ── Translate routing ──────────────────────────────────────────────────
    sg.addConditionalEdges("translate_node", translateRouter, {
      synthesis_node: "synthesis_node",
      __end__: END,
    });

    // ── Synthesis always ends ──────────────────────────────────────────────
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

/**
 * Invokes the compiled graph for a session and message.
 * Falls back to getState() if invoke() returns no messages (langgraph 1.x).
 *
 * @param {string} sessionId - Session ID used as MemorySaver thread_id
 * @param {string} message - User message text
 * @returns {Promise<{reply: string, tripContext: object}>}
 */
export async function invokeGraph(sessionId, message) {
  const compiled = await compileGraph();
  const config = { configurable: { thread_id: sessionId } };

  const invokeResult = await compiled.invoke(
    {
      messages: [new HumanMessage({ content: String(message) })],
      sessionId,
    },
    config,
  );

  console.log("[invokeGraph] invokeResult type:", typeof invokeResult);

  // Use invoke result directly — fall back to getState() if messages missing
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

  return {
    reply,
    tripContext: finalTripContext ?? {},
  };
}
