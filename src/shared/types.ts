// ===================== Think Mode =====================
export type ThinkMode = 'none' | 'normal' | 'deep';

export interface ThinkingProcess {
  round: number;       // 第几轮思考
  content: string;     // 思考内容
  isThinking: boolean; // 是否是思考阶段（false表示总结阶段）
}

// ===================== AI Model Config =====================
export interface ModelConfig {
  id: number;
  name: string;
  base_url: string;
  api_key: string;
  model_id: string;
  max_tokens: number;
  temperature: number;
  is_default: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CreateModelConfig {
  name: string;
  base_url: string;
  api_key: string;
  model_id: string;
  max_tokens?: number;
  temperature?: number;
  is_default?: number;
  is_active?: number;
}

export interface UpdateModelConfig extends Partial<CreateModelConfig> {
  id: number;
}

// ===================== Feishu Config =====================
export interface FeishuConfig {
  id: number;
  name: string;
  app_id: string;
  app_secret: string;
  folder_token: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CreateFeishuConfig {
  name?: string;
  app_id: string;
  app_secret: string;
  folder_token?: string;
  is_active?: number;
}

// ===================== Conversation =====================
export interface Conversation {
  id: number;
  title: string;
  model_config_id: number | null;
  page_url: string;
  page_title: string;
  created_at: string;
  updated_at: string;
}

// ===================== Message =====================
export interface Message {
  id: number;
  conversation_id: number;
  role: 'system' | 'user' | 'assistant';
  content: string;
  thinking_process?: ThinkingProcess[]; // 思考过程记录
  model_config_id: number | null;
  created_at: string;
}

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ===================== Note =====================
export interface Note {
  id: number;
  title: string;
  content: string;
  source_url: string;
  source_type: 'chat' | 'summary' | 'translation' | 'manual';
  conversation_id: number | null;
  message_id: number | null;
  feishu_doc_id: string;
  feishu_doc_url: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

// ===================== Page Content =====================
export interface PageContent {
  title: string;
  description: string;
  url: string;
  language: string;
  textContent: string;
  htmlContent: string;
}

// ===================== Chat Stream =====================
export interface StreamChunk {
  content: string;
  done: boolean;
  error?: string;
}
