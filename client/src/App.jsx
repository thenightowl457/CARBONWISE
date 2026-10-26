import { Routes, Route, NavLink, Link, useNavigate, Navigate } from "react-router-dom";
import { useAuth, RequireAuth } from "./auth";
import Landing from "./pages/Landing";
import { Login, Register } from "./pages/AuthPages";
import Dashboard from "./pages/Dashboard";
import Activities from "./pages/Activities";
import ActivityForm from "./pages/ActivityForm";
import Recommendations from "./pages/Recommendations";
import Simulator from "./pages/Simulator";
import Progress from "./pages/Progress";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";

const Logo = () => (
  <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#1f7a52" /><path d="M9 19c6 0 10-4 14-10-1 8-5 14-12 14-1 0-2-1-2-4z" fill="#e6f4ec" /></svg>
);

function Shell({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="topbar-in">
          <Link to={user ? "/dashboard" : "/"} className="brand"><Logo /> CarbonWise</Link>
          {user ? (
            <>
              <nav className="nav" aria-label="Main">
                <NavLink to="/dashboard">Dashboard</NavLink>
                <NavLink to="/activities">Activities</NavLink>
                <NavLink to="/recommendations">Recommendations</NavLink>
                <NavLink to="/simulator">What-if</NavLink>
                <NavLink to="/progress">Progress</NavLink>
                {user.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
              </nav>
              <div className="nav-right">
                <NavLink to="/profile" className="user"><span className="avatar" aria-hidden="true">{user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>{user.name.split(" ")[0]}</NavLink>
                <button className="btn secondary small" onClick={async () => { await logout(); nav("/"); }}>Log out</button>
              </div>
            </>
          ) : (
            <>
              <span style={{ flex: 1 }} />
              <div className="nav-right">
                <Link to="/login" className="btn secondary small">Log in</Link>
                <Link to="/register" className="btn small">Sign up</Link>
              </div>
            </>
          )}
        </div>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer>
        CarbonWise gives <strong>estimates</strong> from the activities you log and documented emission factors. It is not audited carbon accounting.
        We store only what you enter (name, email, activities) and you can export or delete it any time from your profile.
      </footer>
    </>
  );
}

const P = ({ children, admin }) => <RequireAuth admin={admin}>{children}</RequireAuth>;

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<P><Dashboard /></P>} />
        <Route path="/activities" element={<P><Activities /></P>} />
        <Route path="/activities/new" element={<P><ActivityForm /></P>} />
        <Route path="/activities/:id/edit" element={<P><ActivityForm /></P>} />
        <Route path="/recommendations" element={<P><Recommendations /></P>} />
        <Route path="/simulator" element={<P><Simulator /></P>} />
        <Route path="/progress" element={<P><Progress /></P>} />
        <Route path="/profile" element={<P><Profile /></P>} />
        <Route path="/admin" element={<P admin><Admin /></P>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
