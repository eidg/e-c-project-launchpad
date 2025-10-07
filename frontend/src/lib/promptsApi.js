export async function listPrompts() {
  const res = await fetch("/api/prompts", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to list prompts");
  return res.json();
}

export async function getPrompt(id) {
  const res = await fetch(`/api/prompts/${encodeURIComponent(id)}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to get prompt");
  return res.json();
}

export async function createPrompt({ name, content }) {
  const res = await fetch("/api/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name, content }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to create prompt");
  return data;
}

export async function updatePrompt(id, patch) {
  const res = await fetch(`/api/prompts/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to update prompt");
  return data;
}

export async function deletePrompt(id) {
  const res = await fetch(`/api/prompts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to delete prompt");
  return data;
}
