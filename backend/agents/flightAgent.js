import flightTool from "../tools/flightTool.js";
import { flightAgentPrompt } from "../prompts.js";
import { ChatOpenAI } from "@langchain/openai";
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage } from "@langchain/core/messages";

async function createFlightAgent() {
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
    SystemMessagePromptTemplate.fromTemplate(flightAgentPrompt),
    new MessagesPlaceholder("chat_history"),
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  const llmWithTools = llm.bindTools([flightTool]);

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
    _debug: { llmWithTools, prompt, tools: [flightTool] },
  };
}

export default createFlightAgent;
