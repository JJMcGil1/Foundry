import React from 'react';
import CodeBlock from './CodeBlock';
import styles from './Markdown.module.css';

// ---- Markdown Renderer ---- //
// Handles: code blocks, tables, headers (h1-h6), lists (ul/ol/task),
// blockquotes, HR, bold, italic, bold-italic, strikethrough, inline code, links

// Module-scoped LRU cache for parsed markdown.
// Why: the streaming flush rebuilds the assistant `msg` object on every block
// boundary, which makes AgentMessage re-render and re-call renderMarkdown for
// every text block in the message — even text blocks that came before a tool
// call and never change. With 5+ tool blocks interleaved between text blocks,
// each streaming delta was re-parsing all of them. Cache stable text blocks
// by exact content; the actively-streaming tail still parses fresh each time
// because its content keeps growing.
// Cap: 500 entries is enough for a few hundred messages worth of text blocks
// and keeps the cache memory bounded (~a few MB even with long blocks).
const MD_CACHE_LIMIT = 500;
const mdCache = new Map();

function cachedRenderMarkdown(text) {
  if (mdCache.has(text)) {
    // Refresh recency: delete + re-insert so Map iteration order = LRU order.
    const cached = mdCache.get(text);
    mdCache.delete(text);
    mdCache.set(text, cached);
    return cached;
  }
  const result = renderMarkdownImpl(text);
  mdCache.set(text, result);
  if (mdCache.size > MD_CACHE_LIMIT) {
    // Evict oldest entry (first inserted via Map iteration order).
    const oldest = mdCache.keys().next().value;
    if (oldest !== undefined) mdCache.delete(oldest);
  }
  return result;
}

export function renderMarkdown(text) {
  if (!text) return null;
  return cachedRenderMarkdown(text);
}

function renderMarkdownImpl(text) {
  if (!text) return null;

  // Split into code blocks and non-code segments
  // Supports: ```lang, ``` lang, ```lang-name, ```c++, no newline after ```
  const segments = [];
  const codeBlockRegex = /```([^\n`]*?)[ \t]*\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    const lang = match[1].trim() || 'text';
    segments.push({ type: 'code', lang, content: match[2].replace(/\n$/, '') });
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

// ---- Table helpers ---- //
function isTableRow(line) {
  const t = line.trim();
  return t.startsWith('|') && t.endsWith('|') && t.length > 2;
}

function isTableSeparator(line) {
  const t = line.trim();
  if (!t.startsWith('|') || !t.endsWith('|')) return false;
  const inner = t.slice(1, -1);
  return inner.split('|').every(cell => /^\s*:?-+:?\s*$/.test(cell.trim()));
}

function parseTableCells(line) {
  const t = line.trim();
  return t.slice(1, -1).split('|').map(c => c.trim());
}

// ---- Block-level parser ---- //
function InlineMarkdown({ text }) {
  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headers (h1 – h6)
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch) {
      const level = Math.min(headerMatch[1].length, 6);
      const Tag = `h${level}`;
      const cls = styles[`mdH${level}`] || styles.mdH4;
      elements.push(
        <Tag key={i} className={cls}>{processInline(headerMatch[2])}</Tag>
      );
      i++;
      continue;
    }

    // Tables
    if (isTableRow(line)) {
      const tableRows = [];
      const startI = i;
      while (i < lines.length && isTableRow(lines[i])) {
        tableRows.push(lines[i]);
        i++;
      }
      if (tableRows.length >= 2) {
        const headerCells = parseTableCells(tableRows[0]);
        const dataStart = (tableRows.length >= 2 && isTableSeparator(tableRows[1])) ? 2 : 1;
        const bodyRows = tableRows.slice(dataStart).filter(r => !isTableSeparator(r));
        elements.push(
          <div key={`table-${startI}`} className={styles.tableWrap}>
            <table className={styles.mdTable}>
              <thead>
                <tr>
                  {headerCells.map((cell, ci) => (
                    <th key={ci}>{processInline(cell)}</th>
                  ))}
                </tr>
              </thead>
              {bodyRows.length > 0 && (
                <tbody>
                  {bodyRows.map((row, ri) => {
                    const cells = parseTableCells(row);
                    return (
                      <tr key={ri}>
                        {headerCells.map((_, ci) => (
                          <td key={ci}>{processInline(cells[ci] || '')}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              )}
            </table>
          </div>
        );
        continue;
      }
      i = startI; // single row — fall through
    }

    // Task list items  - [ ] or - [x]
    if (/^[\s]*[-*]\s+\[[ xX]\]\s/.test(line)) {
      const tasks = [];
      while (i < lines.length && /^[\s]*[-*]\s+\[[ xX]\]\s/.test(lines[i])) {
        const checked = /\[[xX]\]/.test(lines[i]);
        const content = lines[i].replace(/^[\s]*[-*]\s+\[[ xX]\]\s+/, '');
        tasks.push(
          <li key={i} className={styles.taskItem}>
            <span className={`${styles.taskCheck} ${checked ? styles.taskChecked : ''}`}>
              {checked && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5.5L4 7.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className={checked ? styles.taskDone : ''}>{processInline(content)}</span>
          </li>
        );
        i++;
      }
      elements.push(<ul key={`task-${i}`} className={styles.taskList}>{tasks}</ul>);
      continue;
    }

    // Unordered list items
    if (/^[\s]*[-*]\s+/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^[\s]*[-*]\s+/.test(lines[i])) {
        const indent = lines[i].match(/^(\s*)/)[1].length;
        listItems.push(
          <li key={i} style={indent >= 2 ? { marginLeft: Math.min(indent, 4) * 8 } : undefined}>
            {processInline(lines[i].replace(/^[\s]*[-*]\s+/, ''))}
          </li>
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
        const indent = lines[i].match(/^(\s*)/)[1].length;
        listItems.push(
          <li key={i} style={indent >= 2 ? { marginLeft: Math.min(indent, 4) * 8 } : undefined}>
            {processInline(lines[i].replace(/^[\s]*\d+\.\s+/, ''))}
          </li>
        );
        i++;
      }
      elements.push(<ol key={`ol-${i}`} className={styles.mdList}>{listItems}</ol>);
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      elements.push(
        <blockquote key={`bq-${i}`} className={styles.mdBlockquote}>
          {processInline(quoteLines.join('\n'))}
        </blockquote>
      );
      continue;
    }

    // Horizontal rule (---, ***, ___)
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      elements.push(<hr key={i} className={styles.mdHr} />);
      i++;
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-block lines
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].match(/^#{1,6}\s/) &&
      !/^[\s]*[-*]\s+/.test(lines[i]) &&
      !/^[\s]*\d+\.\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^[-*_]{3,}\s*$/.test(lines[i].trim()) &&
      !isTableRow(lines[i])
    ) {
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

// ---- Inline parser ---- //
// Handles: ***bold italic***, **bold**, *italic*, ~~strikethrough~~, `code`, [link](url)
// Processes from longest/most-specific patterns first to handle nesting correctly.
function processInline(text) {
  if (!text) return text;

  const parts = [];
  // Order matters: bold-italic before bold before italic
  const regex = /(\*\*\*(.+?)\*\*\*)|(~~(.+?)~~)|(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIdx = 0;
  let m;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      parts.push(text.slice(lastIdx, m.index));
    }
    if (m[1]) {
      // ***bold italic***
      parts.push(<strong key={m.index}><em>{m[2]}</em></strong>);
    } else if (m[3]) {
      // ~~strikethrough~~
      parts.push(<del key={m.index} className={styles.strikethrough}>{m[4]}</del>);
    } else if (m[5]) {
      // **bold**
      parts.push(<strong key={m.index}>{m[6]}</strong>);
    } else if (m[7]) {
      // *italic*
      parts.push(<em key={m.index}>{m[8]}</em>);
    } else if (m[9]) {
      // `inline code`
      parts.push(<code key={m.index} className={styles.inlineCode}>{m[10]}</code>);
    } else if (m[11]) {
      // [link](url)
      parts.push(
        <a key={m.index} className={styles.mdLink} href={m[13]} target="_blank" rel="noopener noreferrer">
          {m[12]}
        </a>
      );
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
}
