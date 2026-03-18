import { useCallback, useRef, useState } from "react";

export default function useChat() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tripContext, setTripContext] = useState({});

  const sessionId = useRef(
    typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now()),
  );

  /**
   * Merges incoming tripContext from the backend into local state.
   * Only overwrites fields that have non-null, non-empty values.
   * Maps backend field "date" to "departDate" so the TripSidebar
   * displays the departure date correctly.
   *
   * @param {object} incoming - tripContext object from backend response
   */
  const mergeTripContext = useCallback((incoming) => {
    if (!incoming || typeof incoming !== "object") return;

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

      // Bug fix: backend stores travel date as "date" but TripSidebar
      // reads "departDate". Map the field so the sidebar updates correctly.
      if (incoming.date && !incoming.departDate) {
        merged.departDate = incoming.date;
      }

      return merged;
    });
  }, []);

  /**
   * Sends a message to the backend and appends both the user message
   * and the assistant reply to the messages array.
   *
   * @param {string} text - The user's message text
   */
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

        mergeTripContext(data?.tripContext ?? null);
      } catch (err) {
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
    [mergeTripContext],
  );

  /**
   * Initialises the chat by silently sending "hi" to trigger the bot's
   * welcome message. Does NOT add a user "hi" bubble — only the bot's
   * reply is shown. Safe to call multiple times (no-ops if messages exist).
   */
  const initChat = useCallback(async () => {
    if (messages.length > 0) return;
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

      mergeTripContext(data?.tripContext ?? null);
    } catch (err) {
      // Show a hardcoded welcome if the backend is unreachable
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
  }, [messages.length, mergeTripContext]);

  return { messages, isLoading, tripContext, sendMessage, initChat };
}
