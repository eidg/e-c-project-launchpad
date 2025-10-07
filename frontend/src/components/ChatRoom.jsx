import { useState, useEffect, useRef } from "react";
import { useChat } from "../contexts/ChatProvider";

const ChatRoom = () => {
  const {
    connected,
    currentRoom,
    messages,
    sendMessage,
    typingUsers,
    startTyping,
    stopTyping,
    loading,
    error,
  } = useChat();

  const [messageInput, setMessageInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleInputChange = (e) => {
    setMessageInput(e.target.value);

    // Handle typing indicators
    if (!isTyping && e.target.value.trim()) {
      setIsTyping(true);
      startTyping();
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      stopTyping();
    }, 1000);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!messageInput.trim() || !connected) return;

    sendMessage(messageInput);
    setMessageInput("");

    // Stop typing indicator
    if (isTyping) {
      setIsTyping(false);
      stopTyping();
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString();
    }
  };

  const groupMessagesByDate = (messages) => {
    const groups = {};
    messages.forEach((message) => {
      const date = formatDate(message.createdAt);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
    });
    return groups;
  };

  if (loading) {
    return (
      <div className="chat-room loading">
        <div className="loading-spinner"></div>
        <p>Connecting to chat...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="chat-room error">
        <div className="error-message">
          <h3>Connection Error</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!currentRoom) {
    return (
      <div className="chat-room no-room">
        <div className="welcome-message">
          <h2>Welcome to E C Project Launchpad Chat! 💬</h2>
          <p>Select a room from the sidebar to start chatting.</p>
        </div>
      </div>
    );
  }

  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="chat-room">
      {/* Chat Header */}
      <div className="chat-header">
        <div className="room-info">
          <h2>#{currentRoom.name}</h2>
          {currentRoom.description && (
            <p className="room-description">{currentRoom.description}</p>
          )}
        </div>
        <div className="connection-status">
          <span
            className={`status-indicator ${connected ? "connected" : "disconnected"}`}
          >
            {connected ? "🟢 Connected" : "🔴 Disconnected"}
          </span>
        </div>
      </div>

      {/* Messages Area */}
      <div className="messages-container">
        {Object.entries(messageGroups).map(([date, dayMessages]) => (
          <div key={date} className="message-group">
            <div className="date-separator">
              <span>{date}</span>
            </div>
            {dayMessages.map((message) => (
              <div key={message.id} className="message">
                <div className="message-avatar">
                  {message.user.email.charAt(0).toUpperCase()}
                </div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-author">{message.user.email}</span>
                    <span className="message-time">
                      {formatTime(message.createdAt)}
                    </span>
                  </div>
                  <div className="message-text">{message.content}</div>
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Typing Indicators */}
        {typingUsers.length > 0 && (
          <div className="typing-indicators">
            <div className="typing-message">
              <div className="typing-avatar">💬</div>
              <div className="typing-content">
                <span className="typing-text">
                  {typingUsers.map((user) => user.email).join(", ")}
                  {typingUsers.length === 1 ? " is" : " are"} typing...
                </span>
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="message-input-container">
        <form onSubmit={handleSubmit} className="message-form">
          <input
            type="text"
            value={messageInput}
            onChange={handleInputChange}
            placeholder={`Message #${currentRoom.name}`}
            disabled={!connected}
            className="message-input"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!connected || !messageInput.trim()}
            className="send-button"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatRoom;
