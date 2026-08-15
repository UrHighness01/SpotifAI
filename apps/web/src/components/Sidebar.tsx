import { NavLink } from "react-router-dom";

export function Sidebar() {
  return (
    <aside className="sidebar">
      <h2>Your Library</h2>
      <nav>
        <NavLink to="/" end className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
          Home
        </NavLink>
        <NavLink to="/search" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
          Search
        </NavLink>
        <NavLink to="/library" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
          Liked Songs
        </NavLink>
        <NavLink to="/upload" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
          Upload a track
        </NavLink>
      </nav>
    </aside>
  );
}
