import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MermaidBlock } from './MermaidBlock';
import type { ComponentPropsWithoutRef } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** 是否处于流式输出中，为 true 时跳过 Mermaid 渲染 */
  isStreaming?: boolean;
}

/**
 * 自定义 code 渲染：检测 mermaid/flowchart/graph 语言标识，渲染为可视化图表
 */
function CodeBlock({
  className,
  children,
  isStreaming,
  ...props
}: ComponentPropsWithoutRef<'code'> & { node?: unknown; isStreaming?: boolean }) {
  const match = /language-(mermaid|flowchart|graph)/.exec(className || '');
  const code = String(children).replace(/\n$/, '');

  if (match) {
    // 流式输出期间：Mermaid 代码可能不完整，显示为代码块避免渲染错误
    if (isStreaming) {
      return (
        <pre className="text-xs text-blue-600 bg-blue-50 p-2 rounded overflow-x-auto my-2">
          <code>{code}</code>
        </pre>
      );
    }
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

export function MarkdownRenderer({ content, className, isStreaming }: MarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: (props) => <CodeBlock {...props} isStreaming={isStreaming} />,
          pre: PreBlock,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
