import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import ProtectedRoute from './components/ProtectedRoute';
import Auth from './pages/Auth';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import Workspace from './pages/Workspace';
import Report from './pages/Report';

function App() {
  const { loadUser } = useAuthStore();

  // On mount: verify token and load user
  useEffect(() => {
    loadUser();
  }, [loadUser]);

  return (
    <Routes>
      {/* Public route */}
      <Route path="/auth" element={<Auth />} />

      {/* Protected routes */}
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/lobby/:roomCode" element={<ProtectedRoute><Lobby /></ProtectedRoute>} />
      <Route path="/workspace/:roomCode" element={<ProtectedRoute><Workspace /></ProtectedRoute>} />
      <Route path="/report/:sessionId" element={<ProtectedRoute><Report /></ProtectedRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
