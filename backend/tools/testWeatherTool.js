import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import weatherTool from "./weatherTool.js";

// Try loading .env from current folder, then repo root, then fall back to .env.example
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
  const city = process.argv[2] || "Tokyo";
  const country = process.argv[3] || undefined;

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    console.error("Please set OPENWEATHER_API_KEY in your environment or .env");
    process.exit(1);
  }

  console.log(
    `Testing weatherTool for ${city}${country ? ", " + country : ""}...`,
  );
  const result = await weatherTool.func({ city, country });
  console.log("\nResult:\n");
  console.log(result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
