// backend/graph.js
// Graph utilities and LangGraph state definition

import {
  Annotation,
  messagesStateReducer,
  StateGraph,
  MemorySaver,
  END,
} from "@langchain/langgraph";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import * as chrono from "chrono-node";
import createWeatherAgent from "./agents/weatherAgent.js";
import createFlightAgent from "./agents/flightAgent.js";
import createAttractionsAgent from "./agents/attractionsAgent.js";
import createRestaurantAgent from "./agents/restaurantAgent.js";
import { supervisorPrompt, systemPrompt } from "./prompts.js";

export function buildGraph() {
  return { nodes: [], edges: [] };
}

// Placeholder graph invocation used by server/chat endpoint
let _compiledGraphPromise = null;

async function compileGraph() {
  if (_compiledGraphPromise) return _compiledGraphPromise;

  _compiledGraphPromise = (async () => {
    const sg = new StateGraph({ channels: GraphState });

    // add nodes
    sg.addNode("supervisor", supervisorNode, {
      ends: [
        "weather_agent",
        "flight_agent",
        "attractions_agent",
        "restaurant_agent",
        END,
      ],
    });
    sg.addNode("weather_agent", weatherAgentNode, { ends: ["synthesis"] });
    sg.addNode("flight_agent", flightAgentNode, { ends: ["synthesis"] });
    sg.addNode("attractions_agent", attractionsAgentNode, {
      ends: ["synthesis"],
    });
    sg.addNode("restaurant_agent", restaurantAgentNode, {
      ends: ["synthesis"],
    });
    sg.addNode("synthesis", synthesisNode, { ends: [END] });

    // entry will be provided at compile time (some langgraph versions don't expose setEntry)

    // conditional edges from supervisor based on routingFunction
    sg.addEdge(
      "supervisor",
      "weather_agent",
      (state) => routingFunction(state) === "weather_agent",
    );
    sg.addEdge(
      "supervisor",
      "flight_agent",
      (state) => routingFunction(state) === "flight_agent",
    );
    sg.addEdge(
      "supervisor",
      "attractions_agent",
      (state) => routingFunction(state) === "attractions_agent",
    );
    sg.addEdge(
      "supervisor",
      "restaurant_agent",
      (state) => routingFunction(state) === "restaurant_agent",
    );
    sg.addEdge("supervisor", END, (state) => routingFunction(state) === "END");

    // specialist agents -> synthesis
    sg.addEdge("weather_agent", "synthesis");
    sg.addEdge("flight_agent", "synthesis");
    sg.addEdge("attractions_agent", "synthesis");
    sg.addEdge("restaurant_agent", "synthesis");

    // synthesis -> END
    sg.addEdge("synthesis", END);

    const compiled = await sg.compile({
      checkpointer: new MemorySaver(),
      entry: "supervisor",
      validate: false,
    });
    return compiled;
  })();

  return _compiledGraphPromise;
}

// Helper: map agent name to node function
function getAgentNodeFn(agentName) {
  const agentMap = {
    weather_agent: weatherAgentNode,
    flight_agent: flightAgentNode,
    attractions_agent: attractionsAgentNode,
    restaurant_agent: restaurantAgentNode,
  };
  return agentMap[agentName];
}

// Invoke the compiled graph: constructs initial state and runs the graph
export async function invokeGraph(sessionId, message) {
  // Try compiled graph first; fall back to manual orchestration on failure
  try {
    const compiled = await compileGraph();

    const initialState = {
      messages: [new HumanMessage({ content: String(message) })],
    };

    // run the graph
    const result = await compiled.invoke(initialState, {
      configurable: { thread_id: sessionId },
    });

    // Try to extract final state
    const finalState = result?.state ?? result?.finalState ?? result;
    const msgs = finalState?.messages ?? [];
    const last = msgs && msgs.length ? msgs[msgs.length - 1] : null;
    const finalAIMessage = last?.content ?? String(last ?? "");

    return {
      reply: finalAIMessage,
      tripContext: finalState?.tripContext ?? {},
    };
  } catch (compileErr) {
    console.log(
      "[invokeGraph] LangGraph compilation failed, using fallback orchestration",
    );
    // Fallback: orchestrate nodes manually
    const state = {
      messages: [new HumanMessage({ content: String(message) })],
      nextAgents: [],
      agentResults: {},
      tripContext: {},
      sessionId,
    };

    // Supervisor
    const supUpdate = await supervisorNode(state);
    Object.assign(state, { ...state, ...supUpdate });

    // Run each agent listed in nextAgents
    const agents = state.nextAgents || [];
    for (const agentName of agents) {
      const agentNodeFn = getAgentNodeFn(agentName);
      if (agentNodeFn) {
        const upd = await agentNodeFn(state);
        Object.assign(state, {
          agentResults: {
            ...(state.agentResults || {}),
            ...(upd.agentResults || {}),
          },
        });
      } else {
        console.warn(`[invokeGraph] Unknown agent: ${agentName}`);
      }
    }

    // Synthesis
    const synth = await synthesisNode(state);
    // merge messages if returned
    if (synth?.messages) state.messages = synth.messages;

    const lastMsg =
      state.messages && state.messages.length
        ? state.messages[state.messages.length - 1]
        : null;
    return {
      reply: lastMsg?.content ?? String(lastMsg ?? ""),
      tripContext: state.tripContext || {},
    };
  }
}

// Define trip context schema
const TripContext = z
  .object({
    destination: z.string().optional().default(""),
    departDate: z.string().optional().default(""),
    returnDate: z.string().optional().default(""),
    flightNumber: z.string().optional().default(""),
    preferences: z.array(z.string()).optional().default([]),
  })
  .default({});

// Define the overall Graph state schema
const GraphStateSchema = z.object({
  // messages channel handled by langgraph's messages reducer
  messages: z.array(z.any()).default([]),

  // nextAgents supports routing to multiple agents at once
  nextAgents: z.array(z.string()).default([]),

  // collects responses keyed by agent name
  agentResults: z.record(z.any()).default({}),

  // trip-specific context
  tripContext: TripContext,

  // session identifier
  sessionId: z.string().default(""),
});

// Export the annotation root as `GraphState`
export const GraphState = Annotation.Root({
  name: "GraphState",
  schema: GraphStateSchema,
  reducers: {
    messages: messagesStateReducer,
  },
});

// Async extract trip context using a provided LLM with structured output
export async function extractTripContext(latestMessage, existing = {}, llm) {
  const text =
    typeof latestMessage === "string"
      ? latestMessage
      : latestMessage?.content || "";

  const TripSchema = z.object({
    destination: z.string().nullable(),
    departDate: z.string().nullable(),
    returnDate: z.string().nullable(),
    flightNumber: z.string().nullable(),
    preferences: z.array(z.string()).nullable(),
  });

  // Helper: parse natural-language date strings into ISO YYYY-MM-DD
  function parseToISO(str) {
    if (!str) return null;
    const s = String(str).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    try {
      const d = chrono.parseDate(s);
      if (!d) return null;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    } catch (e) {
      return null;
    }
  }

  if (!llm || typeof llm.withStructuredOutput !== "function") {
    // Fallback: attempt to call the LLM directly and parse JSON from its reply
    try {
      const prompt = `Extract travel details from the following message. For each field, return the exact value if explicitly mentioned, or null if it is not explicitly mentioned. Respond only with the structured JSON matching the schema. Message:\n\n${text}`;

      const raw = llm.call ? await llm.call(prompt) : await llm.invoke(prompt);
      const content =
        raw?.content ?? (typeof raw === "string" ? raw : JSON.stringify(raw));

      let parsed = null;
      try {
        parsed = JSON.parse(
          typeof content === "string" ? content.trim() : content,
        );
      } catch (err) {
        // Try to extract JSON-like substring
        const m = String(content).match(/\{[\s\S]*\}/);
        if (m) {
          try {
            parsed = JSON.parse(m[0]);
          } catch (err2) {
            parsed = null;
          }
        }
      }

      if (!parsed) return existing;

      const updated = { ...existing };
      if (parsed?.destination != null) updated.destination = parsed.destination;
      if (parsed?.departDate != null) {
        const pd = parseToISO(parsed.departDate) || parsed.departDate || null;
        if (pd) updated.departDate = pd;
      }
      if (parsed?.returnDate != null) {
        const rd = parseToISO(parsed.returnDate) || parsed.returnDate || null;
        if (rd) updated.returnDate = rd;
      }
      if (parsed?.flightNumber != null)
        updated.flightNumber = parsed.flightNumber;
      if (parsed?.preferences != null) updated.preferences = parsed.preferences;

      // If departDate still wasn't extracted, try parsing the free text message
      if (!updated.departDate) {
        const pd = parseToISO(text);
        if (pd) updated.departDate = pd;
      }

      return updated;
    } catch (err) {
      return existing;
    }
  }

  const extractor = llm.withStructuredOutput(TripSchema);

  const prompt = `Extract travel details from the following message. For each field, return the exact value if explicitly mentioned, or null if it is not explicitly mentioned. Respond only with the structured JSON matching the schema. Message:\n\n${text}`;

  let parsed;
  try {
    const out = await extractor.call(prompt);
    parsed =
      out?.outputParsed ?? (typeof out === "string" ? JSON.parse(out) : out);
  } catch (err) {
    // Structured extractor failed — fallback to a raw LLM call with JSON parsing
    try {
      const raw = llm.call ? await llm.call(prompt) : await llm.invoke(prompt);
      const content =
        raw?.content ?? (typeof raw === "string" ? raw : JSON.stringify(raw));

      try {
        parsed = JSON.parse(
          typeof content === "string" ? content.trim() : content,
        );
      } catch (err2) {
        const m = String(content).match(/\{[\s\S]*\}/);
        if (m) {
          try {
            parsed = JSON.parse(m[0]);
          } catch (err3) {
            return existing;
          }
        } else {
          return existing;
        }
      }
    } catch (err4) {
      return existing;
    }
  }

  const updated = { ...existing };
  if (parsed?.destination != null) updated.destination = parsed.destination;
  if (parsed?.departDate != null) {
    const pd = parseToISO(parsed.departDate) || parsed.departDate || null;
    if (pd) updated.departDate = pd;
  }
  if (parsed?.returnDate != null) {
    const rd = parseToISO(parsed.returnDate) || parsed.returnDate || null;
    if (rd) updated.returnDate = rd;
  }
  if (parsed?.flightNumber != null) updated.flightNumber = parsed.flightNumber;
  if (parsed?.preferences != null) updated.preferences = parsed.preferences;

  // Fallback: if flightNumber still wasn't extracted, use regex to find patterns like
  // "DL8739", "AA100", "flight DL8739", etc. This ensures we catch flight numbers
  // that the LLM might have missed.
  if (!updated.flightNumber) {
    const flightMatch = text.match(/(?:flight\s+)?([A-Z]{1,3}\d{1,5})/i);
    if (flightMatch) {
      updated.flightNumber = flightMatch[1].toUpperCase();
      console.log(
        `[extractTripContext] Regex fallback extracted flightNumber: ${updated.flightNumber}`,
      );
    }
  }

  // If departDate still wasn't extracted, attempt natural-language parsing on the message
  if (!updated.departDate) {
    const pd = parseToISO(text);
    if (pd) updated.departDate = pd;
  }

  return updated;
}

// Supervisor node: uses a GitHub LLM (gpt-4o-mini) with structured output to decide routing
export async function supervisorNode(state) {
  // Zod schema for the structured output
  const RoutingSchema = z.object({
    agents: z.array(
      z.enum([
        "weather_agent",
        "flight_agent",
        "attractions_agent",
        "restaurant_agent",
        "FINISH",
      ]),
    ),
  });

  // Build input text from the messages array and prepend the supervisor prompt
  const messagesText = Array.isArray(state.messages)
    ? state.messages
        .map((m) =>
          typeof m === "string" ? m : m.content || JSON.stringify(m),
        )
        .join("\n")
    : String(state.messages || "");

  // Prepare messages so the routing LLM receives the Supervisor instructions
  // as a SystemMessage (ensures system-level instructions are respected).
  const routeMsgs = [
    new SystemMessage({ content: supervisorPrompt }),
    new HumanMessage({ content: messagesText }),
  ];

  // Construct a ChatOpenAI base model for structured routing
  let baseModel;
  try {
    const apiKey = process.env.GITHUB_TOKEN || process.env.OPENAI_API_KEY;
    const baseURL =
      process.env.GITHUB_MODELS_BASE_URL ||
      "https://models.github.ai/inference";
    baseModel = new ChatOpenAI({
      model: "gpt-4o-mini",
      apiKey,
      configuration: { baseURL },
    });
  } catch (err) {
    throw new Error(`Failed to construct ChatOpenAI LLM: ${err.message}`);
  }

  // Use a structured-output wrapper for routing decisions and call it with
  // the supervisor instructions plus the conversation context so the model
  // follows the Supervisor prompt when producing the routing JSON.
  const routeWrapper = baseModel.withStructuredOutput(RoutingSchema);

  // Call the route wrapper with structured messages so the model follows the
  // Supervisor prompt when producing the routing JSON.
  let decision;
  try {
    const raw = routeWrapper.call
      ? await routeWrapper.call(routeMsgs)
      : await routeWrapper.invoke(routeMsgs);
    decision =
      raw?.outputParsed ??
      (typeof raw === "string" ? JSON.parse(raw) : (raw?.content ?? raw));
  } catch (err) {
    throw new Error(`Supervisor LLM call/parse failed: ${err.message}`);
  }

  // Update tripContext from latest message
  const latest =
    Array.isArray(state.messages) && state.messages.length
      ? state.messages[state.messages.length - 1]
      : "";
  const updatedTrip = await extractTripContext(
    latest,
    state.tripContext || {},
    baseModel,
  );

  console.log("[Supervisor] Extracted trip context:", {
    destination: updatedTrip?.destination,
    departDate: updatedTrip?.departDate,
    returnDate: updatedTrip?.returnDate,
    flightNumber: updatedTrip?.flightNumber,
    preferences: updatedTrip?.preferences,
  });

  // Derive final agent list. Log both LLM decision and final decision.
  let agents = decision?.agents ?? [];
  console.log("[Supervisor] LLM router decision:", agents);

  if (updatedTrip?.flightNumber) {
    if (!Array.isArray(agents) || agents.length === 0) {
      agents = ["flight_agent"];
      console.log(
        "[Supervisor] No agents from LLM, forcing flight_agent (flightNumber detected)",
      );
    } else if (!agents.includes("flight_agent")) {
      agents = ["flight_agent", ...agents.filter((a) => a !== "flight_agent")];
      console.log(
        "[Supervisor] Prepending flight_agent to ensure flights are queried",
      );
    }
  }

  console.log("[Supervisor] Final routing to:", agents);

  // Return partial state update
  return {
    nextAgents: agents ?? [],
    tripContext: updatedTrip,
  };
}

// routingFunction: returns first agent or END when finished or empty
export function routingFunction(state) {
  const arr = Array.isArray(state.nextAgents) ? state.nextAgents : [];
  const first = arr.length ? arr[0] : null;
  if (!first || first === "FINISH") return "END";
  return first;
}

// Factory to create agent nodes (eliminates duplication)
function createAgentNode(agentFactory, resultKey, agentName) {
  return async (state) => {
    try {
      console.log(`[Node] Running: ${agentName}`);
      const agent = await agentFactory();
      const latest =
        Array.isArray(state.messages) && state.messages.length
          ? state.messages[state.messages.length - 1]
          : "";

      // Log input and context for debugging
      const inputText =
        typeof latest === "string" ? latest : latest?.content || "";
      if (agentName === "flight_agent") {
        console.log(`[Node] flight_agent input: ${inputText.slice(0, 100)}`);
        console.log(`[Node] flight_agent tripContext:`, state.tripContext);
      }

      const out = await agent.run({
        input: latest,
        chat_history: state.messages,
        tripContext: state.tripContext,
      });
      const text = out?.output ?? out;
      const resultText = String(text);

      if (agentName === "flight_agent") {
        console.log(`[Node] flight_agent output length: ${resultText.length}`);
        if (resultText.length > 0) {
          console.log(
            `[Node] flight_agent output: ${resultText.slice(0, 200)}`,
          );
        }
      }

      console.log(`[Node] ${agentName} result length: ${resultText.length}`);
      return {
        agentResults: {
          ...(state.agentResults || {}),
          [resultKey]: resultText,
        },
      };
    } catch (err) {
      console.error(`[Node] ${agentName} error:`, err?.message ?? err);
      return {
        agentResults: {
          ...(state.agentResults || {}),
          [resultKey]: String(err?.message ?? err),
        },
      };
    }
  };
}

// Agent node creators using the factory
export const weatherAgentNode = createAgentNode(
  createWeatherAgent,
  "weather",
  "weather_agent",
);
export const flightAgentNode = createAgentNode(
  createFlightAgent,
  "flight",
  "flight_agent",
);
export const attractionsAgentNode = createAgentNode(
  createAttractionsAgent,
  "attractions",
  "attractions_agent",
);
export const restaurantAgentNode = createAgentNode(
  createRestaurantAgent,
  "restaurants",
  "restaurant_agent",
);

// synthesisNode: merge agentResults into a single assistant reply and append as AIMessage
export async function synthesisNode(state) {
  try {
    const results = state.agentResults || {};
    const order = ["flight", "weather", "attractions", "restaurants"];
    const entries = [];
    for (const k of order) {
      const v = results[k];
      if (!v) continue;
      const sval = String(v);
      if (!sval.trim()) continue;
      const lower = sval.trim().toLowerCase();
      if (lower.startsWith("error") || lower.includes("trace")) continue;
      entries.push({ key: k, text: sval });
    }

    // Use centralized systemPrompt from backend/prompts.js for consistent behavior
    // Instruct the synthesizer to proceed with available info and avoid asking
    // clarifying questions; note assumptions when needed. Include tripContext
    // so the assistant can reference extracted details in the final reply.
    const tripCtx = state.tripContext || {};

    const synthInstructions = `If any minor details (e.g., temperature units) are missing, proceed using sensible defaults and include a short note about assumptions. Do not ask clarifying questions; instead, acknowledge missing info and continue.`;

    let humanContent;
    if (entries.length === 0) {
      humanContent = "No agent results available to synthesize.";
    } else {
      const parts = entries.map(
        (e) => `---\n${e.key.toUpperCase()}:\n${e.text}`,
      );
      humanContent = `Agent outputs:\n\n${parts.join("\n\n")}`;
    }

    // Append tripContext and synthesis instructions so the LLM composes a final
    // answer that uses the extracted context instead of asking for it again.
    const tripParts = [];
    if (tripCtx.destination)
      tripParts.push(`Destination: ${tripCtx.destination}`);
    if (tripCtx.departDate) tripParts.push(`DepartDate: ${tripCtx.departDate}`);
    if (tripCtx.returnDate) tripParts.push(`ReturnDate: ${tripCtx.returnDate}`);
    if (tripCtx.flightNumber)
      tripParts.push(`FlightNumber: ${tripCtx.flightNumber}`);
    if (Array.isArray(tripCtx.preferences) && tripCtx.preferences.length)
      tripParts.push(`Preferences: ${tripCtx.preferences.join(", ")}`);

    if (tripParts.length)
      humanContent += "\n\nTripContext:\n" + tripParts.join("\n");
    humanContent += "\n\n" + synthInstructions;

    const apiKey = process.env.GITHUB_TOKEN || process.env.OPENAI_API_KEY;
    const baseURL =
      process.env.GITHUB_MODELS_BASE_URL ||
      "https://models.github.ai/inference";
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
      apiKey,
      configuration: { baseURL },
    });

    const messages = [
      new SystemMessage({ content: systemPrompt }),
      new HumanMessage({ content: humanContent }),
    ];
    const aiMsg = await llm.invoke(messages);
    const aiText = aiMsg?.content ?? String(aiMsg);

    const newAIMessage = new AIMessage({ content: aiText });

    return { messages: [...(state.messages || []), newAIMessage] };
  } catch (err) {
    return {
      agentResults: {
        ...(state.agentResults || {}),
        synthesis: String(err?.message ?? err),
      },
    };
  }
}
