import React, { useState, useRef, useCallback } from 'react';
import {
  FiFolderPlus, FiRefreshCw, FiChevronRight,
  FiGitBranch, FiCheck, FiUpload, FiDownload, FiX,
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import FileIcon from './FileIcon';
import styles from './Sidebar.module.css';

/* ── File Tree ── */
function FileTreeItem({ item, depth = 0, onOpenFile, activeFile, parentDimmed = false }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const dimmed = parentDimmed || item.ignored;

  if (item.type === 'directory') {
    return (
      <div>
        <button
          className={`${styles.treeItem} ${dimmed ? styles.treeItemDimmed : ''}`}
          style={{ paddingLeft: 12 + depth * 8 }}
          onClick={() => setExpanded(!expanded)}
        >
          <motion.span
            className={styles.chevron}
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
          >
            <FiChevronRight size={15} />
          </motion.span>
          <span className={styles.treeName}>{item.name}</span>
        </button>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              style={{ overflow: 'hidden' }}
            >
              {item.children?.map(child => (
                <FileTreeItem
                  key={child.path}
                  item={child}
                  depth={depth + 1}
                  onOpenFile={onOpenFile}
                  activeFile={activeFile}
                  parentDimmed={dimmed}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const isActive = activeFile === item.path;

  return (
    <button
      className={`${styles.treeItem} ${styles.treeFile} ${isActive ? styles.treeItemActive : ''} ${dimmed ? styles.treeItemDimmed : ''}`}
      style={{ paddingLeft: 12 + depth * 8 }}
      onClick={() => onOpenFile(item.path)}
    >
      <span className={styles.chevronSpacer} />
      <FileIcon name={item.name} type="file" size={16} />
      <span className={styles.treeName}>{item.name}</span>
    </button>
  );
}

/* ── Source Control Panel ── */
function GitPanel({ gitStatus, projectPath }) {
  const [commitMsg, setCommitMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCommit = async () => {
    if (!commitMsg.trim() || !projectPath) return;
    setLoading(true);
    try {
      for (const f of gitStatus.files) {
        await window.foundry?.gitStage(projectPath, f.path);
      }
      await window.foundry?.gitCommit(projectPath, commitMsg);
      setCommitMsg('');
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handlePush = async () => {
    if (!projectPath) return;
    setLoading(true);
    await window.foundry?.gitPush(projectPath);
    setLoading(false);
  };

  const handlePull = async () => {
    if (!projectPath) return;
    setLoading(true);
    await window.foundry?.gitPull(projectPath);
    setLoading(false);
  };

  const statusColor = (s) => {
    const map = { 'M': '#E5C07B', 'A': '#98C379', 'D': '#E06C75', '??': '#61AFEF', 'R': '#C678DD' };
    return map[s] || 'var(--zinc-400)';
  };

  if (!gitStatus.isRepo) {
    return (
      <div className={styles.panelScroll}>
        <div className={styles.emptyState}>
          <span className={styles.emptyText}>Not a Git repository</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panelScroll}>
      <div className={styles.gitBranch}>
        <FiGitBranch size={12} />
        <span className={styles.branchName}>{gitStatus.branch || 'HEAD'}</span>
        <button className={styles.miniBtn} onClick={handlePull} disabled={loading} title="Pull">
          <FiDownload size={12} />
        </button>
        <button className={styles.miniBtn} onClick={handlePush} disabled={loading} title="Push">
          <FiUpload size={12} />
        </button>
      </div>

      <div className={styles.commitArea}>
        <textarea
          className={styles.commitInput}
          placeholder="Commit message…"
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommit(); } }}
          rows={2}
        />
        <button className={styles.commitBtn} disabled={!commitMsg.trim() || loading} onClick={handleCommit}>
          <FiCheck size={12} />
          <span>Commit</span>
        </button>
      </div>

      <div className={styles.sectionLabel}>
        <span>Changes</span>
        {gitStatus.files.length > 0 && <span className={styles.badge}>{gitStatus.files.length}</span>}
      </div>
      <div className={styles.changesList}>
        {gitStatus.files.map((f, i) => (
          <div key={i} className={styles.changeItem}>
            <span className={styles.changeIndicator} style={{ background: statusColor(f.status) }} />
            <span className={styles.changePath}>{f.path}</span>
            <span className={styles.changeLabel} style={{ color: statusColor(f.status) }}>{f.status}</span>
          </div>
        ))}
        {gitStatus.files.length === 0 && (
          <div className={styles.emptyState} style={{ padding: '16px' }}>
            <span className={styles.emptyText}>Working tree clean</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sidebar ── */
export default function Sidebar({
  panel, width, project, fileTree, gitStatus,
  onOpenFile, onOpenFolder, onRefresh, projectPath,
  onWidthChange, activeFile
}) {
  const panelTitles = { files: 'Explorer', git: 'Source Control' };
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef(null);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    setIsResizing(true);

    const handleMouseMove = (e) => {
      const newWidth = Math.max(200, Math.min(480, startWidth + (e.clientX - startX)));
      onWidthChange(newWidth);
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setIsResizing(false);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width, onWidthChange]);

  return (
    <motion.div
      ref={sidebarRef}
      className={styles.sidebar}
      style={{ width }}
      initial={{ width: 0, opacity: 0 }}
      animate={{ width, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={isResizing ? { duration: 0 } : { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className={styles.inner}>
        <div className={styles.header}>
          <span className={styles.panelTitle}>{panelTitles[panel] || 'Explorer'}</span>
          {panel === 'files' && (
            <div className={styles.headerActions}>
              <button className={styles.miniBtn} onClick={onRefresh} title="Refresh">
                <FiRefreshCw size={12} />
              </button>
              <button className={styles.miniBtn} onClick={onOpenFolder} title="Open Folder">
                <FiFolderPlus size={12} />
              </button>
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={panel}
            className={styles.panelScroll}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            {panel === 'files' && (
              project ? (
                <>
                  <div className={styles.projectLabel}>{project.name}</div>
                  <div className={styles.treeContainer}>
                    {fileTree.map(item => (
                      <FileTreeItem key={item.path} item={item} onOpenFile={onOpenFile} activeFile={activeFile} />
                    ))}
                  </div>
                </>
              ) : (
                <div className={styles.emptyState}>
                  <span className={styles.emptyText}>No folder open</span>
                  <button className={styles.openFolderBtn} onClick={onOpenFolder}>
                    <FiFolderPlus size={14} />
                    <span>Open Folder</span>
                  </button>
                </div>
              )
            )}

            {panel === 'git' && <GitPanel gitStatus={gitStatus} projectPath={projectPath} />}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />
    </motion.div>
  );
}
