import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import authRoutes from "./routes/auth.js";
import conversationsRoutes from "./routes/conversations.js";
import promptsRoutes from "./routes/prompts.js";
import patternDocsRoutes from "./routes/patternDocs.js";
import authMiddleware from "./middleware/auth.js";
import pool from "./db/pool.js";

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 4000;

// Middleware
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// Routes
app.use("/auth", authRoutes);
app.use("/conversations", conversationsRoutes);
app.use("/prompts", promptsRoutes);
app.use("/pattern-docs", patternDocsRoutes);

// Health check (includes DB)
app.get("/health", async (req, res) => {
  const db = { status: "unknown" };
  try {
    await pool.query("SELECT 1");
    db.status = "ok";
  } catch (e) {
    db.status = "down";
  }
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "backend-api",
    features: ["auth", "conversations", "prompts", "pattern-docs"],
    db,
  });
})
;

// AI service health proxy (avoids browser CORS)
const endpoints = ["/healthz", "/health", "/", "/status"]; // probe candidates on langgraph-service
app.get("/ai/health", async (req, res) => {
  const base =
    process.env.LANGGRAPH_SERVICE_URL || "http://langgraph.local:5000";
  for (const ep of endpoints) {
    let url;
    try {
      url = new URL(ep, base).toString();
    } catch {
      url = `${base.replace(/\/$/, "")}${ep}`;
    }
    try {
      const r = await fetch(url);
      let bodyText = "";
      let data = null;
      try {
        bodyText = await r.text();
        try {
          data = JSON.parse(bodyText);
        } catch {}
      } catch {}
      // consider 200 OK as healthy even if non-JSON
      if (r.ok) {
        return res
          .status(200)
          .json({ ok: true, upstream: url, data: data ?? bodyText });
      }
    } catch (e) {
      // try next endpoint
    }
  }
  res
    .status(502)
    .json({ ok: false, error: "AI health probe failed", tried: endpoints });
});

// MCP service health proxy
app.get("/mcp/health", async (req, res) => {
  const base = process.env.MCP_SERVICE_URL || "http://mcp-service:5100";
  const paths = ["/healthz", "/health", "/", "/status"]; // attempt common paths
  for (const p of paths) {
    let url;
    try {
      url = new URL(p, base).toString();
    } catch {
      url = `${base.replace(/\/$/, "")}${p}`;
    }
    try {
      const r = await fetch(url);
      let body = await r.text().catch(() => "");
      let data = null;
      try {
        data = JSON.parse(body);
      } catch {}
      if (r.ok)
        return res
          .status(200)
          .json({ ok: true, upstream: url, data: data ?? body });
    } catch {}
  }
  res
    .status(502)
    .json({ ok: false, error: "MCP health probe failed", tried: paths });
});

// Protected route example
app.get("/protected", authMiddleware, (req, res) => {
  res.json({
    message: "This is a protected route",
    user: req.user,
    timestamp: new Date().toISOString(),
  });
});

// Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend API server running on port ${PORT}`);
  console.log(`📝 Conversations API ready`);
});

export { app };
