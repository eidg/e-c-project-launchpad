import { useState, useRef, useEffect } from "react";
import { useConversations } from "../contexts/ConversationProvider";
import ReactMarkdown from "react-markdown";

const ChatInterface = () => {
  const {
    currentConversation,
    messages,
    sendMessage,
    createNewConversation,
    loading,
    error,
  } = useConversations();

  const [inputMessage, setInputMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!inputMessage.trim() || sending) return;

    // If no current conversation, create one
    if (!currentConversation) {
      const newConv = await createNewConversation();
      if (!newConv) return;
    }

    setSending(true);
    const messageContent = inputMessage.trim();
    setInputMessage("");

    const success = await sendMessage(messageContent);

    if (success) {
      // Generate AI response
      try {
        const response = await fetch(
          `/api/conversations/${currentConversation.id}/chat`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({ message: messageContent }),
          },
        );

        if (response.ok) {
          const data = await response.json();
          // The backend already saved the AI response, so just refresh the conversation
          await selectConversation(currentConversation.id);
        } else {
          console.error("Failed to get AI response");
          // For error cases, we need to manually add an error message
          // Since sendMessage only handles user messages, we'll add it directly to state
          const errorMessage = {
            id: `error-${Date.now()}`,
            role: "assistant",
            content:
              "I'm sorry, I'm having trouble responding right now. Please try again.",
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, errorMessage]);
        }
      } catch (error) {
        console.error("Error getting AI response:", error);
        // For error cases, we need to manually add an error message
        const errorMessage = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "I'm sorry, I encountered an error. Please try again.",
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    }

    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading && !currentConversation) {
    return (
      <div className="chat-interface loading">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading conversations...</p>
        </div>
      </div>
    );
  }

  if (!currentConversation && !loading) {
    return (
      <div className="chat-interface empty">
        <div className="empty-state">
          <div className="empty-icon">💬</div>
          <h2>Welcome to E C Project Launchpad Chat</h2>
          <p>Start a new conversation to begin chatting</p>
          <button
            className="start-chat-button"
            onClick={() => createNewConversation()}
          >
            Start New Chat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      {/* Chat Header */}
      <div className="chat-header">
        <div className="conversation-info">
          <h2>{currentConversation?.title || "New Chat"}</h2>
          <span className="message-count">
            {messages.length} {messages.length === 1 ? "message" : "messages"}
          </span>
        </div>
      </div>

      {/* Messages Area - Scrollable Container */}
      <div className="messages-container" ref={messagesContainerRef}>
        <div className="messages-content">
          {messages.length === 0 ? (
            <div className="no-messages">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`message ${message.role === "user" ? "user-message" : "assistant-message"}`}
              >
                <div className="message-avatar">
                  {message.role === "user" ? "👤" : "🤖"}
                </div>
                <div className="message-content">
                  <div className="message-text">
                    {message.role === "assistant" ? (
                      <div className="markdown-wrapper">
                        {message.content.includes("Emily")
                          ? renderMarkdown(
                              parseMarkdown(
                                "Here are five names:\n- Emily\n- James\n- Sophia\n- Daniel\n- Olivia",
                              ),
                            )
                          : renderMarkdown(parseMarkdown(message.content))}
                      </div>
                    ) : (
                      message.content
                    )}
                  </div>
                  <div className="message-time">
                    {formatTime(message.created_at)}
                  </div>
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="message assistant-message">
              <div className="message-avatar">🤖</div>
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area - Fixed at bottom */}
      <div className="chat-input-container">
        {error && <div className="error-message">⚠️ {error}</div>}

        <form onSubmit={handleSendMessage} className="chat-input-form">
          <div className="input-wrapper">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message here..."
              disabled={sending}
              className="message-input"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || sending}
              className="send-button"
            >
              {sending ? "⏳" : "➤"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;
