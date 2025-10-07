# Slash Command Feature: /template Implementation Plan

## Overview

Add a `/template` slash command to the chat interface that triggers a specialized Langgraph graph. This graph will combine the user's prompt with a stored prompt template ("cat") and a pattern document ("catDoc") to generate structured responses.

## Current Architecture

### Frontend Flow
1. User types message in `ChatPanel.jsx` (Composer component)
2. `onSend()` calls `/api/conversations/:id/chat` via `sendMessage()`
3. Messages stored in `messages` table

### Backend Flow
1. `backend-api/src/routes/conversations.js` receives POST to `/:conversationId/chat`
2. Calls `generateLangGraphResponse(message, history, userId, conversationId)`
3. Forwards to `langgraph-service` at `/graphs/chat/run` or `/chat`
4. Langgraph returns response
5. Response saved to DB as assistant message

### Langgraph Service (`langgraph-service/app.py`)
- Current graph: Simple echo + OpenAI/Anthropic call
- Endpoint: `/graphs/chat/run`
- Uses `generate_ai_response()` which builds messages array and calls LLM

## New Feature Requirements

### User Experience
1. User types `/template` in chat and hits enter
2. System activates template mode
3. Next user message is processed with:
   - User's actual prompt
   - Stored prompt "cat" (from `prompts` table)
   - Pattern document "catDoc" (from `pattern_docs` table)
   - Instructions to align with prompt and format per pattern
4. After response, return to normal mode

### Technical Flow
1. Frontend detects `/template` command
2. Sets a flag/state indicating next message should use template mode
3. Next message sent with `useTemplate: true` flag
4. Backend routes to new template graph endpoint
5. Template graph:
   - Fetches prompt by name "cat" from DB
   - Fetches pattern doc by name "catDoc" from DB
   - Constructs composite prompt
   - Calls LLM
   - Returns formatted response
6. Reset template mode flag

## Implementation Plan

### Phase 1: Database Access in Langgraph Service

**File**: `langgraph-service/app.py`

**Changes**:
1. Add database connection setup
   - Install `asyncpg` Python package for async Postgres access
   - Add database URL to environment variables
   - Create connection pool on startup

2. Add helper functions:
   ```python
   async def fetch_prompt_by_name(name: str) -> Optional[Dict]:
       # Query: SELECT id, name, content FROM prompts WHERE name = $1
       # Return: {id, name, content} or None
   
   async def fetch_pattern_doc_by_name(name: str) -> Optional[Dict]:
       # Query: SELECT id, name, content FROM pattern_docs WHERE name = $1
       # Return: {id, name, content} or None
   ```

### Phase 2: Create Template Graph

**File**: `langgraph-service/app.py` (or new `langgraph-service/graphs/template_graph.py`)

**Graph Structure**:
```
StateGraph nodes:
1. fetch_resources: Load prompt "cat" and pattern "catDoc" from DB
2. assemble_prompt: Combine user message + prompt + pattern + instructions
3. generate_response: Call LLM with assembled prompt
4. END

State schema:
- user_message: str
- prompt_content: str
- pattern_content: str
- assembled_prompt: str
- final_response: str
- provider: str
```

**Implementation**:
```python
class TemplateGraphState(TypedDict, total=False):
    user_message: str
    conversation_history: List[Dict[str, str]]
    prompt_content: str
    pattern_content: str
    assembled_prompt: str
    reply: str
    provider: str
    error: Optional[str]

async def _node_fetch_resources(state: TemplateGraphState) -> TemplateGraphState:
    """Fetch the hardcoded prompt and pattern doc from database"""
    # Hardcoded names for Phase 1
    prompt_name = "cat"
    pattern_name = "catDoc"
    
    prompt = await fetch_prompt_by_name(prompt_name)
    pattern = await fetch_pattern_doc_by_name(pattern_name)
    
    if not prompt or not pattern:
        state["error"] = f"Missing resources: prompt={bool(prompt)}, pattern={bool(pattern)}"
        return state
    
    state["prompt_content"] = prompt["content"]
    state["pattern_content"] = pattern["content"]
    return state

async def _node_assemble_prompt(state: TemplateGraphState) -> TemplateGraphState:
    """Combine user message, prompt template, and pattern document"""
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
    return state

async def _node_generate_template_response(state: TemplateGraphState) -> TemplateGraphState:
    """Generate LLM response using the assembled prompt"""
    assembled = state.get("assembled_prompt", "")
    history = state.get("conversation_history", [])
    
    # Call existing generate_ai_response with assembled prompt
    response, provider = await generate_ai_response(assembled, history)
    
    state["reply"] = response
    state["provider"] = provider
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
```

### Phase 3: Add Template Endpoint

**File**: `langgraph-service/app.py`

**New Models**:
```python
class TemplateGraphRequest(BaseModel):
    message: str
    conversation_history: List[Dict[str, str]] = []

class TemplateGraphResponse(BaseModel):
    ok: bool
    reply: str
    provider: str
    meta: Dict[str, Any] = {}
```

**New Endpoints**:
```python
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
    except Exception as e:
        logger.exception("Template graph run failed")
        raise HTTPException(status_code=500, detail=str(e))
```

### Phase 4: Backend Route Modification

**File**: `backend-api/src/routes/conversations.js`

**Changes**:
1. Modify chat endpoint to accept `useTemplate` flag
2. Update `generateLangGraphResponse()` to support template graph

```javascript
// Chat endpoint modification
router.post("/:conversationId/chat", authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { message, useTemplate = false } = req.body;  // Add useTemplate flag

    // ... existing validation ...

    // Generate AI response using appropriate graph
    const aiResponse = await generateLangGraphResponse(
      message,
      conversationHistory,
      req.userId,
      conversationId,
      useTemplate  // Pass flag to generator
    );

    // ... rest of existing code ...
  }
});

// Update generateLangGraphResponse function signature
async function generateLangGraphResponse(
  userMessage,
  conversationHistory,
  userId,
  conversationId,
  useTemplate = false  // New parameter
) {
  const langGraphUrl =
    process.env.LANGGRAPH_SERVICE_URL || "http://langgraph.local:5000";
  
  try {
    const formattedHistory = conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Choose endpoint based on template flag
    let endpointPath;
    if (useTemplate) {
      endpointPath = "/graphs/template/run";
    } else {
      const useChatGraph = String(process.env.USE_CHAT_GRAPH || "true").toLowerCase() === "true";
      endpointPath = useChatGraph ? "/graphs/chat/run" : "/chat";
    }

    const response = await fetch(`${langGraphUrl}${endpointPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMessage,
        conversation_history: formattedHistory,
        // Only add these for non-template, non-graph mode
        ...(!useTemplate && endpointPath === "/chat" ? {
          user_id: userId,
          conversation_id: conversationId
        } : {})
      }),
    });

    // ... existing response handling ...
    
    const data = await response.json();
    if (useTemplate || endpointPath.includes("/graphs/")) {
      console.log(`Generated response via ${useTemplate ? 'template' : 'chat'} graph (provider=${data.provider})`);
      if (data.ok !== true) {
        throw new Error("Graph returned not ok");
      }
      return data.reply;
    } else {
      console.log(`Generated response using ${data.provider} provider`);
      return data.response;
    }
  } catch (error) {
    console.error("Error calling LangGraph service:", error);
    return generateFallbackResponse(userMessage);
  }
}
```

### Phase 5: Frontend Command Detection

**File**: `frontend/src/components/ChatPanel.jsx`

**Changes**:
1. Add state to track template mode
2. Detect `/template` command
3. Send flag with next message

```javascript
export default function ChatPanelDemo({ embedded = false }) {
  const {
    currentConversation,
    messages,
    createNewConversation,
    sendMessage,
    selectConversation,
    conversations,
    deleteConversation,
    updateConversationTitle,
  } = useConversations();

  const [isStreaming, setIsStreaming] = useState(false);
  const [templateMode, setTemplateMode] = useState(false);  // NEW: Track template mode

  async function onSend(text) {
    try {
      // Check for /template command
      if (text.trim() === "/template") {
        setTemplateMode(true);
        // Add a system message to indicate mode activated
        // (Optional: could show UI indicator instead)
        return;
      }

      // Ensure a conversation exists
      let convId = currentConversation?.id;
      if (!convId) {
        const newConv = await createNewConversation("New Chat");
        if (!newConv) return;
        convId = newConv.id;
      }

      // Send user message (updates UI immediately)
      await sendMessage(text);

      // Trigger AI response generation on backend
      setIsStreaming(true);
      const resp = await fetch(`/api/conversations/${convId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          message: text,
          useTemplate: templateMode  // NEW: Send template flag
        }),
      });

      // Reset template mode after use
      if (templateMode) {
        setTemplateMode(false);
      }

      // Whether ok or not, refresh messages for this conversation
      if (resp.ok) {
        await selectConversation(convId);
      } else {
        console.error("AI chat endpoint failed", await safeText(resp));
      }
    } catch (err) {
      console.error("Error sending/receiving chat:", err);
      setTemplateMode(false);  // Reset on error
    } finally {
      setIsStreaming(false);
    }
  }

  // ... rest of component ...

  return (
    <ChatPanel
      embedded={embedded}
      title={currentConversation?.title || "Assistant"}
      messages={messages}
      isStreaming={isStreaming}
      onSend={onSend}
      onStop={onStop}
      templateMode={templateMode}  // NEW: Pass to child for UI indicator
      // ... rest of props ...
    />
  );
}

// Update ChatPanel to show template mode indicator (optional)
export function ChatPanel({
  title = "Assistant",
  messages = [],
  isStreaming = false,
  onSend,
  onStop,
  embedded = false,
  templateMode = false,  // NEW
  // ... rest of props
}) {
  // ... existing code ...

  return (
    <div className={/* ... */}>
      {/* ... */}
      
      {/* Optional: Template mode indicator in header */}
      <header className="...">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 ..." />
            <h1 className="text-sm font-semibold tracking-tight">
              {title}
              {templateMode && (
                <span className="ml-2 inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                  Template Mode
                </span>
              )}
            </h1>
          </div>
          {/* ... */}
        </div>
      </header>
      
      {/* ... rest of component ... */}
    </div>
  );
}
```

### Phase 6: Environment & Dependencies

**File**: `langgraph-service/pyproject.toml`

Add dependency:
```toml
[tool.poetry.dependencies]
asyncpg = "^0.29.0"
```

**File**: `docker-compose.yml` (or langgraph-service Dockerfile ENV)

Add environment variable for DB connection:
```yaml
langgraph-service:
  # ... existing config ...
  environment:
    OPENAI_API_KEY: ${OPENAI_API_KEY:-}
    ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
    TAVILY_API_KEY: ${TAVILY_API_KEY:-}
    DATABASE_URL: postgresql://postgres:postgres@db.local:5432/e_c_project_launchpad  # NEW
```

**File**: `langgraph-service/app.py`

Add database pool initialization:
```python
import asyncpg
from contextlib import asynccontextmanager

# Global connection pool
db_pool = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown hooks"""
    global db_pool
    
    # Startup: create DB pool
    database_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db.local:5432/e_c_project_launchpad")
    try:
        db_pool = await asyncpg.create_pool(database_url, min_size=2, max_size=10)
        logger.info("Database connection pool created")
    except Exception as e:
        logger.error(f"Failed to create database pool: {e}")
    
    yield
    
    # Shutdown: close pool
    if db_pool:
        await db_pool.close()
        logger.info("Database connection pool closed")

app = FastAPI(title="E C Project Launchpad LangGraph Service", version="0.0.1", lifespan=lifespan)

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
```

## Testing Plan

### Unit Tests
1. **Database helpers**:
   - Test `fetch_prompt_by_name("cat")` returns expected prompt
   - Test `fetch_pattern_doc_by_name("catDoc")` returns expected doc
   - Test error handling for missing resources

2. **Template graph nodes**:
   - Test `_node_fetch_resources` with valid/invalid names
   - Test `_node_assemble_prompt` creates correct combined prompt
   - Test `_node_generate_template_response` calls LLM correctly

3. **Backend routing**:
   - Test `/conversations/:id/chat` with `useTemplate: false` (normal)
   - Test `/conversations/:id/chat` with `useTemplate: true` (template)

### Integration Tests
1. **End-to-end flow**:
   - User types `/template`
   - System activates template mode
   - User sends actual message
   - Backend routes to template graph
   - Graph fetches resources and generates response
   - Response saved and returned
   - Mode resets

2. **Edge cases**:
   - Missing "cat" prompt in database
   - Missing "catDoc" pattern in database
   - LangGraph service unavailable
   - Database unavailable
   - `/template` command in middle of conversation

### Manual Testing Checklist
- [ ] Create prompt named "cat" in Prompts UI
- [ ] Create pattern doc named "catDoc" in Pattern Docs UI
- [ ] Type `/template` in chat - verify mode indicator appears
- [ ] Send a test message - verify template-formatted response
- [ ] Send another normal message - verify standard response
- [ ] Check database for correct message storage
- [ ] Verify error handling if resources missing

## Rollout Phases

### Phase 1: Infrastructure (Days 1-2)
- Add database connection to langgraph-service
- Implement DB helper functions
- Add environment variables
- Test DB connectivity

### Phase 2: Graph Implementation (Days 3-4)
- Create template graph structure
- Implement graph nodes
- Add template endpoint
- Test graph execution

### Phase 3: Backend Integration (Day 5)
- Modify conversations router
- Update generateLangGraphResponse
- Test backend routing

### Phase 4: Frontend Implementation (Day 6)
- Add command detection
- Implement template mode state
- Add UI indicators
- Test user flow

### Phase 5: Testing & Documentation (Days 7-8)
- Comprehensive testing
- Fix bugs
- Document usage
- Create example prompts/patterns

## Future Enhancements

1. **Dynamic Resource Selection**:
   - Change from hardcoded "cat" and "catDoc" to user-selectable
   - Command syntax: `/template promptName patternName`

2. **Multiple Slash Commands**:
   - `/analyze` - analysis-focused template
   - `/summarize` - summary template
   - `/code` - code generation template

3. **Template Library**:
   - Pre-built prompt/pattern combinations
   - Shareable templates
   - Template versioning

4. **Advanced Features**:
   - Template variables/placeholders
   - Multi-step template workflows
   - Template chaining
   - Response post-processing

## Dependencies

### Python Packages (langgraph-service)
- `asyncpg` - Async Postgres driver
- Existing: `fastapi`, `langgraph`, `openai`, `anthropic`

### Environment Variables
- `DATABASE_URL` - Postgres connection string for langgraph-service

### Database
- Existing `prompts` table with test data ("cat")
- Existing `pattern_docs` table with test data ("catDoc")

## Success Criteria

- [ ] `/template` command activates template mode
- [ ] Template mode indicator visible to user
- [ ] Next message after `/template` uses template graph
- [ ] Template graph successfully fetches "cat" and "catDoc"
- [ ] Response formatted according to pattern
- [ ] Mode automatically resets after response
- [ ] Existing chat functionality unchanged
- [ ] Error handling graceful for missing resources
- [ ] Performance acceptable (<3s response time)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Database connection failures | High | Connection pool with retry logic, fallback to normal mode |
| Missing test data ("cat"/"catDoc") | High | Pre-deployment verification script, clear error messages |
| LLM context size limits | Medium | Truncate pattern/prompt if needed, warn user |
| User confusion about template mode | Low | Clear UI indicator, help text, `/help` command |
| Template mode stuck "on" | Medium | Auto-reset after use, manual reset command `/normal` |

## Open Questions

1. Should template mode persist across messages or one-shot?
   - **Decision**: One-shot (resets after single use) for simplicity
   
2. How to handle very large pattern documents?
   - **Decision**: Initial version hardcodes small examples; add truncation later

3. Should we log template usage for analytics?
   - **Decision**: Yes, add provider metadata to track template vs normal usage

4. Error UX: show error message in chat or as system notification?
   - **Decision**: Show as assistant message with error details

## Timeline Estimate

- **Total**: 8 days
- **Critical Path**: Database setup → Graph → Backend → Frontend
- **Buffer**: 2 days for unexpected issues
- **Target Completion**: 10 days from start
