/**
 * Notion API Client.
 * 通过 Internal Integration Token 鉴权，支持将 Markdown 同步到 Notion 页面。
 * - 首次同步：在 parent_page_id 下创建子页面并写入内容
 * - 重复同步：清空已有页面的子块后重新写入（不重复创建页面），并刷新标题
 */

const NOTION_BASE_URL = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

/** Notion 单个 rich_text text 节点的 content 长度上限（官方 2000，留余量）。 */
const NOTION_TEXT_MAX_LEN = 2000;
/** append children 单次最多 100 个块。 */
const NOTION_APPEND_BATCH = 100;

/**
 * 安全解析 fetch 响应为 JSON。处理 Notion 返回非 JSON（如 HTML/网关错误页）的情况。
 */
async function safeParseJSON(response: Response, url?: string): Promise<any> {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  if (contentType.includes('application/json') || text.trim().startsWith('{')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Notion API 返回了无效的 JSON（HTTP ${response.status}，URL: ${url || response.url}）。响应内容: ${text.substring(0, 200)}`);
    }
  }
  const urlHint = url ? `，请求地址: ${url}` : '';
  throw new Error(`Notion API 返回了非 JSON 内容（HTTP ${response.status}, Content-Type: ${contentType}${urlHint}）。响应内容: ${text.substring(0, 200)}`);
}

function notionHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

/**
 * 将 Notion API 错误响应归约为可读的中文提示。
 * Notion 错误体形如 { object: "error", status: 404, message: "Could not find page..." }
 */
function describeNotionError(status: number, body: any): string {
  const msg: string = body?.message || '';
  if (status === 401) {
    return `Notion 认证失败（401）。请检查 Integration Token 是否正确，且未过期。${msg ? '（' + msg + '）' : ''}`;
  }
  if (status === 403) {
    return `Notion 权限不足（403）。请在 Notion 目标页面右上角「···」→「Connect to」中选择并添加该 Integration。${msg ? '（' + msg + '）' : ''}`;
  }
  if (status === 404) {
    return `Notion 资源不存在（404）。请检查目标页面 ID 是否正确，且 Integration 已被连接到该页面。${msg ? '（' + msg + '）' : ''}`;
  }
  if (status === 429) {
    return `Notion 请求被限频（429），请稍后重试。${msg ? '（' + msg + '）' : ''}`;
  }
  return `Notion API 失败（HTTP ${status}）${msg ? '：' + msg : ''}`;
}

/** 统一的 Notion 请求封装：返回 { ok, status, data }，由调用方决定如何处理错误。 */
async function notionRequest(
  token: string,
  method: string,
  path: string,
  body?: any,
  query?: Record<string, string | number>,
): Promise<{ ok: boolean; status: number; data: any }> {
  let url = `${NOTION_BASE_URL}${path}`;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) qs.set(k, String(v));
    url += `?${qs.toString()}`;
  }
  const resp = await fetch(url, {
    method,
    headers: notionHeaders(token),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await safeParseJSON(resp, url);
  // Notion 成功时 object !== 'error'；但以 HTTP 2xx 为准更稳妥
  return { ok: resp.ok, status: resp.status, data };
}

// ===================== Connection Test =====================

/**
 * 测试 Notion 连接。
 * Step 1: GET /v1/users/me 验证 token 有效性。
 * Step 2（可选）: 若提供 parentPageId，GET /v1/pages/{id} 验证应用可访问该页面。
 */
export async function testNotionConnection(
  token: string,
  parentPageId?: string,
): Promise<{ success: boolean; error?: string }> {
  // Step 1: 验证 token
  let meResp;
  try {
    meResp = await notionRequest(token, 'GET', '/users/me');
  } catch (err: any) {
    return { success: false, error: `连接失败：${err.message}` };
  }
  if (!meResp.ok) {
    return { success: false, error: describeNotionError(meResp.status, meResp.data) };
  }
  // bot 类型的 integration 应返回 type === 'bot'
  if (meResp.data?.type && meResp.data.type !== 'bot') {
    return { success: false, error: 'Token 有效但不是 Integration Bot token，请使用 Internal Integration Token。' };
  }

  // Step 2: 验证父页面可访问
  if (parentPageId) {
    const cleanId = normalizePageId(parentPageId);
    const pageResp = await notionRequest(token, 'GET', `/pages/${cleanId}`);
    if (!pageResp.ok) {
      return { success: false, error: describeNotionError(pageResp.status, pageResp.data) };
    }
  }

  return { success: true };
}

// ===================== Markdown → Notion Blocks =====================

/** Notion rich_text annotations。 */
interface Annotations {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
  color?: string;
}

/** 将超长文本切分为多段（每段 ≤ maxLen），优先在换行处切。 */
function splitLongContent(content: string, maxLen: number = NOTION_TEXT_MAX_LEN): string[] {
  if (content.length <= maxLen) return [content];
  const parts: string[] = [];
  let i = 0;
  while (i < content.length) {
    let end = Math.min(i + maxLen, content.length);
    if (end < content.length) {
      const nl = content.lastIndexOf('\n', end);
      if (nl > i + Math.floor(maxLen / 2)) end = nl;
    }
    parts.push(content.slice(i, end));
    i = end;
  }
  return parts;
}

/** 去除转义反斜杠：\* → *。 */
function stripEscapes(text: string): string {
  return text.replace(/\\(.)/g, '$1');
}

/** 查找定界符的下一个出现位置，跳过被反斜杠转义的字符；未找到返回 -1。 */
function findDelimiter(text: string, delimiter: string): number {
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\') { i += 2; continue; }
    if (text.startsWith(delimiter, i)) return i;
    i++;
  }
  return -1;
}

// 行内标记规则：定界符 + 对应 annotations（按长度降序，保证 ***、** 优先于 *）
const INLINE_RULES: { delimiter: string; style: Annotations }[] = [
  { delimiter: '***', style: { bold: true, italic: true } },
  { delimiter: '**', style: { bold: true } },
  { delimiter: '__', style: { bold: true } },
  { delimiter: '~~', style: { strikethrough: true } },
  { delimiter: '`', style: { code: true } },
  { delimiter: '*', style: { italic: true } },
  { delimiter: '_', style: { italic: true } },
];

const LINK_REGEX = /\[([^\]]*)\]\(([^)\s]+)\)/;

/** 构造一个 Notion rich_text text 节点（自动对超长 content 分片）。 */
function makeRichText(content: string, annotations: Annotations = {}, linkUrl?: string): any[] {
  return splitLongContent(content).map((c) => {
    const text: any = { content: c };
    if (linkUrl) text.link = { url: linkUrl };
    return {
      type: 'text',
      text,
      annotations,
    };
  });
}

/**
 * 将一行 Markdown 文本解析为 Notion rich_text 数组，支持行内格式：
 * 加粗、斜体、加粗斜体、删除线、行内代码、链接 [text](url)，并支持简单嵌套。
 */
export function parseInlineToRichText(text: string, inherited: Annotations = {}): any[] {
  const result: any[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    let bestPos = -1;
    let bestEnd = -1;
    let bestContent = '';
    let bestStyle: Annotations = inherited;
    let bestLink: string | undefined;
    let isLink = false;

    // 1) 链接候选
    const linkMatch = LINK_REGEX.exec(remaining);
    if (linkMatch) {
      bestPos = linkMatch.index;
      bestEnd = linkMatch.index + linkMatch[0].length;
      bestContent = linkMatch[1];
      bestLink = linkMatch[2];
      bestStyle = inherited;
      isLink = true;
    }

    // 2) 定界符候选
    for (const rule of INLINE_RULES) {
      const start = findDelimiter(remaining, rule.delimiter);
      if (start !== -1 && (bestPos === -1 || start < bestPos)) {
        const afterStart = start + rule.delimiter.length;
        const end = findDelimiter(remaining.slice(afterStart), rule.delimiter);
        if (end !== -1) {
          bestPos = start;
          bestEnd = afterStart + end + rule.delimiter.length;
          bestContent = remaining.slice(afterStart, afterStart + end);
          bestStyle = { ...inherited, ...rule.style };
          bestLink = undefined;
          isLink = false;
        }
      }
    }

    if (bestPos === -1) {
      result.push(...makeRichText(stripEscapes(remaining), inherited));
      break;
    }

    if (bestPos > 0) {
      result.push(...makeRichText(stripEscapes(remaining.slice(0, bestPos)), inherited));
    }

    if (isLink) {
      // 链接：显示文本整体作为一个 text 节点（带 link），不递归内部
      result.push(...makeRichText(bestContent, bestStyle, bestLink));
    } else {
      result.push(...parseInlineToRichText(bestContent, bestStyle));
    }

    remaining = remaining.slice(bestEnd);
  }

  // Notion rich_text 数组总字符上限约 2000（跨节点合计），这里仅保证单节点不超限；
  // 极长段落由 Notion 自身处理。空数组补一个空节点避免空块校验失败。
  return result.length > 0 ? result : makeRichText('');
}

/** Notion block 工厂函数。 */
function paraBlock(richText: any[]): any {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: richText } };
}
function headingBlock(level: number, richText: any[]): any {
  // Notion 只支持 heading_1/2/3；4-6 统一降为 heading_3
  const lv = Math.min(Math.max(level, 1), 3);
  const type = `heading_${lv}` as 'heading_1' | 'heading_2' | 'heading_3';
  return { object: 'block', type, [type]: { rich_text: richText } };
}
function bulletBlock(richText: any[]): any {
  return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: richText } };
}
function orderedBlock(richText: any[]): any {
  return { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: richText } };
}
function quoteBlock(richText: any[]): any {
  return { object: 'block', type: 'quote', quote: { rich_text: richText } };
}
function codeBlock(code: string, lang: string): any {
  return {
    object: 'block',
    type: 'code',
    code: {
      rich_text: makeRichText(code),
      caption: [],
      language: normalizeCodeLanguage(lang),
    },
  };
}

/** 将围栏语言标识归约为 Notion 支持的 language 值。 */
function normalizeCodeLanguage(lang: string): string {
  const l = (lang || '').trim().toLowerCase();
  if (!l) return 'plain text';
  // Notion 接受的语言列表子集映射
  const alias: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    sh: 'bash',
    shell: 'bash',
    yml: 'yaml',
    'c++': 'c++',
    cpp: 'c++',
    cs: 'c#',
    'c#': 'c#',
  };
  return alias[l] || l;
}

/**
 * 将 Markdown 文本转换为 Notion block 数组。
 * 支持：段落、标题(1-6)、无序列表、有序列表、引用、代码块、分隔线，及行内格式（粗体/斜体/删除线/行内代码/链接）。
 */
export function markdownToNotionBlocks(markdown: string): any[] {
  const lines = markdown.split('\n');
  const blocks: any[] = [];
  let inCodeBlock = false;
  let codeContent = '';
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 代码围栏切换
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        blocks.push(codeBlock(codeContent.replace(/\n$/, ''), codeLang));
        codeContent = '';
        codeLang = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += line + '\n';
      continue;
    }

    // 标题（# 后至少一个空白）
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push(headingBlock(headingMatch[1].length, parseInlineToRichText(headingMatch[2])));
      continue;
    }
    // 无序列表
    if (line.startsWith('- ') || line.startsWith('* ')) {
      blocks.push(bulletBlock(parseInlineToRichText(line.slice(2))));
      continue;
    }
    // 有序列表
    if (/^\d+\.\s/.test(line)) {
      blocks.push(orderedBlock(parseInlineToRichText(line.replace(/^\d+\.\s/, ''))));
      continue;
    }
    // 引用
    if (line.startsWith('> ')) {
      blocks.push(quoteBlock(parseInlineToRichText(line.slice(2))));
      continue;
    }
    // 分隔线
    if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') {
      blocks.push({ object: 'block', type: 'divider', divider: {} });
      continue;
    }
    // 空行跳过
    if (line.trim() === '') continue;
    // 普通段落
    blocks.push(paraBlock(parseInlineToRichText(line)));
  }

  // 未闭合的代码块兜底
  if (inCodeBlock && codeContent) {
    blocks.push(codeBlock(codeContent.replace(/\n$/, ''), codeLang));
  }

  return blocks;
}

// ===================== Page Sync =====================

/** 规范化页面 id：去除连字符与多余空白（Notion 接受 32 位无连字符 id）。 */
function normalizePageId(id: string): string {
  return id.trim().replace(/-/g, '').replace(/^.*\//, '');
}

/** 构造 Notion 页面的可访问 URL。 */
function notionPageUrl(pageId: string): string {
  const clean = normalizePageId(pageId);
  return `https://www.notion.so/${clean}`;
}

/** 分批 append children 到指定父块（每次 ≤ 100 个）。 */
async function appendBlocks(token: string, parentId: string, blocks: any[]): Promise<void> {
  for (let i = 0; i < blocks.length; i += NOTION_APPEND_BATCH) {
    const batch = blocks.slice(i, i + NOTION_APPEND_BATCH);
    const resp = await notionRequest(token, 'PATCH', `/blocks/${parentId}/children`, {
      children: batch,
    });
    if (!resp.ok) {
      throw new Error(describeNotionError(resp.status, resp.data));
    }
  }
}

/**
 * 获取一个页面的所有顶层子块（分页拉取），用于在更新前清空旧内容。
 */
async function listChildBlocks(token: string, pageId: string): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | undefined = undefined;
  do {
    const resp = await notionRequest(token, 'GET', `/blocks/${pageId}/children`, undefined, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    if (!resp.ok) {
      throw new Error(describeNotionError(resp.status, resp.data));
    }
    const results = resp.data?.results || [];
    all.push(...results);
    cursor = resp.data?.has_more ? resp.data?.next_cursor : undefined;
  } while (cursor);
  return all;
}

/**
 * 将 Markdown 同步到 Notion。
 * - notionPageId 为空：在 parentPageId 下创建新页面，返回 { mode: 'created' }。
 * - notionPageId 非空：更新该页面标题 + 清空子块 + 重新写入，返回 { mode: 'updated' }。
 */
export async function syncNotionPage(params: {
  token: string;
  parentPageId: string;
  title: string;
  content: string;
  notionPageId?: string;
}): Promise<{ pageId: string; pageUrl: string; mode: 'created' | 'updated' }> {
  const { token, parentPageId, title, content } = params;

  const blocks = markdownToNotionBlocks(content);
  // Notion 单页面块数无硬上限，但超长内容截断到合理范围，避免请求过大
  const NOTION_BLOCK_LIMIT = 1500;
  const truncatedBlocks = blocks.length > NOTION_BLOCK_LIMIT
    ? blocks.slice(0, NOTION_BLOCK_LIMIT)
    : blocks;

  // 已有页面 → 更新（仅替换内容，不重复创建）
  if (params.notionPageId) {
    const pageId = normalizePageId(params.notionPageId);

    // 1) 更新标题
    const titleResp = await notionRequest(token, 'PATCH', `/pages/${pageId}`, {
      properties: {
        title: {
          title: makeRichText(title),
        },
      },
    });
    if (!titleResp.ok) {
      throw new Error('更新页面标题失败：' + describeNotionError(titleResp.status, titleResp.data));
    }

    // 2) 清空旧子块：列出所有顶层子块并逐个删除
    const oldBlocks = await listChildBlocks(token, pageId);
    for (const b of oldBlocks) {
      const delResp = await notionRequest(token, 'DELETE', `/blocks/${b.id}`);
      if (!delResp.ok) {
        // 单个块删除失败不中断整体同步，记录后继续
        console.warn(`[PageLens] 删除旧块 ${b.id} 失败：`, describeNotionError(delResp.status, delResp.data));
      }
    }

    // 3) 追加新内容
    await appendBlocks(token, pageId, truncatedBlocks);

    return { pageId, pageUrl: notionPageUrl(pageId), mode: 'updated' };
  }

  // 首次同步 → 创建新页面
  const parentClean = normalizePageId(parentPageId);
  const createBody: any = {
    parent: { page_id: parentClean },
    properties: {
      title: {
        title: makeRichText(title),
      },
    },
    children: truncatedBlocks.slice(0, NOTION_APPEND_BATCH),
  };
  const createResp = await notionRequest(token, 'POST', '/pages', createBody);
  if (!createResp.ok) {
    throw new Error('创建 Notion 页面失败：' + describeNotionError(createResp.status, createResp.data));
  }
  const pageId = createResp.data.id;
  const pageUrl = createResp.data.url || notionPageUrl(pageId);

  // 首批 children 已随创建写入，剩余分批 append
  if (truncatedBlocks.length > NOTION_APPEND_BATCH) {
    await appendBlocks(token, pageId, truncatedBlocks.slice(NOTION_APPEND_BATCH));
  }

  return { pageId, pageUrl, mode: 'created' };
}
