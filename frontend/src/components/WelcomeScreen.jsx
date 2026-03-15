import React from "react";

export default function WelcomeScreen({ onSuggestionClick }) {
  const suggestions = [
    "What is the weather in Tokyo?",
    "Check flight AA123 status",
    "Find restaurants in Paris",
    "Things to do in Barcelona",
  ];

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="text-center px-6 py-8">
        <div className="text-6xl">✈️</div>
        <h1 className="mt-4 text-3xl font-extrabold text-gray-900">
          TravelMate AI
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Your intelligent travel companion — powered by multi-agent AI
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onSuggestionClick?.(s)}
              className="px-4 py-2 rounded-full bg-gray-100 hover:bg-gray-200 text-sm text-gray-800"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
