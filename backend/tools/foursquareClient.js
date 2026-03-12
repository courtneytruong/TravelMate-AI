import axios from "axios";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Ensure env is loaded when this module is imported directly.
if (!process.env.FOURSQUARE_API_KEY) {
  const cwdEnv = path.resolve(process.cwd(), ".env");
  const repoRootEnv = path.resolve(process.cwd(), "..", ".env");
  const repoRootExample = path.resolve(process.cwd(), "..", ".env.example");
  const envPath = fs.existsSync(cwdEnv)
    ? cwdEnv
    : fs.existsSync(repoRootEnv)
      ? repoRootEnv
      : fs.existsSync(repoRootExample)
        ? repoRootExample
        : null;
  if (envPath) dotenv.config({ path: envPath });
}

/**
 * Search Foursquare Places v3 `/places/search`.
 * @param {string} city - City/place for the `near` parameter (e.g., "Tokyo, JP").
 * @param {string|number} categoryId - Foursquare category id to filter results.
 * @param {number} [limit=5] - Maximum number of results to return.
 * @returns {Promise<Array>} Resolves with the `results` array from the Foursquare response.
 */
export async function searchFoursquarePlaces(city, categoryId, limit = 5) {
  // New Places API host per migration guide
  const url = "https://places-api.foursquare.com/places/search";

  const foursquareKey = (process.env.FOURSQUARE_API_KEY || "").trim();
  if (!foursquareKey) {
    throw new Error(
      "FOURSQUARE_API_KEY is not set or is empty. Set it in your environment or .env (use the Places Service API key, e.g. starting with fsq3...).",
    );
  }

  // Use Service key Bearer authentication per migration guide
  const authHeader = `Bearer ${foursquareKey}`;
  // intentionally quiet in production

  const headers = {
    Authorization: authHeader,
    Accept: "application/json",
    // Add date-based version header for the Places API
    "X-Places-Api-Version": "2025-06-17",
  };

  const resp = await axios.get(url, {
    headers,
    timeout: 5000,
    params: {
      near: city,
      categories: categoryId,
      limit,
    },
  });

  const results = resp.data?.results ?? [];
  return results;
}
