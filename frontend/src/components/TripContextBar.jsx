import React from "react";

export default function TripContextBar({ tripContext = {} }) {
  const { destination, departDate, flightNumber } = tripContext;

  // Format departDate if it exists
  // Parse YYYY-MM-DD format manually to avoid timezone issues
  // (new Date("YYYY-MM-DD") interprets as UTC, causing off-by-one in other timezones)
  const formattedDate = departDate
    ? (() => {
        const [year, month, day] = departDate.split("-");
        return new Date(year, month - 1, day).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "2-digit",
          year: "numeric",
        });
      })()
    : null;

  return (
    <div
      className="w-full py-2 px-4 border-b rounded-tl-xl rounded-tr-xl mb-1"
      style={{
        backgroundColor: "rgba(170, 59, 255, 0.15)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex items-center justify-center gap-6">
        {/* Flight Section */}
        <div className="flex items-center gap-2">
          <span
            style={{ color: "var(--text-h)" }}
            className="text-sm font-medium"
          >
            Flight:
          </span>
          <span
            style={{ color: "var(--text)", opacity: 0.7 }}
            className="text-sm"
          >
            {flightNumber || "—"}
          </span>
        </div>

        {/* Divider */}
        <div
          className="h-4 w-px"
          style={{
            backgroundColor: "var(--text-h)",
          }}
        />

        {/* Destination Section */}
        <div className="flex items-center gap-2">
          <span
            style={{ color: "var(--text-h)" }}
            className="text-sm font-medium"
          >
            Destination:
          </span>
          <span
            style={{ color: "var(--text)", opacity: 0.7 }}
            className="text-sm"
          >
            {destination || "—"}
          </span>
        </div>

        {/* Divider */}
        <div
          className="h-4 w-px"
          style={{
            backgroundColor: "var(--text-h)",
          }}
        />

        {/* Date Section */}
        <div className="flex items-center gap-2">
          <span
            style={{ color: "var(--text-h)" }}
            className="text-sm font-medium"
          >
            Travel Date:
          </span>
          <span
            style={{ color: "var(--text)", opacity: 0.7 }}
            className="text-sm"
          >
            {formattedDate || "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
