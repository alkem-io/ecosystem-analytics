import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import LoginPage from './pages/LoginPage.js';
import SpaceSelector from './pages/SpaceSelector.js';
import Explorer from './pages/Explorer.js';
import { isAuthenticated, setToken, extractTokenFromUrl } from './services/auth.js';

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());

  useEffect(() => {
    // Check for token in URL (after auth callback redirect)
    const token = extractTokenFromUrl();
    if (token) {
      setToken(token);
      setAuthed(true);
    }
  }, []);

  return (
    <Routes>
      <Route path="/" element={authed ? <Navigate to="/spaces" replace /> : <LoginPage />} />
      <Route
        path="/spaces"
        element={authed ? <SpaceSelector /> : <Navigate to="/" replace />}
      />
      <Route
        path="/explorer"
        element={authed ? <Explorer /> : <Navigate to="/" replace />}
      />
    </Routes>
  );
}
