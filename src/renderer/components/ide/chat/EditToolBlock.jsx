import React, { memo, useState, useMemo } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { LuChevronsUpDown, LuFileCode } from 'react-icons/lu';
import styles from './EditToolBlock.module.css';
import sharedStyles from './shared.module.css';

// When collapsed, render at most this many lines. Anything beyond was hidden
// by CSS overflow before — this keeps the DOM cost of each block bounded.
// Streaming Edits skip the cap so the user sees progress in real time.
const COLLAPSED_LINE_PREVIEW = 6;

function EditToolBlock({ input, isStreaming }) {
  const [expanded, setExpanded] = useState(false);
  const data = useMemo(() => {
    if (!input) return {};
    const d = typeof input === 'string' ? (() => { try { return JSON.parse(input); } catch { return null; } })() : input;
    return d || {};
  }, [input]);

  const filePath = data.file_path || '';
  const fileName = filePath ? filePath.split('/').pop() : 'unknown';
  const oldStr = data.old_string || '';
  const newStr = data.new_string || '';
  // Memoize line splitting so unchanged blocks don't re-split on every parent
  // re-render (the streaming flush re-renders AgentMessage on every flush
  // even though most blocks haven't changed).
  const oldLines = useMemo(() => (oldStr ? oldStr.split('\n') : []), [oldStr]);
  const newLines = useMemo(() => (newStr ? newStr.split('\n') : []), [newStr]);
  const totalLines = oldLines.length + newLines.length;
  const needsCollapse = totalLines > 4;

  // When collapsed and not streaming, only render the preview slice. This
  // keeps the DOM cost of an unexpanded 500-line edit at ~6 nodes instead
  // of 500.
  const showCollapsed = !expanded && needsCollapse && !isStreaming;
  const visibleOld = showCollapsed ? oldLines.slice(0, COLLAPSED_LINE_PREVIEW) : oldLines;
  const visibleNew = showCollapsed
    ? newLines.slice(0, Math.max(0, COLLAPSED_LINE_PREVIEW - visibleOld.length))
    : newLines;

  return (
    <div className={styles.diffBlock}>
      <div className={styles.diffHeader}>
        <LuFileCode size={16} className={styles.diffFileIcon} />
        <span className={styles.diffFileName}>{fileName}</span>
        {!isStreaming && oldStr && newStr && (
          <div className={styles.diffBadges}>
            {newLines.length > 0 && (
              <span className={styles.diffBadgeAdd}>+{newLines.length}</span>
            )}
            {oldLines.length > 0 && (
              <span className={styles.diffBadgeRemove}>-{oldLines.length}</span>
            )}
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
          className={styles.diffCollapseBtn}
          onClick={() => setExpanded(e => !e)}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          <LuChevronsUpDown size={14} />
        </button>
      </div>
      {(oldStr || newStr) && (
        <div className={`${styles.diffBody} ${!expanded && needsCollapse ? styles.diffBodyCollapsed : ''}`}>
          {visibleOld.map((line, i) => (
            <div key={`old-${i}`} className={styles.diffLineRemoved}>
              <span className={styles.diffLineNum}>{i + 1}</span>
              <span className={styles.diffLinePrefix}>−</span>
              <span className={styles.diffLineText}>{line}</span>
            </div>
          ))}
          {visibleNew.map((line, i) => (
            <div key={`new-${i}`} className={styles.diffLineAdded}>
              <span className={styles.diffLineNum}>{oldLines.length + i + 1}</span>
              <span className={styles.diffLinePrefix}>+</span>
              <span className={styles.diffLineText}>{line}</span>
            </div>
          ))}
          {showCollapsed && totalLines > visibleOld.length + visibleNew.length && (
            <div className={styles.diffMoreHint}>
              … {totalLines - (visibleOld.length + visibleNew.length)} more lines
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(EditToolBlock);
