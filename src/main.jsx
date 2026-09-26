import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { YearProvider } from './context/YearContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <HashRouter>
        <AuthProvider>
          <YearProvider>
            <App />
          </YearProvider>
        </AuthProvider>
      </HashRouter>
    </HelmetProvider>
  </React.StrictMode>
);
