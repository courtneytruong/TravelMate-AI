// Main graph compilation and invocation
import { StateGraph, MemorySaver, START, END } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { GraphState } from "./state.js";
import { intakeNode } from "./nodes/intakeNode.js";
import { resolveNode } from "./nodes/resolveNode.js";
import { researchNode } from "./nodes/researchNode.js";
import { translateNode } from "./nodes/translateNode.js";
import { synthesisNode } from "./nodes/synthesisNode.js";
import {
  resolveRouter,
  researchRouter,
  translateRouter,
  intakeRouter,
} from "./routers.js";

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
