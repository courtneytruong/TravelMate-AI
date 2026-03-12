import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { searchFoursquarePlaces } from "./foursquareClient.js";

const categoryMap = {
  museums: "10000",
  museum: "10000",
  parks: "16000",
  park: "16000",
  "arts & entertainment": "10000",
  "landmarks & outdoors": "16000",
};

const zSchema = z.object({ city: z.string(), category: z.string().optional() });

const attractionsTool = new DynamicStructuredTool({
  name: "attractions_tool",
  description:
    "Find attractions in a city using Foursquare Places and return a short numbered list.",
  zodSchema: zSchema,
  func: async ({ city, category } = {}) => {
    try {
      const catKey = (category || "").toLowerCase().trim();
      const categoryId =
        categoryMap[catKey] ?? (category ? category : "10000,16000");

      const results = await searchFoursquarePlaces(city, categoryId, 5);

      if (!Array.isArray(results) || results.length === 0) {
        return `Attraction data is temporarily unavailable for ${city}.`;
      }

      const lines = results.map((place, idx) => {
        const name = place?.name ?? "Unknown name";
        const cat = place?.categories?.[0]?.name ?? "Unknown category";
        const rating = place?.rating != null ? place.rating : "Not rated";
        const loc = place?.location ?? {};
        const address =
          (loc?.formatted_address ??
            [loc?.address, loc?.locality, loc?.region, loc?.country]
              .filter(Boolean)
              .join(", ")) ||
          "Address unavailable";
        return `${idx + 1}. ${name} — ${cat} — ${rating} — ${address}`;
      });

      return lines.join("\n");
    } catch (e) {
      try {
        console.error(
          "attractionsTool error:",
          e?.response?.status,
          e?.response?.data ?? e?.message ?? e,
        );
      } catch (logErr) {
        console.error("attractionsTool logging failed", logErr);
      }
      return `Attraction data is temporarily unavailable for ${city}.`;
    }
  },
});

export default attractionsTool;
