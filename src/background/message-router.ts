import { MSG_TYPES, CHUNK_SIZE, CHUNK_OVERLAP, MAX_PAGE_CONTENT_ABSOLUTE } from '@/shared/constants';
import type { ExtensionMessage } from '@/shared/messages';
import type { ChatMessageInput, ContentPart } from '@/shared/types';
import { testConnection, streamChatCompletion, streamThinkingRound, chatCompletion } from './ai-client';
import { testFeishuConnection, createFeishuDocument, checkFeishuDocExists } from './feishu-client';
import { testNotionConnection, syncNotionPage } from './notion-client';
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

        case MSG_TYPES.TEST_NOTION_CONNECTION:
          handleTestNotionConnection(message)
            .then(sendResponse)
            .catch((err) => sendResponse({ error: err.message }));
          return true;

        case MSG_TYPES.SYNC_TO_NOTION:
          handleSyncToNotion(message)
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
  const { conversationId, modelConfigId, messages, thinkMode, thinkRounds, attachmentStorageKey } = message;

  // 从 storage.session 还原图片 dataUrl（占位 id → 真实 base64），取完即删
  let resolvedMessages: ChatMessageInput[] = messages;
  if (attachmentStorageKey) {
    try {
      const result = (await chrome.storage.session.get(attachmentStorageKey)) as unknown as {
        [key: string]: Array<{ id: string; dataUrl: string }> | undefined;
      };
      const imageData: Array<{ id: string; dataUrl: string }> = result[attachmentStorageKey] || [];
      const idToUrl = new Map(imageData.map((a) => [a.id, a.dataUrl]));
      if (idToUrl.size > 0) {
        resolvedMessages = messages.map((m: ChatMessageInput) => {
          if (typeof m.content === 'string') return m;
          const replaced: ContentPart[] = m.content.map((p) =>
            p.type === 'image_url' && idToUrl.has(p.image_url.url)
              ? { type: 'image_url', image_url: { url: idToUrl.get(p.image_url.url)! } }
              : p,
          );
          return { ...m, content: replaced };
        });
      }
    } catch {
      // ignore restore failure
    }
    // 无论成功失败都清理 session key，释放配额
    chrome.storage.session.remove(attachmentStorageKey).catch(() => {});
  }

  // Look up model config - we need to import the db layer
  // Since service worker can't use sql.js directly, we fetch model config from side panel
  // Instead, we'll receive model config details in the message or look them up
  // For now, get from a simplified storage approach
  let modelConfig: { baseUrl: string; apiKey: string; model: string; maxTokens: number; temperature: number; fullUrl?: boolean } | null = null;

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
      messages: resolvedMessages,
      modelConfig,
      thinkRounds,
      abortController,
      sendToSender,
    });
  } else {
    // Original logic: direct answer
    handleDirectChat({
      conversationId,
      messages: resolvedMessages,
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
  modelConfig: { baseUrl: string; apiKey: string; model: string; maxTokens: number; temperature: number; fullUrl?: boolean };
  abortController: AbortController;
  sendToSender: (msg: any) => void;
}) {
  let fullContent = '';
  let hasRetried = false;

  const attemptStream = (messagesToUse: ChatMessageInput[]) => {
    fullContent = '';

    streamChatCompletion({
      baseUrl: modelConfig.baseUrl,
      apiKey: modelConfig.apiKey,
      model: modelConfig.model,
      messages: messagesToUse,
      maxTokens: modelConfig.maxTokens,
      temperature: modelConfig.temperature,
      fullUrl: modelConfig.fullUrl,
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
      onError: async (error) => {
        // 上下文超长且未重试过 → 降级摘要后重试
        if (!hasRetried && isContextLengthError(error)) {
          hasRetried = true;
          try {
            const newMessages = await summarizeLongContent(
              messagesToUse, modelConfig, abortController.signal, sendToSender, conversationId,
            );
            if (newMessages) {
              attemptStream(newMessages);
              return;
            }
          } catch {
            // 降级失败，走正常报错
          }
          activeStreams.delete(conversationId);
          sendToSender({
            type: MSG_TYPES.CHAT_STREAM_ERROR,
            conversationId,
            error: '内容过长且无法压缩，请更换支持更长上下文的模型，或缩短页面内容后重试',
          });
          return;
        }
        activeStreams.delete(conversationId);
        sendToSender({
          type: MSG_TYPES.CHAT_STREAM_ERROR,
          conversationId,
          error,
        });
      },
    });
  };

  attemptStream(messages);
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
  modelConfig: { baseUrl: string; apiKey: string; model: string; maxTokens: number; temperature: number; fullUrl?: boolean };
  thinkRounds: number;
  abortController: AbortController;
  sendToSender: (msg: any) => void;
}) {
  let hasRetried = false;
  await executeThinkingChat(conversationId, messages, modelConfig, thinkRounds, abortController, sendToSender, hasRetried);
}

/** 思考模式的内部执行（支持重试） */
async function executeThinkingChat(
  conversationId: number,
  messages: ChatMessageInput[],
  modelConfig: { baseUrl: string; apiKey: string; model: string; maxTokens: number; temperature: number; fullUrl?: boolean },
  thinkRounds: number,
  abortController: AbortController,
  sendToSender: (msg: any) => void,
  hasRetried: boolean,
) {
  const thinkingHistory: string[] = [];
  const thinkingProcess: { round: number; content: string; isThinking: boolean }[] = [];

  sendToSender({
    type: 'THINK_STREAM_START',
    conversationId,
    totalRounds: thinkRounds,
  });

  try {
    for (let round = 1; round <= thinkRounds; round++) {
      if (abortController.signal.aborted) return;

      const thinkMessages = buildThinkMessages(messages, thinkingHistory, round);
      const thinkContent = await streamThinkingRound({
        baseUrl: modelConfig.baseUrl,
        apiKey: modelConfig.apiKey,
        model: modelConfig.model,
        messages: thinkMessages,
        maxTokens: modelConfig.maxTokens,
        temperature: modelConfig.temperature,
        fullUrl: modelConfig.fullUrl,
        abortSignal: abortController.signal,
        onChunk: (content) => {
          sendToSender({ type: 'THINK_STREAM_CHUNK', conversationId, round, content });
        },
      });

      thinkingHistory.push(thinkContent);
      thinkingProcess.push({ round, content: thinkContent, isThinking: true });
      sendToSender({ type: 'THINK_STREAM_ROUND_END', conversationId, round, fullContent: thinkContent });
    }

    sendToSender({ type: 'THINK_STREAM_END', conversationId });

    if (abortController.signal.aborted) return;

    const summaryMessages = buildSummaryMessages(messages, thinkingHistory);
    let fullContent = '';

    await streamChatCompletion({
      baseUrl: modelConfig.baseUrl,
      apiKey: modelConfig.apiKey,
      model: modelConfig.model,
      messages: summaryMessages,
      maxTokens: modelConfig.maxTokens,
      temperature: modelConfig.temperature,
      fullUrl: modelConfig.fullUrl,
      abortSignal: abortController.signal,
      onChunk: (content) => {
        fullContent += content;
        sendToSender({ type: MSG_TYPES.CHAT_STREAM_CHUNK, conversationId, content });
      },
      onEnd: () => {
        activeStreams.delete(conversationId);
        sendToSender({ type: MSG_TYPES.CHAT_STREAM_END, conversationId, fullContent, thinkingProcess });
      },
      onError: async (error) => {
        // 上下文超长且未重试过 → 降级摘要后重新执行整个思考流程
        if (!hasRetried && isContextLengthError(error)) {
          hasRetried = true;
          try {
            const newMessages = await summarizeLongContent(
              messages, modelConfig, abortController.signal, sendToSender, conversationId,
            );
            if (newMessages) {
              activeStreams.delete(conversationId);
              await executeThinkingChat(conversationId, newMessages, modelConfig, thinkRounds, abortController, sendToSender, hasRetried);
              return;
            }
          } catch {
            // 降级失败，走正常报错
          }
          activeStreams.delete(conversationId);
          sendToSender({
            type: MSG_TYPES.CHAT_STREAM_ERROR,
            conversationId,
            error: '内容过长且无法压缩，请更换支持更长上下文的模型，或缩短页面内容后重试',
          });
          return;
        }
        activeStreams.delete(conversationId);
        sendToSender({ type: MSG_TYPES.CHAT_STREAM_ERROR, conversationId, error });
      },
    });
  } catch (error: any) {
    // 上下文超长且未重试过 → 降级摘要后重新执行整个思考流程
    if (!hasRetried && error?.name !== 'AbortError' && isContextLengthError(error?.message || '')) {
      hasRetried = true;
      try {
        const newMessages = await summarizeLongContent(
          messages, modelConfig, abortController.signal, sendToSender, conversationId,
        );
        if (newMessages) {
          await executeThinkingChat(conversationId, newMessages, modelConfig, thinkRounds, abortController, sendToSender, hasRetried);
          return;
        }
      } catch {
        // 降级失败
      }
    }
    if (error?.name === 'AbortError') return;
    activeStreams.delete(conversationId);
    sendToSender({ type: MSG_TYPES.CHAT_STREAM_ERROR, conversationId, error: error?.message || 'Thinking process failed' });
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
  const thinkInstruction = `你现在处于"思考阶段"（第${currentRound}轮），请仅对这个用户的原始问题进行推理分析，不要给出最终答案。要求：
1. 分析问题的核心要点和关键信息
2. 列出可能的解决思路或方案
3. 评估每种方案的优缺点
4. 推理出最佳解答路径

注意：不要给出最终答案，只展示你的推理和思考过程。最终答案将在后续的"回答阶段"中给出。

用户的原始问题：`;

  if (typeof lastUserMessage.content === 'string') {
    // 纯文本：与原逻辑完全一致（零回归）
    messages.push({
      role: 'user',
      content: `${thinkInstruction}\n${lastUserMessage.content}`,
    });
  } else {
    // 多模态 content（含图片）：前置思考指令 text part，保留原 image parts
    const parts: ContentPart[] = [{ type: 'text', text: `${thinkInstruction}\n` }, ...lastUserMessage.content];
    messages.push({ role: 'user', content: parts });
  }

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
  const { base_url, api_key, model_id, full_url } = message.modelConfig || {};
  if (!base_url || !api_key || !model_id) {
    return { type: MSG_TYPES.TEST_AI_RESULT, success: false, error: 'Missing required fields' };
  }
  const result = await testConnection(base_url, api_key, model_id, !!full_url);
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

async function handleTestNotionConnection(message: any): Promise<unknown> {
  const { token, parentPageId } = message;
  if (!token) {
    return { type: MSG_TYPES.TEST_NOTION_RESULT, success: false, error: '缺少 Notion Integration Token' };
  }
  const result = await testNotionConnection(token, parentPageId || undefined);
  return { type: MSG_TYPES.TEST_NOTION_RESULT, ...result };
}

async function handleSyncToNotion(message: any): Promise<unknown> {
  const { title, content, notionPageId, notionConfig } = message;
  if (!notionConfig || !notionConfig.token) {
    return { type: MSG_TYPES.SYNC_TO_NOTION_RESULT, success: false, error: 'Notion 未配置' };
  }
  if (!notionConfig.parentPageId && !notionPageId) {
    return { type: MSG_TYPES.SYNC_TO_NOTION_RESULT, success: false, error: '请在设置中配置 Notion 目标页面 ID' };
  }

  try {
    const result = await syncNotionPage({
      token: notionConfig.token,
      parentPageId: notionConfig.parentPageId,
      title,
      content,
      notionPageId: notionPageId || undefined,
    });
    return {
      type: MSG_TYPES.SYNC_TO_NOTION_RESULT,
      success: true,
      pageId: result.pageId,
      pageUrl: result.pageUrl,
      mode: result.mode,
    };
  } catch (err: any) {
    return {
      type: MSG_TYPES.SYNC_TO_NOTION_RESULT,
      success: false,
      error: err.message || '同步到 Notion 失败',
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
      fullUrl: modelConfig.fullUrl,
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

// ===================== Long Content Degradation =====================

/** 检测是否为上下文超长错误 */
function isContextLengthError(error: string): boolean {
  const lower = error.toLowerCase();
  return lower.includes('context length')
    || lower.includes('context_length')
    || lower.includes('maximum context')
    || lower.includes('token limit')
    || lower.includes('input length')
    || (lower.includes('400') && (lower.includes('length') || lower.includes('too long')));
}

/** 通用：从文本中提取指定 XML 标签的内容 */
function extractTagContent(text: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}>\\n?([\\s\\S]*?)\\n?</${tagName}>`);
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

/** 通用：替换文本中指定 XML 标签的内容 */
function replaceTagContent(text: string, tagName: string, newContent: string): string {
  const regex = new RegExp(`<${tagName}>\\n?[\\s\\S]*?\\n?</${tagName}>`);
  return text.replace(regex, `<${tagName}>\n${newContent}\n</${tagName}>`);
}

/** 将长文本按段落边界分块 */
function chunkText(text: string, chunkSize: number = CHUNK_SIZE, overlap: number = CHUNK_OVERLAP): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    // 非最后一块时，尝试在语义边界处分割
    if (end < text.length) {
      const segment = text.slice(start, end);
      const lastParagraph = segment.lastIndexOf('\n\n');
      if (lastParagraph > chunkSize * 0.5) {
        end = start + lastParagraph;
      } else {
        const lastNewline = segment.lastIndexOf('\n');
        if (lastNewline > chunkSize * 0.5) {
          end = start + lastNewline;
        } else {
          const lastPeriod = Math.max(segment.lastIndexOf('。'), segment.lastIndexOf('.'));
          if (lastPeriod > chunkSize * 0.3) {
            end = start + lastPeriod + 1;
          }
        }
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // 下一块从 overlap 位置开始
    const nextStart = end - overlap;
    start = nextStart <= start ? end : nextStart;

    // 防死循环：确保 progress
    if (start <= (chunks.length > 1 ? end - chunkSize : 0)) {
      start = end;
    }
  }

  return chunks;
}

/** 正文顺序累积摘要（段落边界分块，空值兜底） */
async function summarizeBody(
  body: string,
  modelConfig: { baseUrl: string; apiKey: string; model: string; maxTokens: number; temperature: number; fullUrl?: boolean },
  abortSignal: AbortSignal,
  sendToSender: (msg: any) => void,
  conversationId: number,
  baseProgress: number,
  totalSteps: number,
): Promise<string> {
  let content = body;
  if (content.length > MAX_PAGE_CONTENT_ABSOLUTE) {
    content = content.slice(0, MAX_PAGE_CONTENT_ABSOLUTE) + '\n\n[内容过长，已截断...]';
  }

  const chunks = chunkText(content);
  let accumulated = '';

  for (let i = 0; i < chunks.length; i++) {
    if (abortSignal.aborted) throw new DOMException('Aborted', 'AbortError');

    sendToSender({
      type: MSG_TYPES.CHUNKED_SUMMARY_PROGRESS,
      conversationId,
      currentChunk: baseProgress + i + 1,
      totalChunks: totalSteps,
    });

    let prompt: string;
    if (i === 0) {
      prompt = `请对以下页面正文片段进行详细摘要，保留所有关键信息：主题、核心观点、重要事实和数据、人名术语、列表结构。不要遗漏重要细节。

<content>
${chunks[i]}
</content>`;
    } else {
      prompt = `以下是之前正文内容的摘要，请在理解前文的基础上继续摘要当前片段。

<previous_summary>
${accumulated}
</previous_summary>

<current_content>
${chunks[i]}
</current_content>

请对当前片段进行详细摘要，注意与前文的逻辑关联。保留所有关键信息：主题、核心观点、重要事实和数据、人名术语、列表结构。不要遗漏重要细节。`;
    }

    let summary = await chatCompletion({
      baseUrl: modelConfig.baseUrl,
      apiKey: modelConfig.apiKey,
      model: modelConfig.model,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: modelConfig.maxTokens,
      temperature: 0.3,
      fullUrl: modelConfig.fullUrl,
    });

    // 空值兜底：绝不用空字符串替换原始内容
    if (!summary || !summary.trim()) {
      summary = chunks[i].slice(0, 2000) + (chunks[i].length > 2000 ? '\n[片段过长，已截断]' : '');
    }

    accumulated = summary;
  }

  return accumulated;
}

/** 评论按条目分组摘要（保留编号/作者/点赞，不劈开单条评论） */
async function summarizeComments(
  commentsText: string,
  modelConfig: { baseUrl: string; apiKey: string; model: string; maxTokens: number; temperature: number; fullUrl?: boolean },
  abortSignal: AbortSignal,
  sendToSender: (msg: any) => void,
  conversationId: number,
  baseProgress: number,
  totalSteps: number,
): Promise<string> {
  // 按评论条目切分（以 [N] 开头的行为单位）
  const allLines = commentsText.split('\n');
  const commentEntries: string[] = [];
  let currentEntry = '';

  for (const line of allLines) {
    if (/^\[\d+\]/.test(line.trim())) {
      if (currentEntry.trim()) commentEntries.push(currentEntry.trim());
      currentEntry = line;
    } else {
      currentEntry += '\n' + line;
    }
  }
  if (currentEntry.trim()) commentEntries.push(currentEntry.trim());

  // 按条目分组（每组最多 GROUP_SIZE 条）
  const GROUP_SIZE = 40;
  const groups: string[][] = [];
  for (let i = 0; i < commentEntries.length; i += GROUP_SIZE) {
    groups.push(commentEntries.slice(i, i + GROUP_SIZE));
  }

  const summaries: string[] = [];

  for (let g = 0; g < groups.length; g++) {
    if (abortSignal.aborted) throw new DOMException('Aborted', 'AbortError');

    sendToSender({
      type: MSG_TYPES.CHUNKED_SUMMARY_PROGRESS,
      conversationId,
      currentChunk: baseProgress + g + 1,
      totalChunks: totalSteps,
    });

    const group = groups[g];
    const startIdx = g * GROUP_SIZE + 1;
    const endIdx = startIdx + group.length - 1;

    const prompt = `以下是第 ${startIdx}-${endIdx} 条用户评论。请逐条保留编号、作者、点赞数，将每条评论内容精简为核心观点。格式要求：[编号] 作者(👍赞): 精简内容。如果某条评论没有作者或点赞信息，省略对应部分即可。

<comments>
${group.join('\n')}
</comments>`;

    let summary = await chatCompletion({
      baseUrl: modelConfig.baseUrl,
      apiKey: modelConfig.apiKey,
      model: modelConfig.model,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: modelConfig.maxTokens,
      temperature: 0.3,
      fullUrl: modelConfig.fullUrl,
    });

    // 空值兜底：保留原始评论
    if (!summary || !summary.trim()) {
      summary = group.join('\n');
    }

    summaries.push(summary);
  }

  return summaries.join('\n');
}

/** 结构感知的长内容降级：分别对正文和评论独立摘要，metadata 永不摘要 */
async function summarizeLongContent(
  messages: ChatMessageInput[],
  modelConfig: { baseUrl: string; apiKey: string; model: string; maxTokens: number; temperature: number; fullUrl?: boolean },
  abortSignal: AbortSignal,
  sendToSender: (msg: any) => void,
  conversationId: number,
): Promise<ChatMessageInput[] | null> {
  const systemMsgIndex = messages.findIndex(
    (m) => m.role === 'system' && typeof m.content === 'string' && m.content.includes('<page_content>'),
  );
  if (systemMsgIndex === -1) return null;

  const systemMsg = messages[systemMsgIndex];
  // findIndex 守卫已确保该 system 消息的 content 是 string，此处断言避免联合类型报错
  let newContent = systemMsg.content as string;
  let changed = false;

  // 估算需要摘要的步数（正文块数 + 评论组数），用于进度显示
  const body = extractTagContent(newContent, 'page_content');
  const comments = extractTagContent(newContent, 'comments');
  const bodyChunks = body ? chunkText(body).length : 0;
  const commentGroups = comments ? Math.ceil(comments.split('\n').filter(l => /^\[\d+\]/.test(l.trim())).length / 40) : 0;
  const totalSteps = bodyChunks + commentGroups;

  if (totalSteps === 0) return null;

  sendToSender({ type: MSG_TYPES.CHUNKED_SUMMARY_START, conversationId, totalChunks: totalSteps });

  try {
    // 1. 摘要正文（独立处理，不影响评论）
    if (body && body.length > 10000) {
      const bodySummary = await summarizeBody(body, modelConfig, abortSignal, sendToSender, conversationId, 0, totalSteps);
      if (bodySummary && bodySummary !== body) {
        newContent = replaceTagContent(newContent, 'page_content', bodySummary);
        changed = true;
      }
    }

    // 2. 摘要评论（独立处理，不影响正文）
    if (comments && comments.length > 10000) {
      const commentsSummary = await summarizeComments(comments, modelConfig, abortSignal, sendToSender, conversationId, bodyChunks, totalSteps);
      if (commentsSummary && commentsSummary !== comments) {
        newContent = replaceTagContent(newContent, 'comments', commentsSummary);
        changed = true;
      }
    }
  } finally {
    sendToSender({ type: MSG_TYPES.CHUNKED_SUMMARY_END, conversationId });
  }

  if (!changed) return null;

  const newMessages = [...messages];
  newMessages[systemMsgIndex] = { ...systemMsg, content: newContent };
  return newMessages;
}

export { activeStreams };
