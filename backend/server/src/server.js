import express from "express";
import cors from "cors";
import { invokeGraph } from "../../graph.js";

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
    const { sessionID, message } = req.body;
    if (!message)
      return res
        .status(400)
        .json({ error: true, message: "message is required" });

    const result = await invokeGraph(sessionID, message);
    return res.json({ reply: result });
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
