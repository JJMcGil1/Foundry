import React, { memo, useState, useMemo } from 'react';
import { LuChevronsUpDown, LuFilePlus } from 'react-icons/lu';
import styles from './WriteToolBlock.module.css';
import sharedStyles from './shared.module.css';

const COLLAPSED_LINE_PREVIEW = 6;

function WriteToolBlock({ input, isStreaming }) {
  const [expanded, setExpanded] = useState(false);
  const data = useMemo(() => {
    if (!input) return {};
    const d = typeof input === 'string' ? (() => { try { return JSON.parse(input); } catch { return null; } })() : input;
    return d || {};
  }, [input]);

  const filePath = data.file_path || '';
  const fileName = filePath ? filePath.split('/').pop() : 'unknown';
  const content = data.content || '';
  // Memoize the split — written files can be hundreds of lines, and the
  // parent re-renders on every streaming flush even when this block hasn't
  // changed.
  const lines = useMemo(() => (content ? content.split('\n') : []), [content]);
  const needsCollapse = lines.length > 4;

  // Collapsed renders only the preview slice, so an unexpanded 1000-line
  // Write costs ~6 DOM nodes instead of 1000.
  const showCollapsed = !expanded && needsCollapse && !isStreaming;
  const visibleLines = showCollapsed ? lines.slice(0, COLLAPSED_LINE_PREVIEW) : lines;
  const hiddenCount = lines.length - visibleLines.length;

  return (
    <div className={styles.writeBlock}>
      <div className={styles.writeHeader}>
        <LuFilePlus size={16} className={styles.writeFileIcon} />
        <span className={styles.writeFileName}>{fileName}</span>
        {!isStreaming && lines.length > 0 && (
          <div className={styles.writeBadges}>
            <span className={styles.writeBadgeAdd}>+{lines.length}</span>
          </div>
        )}
        {isStreaming && (
          <span className={sharedStyles.pulseDots}>
            <span className={sharedStyles.pulseDot} />
            <span className={sharedStyles.pulseDot} />
            <span className={sharedStyles.pulseDot} />
          </span>
        )}
        <button
          className={styles.writeCollapseBtn}
          onClick={() => setExpanded(e => !e)}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          <LuChevronsUpDown size={14} />
        </button>
      </div>
      {lines.length > 0 && (
        <div className={`${styles.writeBody} ${!expanded && needsCollapse ? styles.writeBodyCollapsed : ''}`}>
          {visibleLines.map((line, i) => (
            <div key={i} className={styles.writeLine}>
              <span className={styles.writeLineNum}>{i + 1}</span>
              <span className={styles.writeLineText}>{line}</span>
            </div>
          ))}
          {showCollapsed && hiddenCount > 0 && (
            <div className={styles.writeMoreHint}>… {hiddenCount} more lines</div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(WriteToolBlock);
