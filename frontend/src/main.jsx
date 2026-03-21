import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#16161a',
            color: '#e8e8f0',
            border: '1px solid rgba(255,255,255,0.06)',
          },
          success: { iconTheme: { primary: '#b5ff4d', secondary: '#0d0d0f' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#0d0d0f' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
