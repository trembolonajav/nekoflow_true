import React, { createContext, useContext, useEffect, useState } from "react";
import { session } from "../../lib/session";

const AuthContext = createContext(session.user);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(session.user);
  useEffect(() => {
    const unsubscribe = session.subscribe(setAuth);
    session.load();
    return unsubscribe;
  }, []);
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
