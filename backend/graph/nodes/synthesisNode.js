// Synthesis node for final response generation
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { getSharedLLM, callWithRetry } from "../llm.js";

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
