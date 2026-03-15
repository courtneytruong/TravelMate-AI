import React from "react";

export default function WelcomeScreen({ onSuggestionClick }) {
  const suggestions = [
    "What is the weather in Tokyo?",
    "Check flight AA123 status",
    "Find restaurants in Paris",
    "Things to do in Barcelona",
  ];

  return (
    <div className="w-full h-full flex items-center justify-center px-4">
      <div className="welcome-container max-w-2xl">
        <div className="welcome-emoji">✈️</div>
        <h1 className="welcome-title">TravelMate AI</h1>
        <p className="welcome-subtitle">
          Your intelligent travel companion — powered by multi-agent AI
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          {suggestions.map((s, idx) => (
            <button
              key={s}
              onClick={() => onSuggestionClick?.(s)}
              className="suggestion-button"
              style={{
                animation: `fadeInUp 0.6s ease-out ${idx * 0.1}s both`,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
