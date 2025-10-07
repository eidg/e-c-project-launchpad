export async function listPatternDocs() {
  const res = await fetch("/api/pattern-docs", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to list pattern docs");
  return res.json();
}

export async function getPatternDoc(id) {
  const res = await fetch(`/api/pattern-docs/${encodeURIComponent(id)}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to get pattern doc");
  return res.json();
}

export async function createPatternDoc({ name, content }) {
  const res = await fetch("/api/pattern-docs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name, content }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to create pattern doc");
  return data;
}

export async function updatePatternDoc(id, patch) {
  const res = await fetch(`/api/pattern-docs/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to update pattern doc");
  return data;
}

export async function deletePatternDoc(id) {
  const res = await fetch(`/api/pattern-docs/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to delete pattern doc");
  return data;
}
