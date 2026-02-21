import { Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import LoginPage from './pages/LoginPage.js';
import SpaceSelector from './pages/SpaceSelector.js';
import Explorer from './pages/Explorer.js';
import { isAuthenticated } from './services/auth.js';

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());

  return (
    <Routes>
      <Route path="/" element={authed ? <Navigate to="/spaces" replace /> : <LoginPage onLogin={() => setAuthed(true)} />} />
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
