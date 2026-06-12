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
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState(false);
  const reactId = useId();
  const renderCountRef = useRef(0);

  useEffect(() => {
    // 关键修复：每次 render 前重置所有状态
    setSvg('');
    setError(false);

    // 使用递增后缀避免 Mermaid ID 复用导致的缓存问题
    renderCountRef.current += 1;
    const mermaidId = `mermaid-${reactId.replace(/:/g, '-')}-${renderCountRef.current}`;
    let cancelled = false;

    mermaid
      .render(mermaidId, code)
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg);
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[Mermaid] Render error:', err);
          setError(true);
        }
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
      className="overflow-x-auto flex justify-center [&>svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
