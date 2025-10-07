import React, { useState } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthProvider";
import Login from "./components/Login";
import Signup from "./components/Signup";
import Dashboard from "./components/Dashboard";
import { ConversationProvider } from "./contexts/ConversationProvider";
import ProtectedRoute from "./components/ProtectedRoute";
import "./App.css";
import "./tailwind.css";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

function AuthenticatedApp() {
  const { user, loading } = useAuth();
  const [authMode, setAuthMode] = useState("login"); // 'login' or 'signup'

  if (loading) {
    return (
      <div className="app loading">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading E C Project Launchpad...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app auth-app">
        <header className="app-header">
          <h1>🚀 E C Project Launchpad</h1>
          <p>Phase 0.2 - Authentication Module</p>
        </header>

        <main className="app-main">
          {authMode === "login" ? (
            <Login onToggleMode={() => setAuthMode("signup")} />
          ) : (
            <Signup onToggleMode={() => setAuthMode("login")} />
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="app authenticated-app">
      <ProtectedRoute>
        <ConversationProvider>
          <Dashboard />
        </ConversationProvider>
      </ProtectedRoute>
    </div>
  );
}

function App() {
  const theme = createTheme({
    palette: { mode: "light" },
  });
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
