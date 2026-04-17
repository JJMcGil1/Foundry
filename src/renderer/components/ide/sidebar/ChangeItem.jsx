import React from 'react';
import { FiPlus, FiMinus, FiRotateCcw } from 'react-icons/fi';
import FileIcon from '../FileIcon';
import styles from '../Sidebar.module.css';

export default function ChangeItem({ f, onOpen, onStage, onUnstage, onDiscard, staged, statusColor, isActive, conflict }) {
  const fileName = f.path.split('/').pop();
  const dirPath = f.path.split('/').slice(0, -1).join('/');
  return (
    <div
      className={`${styles.changeItem} ${isActive ? styles.changeItemActive : ''}`}
      onClick={() => onOpen(f.path)}
    >
      <FileIcon name={fileName} type="file" size={14} />
      <span className={styles.changeFileName}>{fileName}</span>
      {dirPath && <span className={styles.changeDirPath}>{dirPath}</span>}
      {!conflict && (
        <div className={styles.changeActions}>
          {staged ? (
            <button className={styles.changeActionBtn} onClick={(e) => { e.stopPropagation(); onUnstage(f.path); }} title="Unstage">
              <FiMinus size={13} />
            </button>
          ) : (
            <>
              <button className={styles.changeActionBtn} onClick={(e) => { e.stopPropagation(); onDiscard(f.path); }} title="Discard Changes">
                <FiRotateCcw size={13} />
              </button>
              <button className={styles.changeActionBtn} onClick={(e) => { e.stopPropagation(); onStage(f.path); }} title="Stage">
                <FiPlus size={13} />
              </button>
            </>
          )}
        </div>
      )}
      <span className={styles.changeLabel} style={{ color: conflict ? '#E06C75' : statusColor(f.status) }}>
        {conflict ? 'C' : f.status}
      </span>
    </div>
  );
}
