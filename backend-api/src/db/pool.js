import pg from "pg";

const { Pool } = pg;

// Database configuration
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/e_c_project_launchpad",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on("connect", () => {
  console.log("📊 Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL pool error:", err);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("🔄 Closing database pool...");
  pool.end(() => {
    console.log("✅ Database pool closed");
    process.exit(0);
  });
});

export default pool;
