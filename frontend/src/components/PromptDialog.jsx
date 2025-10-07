import React, { useState, useEffect } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

const PromptDialog = ({ open, onClose, onSave, initialName = "", initialContent = "", title = "New Prompt", confirmLabel = "Save" }) => {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Write or paste your prompt here..." }),
    ],
    content: initialContent,
    autofocus: true,
    editorProps: {
      attributes: {
        class:
          "prose max-w-none min-h-[180px] border border-gray-300 rounded-md p-3 focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setError("");
    setSaving(false);
    if (editor) editor.commands.setContent(initialContent || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialName, initialContent]);

  const handleSave = async () => {
    setError("");
    const html = editor?.getHTML() || "";
    if (!name.trim() || !html.trim()) {
      setError("Name and prompt are required");
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), content: html });
      onClose();
    } catch (e) {
      setError(String(e.message || e) || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <div className="space-y-4">
          <TextField
            label="Name"
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
          />
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border border-gray-300 rounded-md p-2 bg-gray-50">
            <button
              type="button"
              className={`px-2 py-1 rounded ${editor?.isActive('bold') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              Bold
            </button>
            <button
              type="button"
              className={`px-2 py-1 rounded ${editor?.isActive('italic') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              Italic
            </button>
            <button
              type="button"
              className={`px-2 py-1 rounded ${editor?.isActive('bulletList') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              • List
            </button>
            <button
              type="button"
              className={`px-2 py-1 rounded ${editor?.isActive('orderedList') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            >
              1. List
            </button>
          </div>
          <EditorContent editor={editor} />
          {error && (
            <div className="rounded border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm">
              {error}
            </div>
          )}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving} variant="text">
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving} variant="contained">
          {saving ? "Saving..." : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PromptDialog;
