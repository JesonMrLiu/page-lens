/**
 * Safely parse a fetch response as JSON.
 * Handles cases where the server returns non-JSON content (e.g. HTML error pages).
 */
async function safeParseJSON(response: Response, url?: string): Promise<any> {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  // If content-type indicates JSON, or the text looks like JSON, try parsing
  if (contentType.includes('application/json') || text.trim().startsWith('{')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`飞书 API 返回了无效的 JSON（HTTP ${response.status}，URL: ${url || response.url}）。响应内容: ${text.substring(0, 200)}`);
    }
  }

  // Non-JSON response — likely an HTML error page or redirect
  const urlHint = url ? `，请求地址: ${url}` : '';
  throw new Error(`飞书 API 返回了非 JSON 内容（HTTP ${response.status}, Content-Type: ${contentType}${urlHint}）。响应内容: ${text.substring(0, 200)}`);
}

/**
 * Feishu (Lark) API Client.
 * Handles authentication, document creation, and content writing.
 */

const FEISHU_BASE_URL = 'https://open.feishu.cn/open-apis';


// Token cache
let cachedToken: { token: string; expireAt: number } | null = null;

/**
 * Get a tenant access token.
 * Caches the token until 5 minutes before expiry.
 */
async function getTenantAccessToken(
  appId: string,
  appSecret: string,
): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedToken.expireAt) {
    return cachedToken.token;
  }

  const url = `${FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
  });

  const data = await safeParseJSON(response, url);

  if (data.code !== 0) {
    throw new Error(`飞书认证失败（code: ${data.code}）: ${data.msg || '未知错误'}。请检查 App ID 和 App Secret 是否正确。`);
  }

  cachedToken = {
    token: data.tenant_access_token,
    expireAt: Date.now() + (data.expire - 300) * 1000, // 5 min buffer
  };

  return data.tenant_access_token;
}

/**
 * Check whether the app's cloud drive permission scope (drive:drive) is in effect.
 *
 * Calls the "get root folder meta" API, which only requires the drive:drive scope
 * (no collaborator grant needed). Used to disambiguate a 91204 FORBIDDEN on a
 * specific folder: if even the root folder is forbidden the scope itself isn't
 * granted/published; if the root folder is accessible the scope is fine and the
 * specific folder just lacks the app as a collaborator.
 *
 * Returns false on any error so the caller falls back to a generic hint.
 */
async function checkDriveScope(token: string): Promise<boolean> {
  try {
    const rootUrl = `${FEISHU_BASE_URL}/drive/explorer/v2/root_folder/meta`;
    const resp = await fetch(rootUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
    const data = await safeParseJSON(resp, rootUrl);
    return data.code === 0;
  } catch {
    return false;
  }
}

/**
 * Map a Feishu folder-API error code to an actionable Chinese hint.
 * For 91204 (FORBIDDEN), probes the root folder to tell apart a missing
 * permission scope from a missing collaborator grant.
 */
async function diagnoseFolderError(code: number, msg: string, token: string): Promise<string> {
  if (code === 91203) {
    return '文件夹 Token 无效（错误码 91203）。请打开飞书目标文件夹，从浏览器地址栏复制正确的文件夹 Token（形如 nodbcb... 的字符串），确认未包含多余字符或 URL 前缀。';
  }
  if (code === 91204) {
    // 二级诊断：根文件夹 API 只需 drive:drive scope，无需协作者授权。
    const scopeOk = await checkDriveScope(token);
    if (!scopeOk) {
      return '云空间权限 scope 未生效（错误码 91204）。请前往飞书开放平台「权限管理」开通「查看云空间中文件元数据」(drive:drive.metadata:readonly) 或「查看、评论、编辑和管理云空间中所有文件」(drive:drive)，然后在「版本管理与发布」创建新版本并发布（scope 修改需发布版本后才生效）。';
    }
    return '应用未被授权访问该文件夹（错误码 91204）。云空间权限已开通，但应用未被添加为该文件夹的协作者。请在飞书云空间打开目标文件夹 → 右上角「共享」→ 搜索并添加该应用对应的「机器人」为协作者（建议授予「可编辑」权限，以便后续写入文档）。';
  }
  return `文件夹验证失败（错误码 ${code}：${msg}）。`;
}

/**
 * Test Feishu connection by obtaining a tenant access token.
 * If folderToken is provided, also verifies the app has access to that folder.
 */
export async function testFeishuConnection(
  appId: string,
  appSecret: string,
  folderToken?: string,
): Promise<{ success: boolean; error?: string }> {
  // Step 1: Test authentication
  let token: string;
  try {
    token = await getTenantAccessToken(appId, appSecret);
  } catch (error: any) {
    return {
      success: false,
      error: `认证失败：${error.message}。请检查 App ID 和 App Secret 是否正确，以及网络是否能访问 open.feishu.cn。`,
    };
  }

  // Step 2: Verify folder access if folder_token is provided
  if (folderToken) {
    try {
      const encodedToken = encodeURIComponent(folderToken);
      const folderUrl = `${FEISHU_BASE_URL}/drive/explorer/v2/folder/${encodedToken}/meta`;
      const folderResp = await fetch(folderUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
      });
      const folderData = await safeParseJSON(folderResp, folderUrl);
      if (folderData.code !== 0) {
        return { success: false, error: await diagnoseFolderError(folderData.code, folderData.msg, token) };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `文件夹验证失败：${error.message}`,
      };
    }
  }

  return { success: true };
}

/**
 * Create a new Feishu document and write content to it.
 * Supports Mermaid diagrams rendered as images.
 */
export async function createFeishuDocument(
  appId: string,
  appSecret: string,
  title: string,
  content: string,
  folderToken?: string,
  mermaidImages?: (MermaidImage | null)[],
): Promise<{ docId: string; docUrl: string }> {
  const token = await getTenantAccessToken(appId, appSecret);

  // 1. Create document
  const createBody: Record<string, string> = { title };
  if (folderToken) {
    createBody.folder_token = folderToken;
  }

  const createUrl = `${FEISHU_BASE_URL}/docx/v1/documents`;
  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createBody),
  });

  const createData: any = await safeParseJSON(createResponse, createUrl);
  if (createData.code !== 0) {
    const msg = createData.msg || '';
    let hint = msg;
    if (msg.toLowerCase().includes('folder permission') || msg.toLowerCase().includes('no folder')) {
      hint = '没有文件夹权限。请在飞书开放平台开通云空间权限（drive:drive），并将应用添加为目标文件夹的协作者。';
    } else if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('forbidden')) {
      hint = `权限不足（${msg}）。请检查应用是否已开通 docx:document 权限。`;
    }
    throw new Error(`Failed to create document: ${hint}`);
  }

  const docId = createData.data.document.document_id;

  // 2. Convert markdown to blocks (mermaid → image placeholder or code block)
  const { blocks, imageBlockIndices, tableBlockIndices } = markdownToFeishuBlocks(content, mermaidImages);

  // 3. Batch-create blocks and collect block_ids for image placeholders
  const createdBlockIds: (string | null)[] = new Array(blocks.length).fill(null);

  if (blocks.length > 0) {
    const blocksUrl = `${FEISHU_BASE_URL}/docx/v1/documents/${docId}/blocks/${docId}/children?document_revision_id=-1`;
    const BATCH_SIZE = 50;
    for (let offset = 0; offset < blocks.length; offset += BATCH_SIZE) {
      const batch = blocks.slice(offset, offset + BATCH_SIZE);
      const blocksResponse = await fetch(blocksUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ children: batch, index: offset }),
      });
      const blocksData: any = await safeParseJSON(blocksResponse, blocksUrl);
      if (blocksData.code !== 0) {
        // 99992402 = field validation failed，是请求体格式问题（块结构非法），与权限无关
        const hint = blocksData.code === 99992402
          ? '内容块格式校验失败，可能包含暂不支持的内容格式，请反馈该笔记内容以便排查。'
          : '请检查应用是否已开通「创建及编辑新版文档」(docx:document) 权限。';
        throw new Error(`文档已创建，但写入正文失败（错误码 ${blocksData.code}：${blocksData.msg || '未知错误'}）。${hint}`);
      }

      // Collect created block_ids from response
      const children: any[] = blocksData.data?.children || [];
      for (let i = 0; i < children.length; i++) {
        createdBlockIds[offset + i] = children[i]?.block_id || null;
      }
    }
  }

  // 4. Upload mermaid images and bind to placeholder blocks
  for (const [blockIdx, img] of imageBlockIndices) {
    const blockId = createdBlockIds[blockIdx];
    if (!blockId) {
      console.warn(`[PageLens] Mermaid 图片占位块 #${blockIdx} 未找到 block_id，跳过上传`);
      continue;
    }
    try {
      await uploadAndBindImage(token, docId, blockId, img);
    } catch (err) {
      console.warn(`[PageLens] Mermaid 图片上传失败（块 #${blockIdx}）:`, err);
      // 单张图失败不中断整体导出
    }
  }

  // 5. Fill table cells（逐格写入文本，失败不中断整体导出）
  for (const [blockIdx, table] of tableBlockIndices) {
    const tableBlockId = createdBlockIds[blockIdx];
    if (!tableBlockId) {
      console.warn(`[PageLens] 表格占位块 #${blockIdx} 未找到 block_id，跳过填充`);
      continue;
    }
    try {
      await fillTableCells(token, docId, tableBlockId, table);
    } catch (err) {
      console.warn(`[PageLens] 表格填充失败（块 #${blockIdx}）:`, err);
    }
  }

  const docUrl = `https://www.feishu.cn/docx/${docId}`;
  return { docId, docUrl };
}

/**
 * 上传图片素材并绑定到文档中的图片占位块。
 */
async function uploadAndBindImage(
  token: string,
  docId: string,
  blockId: string,
  image: MermaidImage,
): Promise<void> {
  // 1. base64 → Blob
  const binaryStr = atob(image.base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'image/png' });

  // 2. Upload media
  const uploadUrl = `${FEISHU_BASE_URL}/drive/v1/medias/upload_all`;
  const formData = new FormData();
  formData.append('file_name', `mermaid-${blockId}.png`);
  formData.append('parent_type', 'docx_image');
  formData.append('parent_node', blockId);
  formData.append('size', String(blob.size));
  formData.append('file', blob);

  const uploadResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });
  const uploadData: any = await safeParseJSON(uploadResp, uploadUrl);
  if (uploadData.code !== 0) {
    const hint = uploadData.code === 91204
      ? '请在飞书开放平台开通「查看、评论、编辑和管理云空间中所有文件」(drive:drive) 权限并发布版本'
      : uploadData.msg || '未知错误';
    throw new Error(`Mermaid 图片上传失败（错误码 ${uploadData.code}：${hint}）`);
  }

  const fileToken = uploadData.data?.file_token;
  if (!fileToken) {
    throw new Error('Mermaid 图片上传成功但未返回 file_token');
  }

  // 3. Bind image to placeholder block
  const patchUrl = `${FEISHU_BASE_URL}/docx/v1/documents/${docId}/blocks/${blockId}?document_revision_id=-1`;
  const patchResp = await fetch(patchUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      replace_image: {
        token: fileToken,
      },
    }),
  });
  const patchData: any = await safeParseJSON(patchResp, patchUrl);
  if (patchData.code !== 0) {
    throw new Error(`Mermaid 图片绑定失败（错误码 ${patchData.code}：${patchData.msg || '未知错误'}）`);
  }
}

/**
 * Mermaid 图片数据（从 sidepanel 渲染后传入）
 */
interface MermaidImage {
  base64: string;
  width: number;
  height: number;
}

/**
 * Convert markdown text to Feishu document block format.
 * Supports: headings, paragraphs, bullet lists, ordered lists, code blocks, quotes, mermaid diagrams.
 *
 * @param mermaidImages 按 mermaid 块出现顺序排列的渲染图片，null 表示该块渲染失败应回退为代码块
 * @returns { blocks, imageBlockIndices } imageBlockIndices 记录了哪些 blocks 下标是图片占位块
 */
function markdownToFeishuBlocks(
  markdown: string,
  mermaidImages?: (MermaidImage | null)[],
): {
  blocks: any[];
  imageBlockIndices: Map<number, MermaidImage>;
  tableBlockIndices: Map<number, TableData>;
} {
  const lines = markdown.split('\n');
  const blocks: any[] = [];
  const imageBlockIndices = new Map<number, MermaidImage>();
  const tableBlockIndices = new Map<number, TableData>();
  let inCodeBlock = false;
  let codeContent = '';
  let codeLang = ''; // 围栏语言标识（如 mermaid）
  let mermaidIndex = 0; // 当前 mermaid 块的序号

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block toggle
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // 闭合围栏
        const trimmedContent = codeContent.trim();
        if (codeLang.toLowerCase() === 'mermaid' && mermaidImages) {
          const img = mermaidImages[mermaidIndex];
          if (img) {
            // 成功渲染的 mermaid → 图片占位块
            const blockIdx = blocks.length;
            blocks.push({ block_type: 27, image: {} });
            imageBlockIndices.set(blockIdx, img);
          } else {
            // 渲染失败 → 回退为代码块
            blocks.push(createCodeBlock(trimmedContent));
          }
          mermaidIndex++;
        } else {
          blocks.push(createCodeBlock(trimmedContent));
        }
        codeContent = '';
        codeLang = '';
        inCodeBlock = false;
      } else {
        // 开启围栏，提取语言标识
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += line + '\n';
      continue;
    }

    // Table（GFM）：当前行以 | 开头，且下一行是分隔行 → 一次消费多行
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const tableLines: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        tableLines.push(lines[j]);
        j++;
      }
      const table = parseTable(tableLines);
      if (table) {
        const blockIdx = blocks.length;
        blocks.push(createTablePlaceholder(table));
        tableBlockIndices.set(blockIdx, table);
        i = j - 1; // for 末尾会 i++，跳过已消费的表格行
        continue;
      }
      // 解析失败则按普通段落处理当前行（落入下方分支）
    }

    // Headings（1-6 级；\s+ 要求 # 后至少一个空白，避免 "##无空格" 被误判为标题）
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(createHeading(headingMatch[2], level));
    }
    // Bullet list
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      blocks.push(createBulletItem(line.slice(2)));
    }
    // Ordered list
    else if (/^\d+\.\s/.test(line)) {
      blocks.push(createOrderedItem(line.replace(/^\d+\.\s/, '')));
    }
    // Quote
    else if (line.startsWith('> ')) {
      blocks.push(createQuote(line.slice(2)));
    }
    // Divider
    else if (line.trim() === '---') {
      blocks.push({ block_type: 22, divider: {} }); // divider（divider 字段必填，缺失会触发字段校验失败）
    }
    // Empty line - skip
    else if (line.trim() === '') {
      continue;
    }
    // Regular paragraph
    else {
      blocks.push(createParagraph(line));
    }
  }

  return { blocks, imageBlockIndices, tableBlockIndices };
}

function createTextElement(content: string): any {
  return makeTextElement(content);
}

/** 飞书 text_element_style 支持的行内样式字段。 */
interface TextElementStyle {
  bold?: true;
  italic?: true;
  strikethrough?: true;
  inline_code?: true;
  link?: { url: string };
}

/** 构造一个 text_run 元素（content + 样式）。 */
function makeTextElement(content: string, style: TextElementStyle = {}): any {
  return {
    text_run: {
      content,
      text_element_style: style,
    },
  };
}

// 行内标记规则：定界符 + 对应样式（按长度降序排列，保证 ***、** 等长标记优先于 *）
const INLINE_RULES: { delimiter: string; style: TextElementStyle }[] = [
  { delimiter: '***', style: { bold: true, italic: true } },
  { delimiter: '**', style: { bold: true } },
  { delimiter: '__', style: { bold: true } },
  { delimiter: '~~', style: { strikethrough: true } },
  { delimiter: '`', style: { inline_code: true } },
  { delimiter: '*', style: { italic: true } },
  { delimiter: '_', style: { italic: true } },
];

// 链接 [text](url)
const LINK_REGEX = /\[([^\]]*)\]\(([^)\s]+)\)/;

/** 去除转义反斜杠：\* → *。 */
function stripEscapes(text: string): string {
  return text.replace(/\\(.)/g, '$1');
}

/** 查找定界符的下一个出现位置，跳过被反斜杠转义的字符；未找到返回 -1。 */
function findDelimiter(text: string, delimiter: string): number {
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text.startsWith(delimiter, i)) {
      return i;
    }
    i++;
  }
  return -1;
}

function mergeStyle(base: TextElementStyle, extra: TextElementStyle): TextElementStyle {
  return { ...base, ...extra };
}

/**
 * 将一行 Markdown 文本解析为飞书 text_run 元素数组，支持行内格式：
 * 加粗 **x** / __x__、斜体 *x* / _x_、加粗斜体 ***x***、删除线 ~~x~~、
 * 行内代码 `x`、链接 [text](url)，并支持简单嵌套。保证至少返回一个元素。
 */
function parseInline(text: string, inheritedStyle: TextElementStyle = {}): any[] {
  const elements: any[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    let bestPos = -1; // 标记起始位置
    let bestEnd = -1; // 标记整体结束位置（结束定界符之后）
    let bestContent = ''; // 标记内部内容
    let bestContentStyle: TextElementStyle = inheritedStyle; // 标记内部内容应用的样式
    let isLink = false;

    // 1) 链接候选 [text](url)
    const linkMatch = LINK_REGEX.exec(remaining);
    if (linkMatch) {
      bestPos = linkMatch.index;
      bestEnd = linkMatch.index + linkMatch[0].length;
      bestContent = linkMatch[1];
      bestContentStyle = mergeStyle(inheritedStyle, { link: { url: linkMatch[2] } });
      isLink = true;
    }

    // 2) 定界符候选（规则按长度降序；同位置时先记录者更长，配合严格 < 比较实现长标记优先）
    for (const rule of INLINE_RULES) {
      const start = findDelimiter(remaining, rule.delimiter);
      // 仅当严格靠前时覆盖，保证已选中的更早候选不被取代
      if (start !== -1 && (bestPos === -1 || start < bestPos)) {
        const afterStart = start + rule.delimiter.length;
        const end = findDelimiter(remaining.slice(afterStart), rule.delimiter);
        if (end !== -1) {
          bestPos = start;
          bestEnd = afterStart + end + rule.delimiter.length;
          bestContent = remaining.slice(afterStart, afterStart + end);
          bestContentStyle = mergeStyle(inheritedStyle, rule.style);
          isLink = false;
        }
      }
    }

    if (bestPos === -1) {
      // 剩余部分无任何标记，作为普通文本输出
      elements.push(makeTextElement(stripEscapes(remaining), inheritedStyle));
      break;
    }

    // 标记前的普通文本
    if (bestPos > 0) {
      elements.push(makeTextElement(stripEscapes(remaining.slice(0, bestPos)), inheritedStyle));
    }

    if (isLink) {
      // 链接：显示文本作为整体 run（不递归内部）
      elements.push(makeTextElement(bestContent, bestContentStyle));
    } else {
      // 定界符标记：内部内容递归解析，支持嵌套格式
      elements.push(...parseInline(bestContent, bestContentStyle));
    }

    remaining = remaining.slice(bestEnd);
  }

  return elements.length > 0 ? elements : [makeTextElement('')];
}

function createParagraph(text: string): any {
  return {
    block_type: 2, // text
    text: {
      elements: parseInline(text),
      style: {},
    },
  };
}

function createHeading(text: string, level: number): any {
  // block_type: 3=heading1 ~ 8=heading6（即 level + 2，飞书 docx 支持 heading1-heading9）
  // 注意：字段名必须与块类型对应（heading1 ~ heading6），否则整个写入请求会失败
  return {
    block_type: level + 2,
    [`heading${level}`]: {
      elements: parseInline(text),
      style: {},
    },
  };
}

function createBulletItem(text: string): any {
  return {
    block_type: 12, // bullet
    bullet: {
      elements: parseInline(text),
      style: {},
    },
  };
}

function createOrderedItem(text: string): any {
  return {
    block_type: 13, // ordered
    ordered: {
      elements: parseInline(text),
      style: {},
    },
  };
}

function createQuote(text: string): any {
  return {
    block_type: 15, // quote
    quote: {
      elements: parseInline(text),
      style: {},
    },
  };
}

function createCodeBlock(code: string): any {
  return {
    block_type: 14, // code
    code: {
      language: 1, // plain text
      elements: [createTextElement(code)],
      style: {},
    },
  };
}

/** GFM 表格解析结果。rows 含表头行，每行已对齐到 columnCount。 */
interface TableData {
  rows: string[][];
  columnCount: number;
  hasHeader: boolean; // 是否含 GFM 分隔行（决定 header_row）
}

/** 判断一行是否为 GFM 表格分隔行（如 |---|:---:|---|）。 */
function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('-')) return false;
  let inner = trimmed;
  if (inner.startsWith('|')) inner = inner.slice(1);
  if (inner.endsWith('|')) inner = inner.slice(0, -1);
  const cells = inner.split('|');
  return cells.length > 0 && cells.every((c) => /^\s*:?-+:?\s*$/.test(c));
}

/** 将一行表格按 | 切分为单元格，处理 \| 转义，去掉首尾 |，每格 trim。 */
function splitTableRow(line: string): string[] {
  const PLACEHOLDER = ' ';
  const safe = line.replace(/\\\|/g, PLACEHOLDER);
  let inner = safe.trim();
  if (inner.startsWith('|')) inner = inner.slice(1);
  if (inner.endsWith('|')) inner = inner.slice(0, -1);
  return inner
    .split('|')
    .map((c) => c.replace(new RegExp(PLACEHOLDER, 'g'), '|').trim());
}

/**
 * 解析连续的 GFM 表格行为 TableData。
 * 第一行为表头；若第二行是分隔行则 hasHeader=true 并跳过它；其余为数据行。
 * 每行对齐到表头列数（不足补空串、超长截断）。解析失败返回 null。
 */
function parseTable(blockLines: string[]): TableData | null {
  if (blockLines.length < 2) return null;
  const header = splitTableRow(blockLines[0]);
  const columnCount = header.length;
  if (columnCount === 0) return null;

  const hasHeader = isTableSeparator(blockLines[1]);
  const rows: string[][] = [header];
  for (let k = hasHeader ? 2 : 1; k < blockLines.length; k++) {
    const cells = splitTableRow(blockLines[k]);
    while (cells.length < columnCount) cells.push('');
    cells.length = columnCount;
    rows.push(cells);
  }
  return { rows, columnCount, hasHeader };
}

/** 构造飞书表格占位块（block_type 31），仅声明行列数与表头；内容由后处理逐格填充。 */
function createTablePlaceholder(table: TableData): any {
  return {
    block_type: 31, // table
    table: {
      property: {
        row_size: table.rows.length,
        column_size: table.columnCount,
        header_row: table.hasHeader,
      },
    },
  };
}

/** 延迟工具，用于飞书创建子块的频率控制（3 QPS）。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 读取表格块的所有单元格 block_id（飞书创建空表后自动生成，按行优先顺序）。 */
async function getTableCellIds(token: string, docId: string, tableBlockId: string): Promise<string[]> {
  const url = `${FEISHU_BASE_URL}/docx/v1/documents/${docId}/blocks/${tableBlockId}/children`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data: any = await safeParseJSON(res, url);
  if (data.code !== 0) {
    throw new Error(`读取表格单元格失败（${data.code}：${data.msg || '未知错误'}）`);
  }
  // table 的直接子块即单元格（block_type 32），按行优先（左→右、上→下）排列
  const items: any[] = data.data?.items || [];
  // 首次验证用日志：确认飞书返回的子块结构（期望全部为 cell、数量 = 行×列）；验证无误后可移除
  console.log(
    `[PageLens] 表格 ${tableBlockId} 返回 ${items.length} 个子块:`,
    items.map((b) => ({ block_type: b.block_type, block_id: b.block_id })),
  );
  return items.map((b) => b.block_id).filter(Boolean);
}

/** 向一个单元格写入文本（创建一个 Text 子块，elements 用 parseInline 解析行内格式）。 */
async function createCellText(
  token: string,
  docId: string,
  cellBlockId: string,
  text: string,
): Promise<void> {
  const url = `${FEISHU_BASE_URL}/docx/v1/documents/${docId}/blocks/${cellBlockId}/children?document_revision_id=-1`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      children: [
        {
          block_type: 2, // text
          text: {
            elements: parseInline(text),
            style: {},
          },
        },
      ],
      index: 0,
    }),
  });
  const data: any = await safeParseJSON(res, url);
  if (data.code !== 0) {
    throw new Error(`写入单元格失败（${data.code}：${data.msg || '未知错误'}）`);
  }
}

/**
 * 填充表格所有单元格：先读取单元格 block_id，再按行优先顺序逐格写入文本。
 * 受飞书 3 QPS 限制，每次创建后 sleep（最后一次不 sleep）。
 */
async function fillTableCells(
  token: string,
  docId: string,
  tableBlockId: string,
  table: TableData,
): Promise<void> {
  const cellIds = await getTableCellIds(token, docId, tableBlockId);
  // 行优先展平所有单元格文本
  const flatCells: string[] = [];
  for (const row of table.rows) {
    for (const cell of row) {
      flatCells.push(cell);
    }
  }
  const count = Math.min(cellIds.length, flatCells.length);
  for (let k = 0; k < count; k++) {
    await createCellText(token, docId, cellIds[k], flatCells[k]);
    if (k < count - 1) {
      await sleep(350); // < 3 QPS
    }
  }
}
