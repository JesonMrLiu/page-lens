import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidBlock } from './MermaidBlock';
import type { ComponentPropsWithoutRef } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * 自定义 code 渲染：检测 mermaid/flowchart/graph 语言标识，渲染为可视化图表
 */
function CodeBlock({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'code'> & { node?: unknown }) {
  const match = /language-(mermaid|flowchart|graph)/.exec(className || '');
  const code = String(children).replace(/\n$/, '');

  if (match) {
    return <MermaidBlock code={code} />;
  }

  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

/**
 * 自定义 pre 渲染：当子元素为 MermaidBlock 时去掉 pre 包裹
 */
function PreBlock({
  children,
  ...props
}: ComponentPropsWithoutRef<'pre'> & { node?: unknown }) {
  // 检测子元素是否包含 MermaidBlock（通过 className 判断）
  const childArray = Array.isArray(children) ? children : [children];
  const hasMermaid = childArray.some((child) => {
    if (child && typeof child === 'object' && 'props' in child) {
      const childProps = (child as { props?: { className?: string } }).props;
      return childProps?.className?.includes('language-mermaid') ||
             childProps?.className?.includes('language-flowchart') ||
             childProps?.className?.includes('language-graph');
    }
    return false;
  });

  if (hasMermaid) {
    return <>{children}</>;
  }

  return <pre {...props}>{children}</pre>;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
          pre: PreBlock,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
