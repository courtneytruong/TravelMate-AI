import { invokeGraph } from "./graph.js";

async function run() {
  try {
    const res = await invokeGraph(
      "test-session",
      "My flight AA4937 is today, what can you tell?",
    );
    console.log("SMOKE RESULT:", res);
  } catch (err) {
    console.error("SMOKE ERROR:", err);
    process.exitCode = 1;
  }
}

run();
