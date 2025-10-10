import React, { useEffect, useMemo, useRef, useState } from "react";
import { useConversations } from "../contexts/ConversationProvider";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import ProjectOverviewEditor from "./ProjectOverviewEditor";

/**
 * Drop‑in Chat UI (React + Tailwind)
 * -------------------------------------------------
 * - No external UI libraries required (Tailwind only)
 * - Mobile-first, responsive, dark‑mode friendly
 * - Modern look: glassy header, rounded bubbles, subtle shadows
 * - Streaming-ready (shows a typing indicator when isStreaming=true)
 * - Keyboard UX: Enter=send, Shift+Enter=new line
 * - Easy integration: wire your API to onSend/onStop (see props)
 *
 * Usage:
 *   <ChatPanel
 *      title="Assistant"
 *      messages={messages}
 *      isStreaming={isStreaming}
 *      onSend={handleSend}
 *      onStop={handleStop}
 *   />
 *
 * Message shape expected:
 *   { id: string, role: 'user' | 'assistant' | 'system', content: string }
 */

// -----------------------------
// Helpers
// -----------------------------
const uid = () => Math.random().toString(36).slice(2);

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

async function safeText(resp) {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

// Simple auto-resizing textarea hook
function useAutosizeTextArea(textareaRef, value) {
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto"; // reset to auto to measure correctly
    el.style.height = el.scrollHeight + "px";
  }, [value, textareaRef]);
}

// -----------------------------
// Message Bubble
// -----------------------------
function MessageBubble({ role, content }) {
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const isSystem = role === "system";

  return (
    <div
      className={classNames(
        "w-full flex gap-3",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="shrink-0 select-none">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 shadow-sm ring-1 ring-black/5 flex items-center justify-center text-white text-sm font-medium">
            {isAssistant ? "A" : isSystem ? "S" : "?"}
          </div>
        </div>
      )}

      <div className={classNames("min-w-0 max-w-[85%] sm:max-w-[70%]")}>
        <div
          className={classNames(
            "rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm",
            isUser && "bg-blue-600 text-white rounded-tr-sm shadow-blue-600/20",
            isAssistant &&
              "bg-white/80 dark:bg-zinc-900/80 text-zinc-900 dark:text-zinc-100 ring-1 ring-zinc-950/5 dark:ring-white/10 backdrop-blur",
            isSystem && "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
          )}
        >
          <RichContent text={content} />
        </div>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="shrink-0 select-none">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-white flex items-center justify-center text-sm font-medium shadow-sm ring-1 ring-black/5">
            U
          </div>
        </div>
      )}
    </div>
  );
}

// Markdown renderer for chat messages
function RichContent({ text }) {
  return (
    <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none">
      <ReactMarkdown
        // Support GitHub-flavored Markdown (tables, task lists, etc.)
        remarkPlugins={[remarkGfm]}
        // Allow inline HTML in Markdown, then sanitize it
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={{
          // Custom code block styling
          pre: ({ node, ...props }) => (
            <pre
              className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950 text-zinc-50 text-[13px] p-3"
              {...props}
            />
          ),
          // Custom inline code styling
          code: ({ node, inline, ...props }) =>
            inline ? (
              <code
                className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-[13px] font-mono"
                {...props}
              />
            ) : (
              <code {...props} />
            ),
          // Remove default margins from paragraphs for better spacing
          p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
          // Style headings
          h1: ({ node, ...props }) => <h1 className="text-xl font-bold mb-2 mt-4 first:mt-0" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-base font-bold mb-1.5 mt-2 first:mt-0" {...props} />,
          h4: ({ node, ...props }) => <h4 className="text-sm font-bold mb-1 mt-2 first:mt-0" {...props} />,
          // Style lists
          ul: ({ node, ...props }) => <ul className="my-2 ml-4 list-disc" {...props} />,
          ol: ({ node, ...props }) => <ol className="my-2 ml-4 list-decimal" {...props} />,
          li: ({ node, ...props }) => <li className="mb-1" {...props} />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

// -----------------------------
// Typing Indicator (streaming)
// -----------------------------
function TypingDots() {
  return (
    <div className="inline-flex items-center gap-1 px-3 py-2 rounded-full bg-white/70 dark:bg-zinc-900/70 ring-1 ring-zinc-950/5 dark:ring-white/10 shadow-sm">
      <span className="sr-only">Assistant is typing</span>
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.2s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce [animation-delay:-0.1s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" />
    </div>
  );
}

// -----------------------------
// Composer
// -----------------------------
function Composer({
  disabled,
  onSend,
  onStop,
  isStreaming,
  placeholder = "Message…",
}) {
  const [value, setValue] = useState("");
  const [isDark, setIsDark] = useState(false);
  const ref = useRef(null);
  useAutosizeTextArea(ref, value);

  useEffect(() => {
    const mql =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    const check = () => {
      const htmlDark = document.documentElement.classList.contains("dark");
      setIsDark(htmlDark || (mql ? mql.matches : false));
    };
    check();
    if (mql && mql.addEventListener) {
      mql.addEventListener("change", check);
      return () => mql.removeEventListener("change", check);
    }
  }, []);

  function submit() {
    const text = value.trim();
    if (!text) return;
    onSend?.(text);
    setValue("");
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="w-full cp-composer-root">
      {/* Scoped hard overrides to defeat legacy/global CSS */}
      <style>{`
        .cp-composer-root .cp-composer-textarea {
          writing-mode: horizontal-tb !important;
          text-orientation: mixed !important;
          transform: none !important;
          direction: ltr !important;
          white-space: pre-wrap !important;
          word-break: break-word !important;
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          flex: 1 1 auto !important;
        }
        .cp-composer-root .cp-composer-button { flex: 0 0 auto !important; }
      `}</style>
      <div className="flex items-center gap-2 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-950/70 backdrop-blur px-3 py-2 shadow-sm">
        <div className="flex flex-row items-stretch gap-2 w-full">
          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            tabIndex={0}
            className="cp-composer-textarea block max-h-40 min-h-[44px] w-full flex-1 min-w-0 resize-none rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 outline-none placeholder-zinc-400 text-[15px] leading-6 caret-blue-600 selection:bg-blue-200 dark:selection:bg-blue-800/60 pointer-events-auto whitespace-pre-wrap break-words"
            style={{
              color: isDark ? "#ffffff" : "#111111",
              WebkitTextFillColor: isDark ? "#ffffff" : "#111111",
              background: isDark ? "#0a0a0a" : "#ffffff",
              writingMode: "horizontal-tb",
              textOrientation: "mixed",
              transform: "none",
              direction: "ltr",
              letterSpacing: "normal",
              lineHeight: "1.5",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={() => onStop?.()}
              className="cp-composer-button flex-none inline-flex items-center gap-1 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-3 py-2 text-sm font-medium shadow hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-400"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              className="cp-composer-button flex-none inline-flex items-center gap-1 rounded-xl bg-blue-600 text-white px-3 py-2 text-sm font-medium shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400"
            >
              Send
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        Shift+Enter for new line
      </p>
    </div>
  );
}

// -----------------------------
// Main Panel
// -----------------------------
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
  const [templateMode, setTemplateMode] = useState(false);

  async function onSend(text) {
    try {
      // Check for /template command
      if (text.trim() === "/template") {
        // Enter template mode and immediately request instructions from the graph
        setTemplateMode(true);

        // Ensure a conversation exists
        let convId = currentConversation?.id;
        if (!convId) {
          const newConv = await createNewConversation("New Chat");
          if (!newConv) return;
          convId = newConv.id;
        }

        // Ask the template graph to start by instructing the user to paste notes
        setIsStreaming(true);
        const resp = await fetch(`/api/conversations/${convId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            message: "/template",
            useTemplate: true,
          }),
        });

        if (resp.ok) {
          await selectConversation(convId);
        } else {
          console.error("Template start failed", await safeText(resp));
        }

        setIsStreaming(false);
        // Keep templateMode true so the next user message (notes) triggers generation
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
          useTemplate: templateMode
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
      setTemplateMode(false); // Reset on error
    } finally {
      setIsStreaming(false);
    }
  }

  function onStop() {
    // If we implement streaming via fetch + AbortController, abort here
    setIsStreaming(false);
  }

  return (
    <ChatPanel
      embedded={embedded}
      title={currentConversation?.title || "Assistant"}
      messages={messages}
      isStreaming={isStreaming}
      onSend={onSend}
      onStop={onStop}
      templateMode={templateMode}
      conversations={conversations}
      currentConversation={currentConversation}
      onNewChat={async () => {
        const conv = await createNewConversation("New Chat");
        if (conv?.id) await selectConversation(conv.id);
      }}
      onSelectConversation={async (id) => {
        if (!id) return;
        await selectConversation(id);
      }}
      onDeleteConversation={async (id) => {
        if (!id) return;
        const ok = window.confirm(
          "Delete this conversation? This cannot be undone.",
        );
        if (!ok) return;
        await deleteConversation(id);
      }}
      onRenameConversation={async (id) => {
        if (!id) return;
        const current = conversations.find((c) => c.id === id);
        const next = window.prompt(
          "Rename conversation:",
          current?.title || "New Chat",
        );
        if (next && next.trim()) {
          await updateConversationTitle(id, next.trim());
        }
      }}
    />
  );
}

export function ChatPanel({
  title = "Assistant",
  messages = [],
  isStreaming = false,
  onSend,
  onStop,
  embedded = false,
  templateMode = false,
  conversations = [],
  currentConversation = null,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
}) {
  const listRef = useRef(null);
  const firstScroll = useRef(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInitial, setEditorInitial] = useState("");
  const [editorMessageId, setEditorMessageId] = useState(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const PROJECT_APPROVAL_Q = "Do you approve of the Project Overview as written?";

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const behavior = firstScroll.current ? "auto" : "smooth";
    el.scrollTo({ top: el.scrollHeight, behavior });
    firstScroll.current = false;
  }, [messages, isStreaming]);

  // Sidebar item
  function SidebarItem({ conv, active, onClick, onDelete, onRename }) {
    return (
      <div
        className={classNames(
          "group w-full px-2 py-1.5 rounded-md transition-colors",
          active
            ? "bg-zinc-200/70 dark:bg-zinc-800/70"
            : "hover:bg-zinc-200/40 dark:hover:bg-zinc-800/40",
        )}
        title={conv.title || "New Chat"}
      >
        <div className="flex items-center justify-between gap-2">
          {/* Left: conversation select */}
          <button
            type="button"
            onClick={onClick}
            className="flex-1 min-w-0 text-left flex items-center gap-2 text-zinc-700 dark:text-zinc-300"
          >
            <div className="h-6 w-6 rounded-md bg-gradient-to-br from-zinc-600 to-zinc-800 text-white flex items-center justify-center text-[11px]">
              C
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {conv.title || "New Chat"}
              </div>
              {conv.last_message_at && (
                <div className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
                  {new Date(conv.last_message_at).toLocaleString()}
                </div>
              )}
            </div>
          </button>
          {/* Right: always-visible icon buttons */}
          <div className="flex items-center gap-1 flex-none">
            <button
              type="button"
              onClick={onRename}
              className="p-1 rounded-md text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
              aria-label="Rename conversation"
              title="Rename"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5.5v-1.42l8.06-8.06 1.42 1.42-8.06 8.06zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1 rounded-md text-red-600 hover:bg-red-100/70 dark:text-red-400 dark:hover:bg-red-900/30"
              aria-label="Delete conversation"
              title="Delete"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M9 3a1 1 0 0 0-1 1v1H5.5a.75.75 0 0 0 0 1.5H6v12.25A2.75 2.75 0 0 0 8.75 22h6.5A2.75 2.75 0 0 0 18 18.75V6.5h.5a.75.75 0 0 0 0-1.5H16V4a1 1 0 0 0-1-1H9Zm2.25 5.75a.75.75 0 0 0-1.5 0v8.5a.75.75 0 0 0 1.5 0v-8.5Zm3.5 0a.75.75 0 0 0-1.5 0v8.5a.75.75 0 0 0 1.5 0v-8.5Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        (embedded ? "h-full" : "h-[100svh]") +
        " w-full relative z-[60] bg-gradient-to-b from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 text-zinc-950 dark:text-zinc-100"
      }
    >
      {/* App Shell: Sidebar + Content */}
      <div className="h-full w-full flex">
        {/* Sidebar (md+) */}
        <aside className="hidden md:flex md:w-64 lg:w-72 xl:w-80 shrink-0 h-full border-r border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/40 backdrop-blur px-3 py-3">
          <div className="flex flex-col gap-3 w-full min-h-0">
            <div className="flex items-center justify-between px-1">
              <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                Conversations
              </div>
              <button
                type="button"
                onClick={() => onNewChat?.()}
                className="inline-flex items-center gap-1 rounded-md bg-blue-600 text-white px-2 py-1 text-xs font-medium shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400"
              >
                + New
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {conversations?.length ? (
                conversations.map((c) => (
                  <SidebarItem
                    key={c.id}
                    conv={c}
                    active={c.id === currentConversation?.id}
                    onClick={() => onSelectConversation?.(c.id)}
                    onDelete={() => onDeleteConversation?.(c.id)}
                    onRename={() => onRenameConversation?.(c.id)}
                  />
                ))
              ) : (
                <div className="text-xs text-zinc-500 dark:text-zinc-400 px-2 py-2">
                  No conversations yet.
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 h-full flex flex-col min-w-0">
          {/* Header (kept minimal) */}
          <header className="px-3 sm:px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-zinc-950/40 border-b border-zinc-200/60 dark:border-zinc-800/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow ring-1 ring-black/5" />
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-semibold tracking-tight">
                    {title}
                  </h1>
                  {templateMode && (
                    <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                      Template Mode
                    </span>
                  )}
                </div>
              </div>
              {/* Mobile new chat shortcut */}
              <div className="md:hidden">
                <button
                  type="button"
                  onClick={() => onNewChat?.()}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 text-white px-2.5 py-1.5 text-xs font-medium shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400"
                >
                  + New Chat
                </button>
              </div>
            </div>
          </header>

          {/* Messages */}
          <div className="flex-1 min-h-0">
            <div
              ref={listRef}
              className="h-full overflow-y-auto py-4 space-y-4 pb-24 px-3 sm:px-6"
            >
              {messages.map((m, idx) => {
                const isApprovalQ = m.role === "assistant" && m.content === PROJECT_APPROVAL_Q;
                const prev = idx > 0 ? messages[idx - 1] : null;
                const canEditPrev = isApprovalQ && prev && prev.role === "assistant";
                return (
                  <div key={m.id} className="space-y-2">
                    <MessageBubble role={m.role} content={m.content} />
                    {isApprovalQ && (
                      <div className="pl-11">{/* align with assistant avatar */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isSavingEdit || isStreaming}
                            onClick={() => onSend?.("Yes")}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-2.5 py-1.5 text-xs font-medium shadow hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-400 disabled:opacity-60"
                          >
                            Approve
                          </button>
                          {canEditPrev && (
                            <button
                              type="button"
                              disabled={isSavingEdit || isStreaming}
                              onClick={() => {
                                setEditorMessageId(prev.id);
                                setEditorInitial(prev.content || "");
                                setEditorOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-md bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 px-2.5 py-1.5 text-xs font-medium shadow hover:bg-zinc-300 dark:hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-400 disabled:opacity-60"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {isStreaming && (
                <div className="w-full flex justify-start">
                  <TypingDots />
                </div>
              )}
            </div>
          </div>

          {/* Composer (non-sticky to avoid overlay issues) */}
          <div className="px-3 sm:px-6 pb-5">
            <div className="sticky bottom-3">
              <Composer
                disabled={false}
                onSend={onSend}
                onStop={onStop}
                isStreaming={isStreaming}
            placeholder={templateMode ? "Paste your project notes here…" : "Message…"}
              />
            </div>
          </div>
        </div>
      </div>
      {/* Editor Modal */}
      <ProjectOverviewEditor
        open={editorOpen}
        initialContent={editorInitial}
        onCancel={() => setEditorOpen(false)}
        onSave={async (nextContent) => {
          if (!currentConversation?.id || !editorMessageId) return;
          try {
            setIsSavingEdit(true);
            const resp = await fetch(`/api/conversations/${currentConversation.id}/messages/${editorMessageId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ content: nextContent }),
            });
            if (!resp.ok) {
              console.error("Failed to update message", await resp.text());
              setIsSavingEdit(false);
              return;
            }
            // Refresh to load updated content
            await onSelectConversation?.(currentConversation.id);
            setEditorOpen(false);
            // Auto-approve to advance
            await onSend?.("Yes");
          } catch (e) {
            console.error("Error saving edited overview", e);
          } finally {
            setIsSavingEdit(false);
          }
        }}
      />
    </div>
  );
}
