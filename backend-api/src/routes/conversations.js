import { Router } from "express";
import pool from "../db/pool.js";
import authMiddleware from "../middleware/auth.js";

const router = Router();

// Get all conversations for the authenticated user
router.get("/", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.title, c.created_at, c.updated_at,
              COUNT(m.id) as message_count,
              MAX(m.created_at) as last_message_at
       FROM conversations c
       LEFT JOIN messages m ON c.id = m.conversation_id
       WHERE c.user_id = $1
       GROUP BY c.id, c.title, c.created_at, c.updated_at
       ORDER BY c.updated_at DESC`,
      [req.userId],
    );

    res.json({ conversations: result.rows });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// Create a new conversation
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { title = "New Chat" } = req.body;

    const result = await pool.query(
      `INSERT INTO conversations (user_id, title)
       VALUES ($1, $2)
       RETURNING id, title, created_at, updated_at`,
      [req.userId, title],
    );

    res.status(201).json({ conversation: result.rows[0] });
  } catch (error) {
    console.error("Error creating conversation:", error);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Get a specific conversation with messages
router.get("/:conversationId", authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;

    // First, verify the conversation belongs to the user
    const convResult = await pool.query(
      "SELECT * FROM conversations WHERE id = $1 AND user_id = $2",
      [conversationId, req.userId],
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Get messages for the conversation
    const messagesResult = await pool.query(
      `SELECT id, role, content, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId],
    );

    res.json({
      conversation: convResult.rows[0],
      messages: messagesResult.rows,
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

// Add a message to a conversation
router.post("/:conversationId/messages", authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, role = "user" } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Message content is required" });
    }

    // Verify the conversation belongs to the user
    const convResult = await pool.query(
      "SELECT * FROM conversations WHERE id = $1 AND user_id = $2",
      [conversationId, req.userId],
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Add the message
    const messageResult = await pool.query(
      `INSERT INTO messages (conversation_id, role, content)
       VALUES ($1, $2, $3)
       RETURNING id, role, content, created_at`,
      [conversationId, role, content.trim()],
    );

    // Update conversation timestamp
    await pool.query(
      "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [conversationId],
    );

    res.status(201).json({ message: messageResult.rows[0] });
  } catch (error) {
    console.error("Error adding message:", error);
    res.status(500).json({ error: "Failed to add message" });
  }
});

// Update conversation title
router.patch("/:conversationId", authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { title } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }

    const result = await pool.query(
      `UPDATE conversations 
       SET title = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING id, title, created_at, updated_at`,
      [title.trim(), conversationId, req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json({ conversation: result.rows[0] });
  } catch (error) {
    console.error("Error updating conversation:", error);
    res.status(500).json({ error: "Failed to update conversation" });
  }
});

// Delete a conversation
router.delete("/:conversationId", authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;

    const result = await pool.query(
      "DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id",
      [conversationId, req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json({ message: "Conversation deleted successfully" });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

// Chat endpoint for AI responses
router.post("/:conversationId/chat", authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { message, useTemplate = false } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Verify the conversation belongs to the user
    const convResult = await pool.query(
      "SELECT * FROM conversations WHERE id = $1 AND user_id = $2",
      [conversationId, req.userId],
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Get conversation history for context
    const messagesResult = await pool.query(
      `SELECT role, content FROM messages 
       WHERE conversation_id = $1 
       ORDER BY created_at ASC 
       LIMIT 10`,
      [conversationId],
    );

    const conversationHistory = messagesResult.rows;

    // Generate AI response using LangGraph service
    const aiResult = await generateLangGraphResponse(
      message,
      conversationHistory,
      req.userId,
      conversationId,
      useTemplate,
    );

    // Determine reply content
    const replyContent = typeof aiResult === "string" ? aiResult : (aiResult.reply || "");

    // Save the AI primary response to the database
    const responseResult = await pool.query(
      `INSERT INTO messages (conversation_id, role, content)
       VALUES ($1, $2, $3)
       RETURNING id, role, content, created_at`,
      [conversationId, "assistant", replyContent],
    );

    // Update conversation timestamp
    await pool.query(
      "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [conversationId],
    );

    // If graph returned a follow-up approval question, insert it as a separate assistant message
    let followUpMessage = null;
    if (aiResult && aiResult.meta && aiResult.meta.follow_up_question) {
      const f = await pool.query(
        `INSERT INTO messages (conversation_id, role, content)
         VALUES ($1, $2, $3)
         RETURNING id, role, content, created_at`,
        [conversationId, "assistant", aiResult.meta.follow_up_question],
      );
      followUpMessage = f.rows[0];
    }

    res.json({
      response: replyContent,
      message: responseResult.rows[0],
      followUp: followUpMessage,
    });
  } catch (error) {
    console.error("Error generating chat response:", error);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

// LangGraph AI response generator
async function generateLangGraphResponse(
  userMessage,
  conversationHistory,
  userId,
  conversationId,
  useTemplate = false,
) {
  const langGraphUrl =
    process.env.LANGGRAPH_SERVICE_URL || "http://langgraph.local:5000";
  const useChatGraph = String(process.env.USE_CHAT_GRAPH || "true").toLowerCase() === "true";

  try {
    // Prepare conversation history for LangGraph
    const formattedHistory = conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Choose endpoint based on template flag or inferred approval flow
    let endpointPath;
    if (useTemplate) {
      endpointPath = "/graphs/template/run";
    } else {
      // Heuristic: if last assistant message asked for any approval, route to template graph
      const lastAssistant = [...formattedHistory].reverse().find((m) => m.role === "assistant");
      const content = (lastAssistant && typeof lastAssistant.content === "string") ? lastAssistant.content : "";
      const askedProjectApproval = content.includes("Do you approve of the Project Overview as written?");
      const askedTechApproval = content.includes("Do you approve of the Technical Overview as written?");
      const askedApproval = askedProjectApproval || askedTechApproval;
      endpointPath = askedApproval ? "/graphs/template/run" : (useChatGraph ? "/graphs/chat/run" : "/chat");
    }
    
    const response = await fetch(`${langGraphUrl}${endpointPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: userMessage,
        conversation_history: formattedHistory,
        ...(endpointPath === "/chat" ? { user_id: userId, conversation_id: conversationId } : {}),
      }),
    });

    if (!response.ok) {
      console.error(
        `LangGraph service error: ${response.status} ${response.statusText}`,
      );
      throw new Error(`LangGraph service returned ${response.status}`);
    }

    const data = await response.json();
    // For graph endpoints, return the full object (reply, provider, ok, meta)
    if (endpointPath.startsWith("/graphs/")) {
      const graphType = endpointPath.includes("template") ? "template" : "chat";
      console.log(`Generated response via ${graphType} graph (provider=${data.provider})`);
      if (data.ok !== true) {
        throw new Error(`${graphType} graph returned not ok`);
      }
      return data; // includes reply and optional meta.follow_up_question
    }
    // Legacy /chat path returns plain structure
    console.log(`Generated response using ${data.provider} provider`);
    return { reply: data.response, provider: data.provider };
  } catch (error) {
    console.error("Error calling LangGraph service:", error);

    // Fallback to simple response if LangGraph service is unavailable
    return generateFallbackResponse(userMessage);
  }
}

// Fallback response generator when LangGraph service is unavailable
function generateFallbackResponse(userMessage) {
  const message = userMessage.toLowerCase();

  if (message.includes("hello") || message.includes("hi")) {
    return "Hello! I'm E C Project Launchpad, your AI assistant. The AI service is currently unavailable, but I'm still here to help as best I can.";
  } else if (message.includes("how are you")) {
    return "I'm doing well, thank you for asking! I'm currently running in fallback mode, but I'm still ready to help you.";
  } else if (message.includes("help")) {
    return "I'm here to help! While my full AI capabilities are temporarily unavailable, I can still assist you with basic responses.";
  } else {
    return "I understand you're asking about that topic. I'm currently running in fallback mode due to the AI service being unavailable, but I'm still here to help as best I can. Could you tell me more about what you'd like to know?";
  }
}

export default router;
