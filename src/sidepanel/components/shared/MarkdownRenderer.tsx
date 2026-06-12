import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { CodeBlock } from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    const codeStr = String(children).replace(/\n$/, '');

    // 行内代码：没有语言标记且为单行
    if (!className && !codeStr.includes('\n')) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }

    // 代码块：语法高亮渲染
    return <CodeBlock language={language || 'text'} code={codeStr} />;
  },
  pre({ children }) {
    // 避免 ReactMarkdown 的 <pre> 包裹导致双层嵌套
    return <>{children}</>;
  },
};

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
