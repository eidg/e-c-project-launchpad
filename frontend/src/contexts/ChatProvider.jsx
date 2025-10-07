import { createContext, useContext, useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthProvider";

const ChatContext = createContext(null);

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};

export const ChatProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [messages, setMessages] = useState({});
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const socketRef = useRef(null);
  const typingTimeoutRef = useRef({});

  // Initialize WebSocket connection
  useEffect(() => {
    if (!user) {
      disconnectSocket();
      return;
    }

    connectSocket();

    return () => {
      disconnectSocket();
    };
  }, [user]);

  const connectSocket = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get access token from cookies
      const cookies = document.cookie.split(";").reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split("=");
        acc[key] = value;
        return acc;
      }, {});

      const token = cookies.accessToken;

      if (!token) {
        throw new Error("No access token found");
      }

      // Use the same host/port as the frontend, but with ws protocol
      const wsUrl = `ws://localhost:3000/api/ws?token=${token}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("🔌 Connected to chat server");
        setConnected(true);
        setSocket(ws);
        socketRef.current = ws;
        setLoading(false);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleSocketMessage(data);
      };

      ws.onclose = (event) => {
        console.log(
          "🔌 Disconnected from chat server",
          event.code,
          event.reason,
        );
        setConnected(false);
        setSocket(null);
        socketRef.current = null;
        setLoading(false);

        // Attempt to reconnect after 3 seconds if not intentional disconnect
        if (event.code !== 1000 && user) {
          setTimeout(() => {
            console.log("🔄 Attempting to reconnect...");
            connectSocket();
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        setError("Connection error");
        setLoading(false);
      };
    } catch (error) {
      console.error("❌ Failed to connect to chat server:", error);
      setError(error.message);
      setLoading(false);
    }
  };

  const disconnectSocket = () => {
    if (socketRef.current) {
      socketRef.current.close(1000, "User disconnected");
      socketRef.current = null;
    }
    setSocket(null);
    setConnected(false);
    setMessages({});
    setRooms([]);
    setCurrentRoom(null);
    setOnlineUsers([]);
    setTypingUsers({});
  };

  const handleSocketMessage = (data) => {
    console.log("📨 Received message:", data.type);

    switch (data.type) {
      case "connected":
        console.log("✅ Connected as:", data.data.user.email);
        fetchRooms();
        break;

      case "room_joined":
        console.log("🏠 Joined room:", data.data.room.name);
        setCurrentRoom(data.data.room);
        break;

      case "room_history":
        setMessages((prev) => ({
          ...prev,
          [data.data.roomId]: data.data.messages,
        }));
        break;

      case "new_message":
        const { roomId, ...messageData } = data.data;
        setMessages((prev) => ({
          ...prev,
          [roomId]: [...(prev[roomId] || []), messageData],
        }));
        break;

      case "user_joined":
        // Handle user joined room notification
        break;

      case "user_left":
        // Handle user left room notification
        break;

      case "user_typing":
        const { userId, user: typingUser, isTyping } = data.data;
        setTypingUsers((prev) => {
          const newTyping = { ...prev };
          if (isTyping) {
            newTyping[userId] = typingUser;
            // Clear typing after 3 seconds
            if (typingTimeoutRef.current[userId]) {
              clearTimeout(typingTimeoutRef.current[userId]);
            }
            typingTimeoutRef.current[userId] = setTimeout(() => {
              setTypingUsers((current) => {
                const updated = { ...current };
                delete updated[userId];
                return updated;
              });
            }, 3000);
          } else {
            delete newTyping[userId];
            if (typingTimeoutRef.current[userId]) {
              clearTimeout(typingTimeoutRef.current[userId]);
              delete typingTimeoutRef.current[userId];
            }
          }
          return newTyping;
        });
        break;

      case "error":
        console.error("❌ Chat error:", data.data.message);
        setError(data.data.message);
        break;

      default:
        console.log("❓ Unknown message type:", data.type);
    }
  };

  const sendMessage = (content, messageType = "text", replyToId = null) => {
    if (!socket || !currentRoom || !content.trim()) return;

    const message = {
      type: "send_message",
      roomId: currentRoom.id,
      content: content.trim(),
      messageType,
      replyToId,
    };

    socket.send(JSON.stringify(message));
  };

  const joinRoom = (roomIdentifier) => {
    if (!socket) return;

    const message = {
      type: "join_room",
      roomId: roomIdentifier,
    };

    socket.send(JSON.stringify(message));
  };

  const leaveRoom = (roomId) => {
    if (!socket) return;

    const message = {
      type: "leave_room",
      roomId,
    };

    socket.send(JSON.stringify(message));
  };

  const startTyping = () => {
    if (!socket || !currentRoom) return;

    const message = {
      type: "typing_start",
      roomId: currentRoom.id,
    };

    socket.send(JSON.stringify(message));
  };

  const stopTyping = () => {
    if (!socket || !currentRoom) return;

    const message = {
      type: "typing_stop",
      roomId: currentRoom.id,
    };

    socket.send(JSON.stringify(message));
  };

  const fetchRooms = async () => {
    try {
      const response = await fetch("/api/chat/rooms", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setRooms(data.rooms);

        // Auto-join general room if available
        const generalRoom = data.rooms.find((room) => room.name === "General");
        if (generalRoom) {
          joinRoom("general");
        }
      }
    } catch (error) {
      console.error("❌ Failed to fetch rooms:", error);
    }
  };

  const createRoom = async (name, description, isPrivate = false) => {
    try {
      const response = await fetch("/api/chat/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ name, description, isPrivate }),
      });

      if (response.ok) {
        const data = await response.json();
        setRooms((prev) => [...prev, data.room]);
        return data.room;
      } else {
        const error = await response.json();
        throw new Error(error.message);
      }
    } catch (error) {
      console.error("❌ Failed to create room:", error);
      setError(error.message);
      return null;
    }
  };

  const value = {
    // Connection state
    connected,
    loading,
    error,

    // Room management
    rooms,
    currentRoom,
    joinRoom,
    leaveRoom,
    createRoom,

    // Messaging
    messages: messages[currentRoom?.id] || [],
    sendMessage,

    // User activity
    onlineUsers,
    typingUsers: Object.values(typingUsers),
    startTyping,
    stopTyping,

    // Utilities
    connectSocket,
    disconnectSocket,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
