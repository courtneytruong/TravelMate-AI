// Save as backend/test-graph.js and run with: node test-graph.js
import {
  Annotation,
  messagesStateReducer,
  StateGraph,
  MemorySaver,
  START,
  END,
} from "@langchain/langgraph";
import { AIMessage, HumanMessage } from "@langchain/core/messages";

const TestState = Annotation.Root({
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});

async function testNode(state) {
  console.log("[testNode] Running, messages count:", state.messages?.length);
  return {
    messages: [new AIMessage({ content: "Hello from test node!" })],
  };
}

const sg = new StateGraph({ channels: TestState });
sg.addNode("test_node", testNode);
sg.addEdge(START, "test_node");
sg.addEdge("test_node", END);

const compiled = sg.compile({ checkpointer: new MemorySaver() });
const config = { configurable: { thread_id: "test-session-1" } };

const result = await compiled.invoke(
  { messages: [new HumanMessage({ content: "hi" })] },
  config,
);

console.log("=== invoke result ===");
console.log(JSON.stringify(result, null, 2));

const savedState = await compiled.getState(config);
console.log("=== savedState.values ===");
console.log(JSON.stringify(savedState?.values, null, 2));
