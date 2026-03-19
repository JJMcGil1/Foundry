import React, { useState, useMemo } from 'react';
import { LuChevronsUpDown, LuFilePlus } from 'react-icons/lu';
import styles from './WriteToolBlock.module.css';
import sharedStyles from './shared.module.css';

export default function WriteToolBlock({ input, isStreaming }) {
  const [expanded, setExpanded] = useState(false);
  const data = useMemo(() => {
    if (!input) return {};
    const d = typeof input === 'string' ? (() => { try { return JSON.parse(input); } catch { return null; } })() : input;
    return d || {};
  }, [input]);

  const filePath = data.file_path || '';
  const fileName = filePath ? filePath.split('/').pop() : 'unknown';
  const content = data.content || '';
  const lines = content ? content.split('\n') : [];
  const needsCollapse = lines.length > 4;

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
          {lines.map((line, i) => (
            <div key={i} className={styles.writeLine}>
              <span className={styles.writeLineNum}>{i + 1}</span>
              <span className={styles.writeLineText}>{line}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
