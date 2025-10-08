import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

// Contexto
import { AppProvider } from './contexts/AppContext';

// Componentes
import ModernNavigation from './components/ModernNavigation';

// Páginas
import ModernLiveChat from './pages/ModernLiveChat';
import Settings from './pages/Settings';

function App() {
  return (
    <AppProvider>
      <Router>
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
          <ModernNavigation />
          <div style={{ flexGrow: 1, overflow: 'hidden' }}>
            <Routes>
              <Route path="/" element={<ModernLiveChat />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </Router>
    </AppProvider>
  );
}

export default App;
