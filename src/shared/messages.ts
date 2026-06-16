import { MSG_TYPES } from './constants';
import type { PageContent, ChatMessageInput, CreateModelConfig, ThinkMode } from './types';

// ===================== Message Type Definitions =====================
export interface ExtractPageMessage {
  type: typeof MSG_TYPES.EXTRACT_PAGE;
}

export interface ExtractPageResultMessage {
  type: typeof MSG_TYPES.EXTRACT_PAGE_RESULT;
  data: PageContent | null;
  error?: string;
}

export interface ChatRequestMessage {
  type: typeof MSG_TYPES.CHAT_REQUEST;
  conversationId: number;
  modelConfigId: number;
  messages: ChatMessageInput[];
  thinkMode?: ThinkMode;
  thinkRounds?: number;
}

export interface ChatStreamChunkMessage {
  type: typeof MSG_TYPES.CHAT_STREAM_CHUNK;
  conversationId: number;
  content: string;
}

export interface ChatStreamEndMessage {
  type: typeof MSG_TYPES.CHAT_STREAM_END;
  conversationId: number;
  fullContent: string;
}

export interface ChatStreamErrorMessage {
  type: typeof MSG_TYPES.CHAT_STREAM_ERROR;
  conversationId: number;
  error: string;
}

export interface ThinkStreamChunkMessage {
  type: 'THINK_STREAM_CHUNK';
  conversationId: number;
  round: number;
  content: string;
}

export interface ThinkStreamStartMessage {
  type: 'THINK_STREAM_START';
  conversationId: number;
  totalRounds: number;
}

export interface ThinkStreamRoundEndMessage {
  type: 'THINK_STREAM_ROUND_END';
  conversationId: number;
  round: number;
  fullContent: string;
}

export interface CancelStreamMessage {
  type: typeof MSG_TYPES.CANCEL_STREAM;
  conversationId: number;
}

export interface TestAiConnectionMessage {
  type: typeof MSG_TYPES.TEST_AI_CONNECTION;
  modelConfig: Omit<CreateModelConfig, 'name'>;
}

export interface TestAiResultMessage {
  type: typeof MSG_TYPES.TEST_AI_RESULT;
  success: boolean;
  error?: string;
}

export interface TestFeishuConnectionMessage {
  type: typeof MSG_TYPES.TEST_FEISHU_CONNECTION;
  appId: string;
  appSecret: string;
}

export interface TestFeishuResultMessage {
  type: typeof MSG_TYPES.TEST_FEISHU_RESULT;
  success: boolean;
  error?: string;
}

export interface ExportToFeishuMessage {
  type: typeof MSG_TYPES.EXPORT_TO_FEISHU;
  noteId: number;
  title: string;
  content: string;
  mermaidImages?: Array<{ base64: string; width: number; height: number } | null>;
  feishuConfig?: {
    appId: string;
    appSecret: string;
    folderToken?: string;
  };
}

export interface ExportToFeishuResultMessage {
  type: typeof MSG_TYPES.EXPORT_TO_FEISHU_RESULT;
  success: boolean;
  docUrl?: string;
  docId?: string;
  error?: string;
  skippedCount?: number;
}

export interface CheckFeishuDocMessage {
  type: typeof MSG_TYPES.CHECK_FEISHU_DOC;
  docId: string;
  feishuConfig: {
    appId: string;
    appSecret: string;
  };
}

export interface CheckFeishuDocResultMessage {
  type: typeof MSG_TYPES.CHECK_FEISHU_DOC_RESULT;
  exists: boolean;
  deleted?: boolean;
  error?: string;
}

export interface GenerateTitleMessage {
  type: typeof MSG_TYPES.GENERATE_TITLE;
  content: string;
  modelConfig: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
}

export interface GenerateTitleResultMessage {
  type: typeof MSG_TYPES.GENERATE_TITLE_RESULT;
  success: boolean;
  title?: string;
  error?: string;
}

export interface GetActiveTabMessage {
  type: typeof MSG_TYPES.GET_ACTIVE_TAB;
}

export interface GetActiveTabResultMessage {
  type: typeof MSG_TYPES.GET_ACTIVE_TAB_RESULT;
  tabId: number;
  url: string;
  title: string;
}

export interface ExtractContentScriptMessage {
  type: typeof MSG_TYPES.EXTRACT;
}

export interface ExtractContentScriptResultMessage {
  type: typeof MSG_TYPES.EXTRACT_RESULT;
  data: PageContent | null;
  error?: string;
}

export type ExtensionMessage =
  | ExtractPageMessage
  | ExtractPageResultMessage
  | ChatRequestMessage
  | ChatStreamChunkMessage
  | ChatStreamEndMessage
  | ChatStreamErrorMessage
  | ThinkStreamStartMessage
  | ThinkStreamChunkMessage
  | ThinkStreamRoundEndMessage
  | CancelStreamMessage
  | TestAiConnectionMessage
  | TestAiResultMessage
  | TestFeishuConnectionMessage
  | TestFeishuResultMessage
  | ExportToFeishuMessage
  | ExportToFeishuResultMessage
  | CheckFeishuDocMessage
  | CheckFeishuDocResultMessage
  | GenerateTitleMessage
  | GenerateTitleResultMessage
  | GetActiveTabMessage
  | GetActiveTabResultMessage
  | ExtractContentScriptMessage
  | ExtractContentScriptResultMessage;

// ===================== Message Helpers =====================
export function sendMessage<T = unknown>(message: ExtensionMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

export function sendTabMessage<T = unknown>(tabId: number, message: ExtensionMessage): Promise<T> {
  return chrome.tabs.sendMessage(tabId, message);
}

export function onMessage(
  handler: (message: ExtensionMessage, sender: chrome.runtime.MessageSender) => Promise<ExtensionMessage | undefined>,
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handler(message as ExtensionMessage, sender)
      .then(sendResponse)
      .catch((err) => {
        console.error('Message handler error:', err);
        sendResponse({ error: err.message } as ExtensionMessage);
      });
    return true; // Keep the message channel open for async response
  });
}
