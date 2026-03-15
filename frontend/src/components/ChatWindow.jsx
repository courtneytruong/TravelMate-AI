import React, { useEffect, useRef, useState } from "react";
import TypingIndicator from "./TypingIndicator";
import WelcomeScreen from "./WelcomeScreen";
import useChat from "../hooks/useChat";

export default function ChatWindow({
  initialMessages = [],
  tripContext = {},
  setTripContext = () => {},
}) {
  const [input, setInput] = useState("");
  const { messages, isLoading, sendMessage } = useChat(
    initialMessages,
    setTripContext,
  );
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
    <div className="flex flex-col card h-[650px]">
      <div className="chat-header">
        <div>Conversation</div>
        <div className="text-sm muted text-right" style={{ fontWeight: 500 }}>
          {tripContext?.destination && (
            <span
              className="bg-[var(--accent-bg)] px-3 py-1 rounded-full inline-block"
              style={{ color: "var(--accent)" }}
            >
              {tripContext.destination}
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[var(--bg)]">
        {messages.length === 0 ? (
          <WelcomeScreen onSuggestionClick={(s) => sendMessage(s)} />
        ) : (
          <>
            {messages.map((m) => {
              const common =
                "px-5 py-3 rounded-xl max-w-[85%] shadow-lg break-words";
              if (m.role === "user") {
                return (
                  <div key={m.id} className="flex justify-end">
                    <div className={`${common} message-user`}>
                      {typeof m.content === "object" ? (
                        <pre className="whitespace-pre-wrap text-sm font-mono">
                          {JSON.stringify(m.content)}
                        </pre>
                      ) : (
                        <p className="text-sm leading-relaxed">{m.content}</p>
                      )}
                    </div>
                  </div>
                );
              }
              if (m.role === "assistant") {
                return (
                  <div key={m.id} className="flex justify-start">
                    <div className={`${common} message-assistant`}>
                      {typeof m.content === "object" ? (
                        <pre className="whitespace-pre-wrap text-sm font-mono">
                          {JSON.stringify(m.content)}
                        </pre>
                      ) : (
                        <p className="text-sm leading-relaxed">{m.content}</p>
                      )}
                    </div>
                  </div>
                );
              }
              return (
                <div key={m.id} className="flex justify-start">
                  <div
                    className={`${common} bg-[var(--accent-bg)] text-[var(--text-h)] border border-[var(--accent-border)]`}
                  >
                    {typeof m.content === "object" ? (
                      <pre className="whitespace-pre-wrap text-sm font-mono">
                        {JSON.stringify(m.content)}
                      </pre>
                    ) : (
                      <p className="text-sm leading-relaxed">{m.content}</p>
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex justify-start">
                <div className="px-5 py-3 rounded-xl bg-[var(--code-bg)] border border-[var(--border)]">
                  <TypingIndicator />
                </div>
              </div>
            )}

            <div ref={endRef} />
          </>
        )}
      </div>

      <div
        className="border-t border-[var(--border)] px-5 py-4 flex items-end gap-3"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.2)" }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message or press Enter..."
          className="flex-1 resize-none h-12 p-3 rounded-xl focus:outline-none chat-input"
          style={{ maxHeight: "120px" }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="px-6 py-3 rounded-xl accent-btn whitespace-nowrap"
        >
          Send
        </button>
      </div>
    </div>
  );
}
