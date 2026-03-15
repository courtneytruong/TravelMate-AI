import React from "react";

export default function TypingIndicator() {
  return (
    <div className="inline-flex items-center space-x-2">
      <span
        className="w-2.5 h-2.5 bg-[var(--accent)] rounded-full"
        style={{
          animation: "bounce 1.4s infinite",
          animationDelay: "0s",
        }}
      />
      <span
        className="w-2.5 h-2.5 bg-[var(--accent)] rounded-full"
        style={{
          animation: "bounce 1.4s infinite",
          animationDelay: "0.2s",
        }}
      />
      <span
        className="w-2.5 h-2.5 bg-[var(--accent)] rounded-full"
        style={{
          animation: "bounce 1.4s infinite",
          animationDelay: "0.4s",
        }}
      />
    </div>
  );
}
