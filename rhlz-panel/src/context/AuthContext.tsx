import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

export const AuthContext = createContext<any>(null);

/** Reads a cookie value (double-submit CSRF token is non-httpOnly). */
function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

// Browser sessions use an httpOnly cookie (immune to XSS token theft).
// Send the session cookie on every request and echo the CSRF cookie back on
// mutations.
axios.defaults.withCredentials = true;
axios.interceptors.request.use((config) => {
  const method = (config.method || "get").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const csrf = readCookie("rhlz_csrf");
    if (csrf) config.headers["X-RHLZ-CSRF"] = csrf;
  }
  return config;
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null); // in-memory only; cookie is authoritative
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The session cookie is httpOnly; /me is the source of truth on load.
    axios
      .get("/api/auth/me")
      .then((res) => {
        setUser(res.data.user || null);
        setLoading(false);
      })
      .catch(() => {
        setUser(null);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 && !error.config?.url?.includes("/auth/login")) {
          setUser(null);
          setToken(null);
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  const login = (token: string | null, user: any) => {
    // token is kept in memory for legacy callers; the session itself lives in
    // the httpOnly cookie set by the server.
    setToken(token);
    setUser(user);
  };

  const logout = async () => {
    try {
      await axios.post("/api/auth/logout");
    } catch {
      // cookie may already be gone; clear locally regardless
    }
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const res = await axios.get("/api/auth/me");
      setUser(res.data.user);
    } catch (e) {
      // ignore
    }
  };

  const updateUser = (updatedFields: any) => {
    setUser((prev: any) => (prev ? { ...prev, ...updatedFields } : prev));
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, refreshUser, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
