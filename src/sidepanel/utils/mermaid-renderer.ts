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
    flowchart: { useMaxWidth: false }, // 不限制 SVG 宽度，避免复杂图被截断
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
 * 确保 SVG 有显式像素宽高，避免 Image 加载 SVG Blob 时尺寸不正确导致截断。
 *
 * Mermaid 产出的 SVG 常带 width="100%" 或 style="max-width:..." 而无显式像素宽度。
 * 浏览器加载这类 SVG Blob 时无法正确解析固有尺寸，img.width 可能是一个默认小值，
 * 导致 Canvas 只画出图的左半部分。本函数从 viewBox 提取真实宽高并注入显式属性。
 */
const MAX_SVG_WIDTH = 3000; // 超宽图等比缩放上限（px），避免飞书文档溢出 + 上传过大

function ensureSvgExplicitSize(svgStr: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgStr, 'image/svg+xml');
    const svgEl = doc.documentElement;

    // 1. 优先从 viewBox 提取真实尺寸
    let width = 0;
    let height = 0;
    const viewBox = svgEl.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.trim().split(/[\s,]+/);
      if (parts.length >= 4) {
        width = parseFloat(parts[2]);
        height = parseFloat(parts[3]);
      }
    }

    // 2. fallback：从 width/height 属性提取
    if (!width || !height) {
      const wAttr = svgEl.getAttribute('width');
      const hAttr = svgEl.getAttribute('height');
      if (wAttr) width = parseFloat(wAttr);
      if (hAttr) height = parseFloat(hAttr);
    }

    // 3. fallback：默认尺寸
    if (!width || !height || isNaN(width) || isNaN(height)) {
      width = 800;
      height = 600;
    }

    // 4. 超宽图等比缩放
    if (width > MAX_SVG_WIDTH) {
      const ratio = MAX_SVG_WIDTH / width;
      width = MAX_SVG_WIDTH;
      height = Math.round(height * ratio);
    }

    // 5. 设置显式像素宽高 + 移除 style 中的 max-width 约束
    svgEl.setAttribute('width', String(width));
    svgEl.setAttribute('height', String(height));
    // 移除可能存在的 max-width style（Mermaid 常注入）
    const style = svgEl.getAttribute('style');
    if (style && style.includes('max-width')) {
      svgEl.setAttribute('style', style.replace(/max-width\s*:\s*[^;]+;?/gi, ''));
    }

    return new XMLSerializer().serializeToString(svgEl);
  } catch {
    // 解析失败时返回原始 SVG（不阻断流程）
    return svgStr;
  }
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
    // 注入显式像素尺寸，避免 Image 加载 SVG Blob 时尺寸不正确导致截断（只有左半边）
    const sizedSvg = ensureSvgExplicitSize(svg);
    const svgBlob = new Blob([sizedSvg], { type: 'image/svg+xml;charset=utf-8' });
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
