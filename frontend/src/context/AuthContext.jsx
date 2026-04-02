import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('coursetrack_token'));
  const [loading, setLoading] = useState(true); // checking stored token on load

  // On mount, validate the stored token
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => {
        // Token invalid/expired — clear it
        localStorage.removeItem('coursetrack_token');
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = (tokenValue, userData) => {
    localStorage.setItem('coursetrack_token', tokenValue);
    setToken(tokenValue);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('coursetrack_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
