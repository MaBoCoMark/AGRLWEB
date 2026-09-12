/**
 * main.js
 * Application bootstrap entry point.
 */

import { GameEngine } from './game/GameEngine.js';
import './styles/game.css';

window.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('app');
  if (!container) {
    console.error('Root element #app not found in document.');
    return;
  }

  // Register PWA Service Worker if supported
  if ('serviceWorker' in navigator && window.isSecureContext) {
    try {
      await navigator.serviceWorker.register('/game-sw.js');
      console.log('[App] Service Worker registered.');
    } catch (e) {
      console.warn('[App] Service Worker registration skipped:', e.message);
    }
  }

  console.log('[App] Starting Car Soccer Engine...');
  const game = new GameEngine(container);
  await game.start();
  console.log('[App] Car Soccer running smoothly.');
});
