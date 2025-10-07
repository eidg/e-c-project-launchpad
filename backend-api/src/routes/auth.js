import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../db/pool.js";
import authMiddleware from "../middleware/auth.js";

const router = Router();
const ACCESS_TTL = "15m";
const REFRESH_TTL = "7d";
const saltRounds = 12;

// Environment variables for JWT secrets (should be set in production)
const ACCESS_SECRET =
  process.env.ACCESS_SECRET || "dev-access-secret-change-in-production";
const REFRESH_SECRET =
  process.env.REFRESH_SECRET || "dev-refresh-secret-change-in-production";

router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
    }

    // Hash password
    const hash = await bcrypt.hash(password, saltRounds);

    // Insert user
    const {
      rows: [user],
    } = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, hash],
    );

    issueTokens(user, res, 201);
  } catch (error) {
    if (error.code === "23505") {
      // Unique constraint violation
      return res.status(409).json({ error: "Email already exists" });
    }
    console.error("Signup error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update current user's profile (email and/or password)
router.put("/profile", authMiddleware, async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body || {};

    // Fetch current user
    const {
      rows: [user],
    } = await pool.query(
      "SELECT id, email, password_hash, created_at FROM users WHERE id = $1",
      [req.userId],
    );
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Validate input
    const updates = [];
    const params = [];
    let idx = 1;

    if (email && email !== user.email) {
      updates.push(`email = $${idx++}`);
      params.push(email);
    }

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Current password is required" });
      }
      const ok = await bcrypt.compare(currentPassword, user.password_hash);
      if (!ok) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
      if (String(newPassword).length < 8) {
        return res
          .status(400)
          .json({ error: "New password must be at least 8 characters" });
      }
      const hash = await bcrypt.hash(newPassword, saltRounds);
      updates.push(`password_hash = $${idx++}`);
      params.push(hash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No changes provided" });
    }

    // Apply update
    params.push(user.id);
    const sql = `UPDATE users SET ${updates.join(", ")} WHERE id = $$${idx} RETURNING id, email, created_at`;
    // Fix parameter index in WHERE clause
    const fixedSql = sql.replace("$$" + idx, "$" + idx);
    const { rows } = await pool.query(fixedSql, params);
    const updated = rows[0];

    // If email changed, new tokens will reflect new email
    issueTokens(updated, res, 200);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email already exists" });
    }
    console.error("Profile update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user
    const {
      rows: [user],
    } = await pool.query(
      "SELECT id, email, password_hash, created_at FROM users WHERE email = $1",
      [email],
    );

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    issueTokens(user, res);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const old = req.cookies.refreshToken;

    if (!old) {
      return res.status(401).json({ error: "Refresh token required" });
    }

    // Delete old token and get user_id
    const {
      rows: [dbTok],
    } = await pool.query(
      "DELETE FROM refresh_tokens WHERE token_hash = crypt($1, token_hash) AND expires_at > now() RETURNING user_id",
      [old],
    );

    if (!dbTok) {
      return res
        .status(401)
        .json({ error: "Invalid or expired refresh token" });
    }

    // Get user
    const {
      rows: [user],
    } = await pool.query(
      "SELECT id, email, created_at FROM users WHERE id = $1",
      [dbTok.user_id],
    );

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    issueTokens(user, res);
  } catch (error) {
    console.error("Refresh error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      // Delete refresh token from database
      await pool.query(
        "DELETE FROM refresh_tokens WHERE token_hash = crypt($1, token_hash)",
        [refreshToken],
      );
    }

    // Clear cookies
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Test route to verify routing is working
router.get("/test", (req, res) => {
  res.json({
    message: "Auth routes are working",
    timestamp: new Date().toISOString(),
  });
});

// Get current user info
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const {
      rows: [user],
    } = await pool.query(
      "SELECT id, email, created_at FROM users WHERE id = $1",
      [req.userId],
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

function issueTokens(user, res, code = 200) {
  try {
    // Create JWT tokens
    const access = jwt.sign(
      { sub: user.id, email: user.email },
      ACCESS_SECRET,
      { expiresIn: ACCESS_TTL },
    );
    const refresh = jwt.sign({ sub: user.id }, REFRESH_SECRET, {
      expiresIn: REFRESH_TTL,
    });

    // Store refresh token in database
    const refreshPayload = jwt.decode(refresh);
    pool
      .query(
        "INSERT INTO refresh_tokens(user_id, token_hash, expires_at) VALUES($1, crypt($2, gen_salt('bf')), to_timestamp($3))",
        [user.id, refresh, refreshPayload.exp],
      )
      .catch((err) => console.error("Error storing refresh token:", err));

    // Set HTTP-only cookies
    res.cookie("accessToken", access, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 15 * 60 * 1000, // 15 minutes
      secure: process.env.NODE_ENV === "production",
    });

    res.cookie("refreshToken", refresh, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      secure: process.env.NODE_ENV === "production",
    });

    res.status(code).json({
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error("Token issuance error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export default router;
