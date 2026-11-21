import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Console from "./pages/Console";
import ProtectedRoute from "./components/ProtectedRoute";
import type { ThemeMode, User } from "./types";

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("cardio_user");
    return saved ? JSON.parse(saved) : null;
  });

  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("cardio_theme") as ThemeMode | null;
    if (saved === "dark" || saved === "green") return saved;
    // migrate old "light" -> green
    if (saved === "light") return "green";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "green";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("cardio_theme", theme);
  }, [theme]);

  function login(u: User) {
    setUser(u);
    localStorage.setItem("cardio_user", JSON.stringify(u));
  }

  function logout() {
    setUser(null);
    localStorage.removeItem("cardio_user");
  }

  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "green" : "dark"));
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <Login onLogin={login} />}
      />
      <Route
        path="/register"
        element={user ? <Navigate to="/dashboard" replace /> : <Register onLogin={login} />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute user={user}>
            <Dashboard
              user={user!}
              onLogout={logout}
              theme={theme}
              onToggleTheme={toggleTheme}
            />
          </ProtectedRoute>
        }
      />
      <Route
        path="/console"
        element={
          <ProtectedRoute user={user}>
            <Console
              user={user!}
              onLogout={logout}
              theme={theme}
              onToggleTheme={toggleTheme}
            />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
