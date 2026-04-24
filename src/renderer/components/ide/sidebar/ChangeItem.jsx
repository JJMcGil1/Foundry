import React, { memo } from 'react';
import { FiPlus, FiMinus, FiRotateCcw } from 'react-icons/fi';
import FileIcon from '../FileIcon';
import styles from '../Sidebar.module.css';

function ChangeItem({ f, onOpen, onStage, onUnstage, onDiscard, staged, statusColor, isActive, conflict }) {
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

// GitStatus is refetched on every file save — each refetch produces new `f`
// object references even when the underlying file hasn't changed. A plain
// React.memo with shallow compare would miss-hit on every gitStatus update.
// Comparing by path + status (the only fields that affect render) keeps
// stable rows free when surrounding files change.
function areEqual(prev, next) {
  if (prev.isActive !== next.isActive) return false;
  if (prev.staged !== next.staged) return false;
  if (prev.conflict !== next.conflict) return false;
  if (prev.statusColor !== next.statusColor) return false;
  if (prev.onOpen !== next.onOpen) return false;
  if (prev.onStage !== next.onStage) return false;
  if (prev.onUnstage !== next.onUnstage) return false;
  if (prev.onDiscard !== next.onDiscard) return false;
  if (prev.f.path !== next.f.path) return false;
  if (prev.f.status !== next.f.status) return false;
  return true;
}

export default memo(ChangeItem, areEqual);
