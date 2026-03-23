// Router functions for conditional flow control
export function resolveRouter(state) {
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

export function researchRouter(state) {
  const hasOutput = !!state.tripContext?.researchOutput;
  console.log("[researchRouter] hasOutput:", hasOutput);
  if (hasOutput) {
    console.log("[researchRouter] -> translate_node");
    return "translate_node";
  }
  console.log("[researchRouter] -> __end__");
  return "__end__";
}

export function translateRouter(state) {
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

export function intakeRouter(state) {
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
