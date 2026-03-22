import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import NotificationRenderer from './components/NotificationRenderer';
import SplashScreen from './components/SplashScreen';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import HomePage from './pages/HomePage';
import MarketDetailPage from './pages/MarketDetailPage';
import ProfilePage from './pages/ProfilePage';
import LeaderboardPage from './pages/LeaderboardPage';
import AdminPage from './pages/AdminPage';
import RoulettePage from './pages/Roulette/RoulettePage';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="page-loader"><div className="skeleton" style={{ width: 200, height: 24 }} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.requiresPasswordChange) return <Navigate to="/change-password" replace />;
  if (adminOnly && !user.isAdmin) return <Navigate to="/" replace />;

  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <>
      <NotificationRenderer />
      <AnimatePresence mode="wait">
      <Routes>
        <Route path="/login" element={user && !user.requiresPasswordChange ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/" element={<ProtectedRoute><Layout><HomePage /></Layout></ProtectedRoute>} />
        <Route path="/market/:id" element={<ProtectedRoute><Layout><MarketDetailPage /></Layout></ProtectedRoute>} />
        <Route path="/profile/:id" element={<ProtectedRoute><Layout><ProfilePage /></Layout></ProtectedRoute>} />
        <Route path="/roulette" element={<ProtectedRoute><Layout><RoulettePage /></Layout></ProtectedRoute>} />
        <Route path="/leaderboard" element={<ProtectedRoute><Layout><LeaderboardPage /></Layout></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><Layout><AdminPage /></Layout></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
    </>
  );
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <AuthProvider>
      {!splashDone ? (
        <SplashScreen onComplete={() => setSplashDone(true)} />
      ) : (
        <AppRoutes />
      )}
    </AuthProvider>
  );
}
