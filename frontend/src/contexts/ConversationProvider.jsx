import { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthProvider";

const ConversationContext = createContext(null);

export const useConversations = () => {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error(
      "useConversations must be used within a ConversationProvider",
    );
  }
  return context;
};

export const ConversationProvider = ({ children }) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load conversations when user is available
  useEffect(() => {
    if (user) {
      loadConversations();
    } else {
      setConversations([]);
      setCurrentConversation(null);
      setMessages([]);
    }
  }, [user]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/conversations", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations);

        // If no current conversation and we have conversations, select the first one
        if (!currentConversation && data.conversations.length > 0) {
          await selectConversation(data.conversations[0].id);
        }
      } else {
        throw new Error("Failed to load conversations");
      }
    } catch (error) {
      console.error("Error loading conversations:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const createNewConversation = async (title = "New Chat") => {
    try {
      setError(null);

      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ title }),
      });

      if (response.ok) {
        const data = await response.json();
        const newConversation = data.conversation;

        setConversations((prev) => [newConversation, ...prev]);
        setCurrentConversation(newConversation);
        setMessages([]);

        return newConversation;
      } else {
        throw new Error("Failed to create conversation");
      }
    } catch (error) {
      console.error("Error creating conversation:", error);
      setError(error.message);
      return null;
    }
  };

  const selectConversation = async (conversationId) => {
    try {
      setError(null);
      setLoading(true);

      const response = await fetch(`/api/conversations/${conversationId}`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentConversation(data.conversation);
        setMessages(data.messages);
      } else {
        throw new Error("Failed to load conversation");
      }
    } catch (error) {
      console.error("Error loading conversation:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (content) => {
    if (!currentConversation || !content.trim()) return null;

    try {
      setError(null);

      // Add user message immediately to UI
      const userMessage = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: content.trim(),
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);

      const response = await fetch(
        `/api/conversations/${currentConversation.id}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ content: content.trim(), role: "user" }),
        },
      );

      if (response.ok) {
        const data = await response.json();

        // Replace temp message with real message
        setMessages((prev) =>
          prev.map((msg) => (msg.id === userMessage.id ? data.message : msg)),
        );

        // Update conversation in list (move to top)
        setConversations((prev) =>
          prev
            .map((conv) =>
              conv.id === currentConversation.id
                ? { ...conv, updated_at: new Date().toISOString() }
                : conv,
            )
            .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)),
        );

        return data.message;
      } else {
        // Remove temp message on error
        setMessages((prev) => prev.filter((msg) => msg.id !== userMessage.id));
        throw new Error("Failed to send message");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setError(error.message);
      return null;
    }
  };

  const updateConversationTitle = async (conversationId, title) => {
    try {
      setError(null);

      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ title }),
      });

      if (response.ok) {
        const data = await response.json();

        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === conversationId ? data.conversation : conv,
          ),
        );

        if (currentConversation?.id === conversationId) {
          setCurrentConversation(data.conversation);
        }

        return data.conversation;
      } else {
        throw new Error("Failed to update conversation title");
      }
    } catch (error) {
      console.error("Error updating conversation title:", error);
      setError(error.message);
      return null;
    }
  };

  const deleteConversation = async (conversationId) => {
    try {
      setError(null);

      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        setConversations((prev) =>
          prev.filter((conv) => conv.id !== conversationId),
        );

        // If we deleted the current conversation, select another one or clear
        if (currentConversation?.id === conversationId) {
          const remaining = conversations.filter(
            (conv) => conv.id !== conversationId,
          );
          if (remaining.length > 0) {
            await selectConversation(remaining[0].id);
          } else {
            setCurrentConversation(null);
            setMessages([]);
          }
        }

        return true;
      } else {
        throw new Error("Failed to delete conversation");
      }
    } catch (error) {
      console.error("Error deleting conversation:", error);
      setError(error.message);
      return false;
    }
  };

  const value = {
    // State
    conversations,
    currentConversation,
    messages,
    loading,
    error,

    // Actions
    loadConversations,
    createNewConversation,
    selectConversation,
    sendMessage,
    updateConversationTitle,
    deleteConversation,
  };

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  );
};
