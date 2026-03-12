import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import attractionsTool from "./attractionsTool.js";

// Load .env: backend/.env, repo root .env, or repo root .env.example
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

async function main() {
  const city = process.argv[2];
  const category = process.argv[3];

  if (!city) {
    console.error("Usage: node tools/testAttractionsTool.js <city> [category]");
    process.exit(1);
  }

  const apiKey = process.env.FOURSQUARE_API_KEY;
  if (!apiKey) {
    console.error("Please set FOURSQUARE_API_KEY in your environment or .env");
    process.exit(1);
  }

  console.log(
    `Testing attractionsTool for ${city}${category ? ", " + category : ""}...`,
  );
  const result = await attractionsTool.func({ city, category });
  console.log("\nResult:\n");
  console.log(result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
