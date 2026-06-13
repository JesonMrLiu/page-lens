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
      return '云空间权限 scope 未生效（错误码 91204）。请前往飞书开放平台「权限管理」开通「查看云空间中文件元数据」(drive:drive:readonly) 或「查看、评论、编辑和管理云空间中所有文件」(drive:drive)，然后在「版本管理与发布」创建新版本并发布（scope 修改需发布版本后才生效）。';
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
 */
export async function createFeishuDocument(
  appId: string,
  appSecret: string,
  title: string,
  content: string,
  folderToken?: string,
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

  // 2. Add content blocks (batched: Feishu allows at most 50 blocks per request)
  const blocks = markdownToFeishuBlocks(content);
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
    }
  }

  const docUrl = `https://www.feishu.cn/docx/${docId}`;
  return { docId, docUrl };
}

/**
 * Convert markdown text to Feishu document block format.
 * Supports: headings, paragraphs, bullet lists, ordered lists, code blocks, quotes.
 */
function markdownToFeishuBlocks(markdown: string): any[] {
  const lines = markdown.split('\n');
  const blocks: any[] = [];
  let inCodeBlock = false;
  let codeContent = '';

  for (const line of lines) {
    // Code block toggle
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        blocks.push(createCodeBlock(codeContent.trim()));
        codeContent = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += line + '\n';
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      blocks.push(createHeading(line.slice(4), 3));
    } else if (line.startsWith('## ')) {
      blocks.push(createHeading(line.slice(3), 2));
    } else if (line.startsWith('# ')) {
      blocks.push(createHeading(line.slice(2), 1));
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

  return blocks;
}

function createTextElement(content: string): any {
  return {
    text_run: {
      content,
      text_element_style: {},
    },
  };
}

function createParagraph(text: string): any {
  return {
    block_type: 2, // text
    text: {
      elements: [createTextElement(text)],
      style: {},
    },
  };
}

function createHeading(text: string, level: number): any {
  // block_type: 3=heading1, 4=heading2, 5=heading3
  // 注意：字段名必须与块类型对应（heading1/heading2/heading3），否则整个写入请求会失败
  return {
    block_type: level + 2,
    [`heading${level}`]: {
      elements: [createTextElement(text)],
      style: {},
    },
  };
}

function createBulletItem(text: string): any {
  return {
    block_type: 12, // bullet
    bullet: {
      elements: [createTextElement(text)],
      style: {},
    },
  };
}

function createOrderedItem(text: string): any {
  return {
    block_type: 13, // ordered
    ordered: {
      elements: [createTextElement(text)],
      style: {},
    },
  };
}

function createQuote(text: string): any {
  return {
    block_type: 15, // quote
    quote: {
      elements: [createTextElement(text)],
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
