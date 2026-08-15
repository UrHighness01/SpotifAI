import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { PlayerBar } from "./components/PlayerBar";
import { Home } from "./pages/Home";
import { Artist } from "./pages/Artist";
import { Album } from "./pages/Album";
import { Search } from "./pages/Search";
import { Library } from "./pages/Library";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Upload } from "./pages/Upload";
import { useAuth } from "./auth";
import { api } from "./api";

function Topbar() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await api.logout();
    await refresh();
    navigate("/");
  };

  return (
    <div className="topbar">
      <Link to="/" style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--accent)" }}>
        SpotifAI
      </Link>
      <div className="topbar-right">
        {user ? (
          <>
            <span>{user.displayName}</span>
            <button onClick={onLogout} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer" }}>
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/login">Log in</Link>
            <Link to="/register" style={{ color: "var(--text)" }}>
              Sign up
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export function App() {
  return (
    <div className="app-shell">
      <Topbar />
      <Sidebar />
      <div className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/library" element={<Library />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/artist/:id" element={<Artist />} />
          <Route path="/album/:id" element={<Album />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Routes>
      </div>
      <PlayerBar />
    </div>
  );
}
