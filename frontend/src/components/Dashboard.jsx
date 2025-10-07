import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthProvider";
import ChatPanelDemo from "./ChatPanel";
import Profile from "./Profile";
import Prompts from "./Prompts";
import PatternDocs from "./PatternDocs";
// Removed AuditPanel import as part of cleanup

const Dashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("chat");
  const [showProfile, setShowProfile] = useState(false);
  const [status, setStatus] = useState({
    frontend: { state: "ok", detail: "self" }, // if you see this UI, frontend is up
    backend: { state: "loading", detail: "" },
    api: { state: "loading", detail: "" },
    db: { state: "loading", detail: "" },
    ai: { state: "loading", detail: "" },
    mcp: { state: "loading", detail: "" },
  });

  const handleLogout = async () => {
    await logout();
  };

  useEffect(() => {
    let cancelled = false;

    async function withTimeout(promise, ms, label) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(`timeout ${label}`), ms);
      try {
        const res = await promise(ctrl.signal);
        return res;
      } finally {
        clearTimeout(t);
      }
    }

    async function checkHealth() {
      // API + DB via backend aggregated health if available
      try {
        const apiRes = await withTimeout(
          (signal) => fetch("/api/health", { signal }),
          4000,
          "api",
        );
        const ok = apiRes.ok;
        let apiData = null;
        try {
          apiData = await apiRes.json();
        } catch {}

        const apiState = ok ? "ok" : "down";
        const dbState =
          apiData && apiData.db && apiData.db.status === "ok"
            ? "ok"
            : ok && apiData && apiData.db
              ? "down"
              : "unknown";

        if (!cancelled) {
          setStatus((s) => ({
            ...s,
            backend: { state: ok ? "ok" : "down", detail: "reachable" },
            api: {
              state: apiState,
              detail: apiData ? JSON.stringify(apiData) : "",
            },
            db: {
              state: dbState,
              detail: apiData && apiData.db ? JSON.stringify(apiData.db) : "",
            },
          }));
        }
      } catch (e) {
        if (!cancelled) {
          setStatus((s) => ({
            ...s,
            backend: { state: "down", detail: String(e) },
            api: { state: "down", detail: String(e) },
            db: { state: "unknown", detail: "no data" },
          }));
        }
      }

      // AI service via backend proxy (avoids CORS)
      try {
        const aiRes = await withTimeout(
          (signal) => fetch("/api/ai/health", { signal }),
          4000,
          "ai",
        );
        const ok = aiRes.ok;
        let aiData = null;
        try {
          aiData = await aiRes.json();
        } catch {}
        if (!cancelled) {
          setStatus((s) => ({
            ...s,
            ai: {
              state: ok ? "ok" : "down",
              detail: aiData ? JSON.stringify(aiData) : "",
            },
          }));
        }
      } catch (e) {
        if (!cancelled) {
          setStatus((s) => ({
            ...s,
            ai: { state: "unknown", detail: String(e) },
          }));
        }
      }

      // MCP via backend proxy
      try {
        const mcpRes = await withTimeout(
          (signal) => fetch("/api/mcp/health", { signal }),
          4000,
          "mcp",
        );
        const ok = mcpRes.ok;
        if (!cancelled)
          setStatus((s) => ({
            ...s,
            mcp: { state: ok ? "ok" : "down", detail: "" },
          }));
      } catch (e) {
        if (!cancelled)
          setStatus((s) => ({
            ...s,
            mcp: { state: "unknown", detail: String(e) },
          }));
      }
    }

    checkHealth();
    const id = setInterval(checkHealth, 30000); // refresh every 30s
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  function Pill({ state, children }) {
    const map = {
      ok: "bg-green-100 text-green-700",
      down: "bg-red-100 text-red-700",
      unknown: "bg-yellow-100 text-yellow-800",
      loading: "bg-gray-100 text-gray-600",
    };
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-md text-sm font-medium ${map[state] || map.unknown}`}
      >
        {children}
      </span>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Fixed Header */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-900">
              E C Project Launchpad Dashboard
            </h1>

            <nav className="flex items-center space-x-1">
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "chat"
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
                onClick={() => setActiveTab("chat")}
              >
                Chat
              </button>
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "status"
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
                onClick={() => setActiveTab("status")}
              >
                Status
              </button>
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "prompts"
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
                onClick={() => setActiveTab("prompts")}
              >
                Prompts
              </button>
              <button
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "pattern-docs"
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
                onClick={() => setActiveTab("pattern-docs")}
              >
                Pattern Documents
              </button>
            </nav>

            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-600">
                Welcome, {user?.email}
              </span>
              <button
                onClick={() => setShowProfile(true)}
                className="px-3 py-1.5 text-blue-600 hover:text-blue-800 transition-colors text-sm font-medium"
              >
                Profile
              </button>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {showProfile ? (
          <Profile onClose={() => setShowProfile(false)} />
        ) : (
          <>
            {activeTab === "chat" && (
              <div className="h-full">
                <ChatPanelDemo embedded />
              </div>
            )}
            {activeTab === "prompts" && (
              <div className="h-full">
                <Prompts />
              </div>
            )}
            {activeTab === "pattern-docs" && (
              <div className="h-full">
                <PatternDocs />
              </div>
            )}
            {activeTab === "status" && (
              <div className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                  System Status
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg shadow p-4">
                    <h3 className="font-medium text-gray-900 mb-2">Frontend</h3>
                    <div className="flex items-center justify-between">
                      <Pill state={status.frontend.state}>
                        {status.frontend.state === "ok"
                          ? "Running"
                          : status.frontend.state === "down"
                            ? "Down"
                            : status.frontend.state === "loading"
                              ? "Checking…"
                              : "Unknown"}
                      </Pill>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <h3 className="font-medium text-gray-900 mb-2">Backend API</h3>
                    <div className="flex items-center justify-between">
                      <Pill state={status.backend.state}>
                        {status.backend.state === "ok"
                          ? "Reachable"
                          : status.backend.state === "down"
                            ? "Down"
                            : status.backend.state === "loading"
                              ? "Checking…"
                              : "Unknown"}
                      </Pill>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <h3 className="font-medium text-gray-900 mb-2">API Status</h3>
                    <div className="flex items-center justify-between">
                      <Pill state={status.api.state}>
                        {status.api.state === "ok"
                          ? "Operational"
                          : status.api.state === "down"
                            ? "Down"
                            : status.api.state === "loading"
                              ? "Checking…"
                              : "Unknown"}
                      </Pill>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <h3 className="font-medium text-gray-900 mb-2">Database</h3>
                    <div className="flex items-center justify-between">
                      <Pill state={status.db.state}>
                        {status.db.state === "ok"
                          ? "Connected"
                          : status.db.state === "down"
                            ? "Down"
                            : status.db.state === "loading"
                              ? "Checking…"
                              : "Unknown"}
                      </Pill>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <h3 className="font-medium text-gray-900 mb-2">AI Service</h3>
                    <div className="flex items-center justify-between">
                      <Pill state={status.ai.state}>
                        {status.ai.state === "ok"
                          ? "Active"
                          : status.ai.state === "down"
                            ? "Down"
                            : status.ai.state === "loading"
                              ? "Checking…"
                              : "Unknown"}
                      </Pill>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <h3 className="font-medium text-gray-900 mb-2">MCP Service</h3>
                    <div className="flex items-center justify-between">
                      <Pill state={status.mcp.state}>
                        {status.mcp.state === "ok"
                          ? "Active"
                          : status.mcp.state === "down"
                            ? "Down"
                            : status.mcp.state === "loading"
                              ? "Checking…"
                              : "Unknown"}
                      </Pill>
                    </div>
                  </div>
                  <p>Clio-Pro Platform - Developed by Estler Consulting, LLC</p>
                  <div className="mt-6">
                    <a
                      href="http://localhost:8080/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      Database Admin
                    </a>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
