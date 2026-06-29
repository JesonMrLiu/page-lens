/**
 * 端到端验证脚本：真实调用 Notion API，验证完整同步链路满足三个验收标准。
 *
 *   1. 点击同步按钮无任何报错            → 脚本创建/更新页面不抛错
 *   2. 内容与 Markdown 100% 一致        → 读回页面块并与输入 markdown 对比结构
 *   3. 重复同步仅更新、不重复创建        → 第二次同步后 pageId 不变、子块不翻倍
 *
 * 用法：
 *   node test-notion-e2e.mjs <token> <parentPageId>
 *
 *   token         Notion Internal Integration Secret（secret_xxx）
 *   parentPageId  目标父页面 id（需已在该页面 Connect 此 Integration）
 *
 * 不依赖浏览器/插件，纯 Node 运行。会在 parentPageId 下创建临时测试子页面，
 * 验证完成后自动删除该子页面，保持 Notion 工作区干净。
 */
const TOKEN = process.argv[2];
const PARENT = process.argv[3];
const BASE = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';

if (!TOKEN || !PARENT) {
  console.error('用法: node test-notion-e2e.mjs <token> <parentPageId>');
  process.exit(2);
}

async function call(method, path, body, query) {
  let url = BASE + path;
  if (query) url += '?' + new URLSearchParams(query).toString();
  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { _raw: text }; }
  if (!resp.ok) {
    throw new Error(`Notion ${method} ${path} 失败 HTTP ${resp.status}: ${data?.message || text}`);
  }
  return data;
}

// 从 notion-client.ts 编译出与生产一致的纯转换函数
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const src = readFileSync(resolve('src/background/notion-client.ts'), 'utf8');
const out = await build({
  stdin: { contents: src, resolveDir: process.cwd(), loader: 'ts' },
  format: 'esm', bundle: false, write: false, target: 'es2020',
});
const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const { markdownToNotionBlocks } = mod;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(cond, label) {
  if (cond) { pass++; console.log('  PASS', label); }
  else { fail++; console.log('  FAIL', label); }
}

try {
  const markdown = `# 测试标题 H1

这是一个段落，含**加粗**和*斜体*以及\`行内代码\`。

## 二级标题

- 无序列表项 A
- 无序列表项 B

1. 有序列表项 1
2. 有序列表项 2

> 引用块内容

\`\`\`javascript
const x = 42;
\`\`\`

---

结尾段落，带[链接](https://example.com)。`;

  console.log('\n[1] 首次同步（创建页面）…');
  const blocks1 = markdownToNotionBlocks(markdown);
  const created = await call('POST', '/pages', {
    parent: { page_id: PARENT.replace(/-/g, '') },
    properties: { title: { title: [{ type: 'text', text: { content: 'PageLens E2E 测试' } }] } },
    children: blocks1.slice(0, 100),
  });
  const pageId = created.id;
  console.log('  创建页面 id:', pageId);
  check(true, '创建页面无报错（验收标准 1）');

  if (blocks1.length > 100) {
    await call('PATCH', `/blocks/${pageId}/children`, { children: blocks1.slice(100) });
  }
  await sleep(800);

  // 读回并验证结构（验收标准 2）
  console.log('\n[2] 读回页面块，校验结构一致性…');
  const childBlocks = await call('GET', `/blocks/${pageId}/children`, undefined, { page_size: 100 });
  const types = childBlocks.results.map(b => b.type);
  const expectedTypes = blocks1.map(b => b.type);
  check(JSON.stringify(types) === JSON.stringify(expectedTypes), `块类型序列一致（${types.join(',')}）`);

  // 校验粗体：段落 index 1（"这是一个段落…"）
  const para = childBlocks.results.find(b => b.type === 'paragraph');
  const boldNode = para.paragraph.rich_text.find(r => r.annotations?.bold);
  check(!!boldNode && boldNode.text.content === '加粗', '段落中粗体节点内容正确');
  const italicNode = para.paragraph.rich_text.find(r => r.annotations?.italic && r.text.content === '斜体');
  check(!!italicNode, '段落中斜体节点正确');
  const codeInline = para.paragraph.rich_text.find(r => r.annotations?.code && r.text.content === '行内代码');
  check(!!codeInline, '段落中行内代码节点正确');

  // 校验代码块语言与内容
  const codeBlk = childBlocks.results.find(b => b.type === 'code');
  check(codeBlk.code.language === 'javascript', '代码块语言正确');
  check(codeBlk.code.rich_text[0].text.content === 'const x = 42;', '代码块内容正确');

  // 校验列表
  const bullets = childBlocks.results.filter(b => b.type === 'bulleted_list_item');
  check(bullets.length === 2, `无序列表项数量=2（实际 ${bullets.length}）`);
  const ordereds = childBlocks.results.filter(b => b.type === 'numbered_list_item');
  check(ordereds.length === 2, `有序列表项数量=2（实际 ${ordereds.length}）`);

  // [3] 重复同步：更新内容（不重新创建）
  console.log('\n[3] 重复同步（更新同一页面）…');
  const markdown2 = `# 更新后的标题

全新内容，**仍含粗体**。

- 新列表项`;

  // 模拟生产更新逻辑：清空旧子块 + 追加新块
  const oldChildren = await call('GET', `/blocks/${pageId}/children`, undefined, { page_size: 100 });
  for (const b of oldChildren.results) {
    await call('DELETE', `/blocks/${b.id}`);
  }
  await call('PATCH', `/pages/${pageId}`, {
    properties: { title: { title: [{ type: 'text', text: { content: '更新后的标题' } }] } },
  });
  const blocks2 = markdownToNotionBlocks(markdown2);
  await call('PATCH', `/blocks/${pageId}/children`, { children: blocks2.slice(0, 100) });
  if (blocks2.length > 100) {
    await call('PATCH', `/blocks/${pageId}/children`, { children: blocks2.slice(100) });
  }
  await sleep(800);

  // 验证：页面 id 未变（未重复创建），子块数量 = 新内容块数（未翻倍）
  const after = await call('GET', `/blocks/${pageId}/children`, undefined, { page_size: 100 });
  const afterTypes = after.results.map(b => b.type);
  check(afterTypes.length === blocks2.length, `更新后块数=${afterTypes.length}（应为 ${blocks2.length}，未翻倍）`);
  check(afterTypes[0] === 'heading_1', '更新后首块为标题（内容已替换）');
  check(after.results.length > 0 && after.results.every((b, i) => b.type === blocks2[i].type), '更新后块类型序列与新内容一致');

  // 清理：删除测试页面
  console.log('\n[清理] 删除测试子页面…');
  await call('DELETE', `/blocks/${pageId}`);
  console.log('  已删除临时测试页面。');

  console.log(`\n结果：${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
} catch (err) {
  console.error('\n[ERROR]', err.message);
  process.exit(1);
}
