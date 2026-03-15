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

  const tripContext = {
    destination: "Tokyo, JP",
    departDate: "2026-05-10",
    returnDate: null,
    flightNumber: "",
    preferences: ["sightseeing", "vegetarian"],
  };

  async function handleSend(text) {
    await new Promise((r) => setTimeout(r, 1200));
    return `Assistant reply to: ${text}`;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <ChatWindow initialMessages={demoMessages} onSend={handleSend} />
        </div>
        <div>
          <TripSidebar tripContext={tripContext} />
        </div>
      </div>
    </div>
  );
}

export default App;
