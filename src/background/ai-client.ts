import type { ChatMessageInput } from '@/shared/types';

interface StreamChatOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessageInput[];
  maxTokens?: number;
  temperature?: number;
  onChunk: (content: string) => void;
  onEnd: (fullContent: string) => void;
  onError: (error: string) => void;
  abortSignal?: AbortSignal;
}

/**
 * Send a streaming chat completion request to an OpenAI-compatible API.
 * Uses native fetch + ReadableStream for SSE parsing.
 */
export async function streamChatCompletion({
  baseUrl,
  apiKey,
  model,
  messages,
  maxTokens = 4096,
  temperature = 0.7,
  onChunk,
  onEnd,
  onError,
  abortSignal,
}: StreamChatOptions): Promise<void> {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API error (${response.status}): ${errorBody}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6); // Remove 'data: ' prefix
        if (data === '[DONE]') {
          onEnd(fullContent);
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullContent += content;
            onChunk(content);
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // If we reach here without [DONE], still call onEnd
    onEnd(fullContent);
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return; // Stream was cancelled
    }
    onError(error.message || 'Unknown error occurred');
  }
}

/**
 * Send a single thinking round request to an OpenAI-compatible API.
 * Returns the full thinking content for this round.
 */
export async function streamThinkingRound({
  baseUrl,
  apiKey,
  model,
  messages,
  maxTokens = 4096,
  temperature = 0.7,
  onChunk,
  abortSignal,
}: Omit<StreamChatOptions, 'onEnd' | 'onError'>): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  let fullContent = '';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API error (${response.status}): ${errorBody}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6);
      if (data === '[DONE]') {
        return fullContent;
      }

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          fullContent += content;
          onChunk(content);
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  }

  return fullContent;
}

/**
 * Send a non-streaming chat completion request to an OpenAI-compatible API.
 * Returns the full response text. Used for short one-shot tasks like title generation.
 */
export async function chatCompletion({
  baseUrl,
  apiKey,
  model,
  messages,
  maxTokens = 100,
  temperature = 0.3,
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessageInput[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Test connection to an OpenAI-compatible API.
 * Sends a minimal completion request and returns success/failure.
 */
export async function testConnection(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<{ success: boolean; error?: string }> {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { success: false, error: `API error (${response.status}): ${errorBody}` };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Connection failed' };
  }
}
