import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings - Professional document styling
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold text-foreground mt-6 mb-3 first:mt-0 pb-2 border-b border-border">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold text-foreground mt-5 mb-2 pb-1 border-b border-border/50">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-base font-semibold text-foreground mt-3 mb-1">{children}</h4>
          ),
          h5: ({ children }) => (
            <h5 className="text-sm font-semibold text-foreground mt-2 mb-1">{children}</h5>
          ),
          h6: ({ children }) => (
            <h6 className="text-sm font-medium text-muted-foreground mt-2 mb-1">{children}</h6>
          ),
          
          // Paragraphs with proper spacing for letters/emails
          p: ({ children }) => (
            <p className="text-sm leading-relaxed mb-3 last:mb-0 text-foreground/90">{children}</p>
          ),
          
          // Lists with proper indentation
          ul: ({ children }) => (
            <ul className="list-disc pl-6 space-y-1.5 mb-3 text-sm">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-6 space-y-1.5 mb-3 text-sm">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-sm leading-relaxed text-foreground/90 pl-1">{children}</li>
          ),
          
          // Bold and italic for emphasis
          strong: ({ children }) => (
            <strong className="font-bold text-foreground">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground/80">{children}</em>
          ),
          
          // Code blocks with syntax highlighting appearance
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="px-1.5 py-0.5 rounded bg-muted text-primary font-mono text-xs border border-border/50" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={cn("block p-4 rounded-lg bg-muted/80 font-mono text-xs overflow-x-auto border border-border/30", className)} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-4 overflow-hidden rounded-lg shadow-sm">{children}</pre>
          ),
          
          // Blockquotes for important notes and citations
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/60 pl-4 py-2 my-4 bg-muted/30 rounded-r-lg italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          
          // Links with proper styling
          a: ({ href, children }) => (
            <a 
              href={href} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80 font-medium"
            >
              {children}
            </a>
          ),
          
          // Horizontal rule for section breaks
          hr: () => <hr className="border-border my-6" />,
          
          // Professional tables with proper styling
          table: ({ children }) => (
            <div className="overflow-x-auto mb-4 rounded-lg border border-border shadow-sm">
              <table className="min-w-full text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/70 border-b border-border">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border/50">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-muted/30 transition-colors">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 text-foreground/90">{children}</td>
          ),
          
          // Definition lists support
          dl: ({ children }) => (
            <dl className="space-y-2 mb-3">{children}</dl>
          ),
          dt: ({ children }) => (
            <dt className="font-semibold text-foreground">{children}</dt>
          ),
          dd: ({ children }) => (
            <dd className="pl-4 text-muted-foreground text-sm">{children}</dd>
          ),
          
          // Images with proper sizing
          img: ({ src, alt }) => (
            <img 
              src={src} 
              alt={alt || ''} 
              className="max-w-full h-auto rounded-lg my-4 shadow-sm"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
