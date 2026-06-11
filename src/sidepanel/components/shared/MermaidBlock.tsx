import { useEffect, useRef, useState, useId } from 'react';
import mermaid from 'mermaid';

// 初始化 mermaid（全局只需一次）
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
});

interface MermaidBlockProps {
  code: string;
}

export function MermaidBlock({ code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState(false);
  const reactId = useId();

  useEffect(() => {
    // 使用 reactId 生成唯一的 mermaid 渲染 ID（去掉冒号以符合 mermaid ID 规范）
    const mermaidId = `mermaid-${reactId.replace(/:/g, '-')}`;
    let cancelled = false;

    mermaid
      .render(mermaidId, code)
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [code, reactId]);

  if (error) {
    return (
      <pre className="text-xs text-red-500 bg-red-50 p-2 rounded overflow-x-auto">
        <code>{code}</code>
      </pre>
    );
  }

  if (!svg) {
    return (
      <div className="text-xs text-gray-400 py-2">渲染图表中...</div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-x-auto flex justify-center [&>svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
