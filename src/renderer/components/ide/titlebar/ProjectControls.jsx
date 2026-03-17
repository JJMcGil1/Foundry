import React, { useState, useRef, useEffect } from 'react';
import { FiFolder, FiChevronDown, FiGitBranch, FiRefreshCw } from 'react-icons/fi';
import { motion } from 'framer-motion';
import WorkspacePanel from './WorkspacePanel';
import BranchPanel from './BranchPanel';
import styles from '../ProjectControls.module.css';

export default function ProjectControls({
  currentProject,
  onSwitchWorkspace,
  onOpenFolder,
  gitStatus,
  projectPath,
  onRefresh,
}) {
  const [wsOpen, setWsOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncHovered, setSyncHovered] = useState(false);
  const [wsDropdownPos, setWsDropdownPos] = useState({ top: 0, left: 0 });
  const [branchDropdownPos, setBranchDropdownPos] = useState({ top: 0, left: 0 });
  const pillRef = useRef(null);
  const wsRef = useRef(null);
  const branchRef = useRef(null);

  // Escape closes any open panel
  useEffect(() => {
    if (!wsOpen && !branchOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') { setWsOpen(false); setBranchOpen(false); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [wsOpen, branchOpen]);

  const openWorkspaceDropdown = () => {
    if (branchOpen) setBranchOpen(false);
    if (!wsOpen && wsRef.current) {
      const rect = wsRef.current.getBoundingClientRect();
      setWsDropdownPos({ top: rect.bottom + 6, left: rect.left });
    }
    setWsOpen(v => !v);
  };

  const openBranchDropdown = () => {
    if (wsOpen) setWsOpen(false);
    if (!branchOpen && pillRef.current) {
      const pillRect = pillRef.current.getBoundingClientRect();
      setBranchDropdownPos({ top: pillRect.bottom + 6, left: Math.max(8, pillRect.right - 320) });
    }
    setBranchOpen(v => !v);
  };

  const handleSync = async (e) => {
    e.stopPropagation();
    if (syncing) return;
    setSyncing(true);
    try {
      await window.foundry?.gitPull(projectPath);
      await window.foundry?.gitPush(projectPath);
      onRefresh?.();
    } catch (err) {
      console.error('Sync failed:', err);
    }
    setSyncing(false);
  };

  const isRepo = gitStatus?.isRepo;
  const behind = gitStatus?.behind || 0;
  const ahead = gitStatus?.ahead || 0;
  const totalUpdates = behind + ahead;
  const displayName = currentProject?.name || 'No workspace';

  return (
    <>
      <div ref={pillRef} className={styles.pill}>
        {/* Workspace segment */}
        <button
          ref={wsRef}
          className={`${styles.segment} ${wsOpen ? styles.segmentOpen : ''}`}
          onClick={openWorkspaceDropdown}
          style={{ borderRadius: !isRepo ? '7px' : '7px 0 0 7px' }}
        >
          <span className={styles.segmentIcon}><FiFolder size={13} /></span>
          <span className={styles.segmentName}>{displayName}</span>
          <motion.span
            className={styles.segmentChevron}
            animate={{ rotate: wsOpen ? 180 : 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <FiChevronDown size={11} />
          </motion.span>
        </button>

        {/* Branch + Sync segment (only when in a git repo) */}
        {isRepo && (
          <>
            <div className={styles.segmentDivider} />
            <button
              ref={branchRef}
              className={`${styles.segment} ${branchOpen ? styles.segmentOpen : ''}`}
              onClick={openBranchDropdown}
              style={{ paddingRight: '6px' }}
            >
              <span className={styles.segmentIcon}><FiGitBranch size={12} /></span>
              <span className={styles.segmentName}>{gitStatus.branch || 'HEAD'}</span>
              <motion.span
                className={styles.segmentChevron}
                animate={{ rotate: branchOpen ? 180 : 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                <FiChevronDown size={11} />
              </motion.span>
            </button>
            <button
              className={`${styles.syncIcon} ${syncing ? styles.syncIconActive : ''}`}
              onClick={handleSync}
              disabled={syncing}
              onMouseEnter={() => setSyncHovered(true)}
              onMouseLeave={() => setSyncHovered(false)}
              title={syncing ? 'Syncing...' : totalUpdates > 0
                ? `Sync — ${behind > 0 ? `${behind}\u2193 behind` : ''}${behind > 0 && ahead > 0 ? ' \u00B7 ' : ''}${ahead > 0 ? `${ahead}\u2191 ahead` : ''}`
                : 'Sync'}
            >
              <FiRefreshCw size={12} className={syncing ? styles.syncSpinning : ''} />
              {totalUpdates > 0 && !syncing && (
                <span className={styles.syncDot} />
              )}
              {syncHovered && !syncing && totalUpdates > 0 && (
                <div className={styles.tooltip}>
                  <span className={styles.tooltipText}>
                    {behind > 0 ? `${behind}\u2193 behind` : ''}{behind > 0 && ahead > 0 ? ' \u00B7 ' : ''}{ahead > 0 ? `${ahead}\u2191 ahead` : ''}
                  </span>
                </div>
              )}
            </button>
          </>
        )}
      </div>

      <WorkspacePanel
        isOpen={wsOpen}
        onClose={() => setWsOpen(false)}
        dropdownPos={wsDropdownPos}
        currentProject={currentProject}
        onSwitchWorkspace={onSwitchWorkspace}
        onOpenFolder={onOpenFolder}
      />

      <BranchPanel
        isOpen={branchOpen}
        onClose={() => setBranchOpen(false)}
        dropdownPos={branchDropdownPos}
        projectPath={projectPath}
        currentBranch={gitStatus?.branch}
        onBranchChanged={onRefresh}
      />
    </>
  );
}
