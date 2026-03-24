import { useCallback, useRef, useState } from "react";

/**
 * useChat hook — manages chat state and backend communication.
 *
 * Accepts an optional config object:
 *   sessionId — if provided use this as the session ID instead of
 *     generating a new one. Allows switching between saved chats.
 *   onUpdate(messages, tripContext) — callback fired after every
 *     successful sendMessage and initChat. Used by useChatHistory
 *     to persist the updated chat to localStorage.
 *
 * @param {{ sessionId?: string, onUpdate?: Function }} config
 */
export default function useChat({
  sessionId: externalSessionId,
  onUpdate,
} = {}) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tripContext, setTripContext] = useState({});

  // Use external sessionId if provided, otherwise generate one
  const sessionId = useRef(
    externalSessionId ??
      (typeof crypto !== "undefined"
        ? crypto.randomUUID()
        : String(Date.now())),
  );

  // Keep sessionId ref in sync when user switches chats
  if (externalSessionId && sessionId.current !== externalSessionId) {
    sessionId.current = externalSessionId;
  }

  // Keep onUpdate in a ref so initChat and sendMessage always call the
  // latest version without needing it in their dependency arrays.
  // This prevents stale closure bugs when activeChat changes in App.jsx.
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // ─── MERGE TRIP CONTEXT ───────────────────────────────────────────────────

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

      // Map "date" to "departDate" so TripContextBar shows the date correctly
      if (incoming.date && !incoming.departDate) {
        merged.departDate = incoming.date;
      }

      return merged;
    });
  }, []);

  // ─── RESET CHAT ───────────────────────────────────────────────────────────

  /**
   * Loads a saved chat's messages and tripContext into local state.
   * Called by App.jsx when the user switches to a saved chat.
   * No backend call — instant load from localStorage data.
   */
  const resetChat = useCallback((savedMessages = [], savedTripContext = {}) => {
    setMessages(savedMessages);
    setTripContext(savedTripContext);
    setIsLoading(false);
  }, []);

  // ─── SEND MESSAGE ─────────────────────────────────────────────────────────

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
        timestamp: Date.now(),
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
          timestamp: Date.now(),
        };

        setMessages((m) => {
          const updated = [...m, aiMsg];
          // Use ref so we always call the latest onUpdate — never stale
          if (onUpdateRef.current) {
            onUpdateRef.current(updated, data?.tripContext ?? {});
          }
          return updated;
        });

        mergeTripContext(data?.tripContext ?? null);
      } catch {
        const errMsg = {
          id:
            typeof crypto !== "undefined"
              ? crypto.randomUUID()
              : String(Date.now()),
          role: "error",
          content: "Something went wrong. Please try again.",
          timestamp: Date.now(),
        };
        setMessages((m) => [...m, errMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [mergeTripContext],
  );

  // ─── INIT CHAT ────────────────────────────────────────────────────────────

  /**
   * Triggers the bot's welcome message by sending "hi" silently.
   * Only the bot reply is added — no user bubble shown.
   *
   * @param {boolean} force - If true, bypasses the messages.length guard.
   *   Pass force=true when initializing a brand new chat to prevent stale
   *   messages from a previous chat blocking the welcome message.
   */
  const initChat = useCallback(
    async (force = false) => {
      // Skip if messages already exist UNLESS force=true
      if (!force && messages.length > 0) return;
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

        const welcomeMsg = replyText
          ? {
              id:
                typeof crypto !== "undefined"
                  ? crypto.randomUUID()
                  : String(Date.now()),
              role: "assistant",
              content: replyText,
              timestamp: Date.now(),
            }
          : null;

        const initialMessages = welcomeMsg ? [welcomeMsg] : [];
        setMessages(initialMessages);

        const incomingContext = data?.tripContext ?? null;
        mergeTripContext(incomingContext);

        // Use ref so we always call the latest onUpdate — never stale
        if (onUpdateRef.current && initialMessages.length > 0) {
          onUpdateRef.current(initialMessages, incomingContext ?? {});
        }
      } catch {
        const fallbackMsg = {
          id:
            typeof crypto !== "undefined"
              ? crypto.randomUUID()
              : String(Date.now()),
          role: "assistant",
          content:
            "👋 Welcome to TravelMate AI! To get started please give me a destination city and travel date, or a flight number and date.",
          timestamp: Date.now(),
        };
        setMessages([fallbackMsg]);
        if (onUpdateRef.current) onUpdateRef.current([fallbackMsg], {});
      } finally {
        setIsLoading(false);
      }
    },
    [messages.length, mergeTripContext],
    // onUpdate intentionally omitted — accessed via onUpdateRef instead
  );

  return { messages, isLoading, tripContext, sendMessage, initChat, resetChat };
}
