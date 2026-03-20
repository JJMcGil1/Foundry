import React, { memo, useState } from 'react';
import { FiCpu, FiCopy, FiCheck } from 'react-icons/fi';
import { renderMarkdown } from './Markdown';
import ThinkingBlock from './ThinkingBlock';
import ToolUseBlock from './ToolUseBlock';
import styles from './AgentMessage.module.css';

function getMessageText(msg) {
  if (!msg.blocks || msg.blocks.length === 0) return msg.content || '';
  return msg.blocks
    .filter(b => b.type === 'text')
    .map(b => b.content)
    .join('\n\n');
}

function AgentMessage({ msg, isStreaming, isLastMsg }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(getMessageText(msg));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.message}>
      <div className={styles.header}>
        <div className={styles.avatar}>
          <FiCpu size={12} />
        </div>
        <span className={styles.role}>Sage</span>
        <button className={styles.copyBtn} onClick={handleCopy} title="Copy message">
          {copied ? <FiCheck size={12} /> : <FiCopy size={12} />}
        </button>
        {msg.timestamp && (
          <span className={styles.time}>{msg.timestamp}</span>
        )}
      </div>
      <AgentContent msg={msg} isStreaming={isStreaming} isLastMsg={isLastMsg} />
    </div>
  );
}

function AgentContent({ msg, isStreaming, isLastMsg }) {
  const blocks = msg.blocks;

  // Legacy: if no blocks, fall back to plain text
  if (!blocks || blocks.length === 0) {
    if (msg.content) {
      return <div className={styles.content}>{renderMarkdown(msg.content)}</div>;
    }
    if (isStreaming && isLastMsg) {
      return (
        <div className={styles.content}>
          <div className={styles.shimmer}>
            <div className={styles.shimmerLine} />
            <div className={styles.shimmerLineShort} />
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className={styles.content}>
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
        // text block — no cursor, just render text naturally
        return (
          <div key={bi} className={styles.textBlock}>
            {renderMarkdown(block.content)}
          </div>
        );
      })}
    </div>
  );
}

export default memo(AgentMessage);
