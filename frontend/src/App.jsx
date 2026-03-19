import React, { useCallback, useEffect, useRef } from "react";
import ChatWindow from "./components/ChatWindow";
import TripContextBar from "./components/TripContextBar";
import ChatHistoryPanel from "./components/ChatHistoryPanel";
import useChat from "./hooks/useChat";
import useChatHistory from "./hooks/useChatHistory";
import "./App.css";

function App() {
  const {
    chats,
    activeChat,
    createChat,
    selectChat,
    updateActiveChat,
    deleteChat,
  } = useChatHistory();

  // Keep a ref to activeChat and updateActiveChat so the onUpdate callback
  // always reads the latest values without going stale inside useCallback.
  const activeChatRef = useRef(activeChat);
  const updateActiveChatRef = useRef(updateActiveChat);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    updateActiveChatRef.current = updateActiveChat;
  }, [updateActiveChat]);

  // Stable onUpdate callback — reads from refs so it never goes stale
  const handleUpdate = useCallback((updatedMessages, updatedTripContext) => {
    if (activeChatRef.current?.id) {
      updateActiveChatRef.current(updatedMessages, updatedTripContext);
    }
  }, []); // no deps needed — reads from refs

  const { messages, isLoading, tripContext, sendMessage, initChat, resetChat } =
    useChat({
      sessionId: activeChat?.sessionId,
      onUpdate: handleUpdate,
    });

  // Single useEffect handles both initial load and chat switching.
  // Runs whenever activeChat.id changes — covers first mount and
  // subsequent chat switches from the history panel.
  const prevActiveChatId = useRef(null);

  useEffect(() => {
    console.log("[App] useEffect fired, activeChat:", activeChat?.id);
    console.log(
      "[App] activeChat.messages length:",
      activeChat?.messages?.length,
    );

    if (!activeChat) {
      console.log("[App] No activeChat — returning");
      return;
    }

    if (prevActiveChatId.current === activeChat.id) {
      console.log("[App] Same activeChat id — skipping");
      return;
    }
    prevActiveChatId.current = activeChat.id;

    if (activeChat.messages && activeChat.messages.length > 0) {
      console.log("[App] Loading saved messages:", activeChat.messages.length);
      resetChat(activeChat.messages, activeChat.tripContext ?? {});
    } else {
      console.log("[App] Calling initChat(true)");
      initChat(true);
    }
  }, [activeChat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f1119] via-[#16171d] to-[#0a0d14] p-6 flex">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 50%, rgba(192, 132, 252, 0.1) 0%, transparent 50%)",
          animation: "gradientShift 15s ease infinite",
        }}
      />
      <div className="relative z-10 flex w-full">
        {/* Chat History Panel — always visible on desktop, overlay on mobile */}
        <ChatHistoryPanel
          chats={chats}
          activeChat={activeChat}
          createChat={createChat}
          selectChat={selectChat}
          deleteChat={deleteChat}
          initChat={initChat}
        />

        {/* Main Content Area */}
        <div className="flex-1 max-w-6xl mx-auto w-full flex flex-col">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1
              style={{ color: "var(--text-h)" }}
              className="text-2xl font-bold tracking-tight mb-2"
            >
              TravelMate AI
            </h1>
            <p
              className="text-sm"
              style={{ color: "var(--text)", opacity: 0.7 }}
            >
              Your intelligent travel companion powered by multi-agent AI
            </p>
          </div>

          {/* Trip Context Bar */}
          <TripContextBar tripContext={tripContext} />

          {/* Chat Window */}
          <ChatWindow
            messages={messages}
            isLoading={isLoading}
            tripContext={tripContext}
            sendMessage={sendMessage}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
