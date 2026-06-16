import { MSG_TYPES } from '@/shared/constants';
import type { ExtensionMessage } from '@/shared/messages';
import type { ChatMessageInput } from '@/shared/types';
import { testConnection, streamChatCompletion, streamThinkingRound, chatCompletion } from './ai-client';
import { testFeishuConnection, createFeishuDocument, checkFeishuDocExists } from './feishu-client';
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

        case MSG_TYPES.CHECK_FEISHU_DOC:
          handleCheckFeishuDoc(message)
            .then(sendResponse)
            .catch((err) => sendResponse({ error: err.message }));
          return true;

        case MSG_TYPES.GENERATE_TITLE:
          handleGenerateTitle(message)
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
  const { conversationId, modelConfigId, messages, thinkMode, thinkRounds } = message;

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

  // Check if thinking mode is enabled
  const hasThinking = thinkMode && thinkMode !== 'none' && thinkRounds > 0;

  if (hasThinking) {
    // Execute multi-round thinking
    handleThinkingChat({
      conversationId,
      messages,
      modelConfig,
      thinkRounds,
      abortController,
      sendToSender,
    });
  } else {
    // Original logic: direct answer
    handleDirectChat({
      conversationId,
      messages,
      modelConfig,
      abortController,
      sendToSender,
    });
  }

  // Return immediately - stream events come via separate messages
  return { status: 'streaming', conversationId };
}

// Helper function for direct chat (no thinking)
function handleDirectChat({
  conversationId,
  messages,
  modelConfig,
  abortController,
  sendToSender,
}: {
  conversationId: number;
  messages: ChatMessageInput[];
  modelConfig: { baseUrl: string; apiKey: string; model: string; maxTokens: number; temperature: number };
  abortController: AbortController;
  sendToSender: (msg: any) => void;
}) {
  let fullContent = '';

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
        thinkingProcess: undefined,
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
}

// Helper function for thinking chat
async function handleThinkingChat({
  conversationId,
  messages,
  modelConfig,
  thinkRounds,
  abortController,
  sendToSender,
}: {
  conversationId: number;
  messages: ChatMessageInput[];
  modelConfig: { baseUrl: string; apiKey: string; model: string; maxTokens: number; temperature: number };
  thinkRounds: number;
  abortController: AbortController;
  sendToSender: (msg: any) => void;
}) {
  const thinkingHistory: string[] = [];
  const thinkingProcess: { round: number; content: string; isThinking: boolean }[] = [];

  // 通知前端思考开始
  sendToSender({
    type: 'THINK_STREAM_START',
    conversationId,
    totalRounds: thinkRounds,
  });

  try {
    // Execute multiple thinking rounds
    for (let round = 1; round <= thinkRounds; round++) {
      if (abortController.signal.aborted) {
        return;
      }

      // Build messages with thinking context
      const thinkMessages = buildThinkMessages(messages, thinkingHistory, round);

      // Stream thinking round
      const thinkContent = await streamThinkingRound({
        baseUrl: modelConfig.baseUrl,
        apiKey: modelConfig.apiKey,
        model: modelConfig.model,
        messages: thinkMessages,
        maxTokens: modelConfig.maxTokens,
        temperature: modelConfig.temperature,
        abortSignal: abortController.signal,
        onChunk: (content) => {
          sendToSender({
            type: 'THINK_STREAM_CHUNK',
            conversationId,
            round,
            content,
          });
        },
      });

      thinkingHistory.push(thinkContent);
      thinkingProcess.push({ round, content: thinkContent, isThinking: true });

      sendToSender({
        type: 'THINK_STREAM_ROUND_END',
        conversationId,
        round,
        fullContent: thinkContent,
      });
    }

    // 通知前端思考阶段结束，正文即将开始
    sendToSender({
      type: 'THINK_STREAM_END',
      conversationId,
    });

    // Final summary round
    if (abortController.signal.aborted) {
      return;
    }

    const summaryMessages = buildSummaryMessages(messages, thinkingHistory);
    let fullContent = '';

    await streamChatCompletion({
      baseUrl: modelConfig.baseUrl,
      apiKey: modelConfig.apiKey,
      model: modelConfig.model,
      messages: summaryMessages,
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
          thinkingProcess,
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
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return;
    }
    activeStreams.delete(conversationId);
    sendToSender({
      type: MSG_TYPES.CHAT_STREAM_ERROR,
      conversationId,
      error: error.message || 'Thinking process failed',
    });
  }
}

// Build messages for a thinking round
function buildThinkMessages(
  originalMessages: ChatMessageInput[],
  thinkingHistory: string[],
  currentRound: number,
): ChatMessageInput[] {
  const messages: ChatMessageInput[] = [];

  // Add original messages (excluding the last user message for context)
  for (let i = 0; i < originalMessages.length - 1; i++) {
    messages.push(originalMessages[i]);
  }

  // Add thinking context if there are previous rounds
  if (thinkingHistory.length > 0) {
    const thinkingContext = thinkingHistory
      .map((content, index) => `【第${index + 1}轮思考】\n${content}`)
      .join('\n\n');

    messages.push({
      role: 'system',
      content: `以下是之前的思考过程，请在此基础上进行更深入的思考：\n\n${thinkingContext}`,
    });
  }

  // Add the current user message with thinking instruction
  const lastUserMessage = originalMessages[originalMessages.length - 1];
  messages.push({
    role: 'user',
    content: `你现在处于"思考阶段"（第${currentRound}轮），请仅对这个用户的原始问题进行推理分析，不要给出最终答案。要求：
1. 分析问题的核心要点和关键信息
2. 列出可能的解决思路或方案
3. 评估每种方案的优缺点
4. 推理出最佳解答路径

注意：不要给出最终答案，只展示你的推理和思考过程。最终答案将在后续的"回答阶段"中给出。

用户的原始问题：
${lastUserMessage.content}`,
  });

  return messages;
}

// Build messages for the final summary
function buildSummaryMessages(
  originalMessages: ChatMessageInput[],
  thinkingHistory: string[],
): ChatMessageInput[] {
  const messages: ChatMessageInput[] = [];

  // Add original messages (excluding the last user message)
  for (let i = 0; i < originalMessages.length - 1; i++) {
    messages.push(originalMessages[i]);
  }

  // Add thinking results as context
  const thinkingContext = thinkingHistory
    .map((content, index) => `【第${index + 1}轮思考】\n${content}`)
    .join('\n\n');

  messages.push({
    role: 'system',
    content: `以下是针对用户问题的多轮思考推理过程，请基于这些推理给出一个完整、准确、有条理的最终回答。回答时不要重复思考过程，直接给出最终答案。

思考推理过程：
${thinkingContext}`,
  });

  // Add the original user message
  const lastUserMessage = originalMessages[originalMessages.length - 1];
  messages.push(lastUserMessage);

  return messages;
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
  const { title, content, feishuConfig, mermaidImages } = message;
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
      mermaidImages || undefined,
    );
    return {
      type: MSG_TYPES.EXPORT_TO_FEISHU_RESULT,
      success: true,
      docUrl: result.docUrl,
      docId: result.docId,
      skippedCount: result.skippedCount || 0,
    };
  } catch (err: any) {
    return {
      type: MSG_TYPES.EXPORT_TO_FEISHU_RESULT,
      success: false,
      error: err.message || '导出失败',
    };
  }
}

async function handleCheckFeishuDoc(message: any): Promise<unknown> {
  const { docId, feishuConfig } = message;
  if (!feishuConfig || !docId) {
    return { type: MSG_TYPES.CHECK_FEISHU_DOC_RESULT, exists: false, deleted: false, error: '缺少文档 ID 或飞书配置' };
  }

  try {
    const result = await checkFeishuDocExists(
      feishuConfig.appId,
      feishuConfig.appSecret,
      docId,
    );
    return {
      type: MSG_TYPES.CHECK_FEISHU_DOC_RESULT,
      exists: result.exists,
      deleted: result.deleted,
      error: result.error,
    };
  } catch (err: any) {
    return {
      type: MSG_TYPES.CHECK_FEISHU_DOC_RESULT,
      exists: false,
      deleted: false,
      error: err.message || '验证文档失败',
    };
  }
}

async function handleGenerateTitle(message: any): Promise<unknown> {
  const { content, modelConfig } = message;
  if (!content || !modelConfig) {
    return { type: MSG_TYPES.GENERATE_TITLE_RESULT, success: false, error: '缺少内容或模型配置' };
  }

  try {
    const title = await chatCompletion({
      baseUrl: modelConfig.baseUrl,
      apiKey: modelConfig.apiKey,
      model: modelConfig.model,
      messages: [
        {
          role: 'user',
          content: `请为以下内容生成一个不超过50字的简洁中文标题，概括内容核心要点，直接输出标题本身，不要引号和多余说明：\n\n${String(content).slice(0, 2000)}`,
        },
      ],
      maxTokens: 100,
      temperature: 0.3,
    });
    const cleaned = title.trim().replace(/^["'「『]+|["'」』]+$/g, '');
    if (!cleaned) {
      return { type: MSG_TYPES.GENERATE_TITLE_RESULT, success: false, error: 'AI 返回了空标题' };
    }
    return { type: MSG_TYPES.GENERATE_TITLE_RESULT, success: true, title: cleaned };
  } catch (err: any) {
    return { type: MSG_TYPES.GENERATE_TITLE_RESULT, success: false, error: err.message || '标题生成失败' };
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
