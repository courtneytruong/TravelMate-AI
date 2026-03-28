import React, { useState } from "react";

export default function ChatHistoryPanel({
  chats = [],
  activeChat = null,
  createChat = () => {},
  selectChat = () => {},
  deleteChat = () => {},
  initChat = () => {},
  resetChat = () => {},
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNewChat = () => {
    createChat();
    initChat();
    setMobileOpen(false);
  };

  const handleSelectChat = (id) => {
    selectChat(id);
    setMobileOpen(false);
  };

  const handleDeleteChat = (e, id) => {
    e.stopPropagation();
    // If deleting the active chat, immediately clear messages to prevent stale data from showing
    if (activeChat?.id === id) {
      resetChat([], {});
    }
    deleteChat(id);
  };

  const panelContent = (
    <div
      className="flex flex-col h-full"
      style={{
        backgroundColor: "#0f1119",
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-4 border-b flex items-center justify-between"
        style={{
          borderColor: "var(--border)",
        }}
      >
        <h2 style={{ color: "var(--text-h)" }} className="text-lg font-bold">
          Chats
        </h2>
        <button
          onClick={handleNewChat}
          className="px-3 py-1.5 text-xs rounded-xl accent-btn"
        >
          New Chat
        </button>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 ? (
          <div
            className="p-4 text-center"
            style={{ color: "var(--text)", opacity: 0.6 }}
          >
            <p className="text-sm">No chats yet</p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => handleSelectChat(chat.id)}
                className="group px-3 py-2.5 rounded-xl cursor-pointer transition-colors relative"
                style={{
                  backgroundColor:
                    activeChat?.id === chat.id
                      ? "rgba(170, 59, 255, 0.15)"
                      : "transparent",
                  color: "var(--text-h)",
                }}
              >
                {/* Chat Name */}
                <div className="truncate text-sm font-medium mb-1">
                  {chat.name}
                </div>

                {/* Created Date */}
                <div
                  className="truncate text-xs"
                  style={{ color: "var(--text)", opacity: 0.6 }}
                >
                  {new Date(chat.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>

                {/* Delete Button - show on hover */}
                <button
                  onClick={(e) => handleDeleteChat(e, chat.id)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs"
                  style={{
                    color: "var(--text)",
                    opacity: 0.5,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: Always visible */}
      <div
        className="hidden lg:block w-64 border-r"
        style={{
          borderColor: "var(--border)",
          backgroundColor: "#0f1119",
          height: "100vh",
          position: "sticky",
          top: 0,
        }}
      >
        {panelContent}
      </div>

      {/* Mobile: Hamburger button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-xl"
        style={{
          backgroundColor: "rgba(170, 59, 255, 0.2)",
          color: "var(--accent)",
        }}
      >
        {mobileOpen ? "✕" : "☰"}
      </button>

      {/* Mobile: Overlay panel */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40"
          onClick={() => setMobileOpen(false)}
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.5)",
          }}
        >
          <div
            className="fixed left-0 top-0 h-full w-64 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#0f1119",
            }}
          >
            {panelContent}
          </div>
        </div>
      )}
    </>
  );
}
