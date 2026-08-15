import { NavLink } from "react-router-dom";

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
    <path d="M12.5 3.2a.75.75 0 0 0-1 0L2 11.3l.9 1.1 1.35-1.05V19.5c0 .69.56 1.25 1.25 1.25H9.5a.75.75 0 0 0 .75-.75V15h3.5v5c0 .41.34.75.75.75h4a1.25 1.25 0 0 0 1.25-1.25v-8.15l1.35 1.05.9-1.1-9.5-8.1Z" />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
    <path d="M10.75 3a7.75 7.75 0 0 1 6.06 12.58l4.3 4.3-1.06 1.06-4.3-4.3A7.75 7.75 0 1 1 10.75 3Zm0 1.5a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5Z" />
  </svg>
);

const HeartIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M12 20.6c-.24 0-.47-.08-.66-.24C6.44 16.5 3 13.15 3 9.6 3 6.8 5.2 4.6 8 4.6c1.55 0 3.02.75 4 1.93A5.32 5.32 0 0 1 16 4.6c2.8 0 5 2.2 5 5 0 3.55-3.44 6.9-8.34 10.76-.19.16-.42.24-.66.24Z" />
  </svg>
);

const ListIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M3 5.75h18v1.5H3v-1.5Zm0 5.5h18v1.5H3v-1.5Zm0 5.5h12v1.5H3v-1.5Z" />
  </svg>
);

const UploadIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M12 3.5 6.75 8.75l1.06 1.06 3.44-3.44V16h1.5V6.37l3.44 3.44 1.06-1.06L12 3.5ZM5 18.25v1.75c0 .69.56 1.25 1.25 1.25h11.5c.69 0 1.25-.56 1.25-1.25v-1.75h-1.5V19H6.5v-.75H5Z" />
  </svg>
);

export function Sidebar() {
  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <NavLink to="/" end className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
          <HomeIcon /> Home
        </NavLink>
        <NavLink to="/search" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
          <SearchIcon /> Search
        </NavLink>
      </nav>

      <div className="sidebar-library">
        <h2>Your Library</h2>
        <nav>
          <NavLink to="/library" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
            <HeartIcon /> Liked Songs
          </NavLink>
          <NavLink to="/playlists" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
            <ListIcon /> Playlists
          </NavLink>
          <NavLink to="/upload" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
            <UploadIcon /> Upload a track
          </NavLink>
        </nav>
      </div>
    </aside>
  );
}
