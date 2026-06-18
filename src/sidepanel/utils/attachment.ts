import type { Attachment } from '@/shared/types';

/** 接受的文本类扩展名（小写，带点） */
export const TEXT_EXTS = [
  '.md', '.markdown', '.txt', '.csv', '.tsv', '.json', '.xml', '.html', '.htm',
  '.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift', '.kt',
  '.css', '.scss', '.less',
  '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.sh', '.bash', '.zsh', '.sql',
  '.log', '.env',
];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;   // 单图上限 5MB
export const MAX_TEXT_SIZE = 512 * 1024;           // 单文本上限 512KB
export const MAX_EDGE = 1568;                       // 图片压缩最长边
export const MAX_IMAGES_PER_MESSAGE = 4;            // 单条消息最多图片数

/** <input accept> 属性字符串，涵盖图片 MIME 与文本白名单扩展名 */
export const ACCEPT_ATTR = [
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp',
  ...TEXT_EXTS,
].join(',');

/** 文件扩展名（小写，带点） */
export function getExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

/** 是否为可上传文件（图片或文本白名单） */
export function isAcceptable(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return TEXT_EXTS.includes(getExt(file.name));
}

/** 判断文件类型：图片 / 文本 */
export function classify(file: File): 'image' | 'file' {
  return file.type.startsWith('image/') ? 'image' : 'file';
}

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'att_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsText(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAIL'));
    img.src = src;
  });
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * canvas 压缩：最长边 ≤ MAX_EDGE。
 * PNG 保持 png 格式（保留透明通道）；jpeg/webp 转为 webp 重编码（quality 0.85）。
 */
async function compressImage(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    let { width, height } = img;
    if (Math.max(width, height) > MAX_EDGE) {
      const scale = MAX_EDGE / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_FAIL');
    ctx.drawImage(img, 0, 0, width, height);
    const outMime = file.type === 'image/png' ? 'image/png' : 'image/webp';
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outMime, outMime === 'image/png' ? undefined : 0.85),
    );
    if (!blob) throw new Error('CANVAS_FAIL');
    return blobToDataURL(blob);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** 处理图片：GIF 原样 base64 不压缩（保留动画），其余走 canvas 压缩 */
export async function processImage(file: File): Promise<Attachment> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
  if (file.type === 'image/gif') {
    const dataUrl = await readAsDataURL(file);
    return { id: genId(), kind: 'image', name: file.name, mime: 'image/gif', dataUrl, size: file.size };
  }
  const dataUrl = await compressImage(file);
  return { id: genId(), kind: 'image', name: file.name, mime: file.type || 'image/png', dataUrl, size: file.size };
}

/** 处理文本文件：读取纯文本 */
export async function processText(file: File): Promise<Attachment> {
  if (file.size > MAX_TEXT_SIZE) throw new Error('TEXT_TOO_LARGE');
  const text = await readAsText(file);
  return { id: genId(), kind: 'file', name: file.name, mime: file.type || 'text/plain', textContent: text, size: file.size };
}

/** 统一入口：批量处理 File 列表，返回成功附件 + 失败原因 */
export async function processFiles(files: File[]): Promise<{ attachments: Attachment[]; errors: string[] }> {
  const attachments: Attachment[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (!isAcceptable(file)) {
      errors.push(`${file.name}: 不支持的文件类型`);
      continue;
    }
    try {
      if (classify(file) === 'image') {
        attachments.push(await processImage(file));
      } else {
        attachments.push(await processText(file));
      }
    } catch (e: any) {
      if (e?.message === 'IMAGE_TOO_LARGE') errors.push(`${file.name}: 图片过大（≤5MB）`);
      else if (e?.message === 'TEXT_TOO_LARGE') errors.push(`${file.name}: 文本过大（≤512KB）`);
      else errors.push(`${file.name}: 处理失败`);
    }
  }
  return { attachments, errors };
}
