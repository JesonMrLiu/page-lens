/**
 * Safely parse a fetch response as JSON.
 * Handles cases where the server returns non-JSON content (e.g. HTML error pages).
 */
async function safeParseJSON(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  // If content-type indicates JSON, or the text looks like JSON, try parsing
  if (contentType.includes('application/json') || text.trim().startsWith('{')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`飞书 API 返回了无效的 JSON（HTTP ${response.status}）。响应内容: ${text.substring(0, 200)}`);
    }
  }

  // Non-JSON response — likely an HTML error page or redirect
  throw new Error(`飞书 API 返回了非 JSON 内容（HTTP ${response.status}, Content-Type: ${contentType}）。响应内容: ${text.substring(0, 200)}`);
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

  const response = await fetch(
    `${FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal/`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: appId,
        app_secret: appSecret,
      }),
    },
  );

  const data = await safeParseJSON(response);

  if (data.code !== 0) {
    throw new Error(`飞书认证失败（code: ${data.code}）: ${data.msg || '未知错误'}`);
  }

  cachedToken = {
    token: data.tenant_access_token,
    expireAt: Date.now() + (data.expire - 300) * 1000, // 5 min buffer
  };

  return data.tenant_access_token;
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
  try {
    const token = await getTenantAccessToken(appId, appSecret);

    // Verify folder access if folder_token is provided
    if (folderToken) {
      const folderResp = await fetch(
        `${FEISHU_BASE_URL}/drive/v1/files/${folderToken}?folder_token=${folderToken}`,
        { headers: { 'Authorization': `Bearer ${token}` } },
      );
      const folderData = await safeParseJSON(folderResp);
      if (folderData.code !== 0) {
        return {
          success: false,
          error: `应用无法访问该文件夹（${folderData.msg}）。请确保：1) 已开通云空间相关权限（drive:drive）；2) 应用已被添加为该文件夹的协作者。`,
        };
      }
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
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

  const createResponse = await fetch(`${FEISHU_BASE_URL}/docx/v1/documents`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createBody),
  });

  const createData: any = await safeParseJSON(createResponse);
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

  // 2. Add content blocks
  const blocks = markdownToFeishuBlocks(content);
  if (blocks.length > 0) {
    await fetch(
      `${FEISHU_BASE_URL}/docx/v1/documents/${docId}/blocks/${docId}/children`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ children: blocks }),
      },
    );
  }

  const docUrl = `https://bytedance.larkoffice.com/docx/${docId}`;
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
      blocks.push({ block_type: 22 }); // divider
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
  return {
    block_type: level + 2,
    heading: {
      elements: [createTextElement(text)],
      style: {},
    },
  };
}

function createBulletItem(text: string): any {
  return {
    block_type: 16, // bullet
    bullet: {
      elements: [createTextElement(text)],
      style: {},
    },
  };
}

function createOrderedItem(text: string): any {
  return {
    block_type: 17, // ordered
    ordered: {
      elements: [createTextElement(text)],
      style: {},
    },
  };
}

function createQuote(text: string): any {
  return {
    block_type: 18, // quote
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
