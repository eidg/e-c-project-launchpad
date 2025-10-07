import React, { useState, useRef, useEffect } from "react";
import { useConversations } from "../contexts/ConversationProvider";

// Simple markdown renderer for AI responses
const renderMarkdown = (text) => {
  if (!text) return "";

  let html = text
    // Code blocks
    .replace(
      /```([\s\S]*?)```/g,
      '<pre class="bg-gray-100 p-3 rounded-md overflow-x-auto"><code>$1</code></pre>',
    )
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded">$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    // Line breaks
    .replace(/\n/g, "<br>");

  return html;
};

const NewChat = () => {
  const {
    currentConversation,
    conversations,
    messages,
    sendMessage,
    createNewConversation,
    selectConversation,
    deleteConversation,
    loading,
    error,
  } = useConversations();

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const message = input.trim();
    setInput("");
    setSending(true);

    try {
      await sendMessage(message);
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSending(false);
    }
  };

  const handleNewChat = async () => {
    await createNewConversation();
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex h-full bg-white">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white flex flex-col">
        {/* New Chat Button */}
        <div className="p-3 border-b border-gray-700">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-3 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-md transition-colors"
          >
            <span className="text-lg">+</span>
            <span>New chat</span>
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => selectConversation(conv.id)}
              className={`p-3 rounded-md cursor-pointer mb-1 group relative ${
                currentConversation?.id === conv.id
                  ? "bg-gray-700"
                  : "hover:bg-gray-800"
              }`}
            >
              <div className="text-sm font-medium truncate">
                {conv.title || "New Conversation"}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {conv.message_count || 0} messages
              </div>

              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Delete this conversation?")) {
                    deleteConversation(conv.id);
                  }
                }}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-600 rounded text-xs"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {!currentConversation ? (
          // Welcome Screen
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-4">💬</div>
              <h2 className="text-2xl font-semibold text-gray-800 mb-2">
                Welcome to E C Project Launchpad
              </h2>
              <p className="text-gray-600">
                Select a conversation or start a new chat to begin
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="border-b border-gray-200 p-4 bg-white">
              <h1 className="text-lg font-semibold text-gray-800">
                {currentConversation.title || "New Conversation"}
              </h1>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="max-w-3xl mx-auto space-y-6">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <div className="text-2xl mb-2">👋</div>
                    <p>Start a conversation by typing a message below</p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div key={message.id} className="flex gap-4">
                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                            message.role === "user"
                              ? "bg-blue-500 text-white"
                              : "bg-green-500 text-white"
                          }`}
                        >
                          {message.role === "user" ? "U" : "AI"}
                        </div>
                      </div>

                      {/* Message Content */}
                      <div className="flex-1 min-w-0">
                        <div className="mb-1">
                          <span className="text-sm font-medium text-gray-900">
                            {message.role === "user" ? "You" : "E C Project Launchpad"}
                          </span>
                          <span className="text-xs text-gray-500 ml-2">
                            {formatTime(message.created_at)}
                          </span>
                        </div>

                        <div className="text-gray-800 leading-relaxed">
                          {message.role === "assistant" ? (
                            <div
                              dangerouslySetInnerHTML={{
                                __html: renderMarkdown(message.content),
                              }}
                            />
                          ) : (
                            <div className="whitespace-pre-wrap">
                              {message.content}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input Area */}
            <div className="border-t border-gray-200 p-4 bg-white">
              <form onSubmit={handleSend} className="max-w-3xl mx-auto">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type your message here..."
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={sending}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || sending}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {sending ? "Sending..." : "Send"}
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default NewChat;
