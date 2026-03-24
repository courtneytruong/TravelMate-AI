import React from "react";

export default function ChatTimeStamp({ timestamp }) {
  if (!timestamp) return null;

  const formatTime = (time) => {
    const date = new Date(time);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );

    const isToday = today.getTime() === messageDate.getTime();
    const isYesterday =
      today.getTime() - messageDate.getTime() === 24 * 60 * 60 * 1000;

    const timeString = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    if (isToday) {
      return `Today at ${timeString}`;
    } else if (isYesterday) {
      return `Yesterday at ${timeString}`;
    } else {
      const dateString = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      return `${dateString} at ${timeString}`;
    }
  };

  return (
    <div
      className="text-xs muted mb-1 text-center w-full"
      style={{ opacity: 0.6 }}
    >
      {formatTime(timestamp)}
    </div>
  );
}
