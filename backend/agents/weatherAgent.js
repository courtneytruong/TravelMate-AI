import weatherTool from "../tools/weatherTool.js";
import { weatherAgentPrompt } from "../prompts.js";
import { ChatOpenAI } from "@langchain/openai";
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage } from "@langchain/core/messages";

async function createWeatherAgent() {
  const apiKey = process.env.GITHUB_TOKEN || process.env.OPENAI_API_KEY;
  if (!apiKey)
    console.warn(
      "No GITHUB_TOKEN or OPENAI_API_KEY found; LLM calls may fail.",
    );
  const baseURL =
    process.env.GITHUB_MODELS_BASE_URL || "https://models.github.ai/inference";
  const llm = new ChatOpenAI({
    model: "gpt-4o-mini",
    apiKey,
    configuration: { baseURL },
  });

  const prompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(weatherAgentPrompt),
    new MessagesPlaceholder("chat_history"),
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  // Bind the tool to the LLM so it can make tool calls
  const llmWithTools = llm.bindTools([weatherTool]);

  return {
    run: async (userInput) => {
      const systemMessages = await prompt.formatMessages({
        chat_history: [],
        agent_scratchpad: [],
      });

      // Build a human message that includes both the user's input and any tripContext
      let humanContent = "";
      if (userInput && typeof userInput === "object") {
        const inp = userInput.input ?? userInput;
        humanContent =
          typeof inp === "string" ? inp : (inp?.content ?? String(inp));
        if (userInput.tripContext) {
          const tc = userInput.tripContext;
          const pieces = [];
          if (tc.destination) pieces.push(`Destination: ${tc.destination}`);
          if (tc.departDate) pieces.push(`DepartDate: ${tc.departDate}`);
          if (tc.returnDate) pieces.push(`ReturnDate: ${tc.returnDate}`);
          if (tc.flightNumber) pieces.push(`FlightNumber: ${tc.flightNumber}`);
          if (Array.isArray(tc.preferences) && tc.preferences.length)
            pieces.push(`Preferences: ${tc.preferences.join(", ")}`);
          if (pieces.length)
            humanContent += "\n\nTripContext:\n" + pieces.join("\n");

          // If we have enough context (destination at least), instruct agent to proceed
          // with defaults instead of asking clarifying questions for minor missing info.
          if (tc.destination) {
            const prefs = tc.preferences || [];
            const hasUnit = prefs.some((p) =>
              /celsius|fahrenheit|°c|°f/i.test(p),
            );
            if (!hasUnit) {
              humanContent +=
                "\n\nNote: If temperature units are not provided, include temperatures in both Celsius and Fahrenheit and do not ask for unit preference.";
            }
          }
        }
      } else {
        humanContent = String(userInput);
      }

      const human = new HumanMessage({ content: humanContent });
      const messages = [...systemMessages, human];
      // If we have explicit tripContext with destination and a depart date,
      // call the weather tool directly to produce a date-specific forecast.
      if (
        userInput &&
        userInput.tripContext &&
        userInput.tripContext.destination &&
        userInput.tripContext.departDate
      ) {
        try {
          const city = userInput.tripContext.destination;
          const date = userInput.tripContext.departDate;
          const toolResp = await weatherTool.func({ city, date });
          const advice = `Packing advice: bring a light waterproof jacket and an umbrella; comfortable walking shoes.`;
          return `${toolResp}\n\n${advice}`;
        } catch (err) {
          // Fall back to LLM if tool call fails
          const aiMsgFallback = await llmWithTools.invoke(messages);
          return aiMsgFallback?.content ?? String(aiMsgFallback);
        }
      }

      const aiMsg = await llmWithTools.invoke(messages);
      return aiMsg?.content ?? String(aiMsg);
    },
    // Expose internals for testing and debugging
    _debug: {
      llmWithTools,
      prompt,
      tools: [weatherTool],
    },
  };
}

export default createWeatherAgent;
