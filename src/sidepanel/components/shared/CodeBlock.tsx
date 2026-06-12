import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  language: string;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-lg overflow-hidden my-2">
      {/* Header: language label + copy button */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#282c34] text-gray-400 text-xs">
        <span className="font-mono lowercase">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-gray-200 transition-colors"
          title="复制代码"
        >
          {copied ? (
            <>
              <Check size={12} className="text-green-400" />
              <span className="text-green-400">已复制</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>复制</span>
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.8rem',
          lineHeight: '1.5',
          maxHeight: '500px',
        }}
        showLineNumbers={code.split('\n').length > 3}
        lineNumberStyle={{ fontSize: '0.7rem', color: '#636d83' }}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
