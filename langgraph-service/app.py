# Ensure imports at top for proper module load
from typing import List, Dict, Any, Optional, TypedDict
import os
import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from langgraph.graph import StateGraph, END
import asyncpg

# Build a minimal LangGraph for chat verification
def _node_generate_reply(state: "ChatGraphState") -> "ChatGraphState":
    # Synchronous echo node to verify LangGraph wiring without async calls
    msg = state.get("message") or ""
    state["reply"] = f"echo: {msg}"
    state["provider"] = "graph"
    return state

def build_chat_graph():
    g = StateGraph(ChatGraphState)
    g.add_node("respond", _node_generate_reply)
    g.set_entry_point("respond")
    g.add_edge("respond", END)
    return g.compile()

_CHAT_GRAPH = None

# Minimal Chat Graph models
class ChatGraphState(TypedDict, total=False):
    message: str
    conversation_history: List[Dict[str, str]]
    reply: str
    provider: str

# Template Graph models
class TemplateGraphState(TypedDict, total=False):
    user_message: str
    conversation_history: List[Dict[str, str]]
    prompt_content: str
    pattern_content: str
    assembled_prompt: str
    reply: str
    provider: str
    error: Optional[str]

class ChatGraphRequest(BaseModel):
    message: str
    # Use plain dicts to avoid forward reference to ChatMessage at import time
    conversation_history: List[Dict[str, str]] = []

class ChatGraphResponse(BaseModel):
    ok: bool
    reply: str
    provider: str
    meta: Dict[str, Any] = {}

class TemplateGraphRequest(BaseModel):
    message: str
    conversation_history: List[Dict[str, str]] = []

class TemplateGraphResponse(BaseModel):
    ok: bool
    reply: str
    provider: str
    meta: Dict[str, Any] = {}

def get_chat_graph():
    global _CHAT_GRAPH
    if _CHAT_GRAPH is None:
        _CHAT_GRAPH = build_chat_graph()
    return _CHAT_GRAPH

# Direct AI client imports
try:
    from openai import AsyncOpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

try:
    from anthropic import AsyncAnthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global database connection pool
db_pool = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown hooks for database connection"""
    global db_pool
    
    # Startup: create DB pool
    database_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db.local:5432/e_c_project_launchpad")
    try:
        db_pool = await asyncpg.create_pool(database_url, min_size=2, max_size=10)
        logger.info(f"Database connection pool created: {database_url}")
    except Exception as e:
        logger.error(f"Failed to create database pool: {e}")
    
    yield
    
    # Shutdown: close pool
    if db_pool:
        await db_pool.close()
        logger.info("Database connection pool closed")

app = FastAPI(title="E C Project Launchpad LangGraph Service", version="0.0.1", lifespan=lifespan)

# Pydantic models
class HealthResponse(BaseModel):
    status: str
    version: str
    ai_provider: Optional[str] = None
    search_provider: Optional[str] = None

class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    message: str
    conversation_history: List[ChatMessage] = []
    user_id: Optional[str] = None
    conversation_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    provider: str
    tokens_used: Optional[int] = None
    processing_time: Optional[float] = None

# (Removed legacy audit graph models)

# Initialize AI clients
def get_ai_client():
    """Get the configured AI client based on available API keys."""
    openai_key = os.getenv("OPENAI_API_KEY")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    
    if openai_key and OPENAI_AVAILABLE:
        logger.info("Using OpenAI provider")
        return AsyncOpenAI(api_key=openai_key), "openai"
    elif anthropic_key and ANTHROPIC_AVAILABLE:
        logger.info("Using Anthropic provider")
        return AsyncAnthropic(api_key=anthropic_key), "anthropic"
    else:
        logger.warning("No AI API keys configured or clients unavailable, using fallback")
        return None, "fallback"

async def generate_ai_response_openai(client: AsyncOpenAI, messages: List[Dict[str, str]]) -> str:
    """Generate response using OpenAI."""
    try:
        response = await client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=messages,
            temperature=0.7,
            max_tokens=1000
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"OpenAI API error: {e}")
        raise

async def generate_ai_response_anthropic(client: AsyncAnthropic, messages: List[Dict[str, str]]) -> str:
    """Generate response using Anthropic."""
    try:
        # Anthropic requires system message to be separate
        system_message = ""
        user_messages = []
        
        for msg in messages:
            if msg["role"] == "system":
                system_message = msg["content"]
            else:
                user_messages.append(msg)
        
        response = await client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=1000,
            temperature=0.7,
            system=system_message,
            messages=user_messages
        )
        return response.content[0].text
    except Exception as e:
        logger.error(f"Anthropic API error: {e}")
        raise

async def generate_ai_response(user_message: str, conversation_history: List[Any]) -> tuple[str, str]:
    """Generate AI response using the configured provider."""
    client, provider = get_ai_client()
    
    if client is None:
        return generate_fallback_response(user_message), "fallback"
    
    try:
        # Prepare messages
        messages = []
        
        # Add system message
        system_prompt = (
            "You are E C Project Launchpad, a helpful AI assistant. You are knowledgeable, "
            "friendly, and provide clear, concise responses. You can help with "
            "various topics including general questions, coding, writing, analysis, "
            "and creative tasks. Always be helpful and maintain a professional "
            "yet approachable tone.\n\n"
            "IMPORTANT: Always format your responses using proper Markdown syntax:\n"
            "- Use bullet points with '- ' at the start of each line for lists\n"
            "- Use numbered lists with '1. ' for ordered lists\n"
            "- Use '**text**' for bold text\n"
            "- Use '*text*' for italic text\n"
            "- Use '# ' for headings, '## ' for subheadings\n"
            "- Use '```' for code blocks\n"
            "- Use '> ' for blockquotes\n"
            "When creating lists, put each item on a separate line with proper markdown formatting."
        )
        messages.append({"role": "system", "content": system_prompt})
        
        # Add conversation history
        for msg in conversation_history:
            if isinstance(msg, dict):
                r = msg.get("role")
                c = msg.get("content")
            else:
                r = getattr(msg, "role", None)
                c = getattr(msg, "content", None)
            if not r or not c:
                continue
            messages.append({"role": r, "content": c})
        
        # Add current user message
        messages.append({"role": "user", "content": user_message})
        
        # Generate response based on provider
        if provider == "openai":
            response = await generate_ai_response_openai(client, messages)
        elif provider == "anthropic":
            response = await generate_ai_response_anthropic(client, messages)
        else:
            response = generate_fallback_response(user_message)
        
        logger.info(f"Generated response using {provider}")
        return response, provider
        
    except Exception as e:
        logger.error(f"Error generating AI response: {e}")
        return generate_fallback_response(user_message), "fallback"

def generate_fallback_response(user_message: str) -> str:
    """Generate a fallback response when AI providers are unavailable."""
    message = user_message.lower()
    
    if any(word in message for word in ["hello", "hi", "hey"]):
        return "Hello! I'm E C Project Launchpad, your AI assistant. How can I help you today?"
    elif "how are you" in message:
        return "I'm doing well, thank you for asking! I'm here and ready to help you with any questions or tasks you might have."
    elif any(word in message for word in ["help", "assist"]):
        return "I'm here to help! I can assist you with various topics including answering questions, helping with analysis, writing, coding, and more. What would you like to work on?"
    elif any(word in message for word in ["thank", "thanks"]):
        return "You're welcome! I'm glad I could help. Is there anything else you'd like to know or work on?"
    elif any(word in message for word in ["bye", "goodbye", "see you"]):
        return "Goodbye! Feel free to come back anytime if you have more questions. Have a great day!"
    else:
        return "I understand you're asking about that topic. While I'm currently running in fallback mode, I'm still here to help as best I can. Could you tell me more about what you'd like to know?"

# Database helper functions for template graph
async def fetch_prompt_by_name(name: str) -> Optional[Dict]:
    """Fetch a prompt from database by name"""
    if not db_pool:
        logger.error("Database pool not available")
        return None
    
    try:
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id, name, content FROM prompts WHERE name = $1",
                name
            )
            if row:
                return dict(row)
            return None
    except Exception as e:
        logger.error(f"Error fetching prompt '{name}': {e}")
        return None

async def fetch_pattern_doc_by_name(name: str) -> Optional[Dict]:
    """Fetch a pattern document from database by name"""
    if not db_pool:
        logger.error("Database pool not available")
        return None
    
    try:
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id, name, content FROM pattern_docs WHERE name = $1",
                name
            )
            if row:
                return dict(row)
            return None
    except Exception as e:
        logger.error(f"Error fetching pattern doc '{name}': {e}")
        return None

# Template Graph implementation
async def _node_fetch_resources(state: TemplateGraphState) -> TemplateGraphState:
    """Fetch the hardcoded prompt and pattern doc from database"""
    # Hardcoded names for Phase 1
    prompt_name = "cat"
    pattern_name = "catDoc"
    
    prompt = await fetch_prompt_by_name(prompt_name)
    pattern = await fetch_pattern_doc_by_name(pattern_name)
    
    if not prompt or not pattern:
        state["error"] = f"Missing resources: prompt={bool(prompt)}, pattern={bool(pattern)}"
        logger.error(state["error"])
        return state
    
    state["prompt_content"] = prompt["content"]
    state["pattern_content"] = pattern["content"]
    logger.info(f"Fetched prompt '{prompt_name}' and pattern '{pattern_name}'")
    return state

async def _node_assemble_prompt(state: TemplateGraphState) -> TemplateGraphState:
    """Combine user message, prompt template, and pattern document"""
    if state.get("error"):
        return state
    
    user_msg = state.get("user_message", "")
    prompt_content = state.get("prompt_content", "")
    pattern_content = state.get("pattern_content", "")
    
    assembled = f"""You are processing a user request with specific guidance and formatting requirements.

PROMPT TEMPLATE:
{prompt_content}

PATTERN DOCUMENT (use this format for your response):
{pattern_content}

USER REQUEST:
{user_msg}

INSTRUCTIONS:
1. Address the user's request while following the guidance in the PROMPT TEMPLATE
2. Structure your response to match the format shown in the PATTERN DOCUMENT
3. Be thorough and professional
4. Maintain consistency with the template requirements
"""
    
    state["assembled_prompt"] = assembled
    logger.info("Assembled composite prompt for template mode")
    return state

async def _node_generate_template_response(state: TemplateGraphState) -> TemplateGraphState:
    """Generate LLM response using the assembled prompt"""
    if state.get("error"):
        state["reply"] = f"Error: {state['error']}"
        state["provider"] = "error"
        return state
    
    assembled = state.get("assembled_prompt", "")
    history = state.get("conversation_history", [])
    
    try:
        # Call existing generate_ai_response with assembled prompt
        response, provider = await generate_ai_response(assembled, history)
        state["reply"] = response
        state["provider"] = provider
        logger.info(f"Generated template response using {provider}")
    except Exception as e:
        logger.error(f"Error generating template response: {e}")
        state["error"] = str(e)
        state["reply"] = f"Error generating response: {e}"
        state["provider"] = "error"
    
    return state

def build_template_graph():
    """Build the template-based response graph"""
    g = StateGraph(TemplateGraphState)
    g.add_node("fetch_resources", _node_fetch_resources)
    g.add_node("assemble_prompt", _node_assemble_prompt)
    g.add_node("generate_response", _node_generate_template_response)
    
    g.set_entry_point("fetch_resources")
    g.add_edge("fetch_resources", "assemble_prompt")
    g.add_edge("assemble_prompt", "generate_response")
    g.add_edge("generate_response", END)
    
    return g.compile()

_TEMPLATE_GRAPH = None

def get_template_graph():
    global _TEMPLATE_GRAPH
    if _TEMPLATE_GRAPH is None:
        _TEMPLATE_GRAPH = build_template_graph()
    return _TEMPLATE_GRAPH



# API endpoints
@app.get("/healthz", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    _, provider = get_ai_client()
    search_provider = "none"
    return HealthResponse(
        status="OK", 
        version="0.0.1",
        ai_provider=provider,
        search_provider=search_provider,
    )

@app.get("/")
async def root():
    """Root endpoint with service information."""
    _, provider = get_ai_client()
    return {
        "message": "E C Project Launchpad AI Service",
        "version": "0.0.1",
        "status": "running",
        "ai_provider": provider,
        "endpoints": {
            "health": "/healthz",
            "chat": "/chat",
            "graphs": {
                "chat": {
                    "health": "/graphs/chat/health",
                    "run": "/graphs/chat/run",
                }
            }
        }
    }

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """Main chat endpoint for AI responses."""
    try:
        # Generate AI response
        response, provider = await generate_ai_response(
            request.message, 
            request.conversation_history
        )
        
        return ChatResponse(
            response=response,
            provider=provider,
            processing_time=0.0  # TODO: Add timing
        )
        
    except Exception as e:
        logger.error(f"Chat endpoint error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process chat request: {str(e)}"
        )

# Audit graph endpoints removed in cleanup

# Chat graph endpoints (for service verification)
@app.get("/graphs/chat/health")
async def chat_graph_health():
    try:
        state: ChatGraphState = {"message": "ping", "conversation_history": []}
        out = get_chat_graph().invoke(state)
        ok = isinstance(out.get("reply"), str)
        return {"ok": ok, "provider": out.get("provider")}
    except Exception as e:
        logger.exception("Chat graph health failed")
        return {"ok": False, "error": str(e)}

@app.post("/graphs/chat/run", response_model=ChatGraphResponse)
async def chat_graph_run(req: ChatGraphRequest):
    try:
        # 1) Run minimal graph as a sanity check (synchronous echo)
        state: ChatGraphState = {"message": req.message, "conversation_history": req.conversation_history}
        _ = get_chat_graph().invoke(state)
        # 2) Produce real response via provider clients
        # generate_ai_response accepts dict-style history items
        real_reply, provider = await generate_ai_response(req.message, req.conversation_history)
        return ChatGraphResponse(ok=True, reply=real_reply, provider=provider)
    except Exception as e:
        logger.exception("Chat graph run failed")
        raise HTTPException(status_code=500, detail=str(e))

# Template graph endpoints
@app.get("/graphs/template/health")
async def template_graph_health():
    """Health check for template graph"""
    try:
        # Quick validation that resources exist
        prompt = await fetch_prompt_by_name("cat")
        pattern = await fetch_pattern_doc_by_name("catDoc")
        ok = bool(prompt and pattern)
        return {
            "ok": ok,
            "prompt_found": bool(prompt),
            "pattern_found": bool(pattern)
        }
    except Exception as e:
        logger.exception("Template graph health failed")
        return {"ok": False, "error": str(e)}

@app.post("/graphs/template/run", response_model=TemplateGraphResponse)
async def template_graph_run(req: TemplateGraphRequest):
    """Run template-based response graph"""
    try:
        state: TemplateGraphState = {
            "user_message": req.message,
            "conversation_history": req.conversation_history
        }
        result = await get_template_graph().ainvoke(state)
        
        if result.get("error"):
            raise HTTPException(status_code=500, detail=result["error"])
        
        return TemplateGraphResponse(
            ok=True,
            reply=result.get("reply", ""),
            provider=result.get("provider", "unknown")
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Template graph run failed")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
