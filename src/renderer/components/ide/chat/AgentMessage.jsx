import React from 'react';
import { FiCpu } from 'react-icons/fi';
import { renderMarkdown } from './Markdown';
import ThinkingBlock from './ThinkingBlock';
import ToolUseBlock from './ToolUseBlock';
import styles from './AgentMessage.module.css';

export default function AgentMessage({ msg, isStreaming, isLastMsg }) {
  return (
    <div className={styles.message}>
      <div className={styles.header}>
        <div className={styles.avatar}>
          <FiCpu size={12} />
        </div>
        <span className={styles.role}>Sage</span>
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
}
