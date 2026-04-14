import React, { useState, useRef, useEffect } from 'react';
import { FiFolder, FiGitBranch, FiRefreshCw } from 'react-icons/fi';
import { motion } from 'framer-motion';
import WorkspacePanel from './WorkspacePanel';
import BranchPanel from './BranchPanel';
import { useToast } from '../ToastProvider';
import styles from '../ProjectControls.module.css';

export default function ProjectControls({
  currentProject,
  onSwitchWorkspace,
  onOpenFolder,
  gitStatus,
  projectPath,
  onRefresh,
}) {
  const addToast = useToast();
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
      setWsDropdownPos({ top: rect.bottom + 8, left: rect.left });
    }
    setWsOpen(v => !v);
  };

  const openBranchDropdown = () => {
    if (wsOpen) setWsOpen(false);
    if (!branchOpen && pillRef.current) {
      const pillRect = pillRef.current.getBoundingClientRect();
      setBranchDropdownPos({ top: pillRect.bottom + 8, left: pillRect.left });
    }
    setBranchOpen(v => !v);
  };

  const handleSync = async (e) => {
    e.stopPropagation();
    if (syncing) return;
    setSyncing(true);
    const minSpin = new Promise(r => setTimeout(r, 600));
    try {
      const syncWork = (async () => {
        const pullResult = await window.foundry?.gitPull(projectPath);
        const pushResult = await window.foundry?.gitPush(projectPath);
        onRefresh?.();
        return { pullResult, pushResult };
      })();

      const [{ pullResult, pushResult }] = await Promise.all([syncWork, minSpin]);

      if (pullResult?.error && !(/no remote|no such remote|no tracking|does not have|no upstream/i.test(pullResult.error))) {
        addToast({ message: `Pull failed: ${pullResult.error.split('\n')[0]}`, type: 'error' });
      } else if (pushResult?.error) {
        addToast({ message: `Push failed: ${pushResult.error.split('\n')[0]}`, type: 'error' });
      } else {
        const output = pullResult?.output || '';
        if (output.includes('Already up to date')) {
          addToast({ message: 'Synced — already up to date', type: 'success' });
        } else {
          const statsMatch = output.match(/(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/);
          if (statsMatch) {
            let msg = `Synced — pulled ${statsMatch[1]} file${statsMatch[1] !== '1' ? 's' : ''} changed`;
            const parts = [];
            if (statsMatch[2]) parts.push(`+${statsMatch[2]}`);
            if (statsMatch[3]) parts.push(`-${statsMatch[3]}`);
            if (parts.length) msg += ` (${parts.join(', ')})`;
            addToast({ message: msg, type: 'success' });
          } else {
            addToast({ message: 'Synced successfully', type: 'success' });
          }
        }
      }
    } catch (err) {
      console.error('Sync failed:', err);
      await minSpin;
      addToast({ message: `Sync failed: ${err.message || 'Unknown error'}`, type: 'error' });
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
        >
          <span className={styles.segmentIcon}><FiFolder size={12} /></span>
          <span className={styles.segmentName}>{displayName}</span>
        </button>

        {/* Branch + Sync segment (only when in a git repo) */}
        {isRepo && (
          <>
            <div className={styles.segmentDivider} />
            <button
              ref={branchRef}
              className={`${styles.segment} ${branchOpen ? styles.segmentOpen : ''}`}
              onClick={openBranchDropdown}
            >
              <span className={styles.segmentIcon}><FiGitBranch size={12} /></span>
              <span className={styles.segmentName}>{gitStatus.branch || 'HEAD'}</span>
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
              <motion.span
                animate={syncing ? { rotate: 360 } : { rotate: 0 }}
                transition={syncing ? { duration: 0.8, repeat: Infinity, ease: 'linear' } : { duration: 0 }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', willChange: 'transform' }}
              >
                <FiRefreshCw size={11} />
              </motion.span>
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
