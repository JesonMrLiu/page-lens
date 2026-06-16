// ===================== Think Mode =====================
export const THINK_MODES = {
  none: { label: '直接回答', rounds: 0 },
  normal: { label: '一般思考', rounds: 1 },
  deep: { label: '深度思考', rounds: 3 },
} as const;

export const MAX_THINK_ROUNDS = 5;
export const DEFAULT_NORMAL_ROUNDS = 1;
export const DEFAULT_DEEP_ROUNDS = 3;

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
  THINK_STREAM_START: 'THINK_STREAM_START',
  CANCEL_STREAM: 'CANCEL_STREAM',

  // Connection testing
  TEST_AI_CONNECTION: 'TEST_AI_CONNECTION',
  TEST_AI_RESULT: 'TEST_AI_RESULT',
  TEST_FEISHU_CONNECTION: 'TEST_FEISHU_CONNECTION',
  TEST_FEISHU_RESULT: 'TEST_FEISHU_RESULT',

  // Feishu export
  EXPORT_TO_FEISHU: 'EXPORT_TO_FEISHU',
  EXPORT_TO_FEISHU_RESULT: 'EXPORT_TO_FEISHU_RESULT',

  // Feishu doc existence check (verify a saved cloud doc still exists)
  CHECK_FEISHU_DOC: 'CHECK_FEISHU_DOC',
  CHECK_FEISHU_DOC_RESULT: 'CHECK_FEISHU_DOC_RESULT',

  // AI title generation
  GENERATE_TITLE: 'GENERATE_TITLE',
  GENERATE_TITLE_RESULT: 'GENERATE_TITLE_RESULT',

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
      ? '请总结当前页面内容，包含核心摘要和关键要点。'
      : 'Please summarize the current page content, including a core summary and key points.';
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
  DB_DATA: 'ai_summary_data',
  DB_VERSION: 'ai_summary_db_version',
  SETTINGS_LANGUAGE: 'ai_summary_language',
  SETTINGS_THEME: 'ai_summary_theme',
  THINK_NORMAL_ROUNDS: 'ai_summary_think_normal_rounds',
  THINK_DEEP_ROUNDS: 'ai_summary_think_deep_rounds',
} as const;

// ===================== DB Constants =====================
export const CURRENT_SCHEMA_VERSION = 1;
