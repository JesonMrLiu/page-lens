// Content Script Entry Point
import { MSG_TYPES } from '@/shared/constants';
import { extractPageContent } from './extractor';

// Listen for extraction requests from the background service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === MSG_TYPES.EXTRACT) {
    try {
      const pageContent = extractPageContent();
      sendResponse({
        type: MSG_TYPES.EXTRACT_RESULT,
        data: pageContent,
      });
    } catch (err: any) {
      sendResponse({
        type: MSG_TYPES.EXTRACT_RESULT,
        data: null,
        error: err.message,
      });
    }
    return true; // Keep channel open for async response
  }
});
