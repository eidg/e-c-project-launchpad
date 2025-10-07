import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import pool from "../db/pool.js";

const ACCESS_SECRET = process.env.ACCESS_SECRET || "dev-access-secret-key";

class ChatServer {
  constructor(server) {
    this.wss = new WebSocketServer({ server });
    this.connectedUsers = new Map(); // socketId -> { userId, socket, roomIds }
    this.rooms = new Map(); // roomId -> Set of socketIds

    this.wss.on("connection", this.handleConnection.bind(this));
    console.log("🔌 Chat WebSocket server initialized");
  }

  async handleConnection(socket, request) {
    console.log("🔗 New WebSocket connection attempt");

    try {
      // Extract token from query string or headers
      const url = new URL(request.url, `http://${request.headers.host}`);
      const token =
        url.searchParams.get("token") ||
        request.headers.authorization?.replace("Bearer ", "");

      if (!token) {
        socket.close(1008, "Authentication required");
        return;
      }

      // Verify JWT token
      const decoded = jwt.verify(token, ACCESS_SECRET);
      const userId = decoded.sub;

      // Get user info from database
      const userResult = await pool.query(
        "SELECT id, email FROM users WHERE id = $1",
        [userId],
      );

      if (userResult.rows.length === 0) {
        socket.close(1008, "Invalid user");
        return;
      }

      const user = userResult.rows[0];
      const socketId = this.generateSocketId();

      // Store user session in database
      await pool.query(
        `INSERT INTO user_sessions (user_id, socket_id, connected_at, last_activity, is_active)
         VALUES ($1, $2, NOW(), NOW(), true)
         ON CONFLICT (socket_id) DO UPDATE SET
         connected_at = NOW(), last_activity = NOW(), is_active = true`,
        [userId, socketId],
      );

      // Store connection info
      this.connectedUsers.set(socketId, {
        userId,
        socket,
        user,
        roomIds: new Set(),
        lastActivity: new Date(),
      });

      socket.socketId = socketId;
      socket.userId = userId;

      console.log(`✅ User ${user.email} connected with socket ${socketId}`);

      // Set up event handlers
      socket.on("message", (data) => this.handleMessage(socketId, data));
      socket.on("close", () => this.handleDisconnection(socketId));
      socket.on("error", (error) => this.handleError(socketId, error));

      // Send welcome message
      this.sendToSocket(socketId, {
        type: "connected",
        data: {
          socketId,
          user: { id: user.id, email: user.email },
          timestamp: new Date().toISOString(),
        },
      });

      // Auto-join general room
      await this.joinRoom(socketId, "general");
    } catch (error) {
      console.error("❌ WebSocket authentication failed:", error.message);
      socket.close(1008, "Authentication failed");
    }
  }

  async handleMessage(socketId, rawData) {
    try {
      const connection = this.connectedUsers.get(socketId);
      if (!connection) return;

      // Update last activity
      connection.lastActivity = new Date();
      await pool.query(
        "UPDATE user_sessions SET last_activity = NOW() WHERE socket_id = $1",
        [socketId],
      );

      const message = JSON.parse(rawData.toString());
      console.log(`📨 Message from ${connection.user.email}:`, message.type);

      switch (message.type) {
        case "join_room":
          await this.joinRoom(socketId, message.roomId);
          break;
        case "leave_room":
          await this.leaveRoom(socketId, message.roomId);
          break;
        case "send_message":
          await this.handleChatMessage(socketId, message);
          break;
        case "get_room_history":
          await this.sendRoomHistory(
            socketId,
            message.roomId,
            message.limit || 50,
          );
          break;
        case "typing_start":
          this.broadcastToRoom(
            message.roomId,
            {
              type: "user_typing",
              data: {
                userId: connection.userId,
                user: connection.user,
                isTyping: true,
              },
            },
            socketId,
          );
          break;
        case "typing_stop":
          this.broadcastToRoom(
            message.roomId,
            {
              type: "user_typing",
              data: {
                userId: connection.userId,
                user: connection.user,
                isTyping: false,
              },
            },
            socketId,
          );
          break;
        default:
          console.log(`❓ Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error("❌ Error handling message:", error);
      this.sendToSocket(socketId, {
        type: "error",
        data: { message: "Failed to process message" },
      });
    }
  }

  async joinRoom(socketId, roomIdentifier) {
    try {
      const connection = this.connectedUsers.get(socketId);
      if (!connection) return;

      // Get or create room
      let roomResult;
      if (roomIdentifier === "general") {
        roomResult = await pool.query(
          "SELECT id, name, description FROM chat_rooms WHERE name = $1",
          ["General"],
        );
      } else {
        roomResult = await pool.query(
          "SELECT id, name, description FROM chat_rooms WHERE id = $1",
          [roomIdentifier],
        );
      }

      if (roomResult.rows.length === 0) {
        this.sendToSocket(socketId, {
          type: "error",
          data: { message: "Room not found" },
        });
        return;
      }

      const room = roomResult.rows[0];
      const roomId = room.id;

      // Add user to room participants if not already there
      await pool.query(
        `INSERT INTO chat_room_participants (room_id, user_id, joined_at, last_read_at)
         VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (room_id, user_id) DO UPDATE SET
         is_active = true, last_read_at = NOW()`,
        [roomId, connection.userId],
      );

      // Add to local room tracking
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, new Set());
      }
      this.rooms.get(roomId).add(socketId);
      connection.roomIds.add(roomId);

      console.log(`🏠 User ${connection.user.email} joined room ${room.name}`);

      // Notify user they joined
      this.sendToSocket(socketId, {
        type: "room_joined",
        data: {
          room: { id: roomId, name: room.name, description: room.description },
          timestamp: new Date().toISOString(),
        },
      });

      // Notify others in room
      this.broadcastToRoom(
        roomId,
        {
          type: "user_joined",
          data: {
            user: connection.user,
            room: { id: roomId, name: room.name },
            timestamp: new Date().toISOString(),
          },
        },
        socketId,
      );

      // Send recent room history
      await this.sendRoomHistory(socketId, roomId, 20);
    } catch (error) {
      console.error("❌ Error joining room:", error);
      this.sendToSocket(socketId, {
        type: "error",
        data: { message: "Failed to join room" },
      });
    }
  }

  async leaveRoom(socketId, roomId) {
    const connection = this.connectedUsers.get(socketId);
    if (!connection) return;

    // Remove from local tracking
    if (this.rooms.has(roomId)) {
      this.rooms.get(roomId).delete(socketId);
      if (this.rooms.get(roomId).size === 0) {
        this.rooms.delete(roomId);
      }
    }
    connection.roomIds.delete(roomId);

    // Update database
    await pool.query(
      "UPDATE chat_room_participants SET is_active = false WHERE room_id = $1 AND user_id = $2",
      [roomId, connection.userId],
    );

    console.log(`🚪 User ${connection.user.email} left room ${roomId}`);

    // Notify others in room
    this.broadcastToRoom(
      roomId,
      {
        type: "user_left",
        data: {
          user: connection.user,
          roomId,
          timestamp: new Date().toISOString(),
        },
      },
      socketId,
    );
  }

  async handleChatMessage(socketId, message) {
    try {
      const connection = this.connectedUsers.get(socketId);
      if (!connection) return;

      const { roomId, content, messageType = "text", replyToId } = message;

      // Validate user is in room
      if (!connection.roomIds.has(roomId)) {
        this.sendToSocket(socketId, {
          type: "error",
          data: { message: "You are not in this room" },
        });
        return;
      }

      // Save message to database
      const result = await pool.query(
        `INSERT INTO chat_messages (room_id, user_id, content, message_type, reply_to_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
        [roomId, connection.userId, content, messageType, replyToId || null],
      );

      const savedMessage = result.rows[0];

      // Broadcast message to all users in room
      const broadcastData = {
        type: "new_message",
        data: {
          id: savedMessage.id,
          roomId,
          content,
          messageType,
          replyToId,
          user: connection.user,
          createdAt: savedMessage.created_at,
          timestamp: new Date().toISOString(),
        },
      };

      this.broadcastToRoom(roomId, broadcastData);

      console.log(`💬 Message from ${connection.user.email} in room ${roomId}`);
    } catch (error) {
      console.error("❌ Error handling chat message:", error);
      this.sendToSocket(socketId, {
        type: "error",
        data: { message: "Failed to send message" },
      });
    }
  }

  async sendRoomHistory(socketId, roomId, limit = 50) {
    try {
      const result = await pool.query(
        `SELECT m.id, m.content, m.message_type, m.created_at, m.reply_to_id,
                u.id as user_id, u.email as user_email
         FROM chat_messages m
         JOIN users u ON m.user_id = u.id
         WHERE m.room_id = $1 AND m.is_deleted = false
         ORDER BY m.created_at DESC
         LIMIT $2`,
        [roomId, limit],
      );

      const messages = result.rows.reverse().map((row) => ({
        id: row.id,
        content: row.content,
        messageType: row.message_type,
        replyToId: row.reply_to_id,
        user: { id: row.user_id, email: row.user_email },
        createdAt: row.created_at,
      }));

      this.sendToSocket(socketId, {
        type: "room_history",
        data: {
          roomId,
          messages,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("❌ Error sending room history:", error);
    }
  }

  broadcastToRoom(roomId, data, excludeSocketId = null) {
    const roomSockets = this.rooms.get(roomId);
    if (!roomSockets) return;

    roomSockets.forEach((socketId) => {
      if (socketId !== excludeSocketId) {
        this.sendToSocket(socketId, data);
      }
    });
  }

  sendToSocket(socketId, data) {
    const connection = this.connectedUsers.get(socketId);
    if (connection && connection.socket.readyState === 1) {
      // OPEN
      connection.socket.send(JSON.stringify(data));
    }
  }

  async handleDisconnection(socketId) {
    const connection = this.connectedUsers.get(socketId);
    if (!connection) return;

    console.log(`🔌 User ${connection.user.email} disconnected`);

    // Remove from all rooms
    connection.roomIds.forEach((roomId) => {
      this.leaveRoom(socketId, roomId);
    });

    // Update database session
    await pool.query(
      "UPDATE user_sessions SET is_active = false WHERE socket_id = $1",
      [socketId],
    );

    // Remove from connected users
    this.connectedUsers.delete(socketId);
  }

  handleError(socketId, error) {
    console.error(`❌ WebSocket error for ${socketId}:`, error);
  }

  generateSocketId() {
    return `socket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get online users count
  getOnlineUsersCount() {
    return this.connectedUsers.size;
  }

  // Get users in room
  getRoomUsers(roomId) {
    const roomSockets = this.rooms.get(roomId);
    if (!roomSockets) return [];

    return Array.from(roomSockets)
      .map((socketId) => {
        const connection = this.connectedUsers.get(socketId);
        return connection ? connection.user : null;
      })
      .filter(Boolean);
  }
}

export default ChatServer;
