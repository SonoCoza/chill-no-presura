import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { useAuthStore } from '../store/authStore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setLoading(false);
        useAuthStore.getState().sync();
        return;
      }
      const { data } = await api.get('/auth/me');
      setUser(data);
      localStorage.setItem('user', JSON.stringify(data));
      useAuthStore.getState().sync();
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      setUser(null);
    } finally {
      setLoading(false);
      useAuthStore.getState().sync();
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    useAuthStore.getState().sync();
    return data;
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    setUser(null);
    useAuthStore.getState().sync();
  };

  const changePassword = async (newPassword, confirmPassword) => {
    const { data } = await api.post('/auth/change-password', { newPassword, confirmPassword });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    useAuthStore.getState().sync();
    return data;
  };

  const updateBalance = (newBalance) => {
    setUser(prev => {
      const updated = { ...prev, balance: newBalance };
      localStorage.setItem('user', JSON.stringify(updated));
      useAuthStore.getState().sync();
      return updated;
    });
  };

  const refreshUser = async () => {
    await fetchMe();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword, updateBalance, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
