import React, { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import {
  listPatternDocs,
  createPatternDoc,
  updatePatternDoc,
  deletePatternDoc,
} from "../lib/patternDocsApi";
import PatternDocDialog from "./PatternDocDialog";
import PromptEditor from "./PromptEditor";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import MuiAlert from "@mui/material/Alert";

const PatternDocs = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState({ open: false, message: "", severity: "success" });

  async function refresh() {
    setError("");
    try {
      const data = await listPatternDocs();
      setItems(data);
    } catch (e) {
      setError("Failed to load pattern documents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async ({ name, content }) => {
    const saved = await createPatternDoc({ name, content });
    setItems((prev) => [saved, ...prev]);
  };

  const handleUpdate = async ({ name, content }) => {
    if (!editItem) return;
    const id = editItem.id;
    // optimistic update
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, name, content } : p)));
    try {
      const saved = await updatePatternDoc(id, { name, content });
      setItems((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      setToast({ open: true, message: "Document updated", severity: "success" });
    } catch (e) {
      setToast({ open: true, message: e.message || "Failed to update", severity: "error" });
      refresh();
    }
  };

  const handleDelete = async (id) => {
    const toRemove = id;
    const prev = items;
    setItems((p) => p.filter((x) => x.id !== toRemove));
    try {
      await deletePatternDoc(toRemove);
      setToast({ open: true, message: "Document deleted", severity: "success" });
    } catch (e) {
      setItems(prev);
      setToast({ open: true, message: e.message || "Failed to delete", severity: "error" });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) =>
      (p.name || "").toLowerCase().includes(q) || (p.content || "").toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Pattern Documents</h2>
        <div className="flex-1" />
        <div className="w-full max-w-md">
          <TextField
            size="small"
            fullWidth
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={() => setOpenNew(true)}
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          New Document
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm mb-4">{error}</div>
      )}

      {loading ? (
        <div>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-600">No pattern documents yet. Click "New Document" to create one.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="bg-white rounded-lg shadow p-4 flex flex-col">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{p.name}</h3>
                  <p className="text-sm text-gray-500">{new Date(p.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="text-blue-600 hover:text-blue-800"
                    title="Edit"
                    onClick={() => setEditItem(p)}
                  >
                    <EditIcon fontSize="small" />
                  </button>
                  <button
                    className="text-red-600 hover:text-red-800"
                    title="Delete"
                    onClick={() => setConfirmId(p.id)}
                  >
                    <DeleteIcon fontSize="small" />
                  </button>
                </div>
              </div>
              <div
                className="mt-3 text-gray-800 break-words max-h-48 overflow-auto prose"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(p.content || "") }}
              />
            </div>
          ))}
        </div>
      )}

      <PatternDocDialog
        open={openNew}
        onClose={() => setOpenNew(false)}
        onSave={handleCreate}
        title="New Pattern Document"
        confirmLabel="Save"
      />

      <PromptEditor
        open={!!editItem}
        onClose={() => setEditItem(null)}
        onSave={handleUpdate}
        name={editItem?.name || ""}
        content={editItem?.content || ""}
        title="Edit Pattern Document"
        confirmLabel="Update"
      />

      <Dialog open={!!confirmId} onClose={() => setConfirmId(null)}>
        <DialogTitle>Delete Document</DialogTitle>
        <DialogContent>Are you sure you want to delete this document?</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmId(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              const id = confirmId;
              setConfirmId(null);
              handleDelete(id);
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <MuiAlert
          elevation={6}
          variant="filled"
          severity={toast.severity}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
        >
          {toast.message}
        </MuiAlert>
      </Snackbar>
    </div>
  );
};

export default PatternDocs;
