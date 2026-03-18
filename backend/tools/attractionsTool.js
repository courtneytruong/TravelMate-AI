// backend/tools/attractionsTool.js
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { searchFoursquarePlaces } from "./foursquareClient.js";

// Category ID map — used when a specific type of attraction is requested
const categoryMap = {
  museums: "10000",
  museum: "10000",
  art: "10000",
  "arts & entertainment": "10000",
  parks: "16000",
  park: "16000",
  outdoors: "16000",
  nature: "16000",
  landmarks: "16000",
  "landmarks & outdoors": "16000",
  sightseeing: "16000",
  temples: "16000",
  shrines: "16000",
};

// Post-filter regex — removes food and drink venues that Foursquare sometimes
// returns even when a landmarks category ID is specified.
const FOOD_DRINK_CATEGORIES =
  /pub|bar|restaurant|cafe|coffee|bakery|food|drink|dining|bistro|brewery|winery|cocktail|tavern|brasserie|eatery|diner/i;

const zSchema = z.object({
  city: z.string().describe("City name to search for attractions"),
  category: z
    .string()
    .optional()
    .describe("Optional category filter e.g. museums, parks, landmarks"),
});

const attractionsTool = new DynamicStructuredTool({
  name: "attractions_tool",
  description:
    "Find top tourist attractions, landmarks, and things to do in a city using Foursquare Places. Returns a numbered list of attractions — NOT restaurants or food venues.",
  schema: zSchema,
  func: async ({ city, category } = {}) => {
    try {
      if (!city) {
        return 'Please provide a destination city (e.g., "Tokyo") so I can search for attractions.';
      }

      const catKey = (category || "").toLowerCase().trim();
      // Default to Landmarks & Outdoors (16000) only — avoids food/drink overlap
      const categoryId = categoryMap[catKey] ?? (category ? category : "16000");

      console.log(
        `[attractionsTool] Searching ${city} with category: ${categoryId}`,
      );

      // Fetch extra results so filtering still leaves enough to show
      const results = await searchFoursquarePlaces(city, categoryId, 10);

      if (!Array.isArray(results) || results.length === 0) {
        return `Attraction data is temporarily unavailable for ${city}.`;
      }

      // Post-filter: remove any food or drink venues from the results
      const filtered = results.filter((place) => {
        const catName = place?.categories?.[0]?.name ?? "";
        return !FOOD_DRINK_CATEGORIES.test(catName);
      });

      console.log(
        `[attractionsTool] Raw: ${results.length} results, after food filter: ${filtered.length}`,
      );

      // Fall back to unfiltered if every result was a food venue
      const finalResults = filtered.length > 0 ? filtered : results;

      // Take top 5 after filtering
      const topFive = finalResults.slice(0, 5);

      const lines = topFive.map((place, idx) => {
        const name = place?.name ?? "Unknown name";
        const cat = place?.categories?.[0]?.name ?? "Attraction";
        const rating = place?.rating != null ? place.rating : "Not rated";
        const loc = place?.location ?? {};
        const address =
          loc?.formatted_address ||
          [loc?.address, loc?.locality, loc?.region, loc?.country]
            .filter(Boolean)
            .join(", ") ||
          "Address unavailable";
        return `${idx + 1}. ${name} — ${cat} — ${rating} — ${address}`;
      });

      return lines.join("\n");
    } catch (err) {
      console.error(
        "[attractionsTool] Error:",
        err?.response?.status,
        err?.response?.data ?? err?.message ?? err,
      );
      return `Attraction data is temporarily unavailable for ${city}.`;
    }
  },
});

export default attractionsTool;
