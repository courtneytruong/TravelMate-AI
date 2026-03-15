import axios from "axios";
import { DynamicStructuredTool } from "@langchain/core/tools";
import "dotenv/config";

const weatherTool = new DynamicStructuredTool({
  name: "weather_tool",
  description:
    "Fetch current weather and 5-day forecast for a city using OpenWeatherMap",
  schema: {
    type: "object",
    properties: {
      city: { type: "string", description: "City name" },
      date: {
        type: "string",
        description:
          "Optional ISO date (YYYY-MM-DD) to return a date-specific forecast",
      },
      country: {
        type: "string",
        description: "Optional country code (ISO 3166) or country name",
      },
    },
    required: ["city"],
  },
  func: async ({ city, country, date } = {}) => {
    try {
      const q = country ? `${city},${country}` : city;
      const apiKey = process.env.OPENWEATHER_API_KEY;
      const url = "https://api.openweathermap.org/data/2.5/forecast";

      const resp = await axios.get(url, {
        params: {
          q,
          units: "imperial",
          appid: apiKey,
        },
      });

      const data = resp.data;
      if (!data || !data.list || data.list.length === 0) {
        throw new Error("No forecast data");
      }

      const current = data.list[0];
      const currentTemp = Math.round(current.main.temp);
      const currentCond = current.weather?.[0]?.description ?? "N/A";
      const currentHum = current.main.humidity;

      // Aggregate into days and pick a representative sample for each day
      const daysMap = {};
      for (const item of data.list) {
        const date = new Date(item.dt * 1000).toISOString().split("T")[0];
        if (!daysMap[date]) daysMap[date] = [];
        daysMap[date].push(item);
      }

      const dates = Object.keys(daysMap).slice(0, 5);
      const forecastLines = dates.map((d) => {
        const items = daysMap[d];
        let chosen = items.find(
          (it) => new Date(it.dt * 1000).getUTCHours() === 12,
        );
        if (!chosen) chosen = items[Math.floor(items.length / 2)];
        const t = Math.round(chosen.main.temp);
        const cond = chosen.weather?.[0]?.description ?? "N/A";
        return `${d}: ${t}°F, ${cond}`;
      });

      // If a specific date was requested, return a concise forecast for that date
      if (date) {
        const target = date;
        const daysMapLocal = {};
        for (const item of data.list) {
          const d = new Date(item.dt * 1000).toISOString().split("T")[0];
          if (!daysMapLocal[d]) daysMapLocal[d] = [];
          daysMapLocal[d].push(item);
        }
        const items = daysMapLocal[target] || [];
        if (items.length === 0) {
          return `No forecast available for ${target} in ${city}.`;
        }
        let chosen = items.find(
          (it) => new Date(it.dt * 1000).getUTCHours() === 12,
        );
        if (!chosen) chosen = items[Math.floor(items.length / 2)];
        const t = Math.round(chosen.main.temp);
        const cond = chosen.weather?.[0]?.description ?? "N/A";
        return `Forecast for ${target} in ${city}: ${t}°F, ${cond}.`;
      }

      const summary = formatWeatherResponse(city, data);
      return summary;
    } catch (err) {
      console.error("weatherTool error", err?.message ?? err);
      return `Weather data is temporarily unavailable for ${city}.`;
    }
  },
});

export function formatWeatherResponse(city, data) {
  try {
    const list = data?.list ?? [];
    const cityName = city || data?.city?.name || "Unknown location";
    if (list.length === 0)
      return `Weather data is temporarily unavailable for ${cityName}.`;

    const current = list[0];
    const temp = current?.main?.temp;
    const tempStr = temp != null ? `${Math.round(temp)}F` : "N/A";
    const condDesc = current?.weather?.[0]?.description ?? null;
    const condStr = condDesc ? condDesc : "";
    const hum = current?.main?.humidity;
    const humStr = hum != null ? `${hum}%` : "N/A";

    const daysMap = {};
    for (const item of list) {
      const date = new Date(item.dt * 1000).toISOString().split("T")[0];
      if (!daysMap[date]) daysMap[date] = [];
      daysMap[date].push(item);
    }

    const dates = Object.keys(daysMap).slice(0, 5);
    const forecastLines = dates.map((d) => {
      const items = daysMap[d] || [];
      let chosen = items.find(
        (it) => new Date(it.dt * 1000).getUTCHours() === 12,
      );
      if (!chosen) chosen = items[Math.floor(items.length / 2)] || {};
      const t = chosen?.main?.temp;
      const tStr = t != null ? `${Math.round(t)}F` : "N/A";
      const desc = chosen?.weather?.[0]?.description ?? "";
      const lower = desc.toLowerCase();
      let label = desc || "N/A";
      if (lower.includes("rain")) label = "rainy";
      else if (lower.includes("clear")) label = "sunny";
      else if (lower.includes("snow")) label = "snowy";
      else if (lower.includes("cloud"))
        label = lower.includes("part") ? "partly cloudy" : "cloudy";

      const dayName = new Date(d).toLocaleDateString("en-US", {
        weekday: "short",
      });
      return `${dayName} ${tStr} ${label}`;
    });

    const forecastStr = forecastLines.join(", ");
    const currentPart = condStr
      ? `Currently ${tempStr} and ${condStr}.`
      : `Currently ${tempStr}.`;
    return `Weather in ${cityName}: ${currentPart} Humidity: ${humStr}. 5-Day Forecast: ${forecastStr}.`;
  } catch (e) {
    return `Weather data is temporarily unavailable for ${city}.`;
  }
}

export default weatherTool;
