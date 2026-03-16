import React from 'react';
import CodeBlock from './CodeBlock';
import styles from './Markdown.module.css';

// ---- Lightweight Markdown Renderer ---- //
export function renderMarkdown(text) {
  if (!text) return null;

  // Split into code blocks and non-code segments
  const segments = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'code', lang: match[1] || 'text', content: match[2].replace(/\n$/, '') });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments.map((seg, i) => {
    if (seg.type === 'code') {
      return <CodeBlock key={i} language={seg.lang} code={seg.content} />;
    }
    return <InlineMarkdown key={i} text={seg.content} />;
  });
}

function InlineMarkdown({ text }) {
  // Process line by line for block-level elements
  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headers
    const headerMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const Tag = `h${level}`;
      elements.push(
        <Tag key={i} className={styles[`mdH${level}`]}>
          {processInline(headerMatch[2])}
        </Tag>
      );
      i++;
      continue;
    }

    // Unordered list items
    if (/^[\s]*[-*]\s+/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^[\s]*[-*]\s+/.test(lines[i])) {
        listItems.push(
          <li key={i}>{processInline(lines[i].replace(/^[\s]*[-*]\s+/, ''))}</li>
        );
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className={styles.mdList}>{listItems}</ul>);
      continue;
    }

    // Ordered list items
    if (/^[\s]*\d+\.\s+/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^[\s]*\d+\.\s+/.test(lines[i])) {
        listItems.push(
          <li key={i}>{processInline(lines[i].replace(/^[\s]*\d+\.\s+/, ''))}</li>
        );
        i++;
      }
      elements.push(<ol key={`ol-${i}`} className={styles.mdList}>{listItems}</ol>);
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <blockquote key={`bq-${i}`} className={styles.mdBlockquote}>
          {processInline(quoteLines.join('\n'))}
        </blockquote>
      );
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} className={styles.mdHr} />);
      i++;
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Regular paragraph — collect consecutive non-empty lines
    const paraLines = [];
    while (i < lines.length && lines[i].trim() && !lines[i].match(/^#{1,4}\s/) && !/^[\s]*[-*]\s+/.test(lines[i]) && !/^[\s]*\d+\.\s+/.test(lines[i]) && !lines[i].startsWith('> ') && !/^---+$/.test(lines[i].trim())) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      elements.push(
        <p key={`p-${i}`} className={styles.mdPara}>
          {processInline(paraLines.join('\n'))}
        </p>
      );
    }
  }

  return <>{elements}</>;
}

function processInline(text) {
  if (!text) return text;

  // Process inline elements: bold, italic, code, links
  const parts = [];
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIdx = 0;
  let m;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      parts.push(text.slice(lastIdx, m.index));
    }
    if (m[1]) {
      parts.push(<strong key={m.index}>{m[2]}</strong>);
    } else if (m[3]) {
      parts.push(<em key={m.index}>{m[4]}</em>);
    } else if (m[5]) {
      parts.push(<code key={m.index} className={styles.inlineCode}>{m[6]}</code>);
    } else if (m[7]) {
      parts.push(<a key={m.index} className={styles.mdLink} href={m[9]} target="_blank" rel="noopener noreferrer">{m[8]}</a>);
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
}
