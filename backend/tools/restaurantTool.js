import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { searchFoursquarePlaces } from "./foursquareClient.js";

const argsSchema = z.object({
  city: z.string(),
  cuisine: z.string().optional(),
  limit: z.number().optional().default(5),
});

const priceTier = (p) => {
  if (p == null) return "Not available";
  const n = Number(p);
  if (!Number.isFinite(n) || n < 1) return "Not available";
  return "$".repeat(Math.min(4, Math.max(1, Math.floor(n))));
};

const restaurantTool = new DynamicStructuredTool({
  name: "restaurant_tool",
  description:
    "Search restaurants using Foursquare Places v3. Accepts city, optional cuisine hint, and optional limit.",
  schema: argsSchema,
  func: async ({ city, cuisine, limit } = {}) => {
    try {
      if (!city) return "Invalid input: city is required.";

      // If cuisine is provided, append it as a hint to the city string
      const queryCity = cuisine ? `${cuisine} restaurants in ${city}` : city;

      const categoryId = 13000; // Dining & Drinking
      const lim = typeof limit === "number" ? limit : 5;

      const results = await searchFoursquarePlaces(queryCity, categoryId, lim);

      if (!Array.isArray(results) || results.length === 0) {
        return `No restaurants found for ${city}.`;
      }

      const lines = results.map((r, i) => {
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
      console.error("restaurantTool error", err?.message ?? err);
      return `Restaurant data is temporarily unavailable for ${city}.`;
    }
  },
});

export default restaurantTool;
