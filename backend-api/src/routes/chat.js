import { Router } from "express";
import pool from "../db/pool.js";
import authMiddleware from "../middleware/auth.js";

const router = Router();

// Get all rooms for the authenticated user
router.get("/rooms", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.name, r.description, r.is_private, r.created_at,
              u.email as created_by_email,
              COUNT(DISTINCT p.user_id) as participant_count,
              COUNT(DISTINCT m.id) as message_count
       FROM chat_rooms r
       LEFT JOIN users u ON r.created_by = u.id
       LEFT JOIN chat_room_participants p ON r.id = p.room_id AND p.is_active = true
       LEFT JOIN chat_messages m ON r.id = m.room_id AND m.is_deleted = false
       WHERE r.is_private = false OR r.id IN (
         SELECT room_id FROM chat_room_participants WHERE user_id = $1 AND is_active = true
       )
       GROUP BY r.id, r.name, r.description, r.is_private, r.created_at, u.email
       ORDER BY r.created_at ASC`,
      [req.user.id],
    );

    res.json({
      rooms: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        isPrivate: row.is_private,
        createdAt: row.created_at,
        createdBy: row.created_by_email,
        participantCount: parseInt(row.participant_count),
        messageCount: parseInt(row.message_count),
      })),
    });
  } catch (error) {
    console.error("Error fetching chat rooms:", error);
    res.status(500).json({ message: "Failed to fetch chat rooms" });
  }
});

// Create a new chat room
router.post("/rooms", authMiddleware, async (req, res) => {
  try {
    const { name, description, isPrivate = false } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: "Room name is required" });
    }

    if (name.trim().length > 255) {
      return res.status(400).json({ message: "Room name too long" });
    }

    // Check if room name already exists
    const existingRoom = await pool.query(
      "SELECT id FROM chat_rooms WHERE name = $1",
      [name.trim()],
    );

    if (existingRoom.rows.length > 0) {
      return res.status(400).json({ message: "Room name already exists" });
    }

    // Create the room
    const result = await pool.query(
      `INSERT INTO chat_rooms (name, description, created_by, is_private)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, is_private, created_at`,
      [name.trim(), description?.trim() || null, req.user.id, isPrivate],
    );

    const room = result.rows[0];

    // Add creator as admin participant
    await pool.query(
      `INSERT INTO chat_room_participants (room_id, user_id, role, joined_at)
       VALUES ($1, $2, 'admin', NOW())`,
      [room.id, req.user.id],
    );

    res.status(201).json({
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        isPrivate: room.is_private,
        createdAt: room.created_at,
        role: "admin",
      },
    });
  } catch (error) {
    console.error("Error creating chat room:", error);
    res.status(500).json({ message: "Failed to create chat room" });
  }
});

// Get room details and recent messages
router.get("/rooms/:roomId", authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    // Check if user has access to this room
    const roomAccess = await pool.query(
      `SELECT r.id, r.name, r.description, r.is_private, r.created_at,
              p.role, p.joined_at
       FROM chat_rooms r
       LEFT JOIN chat_room_participants p ON r.id = p.room_id AND p.user_id = $1 AND p.is_active = true
       WHERE r.id = $2 AND (r.is_private = false OR p.user_id IS NOT NULL)`,
      [req.user.id, roomId],
    );

    if (roomAccess.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Room not found or access denied" });
    }

    const room = roomAccess.rows[0];

    // Get recent messages
    const messagesResult = await pool.query(
      `SELECT m.id, m.content, m.message_type, m.created_at, m.reply_to_id,
              u.id as user_id, u.email as user_email,
              reply_m.content as reply_content,
              reply_u.email as reply_user_email
       FROM chat_messages m
       JOIN users u ON m.user_id = u.id
       LEFT JOIN chat_messages reply_m ON m.reply_to_id = reply_m.id
       LEFT JOIN users reply_u ON reply_m.user_id = reply_u.id
       WHERE m.room_id = $1 AND m.is_deleted = false
       ORDER BY m.created_at DESC
       LIMIT $2`,
      [roomId, limit],
    );

    const messages = messagesResult.rows.reverse().map((row) => ({
      id: row.id,
      content: row.content,
      messageType: row.message_type,
      createdAt: row.created_at,
      user: {
        id: row.user_id,
        email: row.user_email,
      },
      replyTo: row.reply_to_id
        ? {
            id: row.reply_to_id,
            content: row.reply_content,
            user: { email: row.reply_user_email },
          }
        : null,
    }));

    // Get participants
    const participantsResult = await pool.query(
      `SELECT u.id, u.email, p.role, p.joined_at, p.last_read_at
       FROM chat_room_participants p
       JOIN users u ON p.user_id = u.id
       WHERE p.room_id = $1 AND p.is_active = true
       ORDER BY p.joined_at ASC`,
      [roomId],
    );

    const participants = participantsResult.rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      joinedAt: row.joined_at,
      lastReadAt: row.last_read_at,
    }));

    res.json({
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        isPrivate: room.is_private,
        createdAt: room.created_at,
        userRole: room.role || "member",
      },
      messages,
      participants,
    });
  } catch (error) {
    console.error("Error fetching room details:", error);
    res.status(500).json({ message: "Failed to fetch room details" });
  }
});

// Join a room
router.post("/rooms/:roomId/join", authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;

    // Check if room exists and is accessible
    const roomResult = await pool.query(
      "SELECT id, name, is_private FROM chat_rooms WHERE id = $1",
      [roomId],
    );

    if (roomResult.rows.length === 0) {
      return res.status(404).json({ message: "Room not found" });
    }

    const room = roomResult.rows[0];

    if (room.is_private) {
      return res
        .status(403)
        .json({ message: "Cannot join private room without invitation" });
    }

    // Add user to room participants
    await pool.query(
      `INSERT INTO chat_room_participants (room_id, user_id, joined_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (room_id, user_id) DO UPDATE SET
       is_active = true, joined_at = NOW()`,
      [roomId, req.user.id],
    );

    res.json({
      message: "Successfully joined room",
      room: {
        id: room.id,
        name: room.name,
      },
    });
  } catch (error) {
    console.error("Error joining room:", error);
    res.status(500).json({ message: "Failed to join room" });
  }
});

// Leave a room
router.post("/rooms/:roomId/leave", authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;

    await pool.query(
      "UPDATE chat_room_participants SET is_active = false WHERE room_id = $1 AND user_id = $2",
      [roomId, req.user.id],
    );

    res.json({ message: "Successfully left room" });
  } catch (error) {
    console.error("Error leaving room:", error);
    res.status(500).json({ message: "Failed to leave room" });
  }
});

// Get online users
router.get("/online", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT u.id, u.email, s.last_activity
       FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.is_active = true AND s.last_activity > NOW() - INTERVAL '5 minutes'
       ORDER BY s.last_activity DESC`,
      [],
    );

    res.json({
      onlineUsers: result.rows.map((row) => ({
        id: row.id,
        email: row.email,
        lastActivity: row.last_activity,
      })),
    });
  } catch (error) {
    console.error("Error fetching online users:", error);
    res.status(500).json({ message: "Failed to fetch online users" });
  }
});

// Search messages
router.get("/search", authMiddleware, async (req, res) => {
  try {
    const { q: query, roomId, limit = 20 } = req.query;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ message: "Search query is required" });
    }

    let whereClause = `m.is_deleted = false AND m.content ILIKE $1`;
    let queryParams = [`%${query.trim()}%`];
    let paramCount = 1;

    if (roomId) {
      paramCount++;
      whereClause += ` AND m.room_id = $${paramCount}`;
      queryParams.push(roomId);
    }

    // Only search in rooms user has access to
    whereClause += ` AND m.room_id IN (
      SELECT r.id FROM chat_rooms r
      LEFT JOIN chat_room_participants p ON r.id = p.room_id AND p.user_id = $${paramCount + 1} AND p.is_active = true
      WHERE r.is_private = false OR p.user_id IS NOT NULL
    )`;
    queryParams.push(req.user.id);

    const result = await pool.query(
      `SELECT m.id, m.content, m.message_type, m.created_at,
              u.id as user_id, u.email as user_email,
              r.id as room_id, r.name as room_name
       FROM chat_messages m
       JOIN users u ON m.user_id = u.id
       JOIN chat_rooms r ON m.room_id = r.id
       WHERE ${whereClause}
       ORDER BY m.created_at DESC
       LIMIT $${paramCount + 2}`,
      [...queryParams, parseInt(limit)],
    );

    const messages = result.rows.map((row) => ({
      id: row.id,
      content: row.content,
      messageType: row.message_type,
      createdAt: row.created_at,
      user: {
        id: row.user_id,
        email: row.user_email,
      },
      room: {
        id: row.room_id,
        name: row.room_name,
      },
    }));

    res.json({
      query: query.trim(),
      messages,
      total: messages.length,
    });
  } catch (error) {
    console.error("Error searching messages:", error);
    res.status(500).json({ message: "Failed to search messages" });
  }
});

export default router;
