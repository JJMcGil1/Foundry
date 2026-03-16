import React, { useState, useMemo } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { LuChevronsUpDown, LuFileCode } from 'react-icons/lu';
import styles from './EditToolBlock.module.css';
import sharedStyles from './shared.module.css';

export default function EditToolBlock({ input, isStreaming }) {
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
  const oldLines = oldStr ? oldStr.split('\n') : [];
  const newLines = newStr ? newStr.split('\n') : [];
  const totalLines = oldLines.length + newLines.length;
  const needsCollapse = totalLines > 4;

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
          {oldLines.map((line, i) => (
            <div key={`old-${i}`} className={styles.diffLineRemoved}>
              <span className={styles.diffLineNum}>{i + 1}</span>
              <span className={styles.diffLinePrefix}>−</span>
              <span className={styles.diffLineText}>{line}</span>
            </div>
          ))}
          {newLines.map((line, i) => (
            <div key={`new-${i}`} className={styles.diffLineAdded}>
              <span className={styles.diffLineNum}>{oldLines.length + i + 1}</span>
              <span className={styles.diffLinePrefix}>+</span>
              <span className={styles.diffLineText}>{line}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
