import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import weatherTool from "../tools/weatherTool.js";

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

(async () => {
  try {
    const res = await weatherTool.func({ city: "Paris" });
    console.log(res);
  } catch (err) {
    console.error("Smoke test failed:", err?.message ?? err);
    process.exitCode = 1;
  }
})();
