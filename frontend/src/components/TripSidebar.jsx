import React from "react";

export default function TripSidebar({ tripContext = {} }) {
  const { destination, departDate, returnDate, flightNumber, preferences } =
    tripContext;

  const renderVal = (val) => {
    const emptyArray = Array.isArray(val) && val.length === 0;
    if (val === null || val === undefined || val === "" || emptyArray) {
      return <span className="text-gray-500 italic">Not set yet</span>;
    }
    if (Array.isArray(val)) return val.join(", ");
    return String(val);
  };

  return (
    <aside className="w-full max-w-sm sticky top-6">
      <div className="border rounded-lg shadow-sm bg-white overflow-hidden">
        <div className="bg-teal-500 text-white px-4 py-3 font-medium">
          Your Trip
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>📍</span>
              <span className="text-sm text-gray-700">Destination</span>
            </div>
            <div className="text-sm">{renderVal(destination)}</div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>🛫</span>
              <span className="text-sm text-gray-700">Depart</span>
            </div>
            <div className="text-sm">{renderVal(departDate)}</div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>🛬</span>
              <span className="text-sm text-gray-700">Return</span>
            </div>
            <div className="text-sm">{renderVal(returnDate)}</div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>✈️</span>
              <span className="text-sm text-gray-700">Flight</span>
            </div>
            <div className="text-sm">{renderVal(flightNumber)}</div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>❤️</span>
              <span className="text-sm text-gray-700">Preferences</span>
            </div>
            <div className="text-sm">{renderVal(preferences)}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
