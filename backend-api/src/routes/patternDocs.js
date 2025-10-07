import { Router } from "express";
import pool from "../db/pool.js";
import authMiddleware from "../middleware/auth.js";

const router = Router();

// All routes require auth
router.use(authMiddleware);

// GET /pattern-docs - list
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, content, created_at, updated_at FROM pattern_docs ORDER BY created_at DESC",
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        content: r.content,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    );
  } catch (e) {
    console.error("List pattern docs error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /pattern-docs/:id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      "SELECT id, name, content, created_at, updated_at FROM pattern_docs WHERE id = $1",
      [id],
    );
    const r = rows[0];
    if (!r) return res.status(404).json({ error: "Not found" });
    res.json({
      id: r.id,
      name: r.name,
      content: r.content,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  } catch (e) {
    console.error("Get pattern doc error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /pattern-docs
router.post("/", async (req, res) => {
  try {
    const { name, content } = req.body || {};
    if (!name || !content) {
      return res.status(400).json({ error: "name and content are required" });
    }
    if (String(name).length > 200) {
      return res.status(400).json({ error: "name must be <= 200 chars" });
    }
    const {
      rows: [r],
    } = await pool.query(
      "INSERT INTO pattern_docs (name, content) VALUES ($1, $2) RETURNING id, name, content, created_at, updated_at",
      [name, content],
    );
    res.status(201).json({
      id: r.id,
      name: r.name,
      content: r.content,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  } catch (e) {
    console.error("Create pattern doc error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /pattern-docs/:id
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, content } = req.body || {};
    if (name !== undefined && String(name).length === 0) {
      return res.status(400).json({ error: "name cannot be empty" });
    }
    if (name !== undefined && String(name).length > 200) {
      return res.status(400).json({ error: "name must be <= 200 chars" });
    }
    const {
      rows: [r],
    } = await pool.query(
      `UPDATE pattern_docs SET
         name = COALESCE($1, name),
         content = COALESCE($2, content),
         updated_at = now()
       WHERE id = $3
       RETURNING id, name, content, created_at, updated_at`,
      [name ?? null, content ?? null, id],
    );
    if (!r) return res.status(404).json({ error: "Not found" });
    res.json({
      id: r.id,
      name: r.name,
      content: r.content,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  } catch (e) {
    console.error("Update pattern doc error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /pattern-docs/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("DELETE FROM pattern_docs WHERE id = $1", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error("Delete pattern doc error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
