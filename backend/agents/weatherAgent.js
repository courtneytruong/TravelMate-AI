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
      const human = new HumanMessage({ content: String(userInput) });
      const messages = [...systemMessages, human];
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
