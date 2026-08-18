/*
 * RHLZ · Command the flock. Rule your servers.
 * Powered by the RHLZ security core · © RHLZ
 * (Derived from an MIT-licensed upstream panel by Jishnu, see LICENSE)
 */
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);