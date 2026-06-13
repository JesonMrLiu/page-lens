/**
 * Mermaid 图表渲染工具。
 * 在 sidepanel（有 DOM 环境）中将 Mermaid 代码块渲染为 PNG base64，
 * 供飞书导出时作为图片块上传。
 */

let mermaidInitialized = false;
let mermaidModule: typeof import('mermaid').default | null = null;

/**
 * 懒加载并初始化 mermaid（仅一次）。
 * 使用动态 import 避免 service worker 加载失败。
 */
async function ensureMermaid(): Promise<typeof import('mermaid').default> {
  if (mermaidModule && mermaidInitialized) return mermaidModule;

  const mod = await import('mermaid');
  mermaidModule = mod.default;
  mermaidModule.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
  });
  mermaidInitialized = true;
  return mermaidModule;
}

/**
 * 渲染结果
 */
export interface MermaidRenderResult {
  /** PNG base64（不含 data:image/png;base64, 前缀） */
  base64: string;
  width: number;
  height: number;
}

/**
 * 从 Markdown 文本中提取所有 ```mermaid 围栏块的代码内容。
 * 返回按出现顺序排列的代码字符串数组。
 */
export function extractMermaidBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const regex = /```mermaid\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

/**
 * 将一段 Mermaid 代码渲染为 PNG 图片（base64）。
 * 渲染失败时返回 null（调用方应回退为代码块展示）。
 */
export async function renderMermaidToPng(
  code: string,
  index: number,
): Promise<MermaidRenderResult | null> {
  try {
    const mermaid = await ensureMermaid();
    const id = `mermaid-svg-${index}-${Date.now()}`;

    // mermaid.render 返回 { svg: string }
    const { svg } = await mermaid.render(id, code);

    // SVG → Image → Canvas → PNG base64
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = await loadImage(url);
    URL.revokeObjectURL(url);

    // 2x 缩放保证清晰度
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 白色背景（飞书图片块不支持透明）
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);

    const dataUrl = canvas.toDataURL('image/png');
    // 去掉 data:image/png;base64, 前缀
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');

    return {
      base64,
      width: canvas.width,
      height: canvas.height,
    };
  } catch (err) {
    console.warn(`[PageLens] Mermaid 渲染失败（块 #${index}）:`, err);
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * 批量渲染 Markdown 中的 Mermaid 块。
 * 返回与 extractMermaidBlocks 相同长度的数组，渲染失败的项为 null。
 */
export async function renderAllMermaidBlocks(
  markdown: string,
): Promise<Array<MermaidRenderResult | null>> {
  const blocks = extractMermaidBlocks(markdown);
  if (blocks.length === 0) return [];

  const results: (MermaidRenderResult | null)[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const result = await renderMermaidToPng(blocks[i], i);
    results.push(result);
  }
  return results;
}
