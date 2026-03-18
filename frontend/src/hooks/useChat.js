import { useCallback, useRef, useState } from "react";

export default function useChat(
  initialMessages = [],
  setTripContext = () => {},
) {
  const [messages, setMessages] = useState(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [tripContext, setTripContextState] = useState({
    destination: null,
    departDate: null,
    returnDate: null,
    flightNumber: "",
  });

  const sessionId = useRef(
    typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now()),
  );

  const updateTripContext = useCallback(
    (incoming) => {
      if (incoming && typeof incoming === "object") {
        setTripContextState((prev) => {
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
        setTripContext(incoming);
      }
    },
    [setTripContext],
  );

  const sendMessage = useCallback(
    async (text) => {
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
        console.debug("useChat: received response", data);

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
        console.debug("useChat: incoming tripContext", incoming);
        updateTripContext(incoming);
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
    },
    [updateTripContext],
  );

  const initChat = useCallback(async () => {
    if (messages.length > 0) return; // only run once
    setIsLoading(true);
    try {
      const resp = await fetch("http://localhost:3001/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId.current,
          message: "hi",
        }),
      });
      const data = await resp.json();
      const replyText = data?.reply ?? "";
      if (replyText) {
        setMessages([
          {
            id:
              typeof crypto !== "undefined"
                ? crypto.randomUUID()
                : String(Date.now()),
            role: "assistant",
            content: replyText,
          },
        ]);
      }
      const incoming = data?.tripContext ?? null;
      updateTripContext(incoming);
    } catch (err) {
      console.error(err);
      setMessages([
        {
          id:
            typeof crypto !== "undefined"
              ? crypto.randomUUID()
              : String(Date.now()),
          role: "assistant",
          content:
            "👋 Welcome to TravelMate AI! To get started please give me a destination city and travel date, or a flight number and date.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [messages.length, updateTripContext]);

  return { messages, isLoading, tripContext, sendMessage, initChat };
}
