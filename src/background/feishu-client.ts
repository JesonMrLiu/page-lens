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

// 飞书 docx 写入相关错误码分类。1770001 = invalid param 是参数校验失败，与权限无关；
// 真正的权限错误是 1770032 (forbidden) / 99991663 等。文档创建成功已证明 token 与 docx:document 权限没问题。
const FEISHU_PERMISSION_CODES = new Set<number>([
  1770032, // forbidden（文档无编辑权限）
  99991663, 99991672, 1254030, // 应用/用户权限类
  99991661, // token 无效
]);
const FEISHU_VALIDATION_CODES = new Set<number>([
  1770001, // invalid param（块结构非法）
  99992402, // 字段校验失败
  1770006, // schema mismatch
  1770024, // invalid operation（如对非 text_run 设 link）
  1770013, // relation mismatch（图片/文件资源关联不正确）
]);
const FEISHU_LIMIT_CODES = new Set<number>([
  1770004, 1770005, 1770007, // 文档/层级/子块数超限
  1770008, // 文件尺寸超限
  1770010, 1770011, // 表格列/单元格超限
  1770012, // grid 列超限
  1770033, // 纯文本 10485760 字符超限
  1770034, 1770035, // 单元格/资源数超限
]);
const FEISHU_RATE_LIMIT_CODES = new Set<number>([99991400]); // HTTP 400，触发限频

/** 将飞书写入错误码归类为四类之一，返回类别与对应的中文提示。 */
function classifyFeishuBlockError(code: number): { kind: 'permission' | 'validation' | 'limit' | 'rate' | 'other'; hint: string } {
  if (FEISHU_PERMISSION_CODES.has(code)) {
    return {
      kind: 'permission',
      hint: '文档编辑权限不足（错误码 ' + code + '）。请打开飞书目标文档右上角「...」→「添加文档应用」，把本应用加为协作者（可编辑）；或确认 docx:document 权限已开通并发布版本。',
    };
  }
  if (FEISHU_LIMIT_CODES.has(code)) {
    return {
      kind: 'limit',
      hint: '内容超出飞书上限（错误码 ' + code + '）。常见：表格行/列 > 9、单次写入块 > 50、纯文本 > 10MB。',
    };
  }
  if (FEISHU_VALIDATION_CODES.has(code)) {
    return {
      kind: 'validation',
      hint: '内容块结构校验失败（错误码 ' + code + '，与权限无关）。最可能：表格行列超 9、超长段落未分片、空图片块等。已尝试降级写入，详见 Service Worker 日志。',
    };
  }
  if (FEISHU_RATE_LIMIT_CODES.has(code)) {
    return { kind: 'rate', hint: '触发飞书 3 QPS 限频，请稍后重试。' };
  }
  return { kind: 'other', hint: '飞书写入失败（错误码 ' + code + '）。' };
}

/**
 * 生成一批 block 的紧凑结构摘要，用于在写入失败时从日志定位是哪个块、什么结构不合规。
 * 形如 [0]bt=2(text/runs=3/maxRunLen=210) | [1]bt=31(table/rows=12/cols=5) | [2]bt=27(image/empty=true)
 */
function summarizeBatch(batch: any[]): string {
  return batch.map((b, i) => {
    const t = b.block_type;
    let detail: string;
    if (t === 2) {
      const runs = (b.text?.elements || []) as any[];
      const maxLen = runs.reduce((m, e) => Math.max(m, (e.text_run?.content || '').length), 0);
      detail = 'text/runs=' + runs.length + '/maxRunLen=' + maxLen;
    } else if (t === 27) {
      detail = 'image/empty=' + (!b.image?.token);
    } else if (t >= 3 && t <= 11) {
      detail = 'heading' + (t - 2);
    } else if (t === 14) {
      detail = 'code/lang=' + b.code?.language + '/len=' + ((b.code?.elements || []) as any[]).reduce((m, e) => m + (e.text_run?.content || '').length, 0);
    } else if (t === 31) {
      detail = 'table/rows=' + b.table?.property?.row_size + '/cols=' + b.table?.property?.column_size;
    } else if (t === 22) {
      detail = 'divider';
    } else if (t === 15) {
      detail = 'quote';
    } else if (t === 12) {
      detail = 'bullet';
    } else if (t === 13) {
      detail = 'ordered';
    } else {
      detail = 'type=' + t;
    }
    return '[' + i + ']bt=' + t + '(' + detail + ')';
  }).join(' | ');
}


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
 * 检查某个飞书文档是否仍然存在/可访问。
 * 调用「获取文档基本信息」接口 GET /docx/v1/documents/{document_id}。
 *
 * 返回值约定（保守策略：除明确「已删除」外，一律不判定为删除）：
 *  - exists: true —— 文档正常存在（code === 0）
 *  - exists:false, deleted:true —— 文档已被删除/不存在
 *  - exists:false, deleted:false, error —— 权限不足 / 网络 / 认证失败等，**不应**据此清除本地记录
 */
export async function checkFeishuDocExists(
  appId: string,
  appSecret: string,
  docId: string,
): Promise<{ exists: boolean; deleted?: boolean; error?: string }> {
  // Step 1: 取 token；认证失败属「不可判定」，保守不清除
  let token: string;
  try {
    token = await getTenantAccessToken(appId, appSecret);
  } catch (error: any) {
    return { exists: false, deleted: false, error: `认证失败：${error.message}` };
  }

  // Step 2: 查询文档基本信息
  const docUrl = `${FEISHU_BASE_URL}/docx/v1/documents/${encodeURIComponent(docId)}`;
  let data: any;
  try {
    const resp = await fetch(docUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
    data = await safeParseJSON(resp, docUrl);
  } catch (error: any) {
    // 网络/解析异常属「不可判定」，保守不清除
    return { exists: false, deleted: false, error: error.message };
  }

  const code: number = data.code;
  const msg: string = (data.msg || '').toLowerCase();

  if (code === 0) {
    return { exists: true };
  }

  // 判定「已删除/不存在」：飞书删除类错误码 + msg 关键词双重判断
  // 1254040: 文档不存在或已删除；1254003: 文档不存在；1254004: 文档不存在
  const FEISHU_DOC_DELETED_CODES = new Set<number>([1254040, 1254003, 1254004]);
  const DELETED_KEYWORDS = ['不存在', '已删除', '已被删除', '已归档', 'not found', 'deleted', 'has been deleted'];
  const isDeletedByCode = FEISHU_DOC_DELETED_CODES.has(code);
  const isDeletedByMsg = DELETED_KEYWORDS.some(kw => msg.includes(kw));
  if (isDeletedByCode || isDeletedByMsg) {
    return { exists: false, deleted: true };
  }

  // 权限不足（文档可能仍在，只是当前应用无权访问）——保守不清除
  const PERMISSION_KEYWORDS = ['没有权限', '权限', 'permission', 'forbidden', '无权'];
  if (FEISHU_PERMISSION_CODES.has(code) || PERMISSION_KEYWORDS.some(kw => msg.includes(kw))) {
    return { exists: false, deleted: false, error: `权限不足（code ${code}）：${data.msg || ''}` };
  }

  // 其他未知错误——保守不清除
  return { exists: false, deleted: false, error: `未知错误（code ${code}）：${data.msg || ''}` };
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
): Promise<{ docId: string; docUrl: string; skippedCount: number }> {
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

  // 2. Convert markdown to blocks (mermaid → image placeholder or code block; 表格 → 标记块)
  const { blocks, imageBlockIndices } = markdownToFeishuBlocks(content, mermaidImages);

  // 3. 写入正文块：单遍顺序写入。普通块走 create-children（批量+容错降级）；
  //    表格走「创建嵌套块(descendants)」一次性建出带内容的整张表，内容随表一并写入。
  const { blockIds: createdBlockIds, skipped } = await writeBlocksWithFallback(
    token, docId, blocks,
    (origIdx) => console.warn(`[PageLens] 表格 #${origIdx} 已降级为结构化段落`),
  );

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
      // 绑图失败：删除已创建的空 image 块，避免文档残留破损图在后续编辑时触发 1770013
      await deleteBlock(token, docId, blockId);
      // 单张图失败不中断整体导出
    }
  }

  // 表格内容已随 descendant 接口一次写入，无需逐格后处理。

  const docUrl = `https://www.feishu.cn/docx/${docId}`;
  return { docId, docUrl, skippedCount: skipped.length };
}

/** 识别表格标记块（markdownToFeishuBlocks 产出的轻量标记，不会发往飞书 API）。 */
function isTableMarker(b: any): boolean {
  return !!b && b.block_type === 31 && !!b._table;
}

/**
 * 写入一段连续的普通块（非表格）：先批量(50) create-children，某批失败降级逐块写入、跳过坏块。
 * - startIndex：本段首块在根块 children 列表的插入位置（= 已成功累计的 currentRootCount）。
 * - segStartOrigIdx：本段首块在 allBlocks 数组的原始下标（用于回填 blockIds）。
 * - recordIds=false 时只推进计数、不写 blockIds（用于表格降级展开的临时段落，避免覆盖主 blockIds）。
 * 返回本段成功写入的块数（坏块不计）。权限/限频/系统错误直接抛出。
 */
async function writePlainSegment(
  writeChildren: (children: any[], index: number) => Promise<{ ok: boolean; code: number; ids: string[] }>,
  seg: any[],
  startIndex: number,
  segStartOrigIdx: number,
  blockIds: (string | null)[],
  skipped: Array<{ origIdx: number; blockType: number; code: number }>,
  recordIds: boolean = true,
): Promise<number> {
  if (seg.length === 0) return 0;
  let rootCount = startIndex;
  const BATCH_SIZE = 50;

  for (let offset = 0; offset < seg.length; offset += BATCH_SIZE) {
    const batch = seg.slice(offset, offset + BATCH_SIZE);
    const result = await writeChildren(batch, rootCount);

    if (result.ok) {
      if (recordIds) {
        result.ids.forEach((id, i) => {
          blockIds[segStartOrigIdx + offset + i] = id;
        });
      }
      rootCount += batch.length;
      await sleep(350); // < 3 QPS
      continue;
    }

    const cls = classifyFeishuBlockError(result.code);
    // 权限/限频/系统类错误：不降级，直接抛出
    if (cls.kind === 'permission' || cls.kind === 'rate' || cls.kind === 'other') {
      console.error('[PageLens] 批量写入失败（不降级），批次摘要:', summarizeBatch(batch));
      throw new Error(
        `文档已创建，但写入正文失败（错误码 ${result.code}：${result.code === 0 ? '' : cls.hint}）`,
      );
    }

    // 校验/限额类错误：降级为逐块单独写入，定位并跳过坏块
    console.warn(
      `[PageLens] 批次（${batch.length} 块）失败 code=${result.code}（${cls.kind}），降级逐块写入。批次摘要:`,
      summarizeBatch(batch),
    );
    for (let i = 0; i < batch.length; i++) {
      const origIdx = segStartOrigIdx + offset + i;
      const block = batch[i];
      const single = await writeChildren([block], rootCount);
      if (single.ok) {
        if (recordIds) blockIds[origIdx] = single.ids[0] || null;
        rootCount++;
        await sleep(350);
        continue;
      }
      const singleCls = classifyFeishuBlockError(single.code);
      // 单块仍失败：权限/限频/系统类直接抛出
      if (singleCls.kind === 'permission' || singleCls.kind === 'rate' || singleCls.kind === 'other') {
        throw new Error(
          `文档已创建，但写入正文失败（错误码 ${single.code}：${singleCls.hint}）`,
        );
      }
      skipped.push({ origIdx, blockType: block.block_type, code: single.code });
      console.error(
        `[PageLens] 跳过坏块 origIdx=${origIdx} bt=${block.block_type} code=${single.code}，摘要:`,
        summarizeBatch([block]),
      );
      // 坏块不占用根槽位，rootCount 不变
    }
  }

  return rootCount - startIndex;
}

/**
 * 单遍顺序写入根块，currentRootCount 单调递推 index。
 *
 * 关键点：飞书 index = 插入到根块 children 列表的位置。严格按 markdown 原始顺序逐块处理，
 * 每成功插入一个根块（普通块 / 表格块 / 表格降级展开的段落）就 currentRootCount++，
 * 下一个块的 index 永远等于 currentRootCount——天然正确，无需为坏块/降级展开补偿。
 *
 * - 普通块段走 create-children（批量 50 + 失败逐块降级 + 跳过坏块）。
 * - 表格块走「创建嵌套块(descendants)」一次性建出带内容的整张表（突破 create-children 对
 *   Table 的 9×9 上限）；失败/超大表降级为结构化段落。
 * - 权限/限频/系统类错误不降级，直接抛出。
 */
async function writeBlocksWithFallback(
  token: string,
  docId: string,
  allBlocks: any[],
  onTableFallback?: (origIdx: number) => void,
): Promise<{
  blockIds: (string | null)[];
  skipped: Array<{ origIdx: number; blockType: number; code: number }>;
  writtenCount: number;
}> {
  const blockIds: (string | null)[] = new Array(allBlocks.length).fill(null);
  const skipped: Array<{ origIdx: number; blockType: number; code: number }> = [];
  let currentRootCount = 0; // 已成功落到根块列表的块数，即下一个块的 index

  if (allBlocks.length === 0) {
    return { blockIds, skipped, writtenCount: currentRootCount };
  }

  const writeChildren = async (
    children: any[],
    index: number,
  ): Promise<{ ok: boolean; code: number; ids: string[] }> => {
    const url = `${FEISHU_BASE_URL}/docx/v1/documents/${docId}/blocks/${docId}/children?document_revision_id=-1`;
    // 剥离内部辅助字段（_rawMarkdown / _table），不属于飞书 API 规范
    const cleanChildren = children.map((b) => {
      const { _rawMarkdown: _r, _table: _t, ...rest } = b;
      return rest;
    });
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ children: cleanChildren, index }),
    });
    const data: any = await safeParseJSON(resp, url);
    if (data.code !== 0) return { ok: false, code: data.code, ids: [] };
    return { ok: true, code: 0, ids: (data.data?.children || []).map((c: any) => c.block_id) };
  };

  // 表格单元格数量超过此阈值时跳过 descendant 接口直接降级（避免 descendants 数组过大）
  const TABLE_DESC_CELL_LIMIT = 400;

  let i = 0;
  while (i < allBlocks.length) {
    // 1) 收集连续的非表格块成一段，走批量 create-children
    const segStart = i;
    while (i < allBlocks.length && !isTableMarker(allBlocks[i])) i++;
    const seg = allBlocks.slice(segStart, i);
    if (seg.length > 0) {
      const written = await writePlainSegment(
        writeChildren, seg, currentRootCount, segStart, blockIds, skipped, true,
      );
      currentRootCount += written;
    }

    // 2) 处理表格标记块（走「创建嵌套块」接口一次性建表）
    if (i < allBlocks.length && isTableMarker(allBlocks[i])) {
      const origIdx = i;
      const table: TableData = allBlocks[i]._table;
      const cellCount = table.rows.length * table.columnCount;
      let handled = false;

      if (cellCount <= TABLE_DESC_CELL_LIMIT) {
        const res = await createTableBlockViaDescendant(token, docId, currentRootCount, table, origIdx);
        await sleep(350); // < 3 QPS
        if (res.ok) {
          blockIds[origIdx] = res.tableBlockId;
          currentRootCount += 1; // 整张表占 1 个根槽位
          console.log(
            `[PageLens] 表格 #${origIdx} 创建成功 ${table.rows.length}×${table.columnCount}，tableBlockId=${res.tableBlockId}`,
          );
          handled = true;
        } else {
          const cls = classifyFeishuBlockError(res.code);
          // 权限/限频/系统类：不降级直接抛
          if (cls.kind === 'permission' || cls.kind === 'rate' || cls.kind === 'other') {
            throw new Error(
              `文档已创建，但写入表格失败（错误码 ${res.code}：${cls.hint}）`,
            );
          }
          console.warn(
            `[PageLens] 表格 #${origIdx} descendant 失败 code=${res.code}（${cls.kind}），降级为段落。rows=${table.rows.length} cols=${table.columnCount}`,
          );
        }
      } else {
        console.warn(
          `[PageLens] 表格 #${origIdx} 单元格数 ${cellCount} 超过 ${TABLE_DESC_CELL_LIMIT} 上限，直接降级为段落`,
        );
      }

      // 降级：展开为结构化段落逐段写入（recordIds=false 避免临时段落覆盖主 blockIds）
      if (!handled) {
        const fallbackBlocks = tableToFallbackBlocks(table);
        const written = await writePlainSegment(
          writeChildren, fallbackBlocks, currentRootCount, origIdx, blockIds, skipped, false,
        );
        currentRootCount += written;
        onTableFallback?.(origIdx);
        console.warn(
          `[PageLens] 表格 #${origIdx} 已降级为 ${fallbackBlocks.length} 个段落（成功 ${written} 个）`,
        );
      }
      i++;
    }
  }

  return { blockIds, skipped, writtenCount: currentRootCount };
}

/** 删除文档中的一个块（document_revision_id=-1 表示基于最新版本）。失败仅告警，不抛出。 */
async function deleteBlock(token: string, docId: string, blockId: string): Promise<void> {
  const url = `${FEISHU_BASE_URL}/docx/v1/documents/${docId}/blocks/${blockId}?document_revision_id=-1`;
  try {
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    await safeParseJSON(resp, url);
  } catch (err) {
    console.warn(`[PageLens] 删除 block ${blockId} 失败（忽略）:`, err);
  }
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
        // 表格不再用 create-children 占位块（该接口对 Table 的 row/column 上限为 9，
        // 超限或校验失败会触发降级为代码块）。改为 push 一个仅用于内部识别的标记块，
        // 由 writeBlocksWithFallback 改用「创建嵌套块(descendants)」接口一次性创建
        // 带内容的整棵 table→cell→text 子树。
        blocks.push({
          block_type: 31,
          _table: table,
          _rawMarkdown: tableLines.join('\n'),
        });
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

// 飞书对单个 text_run 的 content 有长度上限（经验安全值，留余量）。超长内容需切分成多个 text_run，
// 否则整批 create-children 会被判为 invalid param（错误码 1770001）。
const FEISHU_TEXT_RUN_MAX_LEN = 2000;

/**
 * 将超长文本切分为多段（每段 ≤ maxLen），优先在换行处切避免截断词句。
 * 返回的段落拼接后与原文等价。
 */
function splitLongContent(content: string, maxLen: number = FEISHU_TEXT_RUN_MAX_LEN): string[] {
  if (content.length <= maxLen) return [content];
  const parts: string[] = [];
  let i = 0;
  while (i < content.length) {
    let end = Math.min(i + maxLen, content.length);
    if (end < content.length) {
      const nl = content.lastIndexOf('\n', end);
      if (nl > i + Math.floor(maxLen / 2)) end = nl; // 换行靠后则切在换行处
    }
    parts.push(content.slice(i, end));
    i = end;
  }
  return parts;
}

/** 构造一个或多个 text_run 元素（自动对超长 content 做分片），统一供 create* 使用。 */
function makeTextElements(content: string, style: TextElementStyle = {}): any[] {
  return splitLongContent(content).map((c) => ({
    text_run: {
      content: c,
      text_element_style: style,
    },
  }));
}

/**
 * 构造单元格的 text_run 元素数组：先用 parseInline 解析行内格式（加粗/斜体/删除线/
 * 行内代码/链接/嵌套），再对其中超长 content 的 text_run 用 splitLongContent 分片，
 * 避免 descendant 接口单 text_run 长度上限导致整批校验失败。保证至少返回一个元素。
 */
function inlineElementsForCell(text: string): any[] {
  const elements = parseInline(text);
  const result: any[] = [];
  for (const el of elements) {
    if (el.text_run && el.text_run.content.length > FEISHU_TEXT_RUN_MAX_LEN) {
      const style = el.text_run.text_element_style || {};
      for (const piece of splitLongContent(el.text_run.content)) {
        result.push({ text_run: { content: piece, text_element_style: style } });
      }
    } else {
      result.push(el);
    }
  }
  return result.length > 0 ? result : [makeTextElement('')];
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
  // 代码块整段作为一个 text_run 极易超长，拆成多个 text_run 避免 1770001
  return {
    block_type: 14, // code
    code: {
      language: 1, // plain text
      elements: makeTextElements(code),
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

/** 延迟工具，用于飞书创建子块的频率控制（3 QPS）。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 构造「创建嵌套块(descendants)」接口所需的整棵子树（table→cell→text），一次性携带单元格内容。
 * 纯构造，不发请求。临时 block_id 命名：table=t{tableIdx}；cell=t{tableIdx}_c{r}_{c}；
 * cell 内文本=t{tableIdx}_c{r}_{c}_p0（行优先，0-based）。
 *
 * 相比旧方案（create-children 创建空占位块 + 逐格 fillTableCells），该结构一次性建好表格并写入
 * 内容，并突破 create-children 接口对 Table 的 9 行/9 列上限（descendant 接口 column_size 上限 100，
 * 单元格不超 2000 时行数无固定上限），也避免逐格 sleep 的低效。
 */
function createTableDescendant(
  table: TableData,
  tableIdx: number,
): { childrenId: string[]; descendants: any[] } {
  const tableId = `t${tableIdx}`;
  const rowCount = table.rows.length;
  const colCount = table.columnCount;
  const cellIds: string[] = [];
  const descendants: any[] = [];

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      cellIds.push(`t${tableIdx}_c${r}_${c}`);
    }
  }

  // table 块（bt 31）：children 列出全部 cell 临时 id（行优先顺序）
  descendants.push({
    block_id: tableId,
    block_type: 31,
    table: {
      property: {
        row_size: rowCount,
        column_size: colCount,
        header_row: !!table.hasHeader, // 显式布尔，避免依赖默认值
      },
    },
    children: cellIds,
  });

  // 每个 cell（bt 32）+ 其文本子块（bt 2）。飞书创建空单元格后不会自动含文本块，
  // 必须显式提供文本子块才能写入单元格内容。
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const cellId = `t${tableIdx}_c${r}_${c}`;
      const paraId = `${cellId}_p0`;
      const cellText = table.rows[r][c] ?? '';
      descendants.push({ block_id: cellId, block_type: 32, table_cell: {}, children: [paraId] });
      descendants.push({
        block_id: paraId,
        block_type: 2, // text
        text: { elements: inlineElementsForCell(cellText), style: {} },
        children: [], // 叶子块显式声明空 children，与官方创建嵌套块示例对齐
      });
    }
  }

  return { childrenId: [tableId], descendants };
}

/**
 * 通过「创建嵌套块(descendants)」接口一次性创建带内容的整张表格。
 * 返回 { ok, code, tableBlockId }；code!==0 表示创建失败（由调用方决定是否降级）。
 */
async function createTableBlockViaDescendant(
  token: string,
  docId: string,
  index: number,
  table: TableData,
  tableIdx: number,
): Promise<{ ok: boolean; code: number; tableBlockId: string | null }> {
  const { childrenId, descendants } = createTableDescendant(table, tableIdx);
  // 注意：路径段为单数 descendant（非 descendants），否则飞书返回 404 not found
  const url = `${FEISHU_BASE_URL}/docx/v1/documents/${docId}/blocks/${docId}/descendant?document_revision_id=-1`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ index, children_id: childrenId, descendants }),
  });
  const data: any = await safeParseJSON(res, url);
  if (data.code !== 0) {
    return { ok: false, code: data.code, tableBlockId: null };
  }
  // descendant 接口返回 data.children，首个即新建的 table 顶层块
  const tableBlockId = data.data?.children?.[0]?.block_id ?? null;
  return { ok: true, code: 0, tableBlockId };
}

/**
 * 表格降级为结构化段落（加粗表头 + 逐行用「|」连接的段落），保留可读结构。
 * 不再用 createCodeBlock——那正是"表格变成代码块"bug 的来源。
 */
function tableToFallbackBlocks(table: TableData): any[] {
  const blocks: any[] = [];
  for (let r = 0; r < table.rows.length; r++) {
    const line = table.rows[r].map((cell) => cell ?? '').join(' | ');
    const isHeader = table.hasHeader && r === 0;
    blocks.push(createParagraph(isHeader ? `**${line}**` : line));
  }
  return blocks;
}
