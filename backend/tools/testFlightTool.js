import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import flightTool from "./flightTool.js";

// Try loading .env from backend, then repo root, then fall back to .env.example
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
  const flightNumber = process.argv[2];
  const date = process.argv[3];

  if (!flightNumber) {
    console.error(
      "Usage: node tools/testFlightTool.js <flightNumber> [YYYY-MM-DD]",
    );
    process.exit(1);
  }

  console.log(
    `Testing flightTool for ${flightNumber}${date ? ", " + date : ""}...`,
  );
  const result = await flightTool.func({ flightNumber, date });
  console.log("\nResult:\n");
  console.log(result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
