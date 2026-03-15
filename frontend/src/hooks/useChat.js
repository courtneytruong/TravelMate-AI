import { useCallback, useRef, useState } from "react";

export default function useChat(initialMessages = []) {
  const [messages, setMessages] = useState(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [tripContext, setTripContext] = useState({});

  const sessionId = useRef(
    typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now()),
  );

  const sendMessage = useCallback(async (text) => {
    const trimmed = String(text || "").trim();
    if (!trimmed) return;

    const userMsg = {
      id:
        typeof crypto !== "undefined"
          ? crypto.randomUUID()
          : String(Date.now()),
      role: "user",
      content: trimmed,
    };
    setMessages((m) => [...m, userMsg]);
    setIsLoading(true);

    try {
      const resp = await fetch("http://localhost:3001/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId.current,
          message: trimmed,
        }),
      });

      const data = await resp.json();

      const replyText = data?.reply ?? String(data ?? "");
      const aiMsg = {
        id:
          typeof crypto !== "undefined"
            ? crypto.randomUUID()
            : String(Date.now()),
        role: "assistant",
        content: replyText,
      };
      setMessages((m) => [...m, aiMsg]);

      const incoming = data?.tripContext ?? null;
      if (incoming && typeof incoming === "object") {
        setTripContext((prev) => {
          const merged = { ...prev };
          Object.keys(incoming).forEach((k) => {
            const v = incoming[k];
            if (
              v !== null &&
              v !== undefined &&
              !(Array.isArray(v) && v.length === 0) &&
              !(typeof v === "string" && v === "")
            ) {
              merged[k] = v;
            }
          });
          return merged;
        });
      }
    } catch (err) {
      console.error(err);
      const errMsg = {
        id:
          typeof crypto !== "undefined"
            ? crypto.randomUUID()
            : String(Date.now()),
        role: "error",
        content: "Something went wrong. Please try again.",
      };
      setMessages((m) => [...m, errMsg]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { messages, isLoading, tripContext, sendMessage };
}
