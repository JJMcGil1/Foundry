import React, { useState, useRef, useCallback, useEffect } from 'react';
import { FiFolderPlus, FiFilePlus } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import MiniTooltipBtn from './MiniTooltipBtn';
import FileTreeItem from './FileTree';
import GitPanel from './GitPanel';
import WorkflowsPanel from './WorkflowsPanel';
import styles from '../Sidebar.module.css';

const TREE_STATE_KEY = 'file_tree_expanded_paths';
let persistTimer = null;

export default function Sidebar({
  panel, width, project, fileTree, gitStatus,
  onOpenFile, onOpenFolder, onRefresh, projectPath,
  onWidthChange, activeFile
}) {
  const [isResizing, setIsResizing] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState(new Set());
  const [treeStateLoaded, setTreeStateLoaded] = useState(false);
  const sidebarRef = useRef(null);

  // Restore expanded paths from DB on mount / project change
  useEffect(() => {
    if (!projectPath) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await window.foundry?.getSetting(TREE_STATE_KEY + ':' + projectPath);
        if (!cancelled && raw) {
          const paths = JSON.parse(raw);
          if (Array.isArray(paths)) {
            setExpandedPaths(new Set(paths));
            setTreeStateLoaded(true);
            return;
          }
        }
      } catch { /* ignore parse errors */ }
      if (!cancelled) setTreeStateLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [projectPath]);

  // Persist expanded paths to DB (debounced)
  const persistExpandedPaths = useCallback((paths) => {
    if (!projectPath) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      window.foundry?.setSetting(
        TREE_STATE_KEY + ':' + projectPath,
        JSON.stringify([...paths])
      );
    }, 300);
  }, [projectPath]);

  const handleToggleExpand = useCallback((path) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      persistExpandedPaths(next);
      return next;
    });
  }, [persistExpandedPaths]);

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
        {panel === 'files' && (
          <div className={styles.explorerHeader}>
            <span className={styles.gitPanelTitle}>Explorer</span>
            <div className={styles.headerActions}>
              <MiniTooltipBtn icon={FiFilePlus} label="New File" onClick={() => window.foundry?.createFile?.(projectPath)} />
              <MiniTooltipBtn icon={FiFolderPlus} label="New Folder" onClick={() => window.foundry?.createFolder?.(projectPath)} />
            </div>
          </div>
        )}

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
                      <FileTreeItem
                        key={item.path}
                        item={item}
                        onOpenFile={onOpenFile}
                        activeFile={activeFile}
                        expandedPaths={expandedPaths}
                        onToggleExpand={handleToggleExpand}
                      />
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

            {panel === 'git' && <GitPanel gitStatus={gitStatus} projectPath={projectPath} onOpenFile={onOpenFile} onRefreshGit={onRefresh} activeFile={activeFile} />}

            {panel === 'workflows' && <WorkflowsPanel projectPath={projectPath} />}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />
    </motion.div>
  );
}
