// Background Service Worker Entry Point
import { setupMessageRouter } from './message-router';

// Initialize side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Setup message router
setupMessageRouter();

// Log startup
console.log('[PageLens] Background service worker initialized');
