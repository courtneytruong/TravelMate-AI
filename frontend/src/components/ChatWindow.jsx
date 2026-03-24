import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import TypingIndicator from "./TypingIndicator";
import ChatTimeStamp from "./ChatTimeStamp";

export default function ChatWindow({
  messages = [],
  isLoading = false,
  sendMessage = () => {},
  tripContext = {},
}) {
  const [input, setInput] = useState("");
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
        {messages.map((m) => {
          const common =
            "px-5 py-3 rounded-xl max-w-[85%] shadow-lg break-words";
          if (m.role === "user") {
            return (
              <div key={m.id}>
                <ChatTimeStamp timestamp={m.timestamp} />
                <div className="flex justify-end">
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
              </div>
            );
          }
          if (m.role === "assistant") {
            return (
              <div key={m.id}>
                <ChatTimeStamp timestamp={m.timestamp} />
                <div className="flex justify-start">
                  <div className={`${common} message-assistant`}>
                    {typeof m.content === "object" ? (
                      <pre className="whitespace-pre-wrap text-sm font-mono">
                        {JSON.stringify(m.content)}
                      </pre>
                    ) : (
                      <div className="text-sm leading-relaxed prose prose-invert max-w-none">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div key={m.id}>
              <ChatTimeStamp timestamp={m.timestamp} />
              <div className="flex justify-start">
                <div
                  className={`${common} bg-red-900 bg-opacity-30 text-red-200 border border-red-700`}
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
      </div>

      <div
        className="border-t border-[var(--border)] px-5 py-4"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.2)" }}
      >
        <div className="flex items-end gap-3 mb-3">
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

        {!messages.some((m) => m.role === "user") && (
          <div className="flex flex-wrap gap-2">
            {[
              "Weather in Tokyo",
              "Flight AA123 status",
              "Restaurants in Paris",
              "Things to do in Barcelona",
            ].map((chip) => (
              <button
                key={chip}
                onClick={() => setInput(chip)}
                className="px-3 py-1.5 text-xs rounded-full border border-[var(--border)] bg-[var(--code-bg)] hover:bg-[var(--accent-bg)] transition-colors"
                style={{ color: "var(--text)" }}
              >
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
