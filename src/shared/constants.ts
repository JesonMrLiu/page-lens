// ===================== Message Types =====================
export const MSG_TYPES = {
  // Page extraction
  EXTRACT_PAGE: 'EXTRACT_PAGE',
  EXTRACT_PAGE_RESULT: 'EXTRACT_PAGE_RESULT',

  // Chat
  CHAT_REQUEST: 'CHAT_REQUEST',
  CHAT_STREAM_CHUNK: 'CHAT_STREAM_CHUNK',
  CHAT_STREAM_END: 'CHAT_STREAM_END',
  CHAT_STREAM_ERROR: 'CHAT_STREAM_ERROR',
  CANCEL_STREAM: 'CANCEL_STREAM',

  // Connection testing
  TEST_AI_CONNECTION: 'TEST_AI_CONNECTION',
  TEST_AI_RESULT: 'TEST_AI_RESULT',
  TEST_FEISHU_CONNECTION: 'TEST_FEISHU_CONNECTION',
  TEST_FEISHU_RESULT: 'TEST_FEISHU_RESULT',

  // Feishu export
  EXPORT_TO_FEISHU: 'EXPORT_TO_FEISHU',
  EXPORT_TO_FEISHU_RESULT: 'EXPORT_TO_FEISHU_RESULT',

  // Tab info
  GET_ACTIVE_TAB: 'GET_ACTIVE_TAB',
  GET_ACTIVE_TAB_RESULT: 'GET_ACTIVE_TAB_RESULT',

  // Content script extraction
  EXTRACT: 'EXTRACT',
  EXTRACT_RESULT: 'EXTRACT_RESULT',
} as const;

// ===================== Defaults =====================
export const DEFAULT_MAX_TOKENS = 4096;
export const DEFAULT_TEMPERATURE = 0.7;
export const MAX_PAGE_CONTENT_LENGTH = 15000;

// ===================== Prompt Templates =====================
export const PROMPTS = {
  summarize: (language: string = 'zh') => {
    return language === 'zh'
      ? '请总结当前页面内容，包含核心摘要和关键要点。如涉及流程、架构或因果关系，请用 Mermaid 图表可视化说明。'
      : 'Please summarize the current page content, including a core summary and key points. If it involves processes, architecture, or causal relationships, use Mermaid diagrams for visual explanation.';
  },
  translateToZh: () => {
    return '请将当前页面的内容翻译为中文，保持原有格式。';
  },
  translateToEn: () => {
    return 'Please translate the current page content to English, preserving the original formatting.';
  },
} as const;

// ===================== Storage Keys =====================
export const STORAGE_KEYS = {
  DB_DATA: 'ai_summary_db_data',
  DB_VERSION: 'ai_summary_db_version',
  SETTINGS_LANGUAGE: 'ai_summary_language',
  SETTINGS_THEME: 'ai_summary_theme',
} as const;

// ===================== DB Constants =====================
export const CURRENT_SCHEMA_VERSION = 1;
