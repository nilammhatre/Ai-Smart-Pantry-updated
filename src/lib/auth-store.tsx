import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { setActiveUserId } from "@/services/swiggy/pantryDb";

export interface User {
  id: string;
  name: string;
  email: string;
}

const DEFAULT_USERS: User[] = [
  { id: "user_nilam", name: "Nilam Mhatre", email: "nilam@smartpantry.ai" },
  { id: "user_alex", name: "Alex Johnson", email: "alex@kitchen.org" },
];

const AUTH_USERS_KEY = "smart_pantry_users_list";
const AUTH_ACTIVE_KEY = "smart_pantry_active_user_id";

interface AuthContextType {
  user: User | null;
  users: User[];
  login: (email: string) => boolean;
  signup: (name: string, email: string) => User;
  switchUser: (userId: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>(() => {
    try {
      const raw = localStorage.getItem(AUTH_USERS_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_USERS;
    } catch {
      return DEFAULT_USERS;
    }
  });

  const [user, setUser] = useState<User | null>(() => {
    try {
      const activeId = localStorage.getItem(AUTH_ACTIVE_KEY) || "user_nilam";
      const found = users.find((u) => u.id === activeId);
      return found || users[0] || null;
    } catch {
      return DEFAULT_USERS[0];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
    } catch { /* ignore */ }
  }, [users]);

  useEffect(() => {
    if (user) {
      localStorage.setItem(AUTH_ACTIVE_KEY, user.id);
      setActiveUserId(user.id);
    } else {
      localStorage.removeItem(AUTH_ACTIVE_KEY);
    }
  }, [user]);

  const login = (email: string) => {
    const found = users.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
    if (found) {
      setUser(found);
      setActiveUserId(found.id);
      window.dispatchEvent(new Event("storage"));
      return true;
    }
    return false;
  };

  const signup = (name: string, email: string) => {
    const cleanEmail = email.toLowerCase().trim();
    const existing = users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (existing) {
      setUser(existing);
      setActiveUserId(existing.id);
      window.dispatchEvent(new Event("storage"));
      return existing;
    }

    const newUser: User = {
      id: "user_" + Date.now().toString(36),
      name: name.trim() || "Kitchen User",
      email: cleanEmail
    };

    setUsers((prev) => [...prev, newUser]);
    setUser(newUser);
    setActiveUserId(newUser.id);
    window.dispatchEvent(new Event("storage"));
    return newUser;
  };

  const switchUser = (userId: string) => {
    const found = users.find((u) => u.id === userId);
    if (found) {
      setUser(found);
      setActiveUserId(found.id);
      window.dispatchEvent(new Event("storage"));
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(AUTH_ACTIVE_KEY);
    window.dispatchEvent(new Event("storage"));
  };

  return (
    <AuthContext.Provider value={{ user, users, login, signup, switchUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
