import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, setUnauthorizedHandler } from "./api";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api("/auth/me").then((d) => setUser(d.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => setUser((await api("/auth/login", { method: "POST", body: { email, password } })).user), []);
  const register = useCallback(async (body) => setUser((await api("/auth/register", { method: "POST", body })).user), []);
  const logout = useCallback(async () => { try { await api("/auth/logout", { method: "POST" }); } finally { setUser(null); } }, []);

  return <Ctx.Provider value={{ user, setUser, loading, login, register, logout }}>{children}</Ctx.Provider>;
}

export function RequireAuth({ admin, children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <p className="center-note" role="status">Loading…</p>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (admin && user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}
