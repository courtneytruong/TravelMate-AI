import "dotenv/config";
import express from "express";
import cors from "cors";
import { invokeGraph } from "./graph.js";

// Startup check — confirm env vars are loaded
const requiredEnvVars = [
  "GITHUB_TOKEN",
  "OPENWEATHER_API_KEY",
  "FOURSQUARE_API_KEY",
];
const missingVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
  console.error("❌ Missing environment variables:", missingVars.join(", "));
  console.error("Make sure your .env file is in the backend/ folder.");
  process.exit(1); // Stop the server immediately with a clear error
} else {
  console.log("✅ Environment variables loaded successfully");
  console.log("GITHUB_TOKEN set:", !!process.env.GITHUB_TOKEN);
  console.log("OPENWEATHER_API_KEY set:", !!process.env.OPENWEATHER_API_KEY);
  console.log("FOURSQUARE_API_KEY set:", !!process.env.FOURSQUARE_API_KEY);
}

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
  }),
);

app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.post("/api/chat", async (req, res, next) => {
  try {
    // Accept either `sessionID` (older) or `sessionId` (client)
    const { message } = req.body;
    const sessionID = req.body.sessionID || req.body.sessionId;
    if (!message)
      return res
        .status(400)
        .json({ error: true, message: "message is required" });

    const result = await invokeGraph(sessionID, message);
    // `invokeGraph` may return either a string reply or an object
    // with `{ reply, tripContext }`. Normalize the response so the
    // client can always read `data.reply` and `data.tripContext`.
    if (result && typeof result === "object") {
      return res.json(result);
    }
    return res.json({ reply: String(result), tripContext: {} });
  } catch (err) {
    next(err);
  }
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error(err);
  res
    .status(500)
    .json({ error: true, message: err?.message ?? "Internal Server Error" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`TravelMate AI server listening on ${PORT}`),
);
