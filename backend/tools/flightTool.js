import axios from "axios";
import { DynamicStructuredTool } from "@langchain/core/tools";

function todayYYYYMMDD() {
  return new Date().toISOString().split("T")[0];
}

function fmtDateTime(dt) {
  if (!dt) return "N/A";
  try {
    return new Date(dt).toLocaleString();
  } catch (e) {
    return String(dt);
  }
}

const flightTool = new DynamicStructuredTool({
  name: "flight_tool",
  description:
    "Fetch flight status and schedule for a flight number using AeroDataBox (via RapidAPI)",
  schema: {
    type: "object",
    properties: {
      flightNumber: {
        type: "string",
        description: "Airline flight number (e.g. AA100)",
      },
      date: {
        type: "string",
        description: "Date in YYYY-MM-DD format (defaults to today)",
      },
    },
    required: ["flightNumber"],
  },
  func: async ({ flightNumber, date } = {}) => {
    try {
      if (!flightNumber) return "Invalid input: flightNumber is required.";

      // Use the flight number as provided (trim whitespace). Do not enforce
      // a strict regex or force uppercase — some carriers use nonstandard
      // formats that should be passed through unchanged.
      const normalized = String(flightNumber).trim();

      const queryDate = date || todayYYYYMMDD();

      const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(
        normalized,
      )}/${encodeURIComponent(queryDate)}`;

      const rapidKey = process.env.AERODATABOX_API_KEY;
      if (!rapidKey) {
        console.error("AeroDataBox RapidAPI key missing (AERODATABOX_API_KEY)");
        return "Flight data is temporarily unavailable. Please check the airline website.";
      }

      const resp = await axios.get(url, {
        headers: {
          "X-RapidAPI-Key": rapidKey,
          "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
        },
      });

      // AeroDataBox returns 204 No Content when no flights match the query
      if (resp && resp.status === 204) {
        console.error("flightTool: AeroDataBox returned 204 No Content");
        return `No flights found for ${normalized} on ${queryDate}.`;
      }

      // Debug info: log status and a small preview when troubleshooting
      if (!resp || !resp.data) {
        console.error(
          "flightTool: empty response from AeroDataBox",
          resp?.status,
        );
        return "Flight data is temporarily unavailable. Please check the airline website.";
      }

      // Support responses where data is an array at the root or an object with `flights`.
      const flights = Array.isArray(resp.data)
        ? resp.data
        : (resp.data.flights ?? []);
      if (!Array.isArray(flights) || flights.length === 0) {
        try {
          const preview = JSON.stringify(resp.data, null, 2).slice(0, 2000);
          console.error(
            "flightTool: no flights found in response, preview:",
            preview,
          );
        } catch (e) {
          console.error(
            "flightTool: no flights and failed to stringify response",
          );
        }
        return "Flight data is temporarily unavailable. Please check the airline website.";
      }

      const f = flights[0];

      const airline = f?.airline?.name ?? f?.airline?.iata ?? "Unknown airline";

      const originAirport = f?.departure?.airport ?? {};
      const origin =
        originAirport?.name ??
        originAirport?.iata ??
        originAirport?.icao ??
        "Unknown origin";

      const arrivalAirport = f?.arrival?.airport ?? {};
      const destination =
        arrivalAirport?.name ??
        arrivalAirport?.iata ??
        arrivalAirport?.icao ??
        "Unknown destination";

      const getTime = (side) => {
        if (!side) return null;
        const sched =
          side.scheduledTime ??
          side.scheduledTimeLocal ??
          side.scheduledTimeUtc ??
          null;
        if (typeof sched === "string") return sched;
        if (sched && sched.local) return sched.local;
        if (sched && sched.utc) return sched.utc;
        if (side.predictedTime?.local) return side.predictedTime.local;
        if (side.predictedTime?.utc) return side.predictedTime.utc;
        if (side.predictedTime) return side.predictedTime;
        return null;
      };

      const schedDep = getTime(f.departure);
      const schedArr = getTime(f.arrival);

      const status = f?.status ?? f?.status?.definition ?? "Unknown";

      const delayDep =
        f?.departure?.delay ?? f?.departure?.delayMinutes ?? null;
      const delayArr = f?.arrival?.delay ?? f?.arrival?.delayMinutes ?? null;

      const delayInfo =
        delayDep != null
          ? `Departure delay ${delayDep} min`
          : delayArr != null
            ? `Arrival delay ${delayArr} min`
            : "No delay reported";

      const displayedNumber = f?.number ?? normalized;
      const result = `${displayedNumber} (${airline}): ${origin} → ${destination}. Scheduled: ${fmtDateTime(schedDep)} → ${fmtDateTime(schedArr)}. Status: ${status}. ${delayInfo}.`;

      return result;
    } catch (err) {
      // Log helpful diagnostics for axios errors
      const status = err?.response?.status;
      const respData = err?.response?.data;
      console.error("flightTool error", err?.message ?? err);
      if (status) console.error("flightTool response status:", status);
      if (respData) {
        try {
          console.error(
            "flightTool response data:",
            typeof respData === "object"
              ? JSON.stringify(respData).slice(0, 2000)
              : String(respData),
          );
        } catch (e) {
          console.error("flightTool response data (stringify failed)");
        }
      }

      if (status === 403) {
        return "Flight data unavailable: API access denied (403). Check AERODATABOX_API_KEY and RapidAPI plan.";
      }

      return "Flight data is temporarily unavailable. Please check the airline website.";
    }
  },
});

export default flightTool;
