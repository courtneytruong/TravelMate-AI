import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "travelmate_chats";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function newId() {
  return typeof crypto !== "undefined"
    ? crypto.randomUUID()
    : String(Date.now());
}

/**
 * Creates a plain new chat object — no setState calls.
 * Safe to use inside lazy useState initializers.
 */
function createNewChatObject() {
  return {
    id: newId(),
    name: "New Chat",
    sessionId: newId(),
    messages: [],
    tripContext: {},
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generates a chat name from tripContext.
 * Priority: destination + date > destination only > flightNumber > "New Chat"
 */
function generateChatName(tripContext = {}) {
  const { destination, departDate, date, flightNumber } = tripContext;
  const travelDate = departDate || date;

  if (destination && travelDate) {
    try {
      const d = new Date(travelDate + "T00:00:00Z");
      const formatted = d.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      });
      return `${destination} — ${formatted}`;
    } catch {
      return `${destination} Trip`;
    }
  }

  if (destination) return `${destination} Trip`;
  if (flightNumber) return `Flight ${flightNumber}`;
  return "New Chat";
}

/**
 * Reads chats from localStorage. Creates and saves a default chat if
 * nothing exists. Safe to call inside lazy useState initializers.
 */
function loadChatsFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error("[useChatHistory] Failed to parse localStorage:", e);
  }

  const defaultChat = createNewChatObject();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([defaultChat]));
  } catch {
    // localStorage unavailable — proceed without persisting
  }
  return [defaultChat];
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

export default function useChatHistory() {
  // Read storage ONCE and use the result for both initialisers so both
  // state values start from the exact same data — fixes the bug where
  // activeChat was undefined on first render because two separate
  // loadChatsFromStorage() calls could return different objects.
  const [chats, setChats] = useState(() => {
    const initial = loadChatsFromStorage();
    return initial;
  });

  const [activeChat, setActiveChat] = useState(() => {
    const initial = loadChatsFromStorage();
    return initial[0] ?? null;
  });

  // ─── VALIDATE ACTIVE CHAT ─────────────────────────────────────────────────
  // Whenever chats change (e.g., a chat is deleted), ensure activeChat still
  // exists in the list. If not, switch to another chat or null.
  useEffect(() => {
    setActiveChat((current) => {
      // If activeChat still exists in the chats list, keep it
      if (current && chats.find((c) => c.id === current.id)) {
        return current;
      }
      // Otherwise, switch to the first chat or null if none exist
      return chats.length > 0 ? chats[0] : null;
    });
  }, [chats]);

  // ─── PERSIST ──────────────────────────────────────────────────────────────

  const persistChats = useCallback((updated) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("[useChatHistory] Failed to save:", e);
    }
  }, []);

  // ─── CREATE ───────────────────────────────────────────────────────────────

  const createChat = useCallback(() => {
    const newChat = createNewChatObject();
    setChats((prev) => {
      const updated = [newChat, ...prev];
      persistChats(updated);
      return updated;
    });
    setActiveChat(newChat);
    return newChat;
  }, [persistChats]);

  // ─── SELECT ───────────────────────────────────────────────────────────────

  const selectChat = useCallback(
    (id) => {
      const found = chats.find((c) => c.id === id);
      console.log(
        "[useChatHistory.selectChat] Selecting chat",
        id,
        "found:",
        found,
      );
      if (found) {
        console.log(
          "[useChatHistory.selectChat] Setting activeChat with tripContext:",
          found.tripContext,
        );
        setActiveChat(found);
      }
    },
    [chats],
  );

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  const updateActiveChat = useCallback(
    (messages, tripContext) => {
      console.log(
        "[useChatHistory.updateActiveChat] Updating chat",
        activeChat?.id,
        "with tripContext:",
        tripContext,
      ); // Guard: no-op if there is no active chat to update
      if (!activeChat?.id) return;

      setChats((prev) => {
        const updated = prev.map((chat) => {
          if (chat.id !== activeChat.id) return chat;
          return {
            ...chat,
            messages,
            tripContext,
            name: generateChatName(tripContext),
          };
        });
        persistChats(updated);
        return updated;
      });

      // Update the activeChat state directly (no async deferral needed)
      setActiveChat((current) => {
        if (current?.id === activeChat.id) {
          return {
            ...current,
            messages,
            tripContext,
            name: generateChatName(tripContext),
          };
        }
        return current;
      });
    },
    [activeChat, persistChats],
  );

  // ─── DELETE ───────────────────────────────────────────────────────────────

  const deleteChat = useCallback(
    (id) => {
      setChats((prev) => {
        const filtered = prev.filter((c) => c.id !== id);
        persistChats(filtered);
        return filtered;
      });
      // The useEffect above will automatically update activeChat if needed
    },
    [persistChats],
  );

  return {
    chats,
    activeChat,
    createChat,
    selectChat,
    updateActiveChat,
    deleteChat,
  };
}
