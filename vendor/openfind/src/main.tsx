import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { hartaAcquisitionUrl } from '../../../js/acquisition-route.js';
import './styles.css';
import '../../../css/ui-foundation.css';
import '../../../css/studio-tokens.css';
import './studio-theme.css';
// Same-origin embedded workspace follows the host theme without resetting work.
if(window.parent!==window){
  const host=window.parent.document.documentElement;
  const syncTheme=()=>document.documentElement.setAttribute('data-theme',host.getAttribute('data-theme')||'dark');
  syncTheme();
  const observer=new MutationObserver(syncTheme);observer.observe(host,{attributes:true,attributeFilter:['data-theme']});
  window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
}
if (window.parent === window) location.replace(hartaAcquisitionUrl(location.search, location.hash.slice(1)));
else ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
