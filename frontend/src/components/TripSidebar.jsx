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
    <aside className="w-full max-w-sm sticky top-8">
      <div className="trip-card">
        <div className="trip-header">Trip Details</div>
        <div className="p-6 space-y-0">
          <div className="trip-item">
            <div className="trip-label mb-2">Destination</div>
            <div className="trip-value">{renderVal(destination)}</div>
          </div>

          <div className="trip-item">
            <div className="trip-label mb-2">Departure</div>
            <div className="trip-value">{renderVal(departDate)}</div>
          </div>

          <div className="trip-item">
            <div className="trip-label mb-2">Return</div>
            <div className="trip-value">{renderVal(returnDate)}</div>
          </div>

          <div className="trip-item">
            <div className="trip-label mb-2">Flight</div>
            <div className="trip-value">{renderVal(flightNumber)}</div>
          </div>

          <div className="trip-item">
            <div className="trip-label mb-2">Preferences</div>
            <div className="trip-value">{renderVal(preferences)}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
