import { invokeGraph } from "./graph.js";

async function run() {
  try {
    const res = await invokeGraph(
      "test-session",
      "My flight to Paris is on 2026-04-01. What's the weather and any attractions?",
    );
    console.log("SMOKE RESULT:", res);
  } catch (err) {
    console.error("SMOKE ERROR:", err);
    process.exitCode = 1;
  }
}

run();
