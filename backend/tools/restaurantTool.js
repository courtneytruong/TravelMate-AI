// backend/tools/restaurantTool.js
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { searchFoursquarePlaces } from "./foursquareClient.js";

const argsSchema = z.object({
  city: z.string(),
  cuisine: z.string().optional(),
  limit: z.number().optional().default(5),
});

/**
 * Converts a Foursquare price integer (1-4) to dollar signs.
 * @param {number|null} p
 * @returns {string}
 */
const priceTier = (p) => {
  if (p == null) return "Not available";
  const n = Number(p);
  if (!Number.isFinite(n) || n < 1) return "Not available";
  return "$".repeat(Math.min(4, Math.max(1, Math.floor(n))));
};

// Post-filter regex — removes non-food venues (shrines, parks, museums etc.)
// that Foursquare sometimes returns when searching near landmarks.
const NON_FOOD_CATEGORIES =
  /shrine|temple|garden|park|museum|landmark|monument|church|mosque|cemetery|government|hospital|stadium|arena|theater|theatre|gallery|library|school|university/i;

const restaurantTool = new DynamicStructuredTool({
  name: "restaurant_tool",
  description:
    "Search for restaurants and dining options in a city using Foursquare Places v3. Accepts city, optional cuisine hint, and optional limit. Returns food and drink venues only.",
  schema: argsSchema,
  func: async ({ city, cuisine, limit } = {}) => {
    try {
      if (!city) return "Invalid input: city is required.";

      // Append cuisine as a hint to improve Foursquare relevance
      const queryCity = cuisine ? `${cuisine} restaurants in ${city}` : city;

      const categoryId = 13000; // Dining & Drinking
      // Fetch extra results so filtering still leaves enough to show
      const fetchLimit = typeof limit === "number" ? limit + 5 : 10;

      console.log(`[restaurantTool] Searching for restaurants in ${queryCity}`);

      const results = await searchFoursquarePlaces(
        queryCity,
        categoryId,
        fetchLimit,
      );

      if (!Array.isArray(results) || results.length === 0) {
        return `No restaurants found for ${city}.`;
      }

      // Post-filter: remove non-food venues that appear due to proximity
      const filtered = results.filter((place) => {
        const catName = place?.categories?.[0]?.name ?? "";
        return !NON_FOOD_CATEGORIES.test(catName);
      });

      console.log(
        `[restaurantTool] Raw: ${results.length} results, after non-food filter: ${filtered.length}`,
      );

      // Fall back to unfiltered if filter removed everything
      const finalResults = filtered.length > 0 ? filtered : results;

      // Take only as many as originally requested
      const displayLimit = typeof limit === "number" ? limit : 5;
      const topResults = finalResults.slice(0, displayLimit);

      const lines = topResults.map((r, i) => {
        const name = r?.name ?? "Not available";
        const cuisineType =
          (Array.isArray(r?.categories) && r.categories[0]?.name) ??
          "Not available";
        const rating = r?.rating != null ? `${r.rating}/10` : "Not available";
        const price = priceTier(r?.price);

        const loc = r?.location ?? {};
        const address =
          loc?.formatted_address ||
          [loc?.address, loc?.locality, loc?.region, loc?.postcode]
            .filter(Boolean)
            .join(", ") ||
          "Not available";

        return `${i + 1}. ${name} — ${cuisineType} — Rating: ${rating} — Price: ${price} — Address: ${address}`;
      });

      return lines.join("\n");
    } catch (err) {
      console.error("[restaurantTool] Error:", err?.message ?? err);
      return `Restaurant data is temporarily unavailable for ${city}.`;
    }
  },
});

export default restaurantTool;
