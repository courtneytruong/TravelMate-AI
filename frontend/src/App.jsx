import React, { useState } from "react";
import ChatWindow from "./components/ChatWindow";
import TripSidebar from "./components/TripSidebar";
import "./App.css";

function App() {
  const demoMessages = [
    {
      id: 1,
      role: "assistant",
      content: "Hi — I'm TravelMate. How can I help?",
    },
  ];

  const [tripContext, setTripContext] = useState({
    destination: null,
    departDate: null,
    returnDate: null,
    flightNumber: "",
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f1119] via-[#16171d] to-[#0a0d14] p-6">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 50%, rgba(192, 132, 252, 0.1) 0%, transparent 50%)",
          animation: "gradientShift 15s ease infinite",
        }}
      />
      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1
            style={{ color: "var(--text-h)" }}
            className="text-2xl font-bold tracking-tight mb-2"
          >
            TravelMate AI
          </h1>
          <p className="text-sm" style={{ color: "var(--text)", opacity: 0.7 }}>
            Your intelligent travel companion powered by multi-agent AI
          </p>
        </div>
        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2">
            <ChatWindow
              initialMessages={demoMessages}
              tripContext={tripContext}
              setTripContext={setTripContext}
            />
          </div>
          <div>
            <TripSidebar tripContext={tripContext} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
