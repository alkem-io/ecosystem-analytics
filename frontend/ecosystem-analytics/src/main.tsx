import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from './components/ui/tooltip.js';
import App from './App.js';
import './styles/globals.css';
import './styles/tokens.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
