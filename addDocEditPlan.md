# Project Overview Edit-in-Modal Plan

## Objectives

- **Enable in-place editing**: When the user does not approve the generated Project Overview, open a modal with a rich text editor preloaded with that overview.
- **Persist revision**: Save the edited overview back to the conversation message store so it becomes the authoritative source.
- **Advance flow safely**: After saving, close the modal, replace the overview in the chat UI, and automatically proceed to generate the Technical Overview using the revised text.
- **Minimize regressions**: Make changes that are small, isolated, and compatible with the existing `langgraph-service` graph and backend APIs.

## Context and Current Flow

- The Template Graph in `langgraph-service/app.py` generates:
  - A Project Overview (assistant message), then
  - An approval question: `"Do you approve of the Project Overview as written?"` (assistant message).
- The graph advances to the Technical Overview only when the next user input is affirmative (e.g., "Yes").
- The graph uses `_find_latest_assistant_before_question(history, PROJECT_APPROVAL_Q)` to retrieve the approved Project Overview from `conversation_history`.
- The backend API (`backend-api/src/routes/conversations.js`) persists messages and forwards the last messages to `langgraph-service` per request. It also inserts the approval question as a separate assistant message immediately after the overview.
- The frontend (`frontend/src/components/ChatPanel.jsx`) renders messages and already includes TipTap dependencies, but it does not currently render approve/edit controls.

## High-Level Design (Minimal Risk)

- **Frontend-only UI control point**: Detect the approval question in the rendered messages list and show an inline control with two actions: [Approve] and [Edit].
- **Edit path**: When [Edit] is clicked, open a modal rich text editor preloaded with the immediate previous assistant message (the Project Overview). On [Save], PATCH the message content via a new backend endpoint, refresh the conversation, then automatically post an affirmative message to advance the graph.
- **No changes to `langgraph-service`**: By persisting the edited overview in the DB and then sending "Yes", the graph will pick up the updated overview from `conversation_history` without modification.

## Trigger Detection and Target Message

- The approval question literal is defined in `langgraph-service/app.py` as `PROJECT_APPROVAL_Q = "Do you approve of the Project Overview as written?"`.
- The backend stores the approval question as a separate assistant message immediately after the Project Overview.
- In the UI, for any assistant message with content equal to `PROJECT_APPROVAL_Q`, render actions beneath it.
- The message to edit is the assistant message that immediately precedes that approval question (same conversation, next earlier message index).

## Frontend Plan

Files to touch:
- `frontend/src/components/ChatPanel.jsx`
- `frontend/src/components/ProjectOverviewEditor.jsx` (new)

Changes:
- **Render Approve/Edit controls** under any assistant message whose content equals the approval question string.
- **Open Rich Text Editor modal** (`ProjectOverviewEditor.jsx`) using TipTap (`@tiptap/react`, `@tiptap/starter-kit`). Preload with the previous assistant message content (Project Overview).
- **Save flow**:
  - Call `PATCH /api/conversations/:conversationId/messages/:messageId` with the edited content targeting the Project Overview message ID.
  - On success: refresh messages (`selectConversation(conversationId)`).
  - Then automatically send an affirmative user message (e.g., `"Yes"`) via the existing chat send path so the backend routes to `/graphs/template/run` and advances `stage="technical_overview"`.
- **Cancel**: Close modal without action.

Notes:
- The UI must know `conversationId` and the `messageId` of the Project Overview. The message IDs are available from the backend’s message list; ensure the message list rendered in `ChatPanel.jsx` keeps the message IDs.
- Keep the detection string centralized to avoid drift with `langgraph-service`. Consider a small constants module in the frontend for the approval question literal.

## Backend Plan

Files to touch:
- `backend-api/src/routes/conversations.js`

Changes:
- **Add PATCH endpoint**: `PATCH /:conversationId/messages/:messageId`
  - Verify conversation ownership (`user_id`) and that the message belongs to the conversation.
  - Only allow editing messages where `role='assistant'` and content is not the approval question itself (to avoid editing control prompts).
  - Update `messages.content` and bump the parent conversation `updated_at`.
- No changes to existing POST chat or conversation endpoints.
- No changes to `langgraph-service/app.py`.

Security/Validation:
- Ensure the authenticated user owns the conversation.
- Block edits to messages not in the conversation or with `role!='assistant'`.
- Block edits where `content` equals the approval question literal.

## Data Flow (Edit Path)

1. Assistant posts:
   - Message A (assistant): Project Overview
   - Message B (assistant): `PROJECT_APPROVAL_Q`
2. User clicks [Edit] under Message B.
3. UI locates Message A, opens modal preloaded with A’s content.
4. User clicks [Save].
5. UI calls `PATCH /api/conversations/:conversationId/messages/:messageId` targeting A with edited content.
6. On success, UI refreshes the conversation (A now shows revised content).
7. UI auto‑sends an affirmative message (e.g., "Yes").
8. Backend forwards history (with revised A) to `langgraph-service` `/graphs/template/run`.
9. Template graph sets `stage="technical_overview"` and uses the revised A (via `_find_latest_assistant_before_question`).
10. Assistant returns the Technical Overview and (if applicable) its approval question next.

## Edge Cases and Behavior

- **Cancel**: Modal closes, nothing persists, approval state unchanged.
- **Multiple edits**: Allow re-opening the modal as long as the approval question remains the latest approval gate. After advancing to technical overview, hide edit controls for the already-approved step.
- **Streaming**: The edit control is only rendered after full assistant messages (overview + approval question) exist; no streaming changes needed.
- **Race conditions**: Disable Approve/Edit buttons while PATCH is in-flight. Ensure PATCH completes and conversation is refreshed before auto-sending "Yes".
- **Sanitization**: TipTap content is treated as markdown/plain text for storage (consistent with current usage). The frontend already uses `react-markdown` with `rehype-sanitize` for display.

## Testing Plan

- **Frontend unit tests**:
  - Selector logic for identifying `PROJECT_APPROVAL_Q` and preceding message.
  - Modal lifecycle (open, preload content, save, cancel).
  - Button disabled states during save.
- **Backend unit tests**:
  - `PATCH` permissions (ownership), role constraints, and approval-question exclusion.
  - Successful content update and conversation timestamp bump.
- **Integration tests**:
  - End-to-end: generate Project Overview, open editor, save changes, auto-approve, verify Technical Overview reflects revised content.
- **UX acceptance**:
  - Keyboard/screen reader accessibility for modal.
  - Mobile layout unaffected.
  - No regressions to normal chat or non-template mode.

## Rollout Strategy

- **Backend-first**: Deploy the PATCH route; it is unused until the UI calls it.
- **Feature flag (optional)**: Gate the Edit UI in the frontend behind an env or config flag for staged rollout.
- **Monitoring**: Log PATCH invocations and failures; capture errors on auto-approve step.

## Concrete Change List (for implementation phase)

- **Frontend**
  - Update `frontend/src/components/ChatPanel.jsx`:
    - Detect assistant message content equal to `"Do you approve of the Project Overview as written?"` and render approve/edit controls.
    - Wire [Edit] to open `ProjectOverviewEditor` with previous assistant message content and id.
    - On [Save]: call new PATCH endpoint, refresh, then send "Yes" message.
  - Add `frontend/src/components/ProjectOverviewEditor.jsx`:
    - TipTap-based editor with Save/Cancel.
    - Props: `initialContent`, `onSave(content)`, `onCancel()`.
  - Optional: `frontend/src/lib/constants.js` for approval question literals to avoid string drift.

- **Backend**
  - Update `backend-api/src/routes/conversations.js`:
    - Add `PATCH /:conversationId/messages/:messageId` to update assistant message content, with ownership and validation.

- **No changes** to `langgraph-service/app.py` needed.

## Open Questions / Assumptions

- Are there any other approval gates that should support the same edit-in-modal flow (e.g., Technical Overview)? The pattern supports extending this approach by targeting the message prior to the corresponding approval question.
- Should the approval question string be localized or configurable? If so, surface it from the backend or centralize in a shared constants module.
- What is the maximum message size for edited content? If limits exist, enforce and provide UX feedback in the modal.

---

This plan confines changes to a small PATCH endpoint and localized frontend UI, leveraging the existing graph logic to consume the revised Project Overview from persisted conversation history. This keeps the risk of regressions low while enabling a powerful editing experience.

