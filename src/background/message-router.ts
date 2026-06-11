import { MSG_TYPES } from '@/shared/constants';
import type { ExtensionMessage } from '@/shared/messages';
import { testConnection, streamChatCompletion } from './ai-client';
import { testFeishuConnection, createFeishuDocument } from './feishu-client';
import { extractFromActiveTab } from './page-extractor';

/**
 * Central message router for the background service worker.
 * Dispatches incoming messages to the appropriate handler.
 */
export function setupMessageRouter(): void {
  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, sender, sendResponse) => {
      const msg = message as { type: string };

      switch (msg.type) {
        case MSG_TYPES.EXTRACT_PAGE:
          handleExtractPage(sender)
            .then(sendResponse)
            .catch((err) => sendResponse({ error: err.message }));
          return true;

        case MSG_TYPES.CHAT_REQUEST:
          handleChatRequest(message, sender)
            .then(sendResponse)
            .catch((err) => sendResponse({ error: err.message }));
          return true;

        case MSG_TYPES.CANCEL_STREAM:
          handleCancelStream(message)
            .then(sendResponse)
            .catch((err) => sendResponse({ error: err.message }));
          return true;

        case MSG_TYPES.TEST_AI_CONNECTION:
          handleTestAiConnection(message)
            .then(sendResponse)
            .catch((err) => sendResponse({ error: err.message }));
          return true;

        case MSG_TYPES.TEST_FEISHU_CONNECTION:
          handleTestFeishuConnection(message)
            .then(sendResponse)
            .catch((err) => sendResponse({ error: err.message }));
          return true;

        case MSG_TYPES.EXPORT_TO_FEISHU:
          handleExportToFeishu(message)
            .then(sendResponse)
            .catch((err) => sendResponse({ error: err.message }));
          return true;

        case MSG_TYPES.GET_ACTIVE_TAB:
          handleGetActiveTab()
            .then(sendResponse)
            .catch((err) => sendResponse({ error: err.message }));
          return true;

        default:
          console.warn('[PageLens] Unknown message type:', msg.type);
          break;
      }
    },
  );
}

// ===================== Placeholder Handlers =====================
// These will be fully implemented in subsequent phases

async function handleExtractPage(
  _sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  try {
    const result = await extractFromActiveTab();
    if (result.error) {
      // 将英文错误映射为中文友好提示
      const friendlyError = result.error.includes('No active tab')
        ? '未找到活动标签页'
        : result.error.includes('Cannot extract')
          ? '当前页面不支持内容提取，请确保您正在浏览一个普通网页'
          : result.error.includes('Receiving end')
            ? '无法连接到页面，请刷新页面后重试'
            : result.error;
      return { type: MSG_TYPES.EXTRACT_PAGE_RESULT, data: null, error: friendlyError };
    }
    return { type: MSG_TYPES.EXTRACT_PAGE_RESULT, data: result.data };
  } catch (err: any) {
    return {
      type: MSG_TYPES.EXTRACT_PAGE_RESULT,
      data: null,
      error: '无法连接到页面，请刷新页面后重试',
    };
  }
}

// Track active stream abort controllers per conversation
const activeStreams = new Map<number, AbortController>();

async function handleChatRequest(message: any, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const { conversationId, modelConfigId, messages } = message;

  // Look up model config - we need to import the db layer
  // Since service worker can't use sql.js directly, we fetch model config from side panel
  // Instead, we'll receive model config details in the message or look them up
  // For now, get from a simplified storage approach
  let modelConfig: { baseUrl: string; apiKey: string; model: string; maxTokens: number; temperature: number } | null = null;

  try {
    // Get model config from chrome.storage (side panel saves it there)
    const storageResult = await chrome.storage.local.get('ai_summary_model_' + modelConfigId);
    if (storageResult['ai_summary_model_' + modelConfigId]) {
      modelConfig = storageResult['ai_summary_model_' + modelConfigId];
    }
  } catch {
    // Ignore
  }

  // Fallback: side panel should send model config directly
  if (!modelConfig && message.modelConfig) {
    modelConfig = message.modelConfig;
  }

  if (!modelConfig) {
    // Try to read from storage using db data
    // This is a workaround since service worker can't use sql.js
    return {
      type: MSG_TYPES.CHAT_STREAM_ERROR,
      conversationId,
      error: 'Model configuration not found. Please re-select the model.',
    };
  }

  const abortController = new AbortController();
  activeStreams.set(conversationId, abortController);

  // Get sender tab for sending stream messages back
  const senderTabId = sender.tab?.id;

  const sendToSender = (msg: any) => {
    if (senderTabId) {
      chrome.tabs.sendMessage(senderTabId, msg).catch(() => {
        // Tab might not be ready, use runtime instead
        chrome.runtime.sendMessage(msg).catch(() => {});
      });
    } else {
      chrome.runtime.sendMessage(msg).catch(() => {});
    }
  };

  let fullContent = '';

  // Start streaming in background - don't await the full stream
  streamChatCompletion({
    baseUrl: modelConfig.baseUrl,
    apiKey: modelConfig.apiKey,
    model: modelConfig.model,
    messages,
    maxTokens: modelConfig.maxTokens,
    temperature: modelConfig.temperature,
    abortSignal: abortController.signal,
    onChunk: (content) => {
      fullContent += content;
      sendToSender({
        type: MSG_TYPES.CHAT_STREAM_CHUNK,
        conversationId,
        content,
      });
    },
    onEnd: () => {
      activeStreams.delete(conversationId);
      sendToSender({
        type: MSG_TYPES.CHAT_STREAM_END,
        conversationId,
        fullContent,
      });
    },
    onError: (error) => {
      activeStreams.delete(conversationId);
      sendToSender({
        type: MSG_TYPES.CHAT_STREAM_ERROR,
        conversationId,
        error,
      });
    },
  });

  // Return immediately - stream events come via separate messages
  return { status: 'streaming', conversationId };
}

async function handleCancelStream(message: any): Promise<unknown> {
  const controller = activeStreams.get(message.conversationId);
  if (controller) {
    controller.abort();
    activeStreams.delete(message.conversationId);
  }
  return { success: true };
}

async function handleTestAiConnection(message: any): Promise<unknown> {
  const { base_url, api_key, model_id } = message.modelConfig || {};
  if (!base_url || !api_key || !model_id) {
    return { type: MSG_TYPES.TEST_AI_RESULT, success: false, error: 'Missing required fields' };
  }
  const result = await testConnection(base_url, api_key, model_id);
  return { type: MSG_TYPES.TEST_AI_RESULT, ...result };
}

async function handleTestFeishuConnection(message: any): Promise<unknown> {
  const { appId, appSecret, folderToken } = message;
  if (!appId || !appSecret) {
    return { type: MSG_TYPES.TEST_FEISHU_RESULT, success: false, error: 'Missing App ID or Secret' };
  }
  const result = await testFeishuConnection(appId, appSecret, folderToken || undefined);
  return { type: MSG_TYPES.TEST_FEISHU_RESULT, ...result };
}

async function handleExportToFeishu(message: any): Promise<unknown> {
  const { title, content, feishuConfig } = message;
  if (!feishuConfig) {
    return { type: MSG_TYPES.EXPORT_TO_FEISHU_RESULT, success: false, error: '飞书未配置' };
  }

  try {
    const result = await createFeishuDocument(
      feishuConfig.appId,
      feishuConfig.appSecret,
      title,
      content,
      feishuConfig.folderToken || undefined,
    );
    return {
      type: MSG_TYPES.EXPORT_TO_FEISHU_RESULT,
      success: true,
      docUrl: result.docUrl,
      docId: result.docId,
    };
  } catch (err: any) {
    return {
      type: MSG_TYPES.EXPORT_TO_FEISHU_RESULT,
      success: false,
      error: err.message || '导出失败',
    };
  }
}

async function handleGetActiveTab(): Promise<unknown> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    return { type: MSG_TYPES.GET_ACTIVE_TAB_RESULT, tabId: -1, url: '', title: '' };
  }
  return {
    type: MSG_TYPES.GET_ACTIVE_TAB_RESULT,
    tabId: tab.id,
    url: tab.url,
    title: tab.title || '',
  };
}

export { activeStreams };
