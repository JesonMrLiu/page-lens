/**
 * 端到端验证脚本：直接调用飞书「创建嵌套块」接口创建一张表格，
 * 验证代码生成的请求体在真实 API 下能否成功渲染为表格。
 *
 * 用法：
 *   node test-table-e2e.mjs <appId> <appSecret> [folderToken]
 *
 * 例如：
 *   node test-table-e2e.mjs cli_a1b2c3d4 你的appSecret
 *
 * 这会：
 * 1. 获取 tenant_access_token
 * 2. 创建一个测试文档
 * 3. 用与插件完全相同的 createTableDescendant 逻辑创建一张 3行2列表格（含表头）
 * 4. 打印 API 响应（成功/失败码）
 * 5. 读回文档块验证表格是否真的建成了
 *
 * 不依赖浏览器/插件，纯 Node 运行。
 */
const BASE = 'https://open.feishu.cn/open-apis';

async function safeJSON(resp, url) {
  const text = await resp.text();
  try { return JSON.parse(text); }
  catch { throw new Error('非 JSON 响应 (HTTP ' + resp.status + '): ' + text.slice(0, 200) + ' url=' + url); }
}

// ===== 与 feishu-client.ts 完全相同的表格构造逻辑 =====
function createTableDescendant(table, tableIdx) {
  const tableId = 't' + tableIdx;
  const rowCount = table.rows.length;
  const colCount = table.columnCount;
  const cellIds = [];
  const descendants = [];
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      cellIds.push('t' + tableIdx + '_c' + r + '_' + c);
    }
  }
  descendants.push({
    block_id: tableId,
    block_type: 31,
    table: { property: { row_size: rowCount, column_size: colCount, header_row: !!table.hasHeader } },
    children: cellIds,
  });
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const cellId = 't' + tableIdx + '_c' + r + '_' + c;
      const paraId = cellId + '_p0';
      descendants.push({ block_id: cellId, block_type: 32, table_cell: {}, children: [paraId] });
      descendants.push({
        block_id: paraId,
        block_type: 2,
        text: {
          elements: [{ text_run: { content: String(table.rows[r][c] || ''), text_element_style: {} } }],
          style: {},
        },
        children: [],
      });
    }
  }
  return { childrenId: [tableId], descendants };
}

async function main() {
  const appId = process.argv[2];
  const appSecret = process.argv[3];
  const folderToken = process.argv[4] || undefined;

  if (!appId || !appSecret) {
    console.error('用法: node test-table-e2e.mjs <appId> <appSecret> [folderToken]');
    process.exit(1);
  }

  // 1. 获取 token
  console.log('1. 获取 tenant_access_token ...');
  const tokenResp = await fetch(BASE + '/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const tokenData = await safeJSON(tokenResp);
  if (tokenData.code !== 0) {
    console.error('   认证失败:', tokenData.code, tokenData.msg);
    process.exit(1);
  }
  const token = tokenData.tenant_access_token;
  console.log('   ✓ token 获取成功');

  // 2. 创建测试文档
  console.log('2. 创建测试文档 ...');
  const createBody = { title: '表格端到端测试' };
  if (folderToken) createBody.folder_token = folderToken;
  const docResp = await fetch(BASE + '/docx/v1/documents', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody),
  });
  const docData = await safeJSON(docResp, BASE + '/docx/v1/documents');
  if (docData.code !== 0) {
    console.error('   创建文档失败:', docData.code, docData.msg);
    process.exit(1);
  }
  const docId = docData.data.document.document_id;
  console.log('   ✓ 文档已创建: https://www.feishu.cn/docx/' + docId);

  // 3. 构造表格（3行2列，含表头）
  const table = {
    rows: [['姓名', '年龄'], ['张三', '25'], ['李四', '30']],
    columnCount: 2,
    hasHeader: true,
  };
  const { childrenId, descendants } = createTableDescendant(table, 0);
  console.log('3. 创建嵌套块 (descendant 接口)，3行2列表格，descendants 块数:', descendants.length);

  // ★ 注意路径：单数 descendant
  const url = BASE + '/docx/v1/documents/' + docId + '/blocks/' + docId + '/descendant?document_revision_id=-1';
  const descResp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ index: 0, children_id: childrenId, descendants }),
  });
  const descData = await safeJSON(descResp, url);

  if (descData.code !== 0) {
    console.error('   ✗ 创建表格失败! code=' + descData.code + ' msg=' + descData.msg);
    console.error('   这就是表格无法渲染的原因。请把这个 code 反馈给开发者。');
    process.exit(1);
  }
  console.log('   ✓ 表格创建成功! code=0');
  const relations = descData.data?.block_id_relations || [];
  console.log('   临时ID→实际ID 映射数:', relations.length);

  // 4. 读回文档块，验证表格真的存在
  console.log('4. 读回文档块验证 ...');
  const listResp = await fetch(BASE + '/docx/v1/documents/' + docId + '/blocks?page_size=100', {
    headers: { Authorization: 'Bearer ' + token },
  });
  const listData = await safeJSON(listResp);
  if (listData.code === 0) {
    const items = listData.data?.items || [];
    const types = items.map(b => b.block_type);
    const hasTable = types.includes(31);
    const hasCell = types.includes(32);
    console.log('   文档块类型:', types.join(', '));
    console.log('   含表格块(31):', hasTable ? '✓ 是' : '✗ 否');
    console.log('   含单元格块(32):', hasCell ? '✓ 是' : '✗ 否');
  }

  console.log('\n========== 结论 ==========');
  console.log('表格已通过「创建嵌套块」接口成功写入飞书文档。');
  console.log('请打开文档确认渲染效果: https://www.feishu.cn/docx/' + docId);
  console.log('如果打开后看到的是真正的表格（而非代码块），则修复成功。');
}

main().catch(err => {
  console.error('异常:', err.message);
  process.exit(1);
});
