import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { hartaAcquisitionUrl } from '../../../js/acquisition-route.js';
import './styles.css';
import '../../../css/ui-foundation.css';
if (window.parent === window) location.replace(hartaAcquisitionUrl(location.search, location.hash.slice(1)));
else ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
