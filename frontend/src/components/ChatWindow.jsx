import React, { useEffect, useRef, useState } from "react";
import TypingIndicator from "./TypingIndicator";
import WelcomeScreen from "./WelcomeScreen";
import useChat from "../hooks/useChat";

export default function ChatWindow({ initialMessages = [], onSend }) {
  const [input, setInput] = useState("");
  const { messages, isLoading, tripContext, sendMessage } =
    useChat(initialMessages);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  function handleSend() {
    const text = String(input || "").trim();
    if (!text) return;
    setInput("");
    return sendMessage(text);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading) handleSend();
    }
  }

  return (
    <div className="flex flex-col border rounded-lg h-[600px] max-w-2xl mx-auto">
      <div className="px-4 py-3 border-b">Chat</div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
        {messages.length === 0 ? (
          <WelcomeScreen onSuggestionClick={(s) => sendMessage(s)} />
        ) : (
          <>
            {messages.map((m) => {
              const common = "px-4 py-2 rounded-lg max-w-[75%]";
              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex justify-end">
                    <div className={`${common} bg-blue-500 text-white`}>
                      {typeof m.content === "object" ? (
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(m.content)}
                        </pre>
                      ) : (
                        m.content
                      )}
                    </div>
                  </div>
                );
              }
              if (m.role === "assistant") {
                return (
                  <div key={m.id} className="flex justify-start">
                    <div className={`${common} bg-gray-100 text-gray-900`}>
                      {typeof m.content === "object" ? (
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(m.content)}
                        </pre>
                      ) : (
                        m.content
                      )}
                    </div>
                  </div>
                );
              }
              return (
                <div key={m.id} className="flex justify-start">
                  <div className={`${common} bg-pink-100 text-pink-900`}>
                    {typeof m.content === "object" ? (
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(m.content)}
                      </pre>
                    ) : (
                      m.content
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex justify-start">
                <div className="px-4 py-2 rounded-lg bg-gray-100">
                  <TypingIndicator />
                </div>
              </div>
            )}

            <div ref={endRef} />
          </>
        )}
      </div>

      <div className="border-t px-3 py-2 flex items-center gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 resize-none h-10 p-2 rounded-md border focus:outline-none focus:ring"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="bg-blue-600 text-white px-4 py-2 rounded-md disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
