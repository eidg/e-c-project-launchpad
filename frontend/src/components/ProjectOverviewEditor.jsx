import React from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from "@mui/material";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

export default function ProjectOverviewEditor({ open, initialContent = "", onSave, onCancel }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Edit the Project Overview…" }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none dark:prose-invert min-h-[240px] p-3 border rounded-md border-zinc-300 dark:border-zinc-700 focus:outline-none",
      },
    },
  }, [open]);

  function handleSave() {
    if (!editor) return;
    const text = editor.getText(); // store as plain text to keep prompts clean
    onSave?.(text);
  }

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="md">
      <DialogTitle>Edit Project Overview</DialogTitle>
      <DialogContent>
        <div className="mt-2">
          {editor ? <EditorContent editor={editor} /> : null}
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Your edits will replace the generated Project Overview before proceeding to the Technical Overview.
        </p>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} variant="text">Cancel</Button>
        <Button onClick={handleSave} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
}
