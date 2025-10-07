  - Select by id:
    ```sql
    SELECT id, name, content, created_at, updated_at FROM prompts WHERE id = $1
    ```
# Prompts Feature Development Plan

This plan adds a new Prompts tab to the application, enabling users to create, view, edit, and delete reusable prompts stored in Postgres.

The implementation is staged to minimize regressions and keep the UI consistent with current patterns (Tailwind), with an option to introduce MUI selectively for dialogs and autosizing text fields.

## Objectives

- Add a new navigation tab: `Prompts` (to the right of existing tabs) in `frontend/src/components/Dashboard.jsx`.
- Provide a "New Prompt" button at the top of the page.
- Clicking "New Prompt" opens a dialog with two fields:
  - Name (single-line input)
  - Prompt (dynamic, auto-resizing text input)
  - Save button (persists to DB)
- Create a new `prompts` table in Postgres with a unique identifier per prompt.
- On page load, fetch and display all prompts in a scrollable list.
- Each prompt item includes Edit (rich text editor) and Delete actions.
- Maintain current Tailwind styling; optionally introduce MUI for improved UX components.

## Data Model

Table: `prompts`

Columns:
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `name` TEXT NOT NULL
- `content` TEXT NOT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT `now()`
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT `now()`

Indexes:
- Index on `created_at` for ordering

Extensions:
- Ensure `pgcrypto` extension is enabled for `gen_random_uuid()`.

Migration file: `scripts/migrate/008_create_prompts.sql`

```sql
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompts_created_at ON prompts (created_at DESC);

COMMIT;
```

## Backend API

Add a new router: `backend-api/src/routes/prompts.js`

- All routes secured by existing `authMiddleware`.
- JSON payloads; validate inputs server-side.

Endpoints:
- `GET /prompts`
  - Returns list of prompts ordered by `created_at DESC`.
- `GET /prompts/:id`
  - Returns a single prompt by UUID `id`.
- `POST /prompts`
  - Body: `{ name: string, content: string }`
  - Creates a new prompt; returns `{ id, name, content, createdAt, updatedAt }`.
- `PUT /prompts/:id`
  - Body: `{ name?: string, content?: string }`
  - Updates fields; sets `updated_at = now()`; returns updated prompt.
- `DELETE /prompts/:id`
  - Deletes prompt; returns `{ ok: true }`.

Integration:
- Register the router in `backend-api/src/server.js` (or wherever routes are composed):
  - `app.use('/prompts', promptsRouter);`

DB layer:
- Use existing `pool` from `backend-api/src/db/pool.js`.
- Parameterized queries.
- Map DB columns to camelCase keys in JSON.

## Frontend UI

Location: `frontend/src/components/`

New components:
- `Prompts.jsx`: main page
  - Header with page title and a `New Prompt` button (primary style)
  - List of prompts (infinite scroll not required initially; simple scroll/overflow)
  - Each prompt card shows `name`, a snippet of `content`, `createdAt` (relative), `Edit` and `Delete` controls
  - Fetch prompts on mount via `/api/prompts` (polling not necessary beyond initial load unless desired; if polling is required, use a 30s interval with cleanup)
- `PromptDialog.jsx`: modal dialog to create a new prompt
  - Fields: Name (input), Prompt (auto-resize textarea)
  - Save button creates prompt and closes dialog on success
- `PromptEditor.jsx`: inline editor or modal for editing (Phase 2 includes rich text)

Shared API helper (frontend):
- Add `frontend/src/lib/promptsApi.js` to expose reusable functions for any component/page:
  - `list(): Promise<Prompt[]>` → GET `/api/prompts`
  - `get(id: string): Promise<Prompt>` → GET `/api/prompts/:id`
  - `create({ name, content }): Promise<Prompt>` → POST `/api/prompts`
  - `update(id, patch): Promise<Prompt>` → PUT `/api/prompts/:id`
  - `remove(id): Promise<{ ok: true }>` → DELETE `/api/prompts/:id`
  - Optional lightweight in-memory cache and invalidation on create/update/delete

Navigation:
- Modify `Dashboard.jsx` to add a `Prompts` tab button to the right of the existing tabs (Chat, Status). Follow the same pattern as existing tabs by extending the `activeTab` state with `prompts` option.

Autosizing prompt field:
- Option A (no external deps): tailwind-styled `<textarea>` with `onInput` handler to adjust height (`e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'`).
- Option B (MUI): `@mui/base/TextareaAutosize` for smoother UX; requires adding MUI packages and ThemeProvider (see below).

Rich text editor (Phase 2):
- Option A: TipTap (`@tiptap/react`) with a minimal toolbar for bold/italic/lists; store HTML in `content`.
- Option B: Quill; similar tradeoffs.
- Initial rollout (Phase 1) can use plain text/Markdown; upgrade to RTE in Phase 2.

## Optional MUI Integration (incremental)

If we adopt MUI for dialog and autosize:
- Install packages at repo root:
  ```bash
  pnpm add -w @mui/material @emotion/react @emotion/styled @mui/base @mui/icons-material
  ```
- Wrap app with `ThemeProvider` in `frontend/src/App.jsx`.
- Use `Dialog`, `TextField`, `Button`, `TextareaAutosize` and icons for delete/edit.
- Keep Tailwind for layout and page structure.

## Backend Implementation Details

- Validation:
  - `name`: non-empty, max length (e.g., 200 chars)
  - `content`: non-empty
- Errors: consistent JSON `{ error: string }`
- Security: All endpoints behind `authMiddleware`.
- SQL examples:
  - Insert:
    ```sql
    INSERT INTO prompts (name, content)
    VALUES ($1, $2)
    RETURNING id, name, content, created_at, updated_at
    ```
  - Update:
    ```sql
    UPDATE prompts SET
      name = COALESCE($1, name),
      content = COALESCE($2, content),
      updated_at = now()
    WHERE id = $3
    RETURNING id, name, content, created_at, updated_at
    ```

## Frontend Implementation Details

- State and data fetching in `Prompts.jsx`:
  - `useEffect` on mount to `fetch('/api/prompts')`
  - Store in state; render cards with Tailwind
  - `New Prompt` opens `PromptDialog`
  - On save, POST to `/api/prompts`, prepend or refetch list
  - `Edit` opens `PromptEditor` (Phase 2 rich text)
  - `Delete` shows confirm then DELETE `/api/prompts/:id`, update list
- Accessibility:
  - Focus trap for dialog
  - Labels for inputs
  - Keyboard interactions for save/cancel

## Testing & Validation

- Migration runs successfully and `prompts` table exists (Adminer check)
- Backend endpoints:
  - Unit tests or manual curl checks for CRUD
- Frontend:
  - Manual flows: create/edit/delete, autosize behavior, list rendering
  - Auth required paths verified

## Rollout Plan

Phase 1 (MVP):
- Migration `008_create_prompts.sql`
- Backend routes for CRUD
- Include `GET /prompts/:id` for programmatic access
- Frontend `Prompts` tab with list
- Add shared client utility `frontend/src/lib/promptsApi.js` (list/get/create/update/delete)
- `New Prompt` dialog using Tailwind or MUI TextareaAutosize
- Plain text content persistence

Phase 2 (Enhancements):
- Introduce TipTap (or chosen RTE) for editing
- Add search/filter, pagination, and better metadata (tags)
- Add optimistic updates and skeleton loaders

## Files to add/update

- `scripts/migrate/008_create_prompts.sql` (add)
- `backend-api/src/routes/prompts.js` (add)
- `backend-api/src/server.js` or router index to mount `/prompts` (update)
- `frontend/src/components/Prompts.jsx` (add)
- `frontend/src/components/PromptDialog.jsx` (add)
- `frontend/src/components/PromptEditor.jsx` (add, Phase 2)
- `frontend/src/components/Dashboard.jsx` (update: add Prompts tab and view)
- Optional MUI setup: `frontend/src/App.jsx` ThemeProvider (update)

## Risks and Mitigations

- UI regressions in `Dashboard.jsx` tabs
  - Keep changes localized; follow existing pattern for tabs
- DB migration ordering
  - Use `008_create_prompts.sql` after `007_drop_audit.sql`
- Bundle size if MUI + RTE added
  - Start minimal; lazy-load editor if needed

## Success Criteria

- Users can create, view, edit, and delete prompts persistently
- Autosizing prompt input delivers good UX for long texts
- No regressions in existing Auth/Chat/Status flows
