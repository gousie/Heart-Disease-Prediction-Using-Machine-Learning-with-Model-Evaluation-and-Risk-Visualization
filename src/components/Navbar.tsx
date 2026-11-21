import { BarChart3, HeartPulse, LogOut, Moon, Sun, Terminal, UserRound } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { User, ThemeMode } from "../types";

interface Props {
  user: User;
  onLogout: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export default function Navbar({ user, onLogout, theme, onToggleTheme }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="topbar">
      <button className="brand" onClick={() => navigate("/dashboard")}>
        <span className="brand-icon">
          <HeartPulse size={20} />
        </span>
        <span>
          HeartDisease<span>Predict</span>
        </span>
      </button>

      <nav className="topnav">
        <button
          className={isActive("/dashboard") ? "nav-active" : undefined}
          onClick={() => navigate("/dashboard")}
        >
          <BarChart3 size={17} /> Dashboard
        </button>
        <button
          className={isActive("/console") ? "nav-active" : undefined}
          onClick={() => navigate("/console")}
        >
          <Terminal size={17} /> Console
        </button>
        <button
          className="theme-toggle"
          onClick={onToggleTheme}
          title={theme === "dark" ? "Switch to green mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <div className="user-chip">
          <UserRound size={16} /> {user.name}
        </div>
        <button className="logout-btn" onClick={onLogout}>
          <LogOut size={17} /> Logout
        </button>
      </nav>
    </header>
  );
}
