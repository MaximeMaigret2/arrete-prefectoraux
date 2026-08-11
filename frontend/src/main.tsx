import React from 'react';
import ReactDOM from 'react-dom/client';
import MapPage from './pages/MapPage.js';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MapPage />
  </React.StrictMode>,
);
