import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSend, FiMessageSquare, FiUser, FiCpu, FiSquare, FiAlertCircle, FiSettings, FiChevronRight, FiTool, FiCopy, FiCheck } from 'react-icons/fi';
import styles from './ChatPanel.module.css';

let streamIdCounter = 0;

// ---- Lightweight Markdown Renderer ---- //
function renderMarkdown(text) {
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

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHeader}>
        <span className={styles.codeLang}>{language}</span>
        <button className={styles.copyBtn} onClick={handleCopy} title="Copy code">
          {copied ? <FiCheck size={12} /> : <FiCopy size={12} />}
        </button>
      </div>
      <pre className={styles.codePre}><code>{code}</code></pre>
    </div>
  );
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
  // Match: **bold**, *italic*, `code`, [text](url)
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


// ---- Thinking Block Component ---- //
function ThinkingBlock({ content, isStreaming }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.thinkingBlock}>
      <button
        className={`${styles.thinkingToggle} ${expanded ? styles.thinkingExpanded : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <FiChevronRight size={12} className={styles.thinkingChevron} />
        <span className={styles.thinkingLabel}>
          {isStreaming ? 'Thinking...' : 'Thinking'}
        </span>
        {isStreaming && (
          <span className={styles.thinkingPulse}>
            <span className={styles.pulseDot} />
            <span className={styles.pulseDot} />
            <span className={styles.pulseDot} />
          </span>
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            className={styles.thinkingContent}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className={styles.thinkingText}>
              {content || '...'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ---- Tool Use Block Component ---- //
function ToolUseBlock({ name, input, isStreaming }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.toolBlock}>
      <button
        className={`${styles.toolToggle} ${expanded ? styles.toolExpanded : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <FiTool size={11} className={styles.toolIcon} />
        <span className={styles.toolName}>{name || 'Tool call'}</span>
        {isStreaming && (
          <span className={styles.toolRunning}>running...</span>
        )}
        <FiChevronRight size={12} className={styles.toolChevron} />
      </button>
      <AnimatePresence>
        {expanded && input && (
          <motion.div
            className={styles.toolContent}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <pre className={styles.toolInput}>
              {typeof input === 'string' ? input : JSON.stringify(input, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ---- Main ChatPanel Component ---- //
export default function ChatPanel({ width, onWidthChange, onOpenSettings }) {
  const [isResizing, setIsResizing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamId, setCurrentStreamId] = useState(null);
  const [hasProvider, setHasProvider] = useState(null);
  const [modelLabel, setModelLabel] = useState('Claude');
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const cleanupRef = useRef([]);

  // Content block tracking for streaming
  const blocksRef = useRef([]);           // array of { type, content, name, input }
  const activeBlockIdxRef = useRef(-1);   // index of currently-streaming block

  // Check if a provider is connected
  useEffect(() => {
    async function checkProvider() {
      try {
        const [tokenResult, modelResult] = await Promise.all([
          window.foundry?.claudeGetToken(),
          window.foundry?.claudeGetModel(),
        ]);
        setHasProvider(!!tokenResult?.token);
        if (modelResult) {
          const labels = { 'sonnet': 'Sonnet', 'opus': 'Opus', 'haiku': 'Haiku' };
          setModelLabel(labels[modelResult] || modelResult);
        }
      } catch {
        setHasProvider(false);
      }
    }
    checkProvider();
    const handleFocus = () => checkProvider();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Helper: update the last assistant message's blocks
  const updateAssistantBlocks = useCallback((blocks) => {
    setMessages(prev => {
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
        updated[lastIdx] = { ...updated[lastIdx], blocks: [...blocks] };
      }
      return updated;
    });
  }, []);

  // Set up stream listeners
  useEffect(() => {
    const cleanupStream = window.foundry?.onClaudeStream((streamId, data) => {
      const { type } = data;

      // --- content_block_start: a new block begins ---
      if (type === 'content_block_start') {
        const cb = data.content_block || {};
        const block = {
          type: cb.type || 'text',       // 'text', 'thinking', 'tool_use'
          content: cb.text || cb.thinking || '',
          name: cb.name || '',
          id: cb.id || '',
          input: cb.input || null,
          streaming: true,
        };
        blocksRef.current = [...blocksRef.current, block];
        activeBlockIdxRef.current = blocksRef.current.length - 1;
        updateAssistantBlocks(blocksRef.current);
      }

      // --- content_block_delta: append to the active block ---
      if (type === 'content_block_delta') {
        const idx = activeBlockIdxRef.current;
        if (idx < 0 || idx >= blocksRef.current.length) {
          // No active block — create a fallback text block
          const delta = data.delta;
          if (delta?.type === 'text_delta' && delta.text) {
            const block = { type: 'text', content: delta.text, streaming: true };
            blocksRef.current = [...blocksRef.current, block];
            activeBlockIdxRef.current = blocksRef.current.length - 1;
            updateAssistantBlocks(blocksRef.current);
          }
          return;
        }

        const delta = data.delta;
        const blocks = [...blocksRef.current];
        const current = { ...blocks[idx] };

        if (delta?.type === 'text_delta' && delta.text) {
          current.content = (current.content || '') + delta.text;
        } else if (delta?.type === 'thinking_delta' && delta.thinking) {
          current.content = (current.content || '') + delta.thinking;
        } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
          current.input = (current.input || '') + delta.partial_json;
        }

        blocks[idx] = current;
        blocksRef.current = blocks;
        updateAssistantBlocks(blocks);
      }

      // --- content_block_stop: mark block as done ---
      if (type === 'content_block_stop') {
        const idx = data.index != null ? data.index : activeBlockIdxRef.current;
        if (idx >= 0 && idx < blocksRef.current.length) {
          const blocks = [...blocksRef.current];
          blocks[idx] = { ...blocks[idx], streaming: false };

          // Try to parse tool input JSON
          if (blocks[idx].type === 'tool_use' && typeof blocks[idx].input === 'string') {
            try {
              blocks[idx].input = JSON.parse(blocks[idx].input);
            } catch { /* leave as string */ }
          }

          blocksRef.current = blocks;
          updateAssistantBlocks(blocks);
        }
        activeBlockIdxRef.current = -1;
      }
    });

    const cleanupEnd = window.foundry?.onClaudeStreamEnd((streamId) => {
      setIsStreaming(false);
      setCurrentStreamId(null);
      // Finalize all blocks
      const blocks = blocksRef.current.map(b => ({ ...b, streaming: false }));
      blocksRef.current = blocks;
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          updated[lastIdx] = {
            ...updated[lastIdx],
            blocks,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
        }
        return updated;
      });
    });

    const cleanupError = window.foundry?.onClaudeStreamError((streamId, error) => {
      setIsStreaming(false);
      setCurrentStreamId(null);
      setError(error);
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          const hasContent = updated[lastIdx].blocks?.some(b => b.content);
          if (!hasContent) {
            updated.pop();
          }
        }
        return updated;
      });
    });

    cleanupRef.current = [cleanupStream, cleanupEnd, cleanupError];
    return () => {
      cleanupRef.current.forEach(fn => fn?.());
    };
  }, [updateAssistantBlocks]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    setError(null);

    const userMsg = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // Build message history for API
    const apiMessages = [...messages, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role,
        content: m.role === 'assistant'
          ? (m.blocks?.filter(b => b.type === 'text').map(b => b.content).join('\n') || m.content || '')
          : m.content,
      }));

    const assistantPlaceholder = {
      role: 'assistant',
      blocks: [],
      content: '',
      timestamp: '',
    };

    setMessages(prev => [...prev, userMsg, assistantPlaceholder]);
    setInput('');
    setIsStreaming(true);

    // Reset block tracking
    blocksRef.current = [];
    activeBlockIdxRef.current = -1;

    const streamId = `stream-${++streamIdCounter}-${Date.now()}`;
    setCurrentStreamId(streamId);

    let model;
    try { model = await window.foundry?.claudeGetModel(); } catch { /* default */ }

    const result = await window.foundry?.claudeChat({
      messages: apiMessages,
      model: model || 'sonnet',
      streamId,
    });

    if (result?.error) {
      setIsStreaming(false);
      setCurrentStreamId(null);
      setError(result.error);
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant' && !updated[lastIdx].blocks?.length) {
          updated.pop();
        }
        return updated;
      });
    }
  };

  const handleStop = async () => {
    if (currentStreamId) {
      await window.foundry?.claudeStopStream(currentStreamId);
      setIsStreaming(false);
      setCurrentStreamId(null);
      const blocks = blocksRef.current.map(b => ({ ...b, streaming: false }));
      blocksRef.current = blocks;
      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          const hasContent = updated[lastIdx].blocks?.some(b => b.content);
          if (!hasContent) {
            updated.pop();
          } else {
            updated[lastIdx] = {
              ...updated[lastIdx],
              blocks,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
          }
        }
        return updated;
      });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = width;
    const handleMouseMove = (e) => {
      const newWidth = Math.max(280, Math.min(600, startWidth - (e.clientX - startX)));
      onWidthChange(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width, onWidthChange]);

  // Render a single message's content blocks
  const renderMessageContent = (msg, msgIndex) => {
    const blocks = msg.blocks;
    const isLastMsg = msgIndex === messages.length - 1;

    // Legacy: if no blocks, fall back to plain text
    if (!blocks || blocks.length === 0) {
      if (msg.content) {
        return <div className={styles.messageContent}>{renderMarkdown(msg.content)}</div>;
      }
      if (isStreaming && isLastMsg && msg.role === 'assistant') {
        return (
          <div className={styles.messageContent}>
            <div className={styles.typing}>
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
            </div>
          </div>
        );
      }
      return null;
    }

    return (
      <div className={styles.messageContent}>
        {blocks.map((block, bi) => {
          if (block.type === 'thinking') {
            return (
              <ThinkingBlock
                key={bi}
                content={block.content}
                isStreaming={block.streaming}
              />
            );
          }
          if (block.type === 'tool_use') {
            return (
              <ToolUseBlock
                key={bi}
                name={block.name}
                input={block.input}
                isStreaming={block.streaming}
              />
            );
          }
          // text block
          return (
            <div key={bi} className={styles.textBlock}>
              {renderMarkdown(block.content)}
              {block.streaming && (
                <span className={styles.streamCursor} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderEmptyState = () => {
    if (hasProvider === null) return null;
    if (hasProvider === false) {
      return (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><FiCpu size={24} /></div>
          <h4 className={styles.emptyTitle}>Connect a Provider</h4>
          <p className={styles.emptyDesc}>
            Add your Claude API key or connect your Claude Code subscription to start chatting.
          </p>
          {onOpenSettings && (
            <button className={styles.emptyBtn} onClick={() => onOpenSettings('providers')}>
              <FiSettings size={13} />
              Open Providers Settings
            </button>
          )}
        </div>
      );
    }
    if (messages.length === 0) {
      return (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><FiMessageSquare size={24} /></div>
          <h4 className={styles.emptyTitle}>Start a Conversation</h4>
          <p className={styles.emptyDesc}>
            Ask anything about your code. Claude will help you build, debug, and understand your project.
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div
      className={styles.panel}
      style={{ width: isResizing ? width : undefined }}
      initial={{ width: 0, opacity: 0 }}
      animate={{ width, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={isResizing ? { duration: 0 } : { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />
      <div className={styles.header}>
        <FiMessageSquare size={14} />
        <span className={styles.headerTitle}>Chat</span>
        <div className={styles.modelBadge}>
          <FiCpu size={11} />
          <span>{modelLabel}</span>
        </div>
      </div>

      <div className={styles.messages}>
        {renderEmptyState()}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : styles.messageAssistant}`}
          >
            <div className={styles.messageHeader}>
              <div className={`${styles.messageAvatar} ${msg.role === 'user' ? styles.avatarUser : styles.avatarAi}`}>
                {msg.role === 'user' ? <FiUser size={12} /> : <FiCpu size={12} />}
              </div>
              <span className={styles.messageRole}>
                {msg.role === 'user' ? 'You' : 'Claude'}
              </span>
              {msg.timestamp && (
                <span className={styles.messageTime}>{msg.timestamp}</span>
              )}
            </div>
            {msg.role === 'user' ? (
              <div className={styles.messageContent}>{msg.content}</div>
            ) : (
              renderMessageContent(msg, i)
            )}
          </div>
        ))}
        {error && (
          <div className={styles.errorBanner}>
            <FiAlertCircle size={13} />
            <span>{error}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={inputRef}
            className={styles.input}
            placeholder={hasProvider === false ? 'Connect a provider to start...' : 'Ask Claude...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={hasProvider === false}
          />
          {isStreaming ? (
            <button className={styles.stopBtn} onClick={handleStop} title="Stop generating">
              <FiSquare size={12} />
            </button>
          ) : (
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={!input.trim() || hasProvider === false}
            >
              <FiSend size={14} />
            </button>
          )}
        </div>
        <div className={styles.inputHint}>
          <kbd className={styles.kbd}>Enter</kbd>
          <span>to send</span>
          <kbd className={styles.kbd}>Shift+Enter</kbd>
          <span>new line</span>
        </div>
      </div>
    </motion.div>
  );
}
