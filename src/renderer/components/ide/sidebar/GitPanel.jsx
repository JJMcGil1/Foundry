import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  FiRefreshCw, FiChevronRight,
  FiCheck, FiPlus, FiMinus, FiRotateCcw, FiUpload,
  FiArchive, FiDownload, FiTrash2,
} from 'react-icons/fi';
import { IoSparkles } from 'react-icons/io5';
import { motion, AnimatePresence } from 'framer-motion';
import ChangeItem from './ChangeItem';
import CommitGraph from './CommitGraph';
import { statusColor, COMMITS_PAGE_SIZE, CONFLICT_STATUS_CODES, conflictLabel } from './gitUtils';
import { useToast } from '../ToastProvider';
import ConfirmationModal from '../ConfirmationModal';
import styles from '../Sidebar.module.css';

const SYNC_STEPS = ['pull', 'stage', 'commit', 'push'];
const STEP_LABELS = { pull: 'Pulling…', stage: 'Staging…', commit: 'Committing…', push: 'Pushing…' };

// Parse git pull output to extract change summary
function parsePullOutput(output) {
  if (!output) return null;
  if (output.includes('Already up to date')) return { upToDate: true };
  // Match patterns like "3 files changed, 10 insertions(+), 2 deletions(-)"
  const statsMatch = output.match(/(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/);
  if (statsMatch) {
    return {
      upToDate: false,
      filesChanged: parseInt(statsMatch[1], 10),
      insertions: statsMatch[2] ? parseInt(statsMatch[2], 10) : 0,
      deletions: statsMatch[3] ? parseInt(statsMatch[3], 10) : 0,
    };
  }
  // Fast-forward or other pull that succeeded
  if (output.includes('Fast-forward') || output.includes('Merge made')) {
    return { upToDate: false, filesChanged: null };
  }
  return null;
}

export default function GitPanel({ gitStatus, projectPath, onOpenFile, onRefreshGit, activeFile, isActive, gitRefreshKey }) {
  const addToast = useToast();
  const [commitMsg, setCommitMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [syncStep, setSyncStep] = useState(null);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [stagedOpen, setStagedOpen] = useState(true);
  const [changesOpen, setChangesOpen] = useState(true);
  const [conflictsOpen, setConflictsOpen] = useState(true);
  // Optimistic staging state — files mid-transition
  const [optimisticStaged, setOptimisticStaged] = useState(new Set());   // paths being staged
  const [optimisticUnstaged, setOptimisticUnstaged] = useState(new Set()); // paths being unstaged
  // Discard confirmation modal state
  const [discardConfirm, setDiscardConfirm] = useState(null); // null | { type: 'file', path: string } | { type: 'all', files: array }
  // Serialize git index operations to prevent index.lock races
  const gitQueueRef = useRef(Promise.resolve());

  // Reactive cleanup: clear optimistic state only once gitStatus confirms the real move.
  // This prevents the flicker caused by clearing optimistic eagerly (before gitStatus arrives).
  useEffect(() => {
    if (optimisticStaged.size === 0) return;
    const confirmed = new Set((gitStatus.staged || []).map(f => f.path));
    const resolved = [...optimisticStaged].filter(p => confirmed.has(p));
    if (resolved.length > 0) {
      setOptimisticStaged(prev => { const next = new Set(prev); resolved.forEach(p => next.delete(p)); return next; });
    }
  }, [gitStatus, optimisticStaged]);

  useEffect(() => {
    if (optimisticUnstaged.size === 0) return;
    const confirmed = new Set([
      ...(gitStatus.unstaged || []).map(f => f.path),
      ...(gitStatus.staged || []).map(f => f.path), // may appear in either list after unstage
    ]);
    const resolved = [...optimisticUnstaged].filter(p => !((gitStatus.staged || []).find(f => f.path === p)));
    if (resolved.length > 0) {
      setOptimisticUnstaged(prev => { const next = new Set(prev); resolved.forEach(p => next.delete(p)); return next; });
    }
  }, [gitStatus, optimisticUnstaged]);

  const commitInputRef = useRef(null);

  // Submodule & repo connection state
  const [submodules, setSubmodules] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(''); // '' = root repo

  // Stashes
  const [stashes, setStashes] = useState([]);

  // Commit graph state
  const [commits, setCommits] = useState([]);
  const [totalCommits, setTotalCommits] = useState(0);
  const [hasMoreCommits, setHasMoreCommits] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const effectiveBranch = gitStatus?.branch || null;

  // Detect submodules
  useEffect(() => {
    if (!projectPath || !gitStatus.isRepo) return;
    let cancelled = false;
    window.foundry?.gitListSubmodules?.(projectPath).then(subs => {
      if (!cancelled && subs) setSubmodules(subs);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [projectPath, gitStatus]);

  // Fetch commit log on mount and when branch changes
  useEffect(() => {
    if (!projectPath || !gitStatus.isRepo) return;
    let cancelled = false;
    (async () => {
      const [log, count] = await Promise.all([
        window.foundry?.gitLog(projectPath, COMMITS_PAGE_SIZE, 0, effectiveBranch),
        window.foundry?.gitCommitCount(projectPath, effectiveBranch),
      ]);
      if (!cancelled) {
        if (log) {
          setCommits(log);
          setHasMoreCommits(log.length >= COMMITS_PAGE_SIZE);
        }
        if (count != null) setTotalCommits(count);
      }
    })();
    return () => { cancelled = true; };
  }, [projectPath, gitStatus.isRepo, effectiveBranch, gitRefreshKey]);

  // Fetch stash list
  const refreshStashes = useCallback(async () => {
    if (!projectPath || !gitStatus.isRepo) return;
    const result = await window.foundry?.gitStashList?.(projectPath);
    if (result && !result.error) setStashes(result.stashes || []);
  }, [projectPath, gitStatus.isRepo]);

  useEffect(() => { refreshStashes(); }, [refreshStashes, gitRefreshKey]);

  const handleStash = async () => {
    if (!projectPath) return;
    const result = await window.foundry?.gitStash?.(projectPath);
    if (result?.error) {
      addToast({ message: result.error, type: 'error' });
    } else {
      addToast({ message: 'Changes stashed', type: 'success' });
      refreshGit();
      refreshStashes();
    }
  };

  const handleStashPop = async (ref) => {
    const result = await window.foundry?.gitStashPop?.(projectPath, ref);
    if (result?.error) {
      addToast({ message: `Pop failed: ${result.error.split('\n')[0]}`, type: 'error' });
    } else {
      addToast({ message: 'Stash applied', type: 'success' });
      refreshGit();
      refreshStashes();
    }
  };

  const handleStashDrop = async (ref) => {
    const result = await window.foundry?.gitStashDrop?.(projectPath, ref);
    if (result?.error) {
      addToast({ message: `Drop failed: ${result.error.split('\n')[0]}`, type: 'error' });
    } else {
      addToast({ message: 'Stash dropped', type: 'success' });
      refreshStashes();
    }
  };

  const loadMoreCommits = useCallback(async () => {
    if (loadingMore || !hasMoreCommits || !projectPath) return;
    setLoadingMore(true);
    try {
      const more = await window.foundry?.gitLog(projectPath, COMMITS_PAGE_SIZE, commits.length, effectiveBranch);
      if (more && more.length > 0) {
        setCommits(prev => [...prev, ...more]);
        setHasMoreCommits(more.length >= COMMITS_PAGE_SIZE);
      } else {
        setHasMoreCommits(false);
      }
    } catch { setHasMoreCommits(false); }
    setLoadingMore(false);
  }, [loadingMore, hasMoreCommits, projectPath, commits.length, effectiveBranch]);

  // The effective path for git operations (root or submodule)
  const effectivePath = selectedRepo ? selectedRepo : projectPath;

  const refreshGit = useCallback(() => {
    onRefreshGit?.();
  }, [onRefreshGit]);

  // Callbacks are stabilized so memoized ChangeItem rows stay parked
  // when gitStatus updates (which happens on every file save via the
  // file-watcher).
  const handleStageFile = useCallback((filePath) => {
    setOptimisticStaged(prev => new Set(prev).add(filePath));
    gitQueueRef.current = gitQueueRef.current
      .then(() => window.foundry?.gitStage(projectPath, filePath))
      .then(() => refreshGit())
      .catch(() => refreshGit());
  }, [projectPath, refreshGit]);

  const handleUnstageFile = useCallback((filePath) => {
    setOptimisticUnstaged(prev => new Set(prev).add(filePath));
    gitQueueRef.current = gitQueueRef.current
      .then(() => window.foundry?.gitUnstage(projectPath, filePath))
      .then(() => refreshGit())
      .catch(() => refreshGit());
  }, [projectPath, refreshGit]);

  const handleDiscardFile = useCallback((filePath) => {
    setDiscardConfirm({ type: 'file', path: filePath });
  }, []);

  const executeDiscard = async () => {
    if (!discardConfirm) return;
    if (discardConfirm.type === 'file') {
      await window.foundry?.gitDiscard(projectPath, discardConfirm.path);
    } else if (discardConfirm.type === 'all') {
      for (const f of discardConfirm.files) {
        await window.foundry?.gitDiscard(projectPath, f.path);
      }
    }
    setDiscardConfirm(null);
    refreshGit();
  };

  const handleOpenFile = useCallback((filePath) => {
    const fullPath = projectPath + '/' + filePath;
    onOpenFile?.(fullPath);
  }, [projectPath, onOpenFile]);

  // Auto-sizing is CSS-only (`field-sizing: content` on .commitInput).
  // Previous JS implementation fired a layout read on every keystroke
  // and after every AI-generated character.

  const handleCommitMsgChange = useCallback((e) => {
    setCommitMsg(e.target.value);
  }, []);

  // AI commit message generation from diff
  const handleGenerateCommitMsg = async () => {
    if (aiLoading || !projectPath) return;
    setAiLoading(true);
    try {
      const result = await window.foundry?.gitGenerateCommitMsg(projectPath);
      if (result && !result.error) {
        setCommitMsg(result.message);
      } else if (result?.error) {
        addToast({ message: 'Failed to generate commit message. Try again.', type: 'error' });
      }
    } catch (err) {
      console.error('AI commit message generation failed:', err);
    }
    setAiLoading(false);
  };

  const markDone = (step) => setCompletedSteps(prev => new Set([...prev, step]));

  const handleCommit = async () => {
    if (!commitMsg.trim() || !projectPath) return;
    setLoading(true);
    setSyncStep(null);
    setCompletedSteps(new Set());

    let pullInfo = null;
    let hadError = false;

    try {
      // Step 1: Pull
      setSyncStep('pull');
      const pullResult = await window.foundry?.gitPull(projectPath);
      if (pullResult?.error) {
        const errLower = pullResult.error.toLowerCase();
        const isNoRemote = errLower.includes('no remote') || errLower.includes('no such remote') || errLower.includes('no tracking') || errLower.includes('does not have') || errLower.includes('no upstream');
        if (!isNoRemote) {
          console.error('Pull failed:', pullResult.error);
        }
      } else if (pullResult?.output) {
        pullInfo = parsePullOutput(pullResult.output);
      }
      markDone('pull');

      // Step 2: Stage (if nothing staged, stage everything)
      setSyncStep('stage');
      const currentStaged = gitStatus.staged || [];
      if (currentStaged.length === 0) {
        const allPaths = (gitStatus.files || []).map(f => f.path);
        if (allPaths.length > 0) {
          await window.foundry?.gitStage(projectPath, allPaths);
        }
      }
      markDone('stage');

      // Step 3: Commit
      setSyncStep('commit');
      const commitResult = await window.foundry?.gitCommit(projectPath, commitMsg);
      if (commitResult?.error) {
        console.error('Commit failed:', commitResult.error);
        hadError = true;
        addToast({ message: `Commit failed: ${commitResult.error.split('\n')[0]}`, type: 'error' });
      }
      markDone('commit');

      // Step 4: Push
      setSyncStep('push');
      const pushResult = await window.foundry?.gitPush(projectPath);
      if (pushResult?.error) {
        console.error('Push failed:', pushResult.error);
        hadError = true;
        addToast({ message: `Push failed: ${pushResult.error.split('\n')[0]}`, type: 'error' });
      }
      markDone('push');

      // Show push success toast
      if (!pushResult?.error && !hadError) {
        const truncated = commitMsg.length > 50 ? commitMsg.slice(0, 50) + '…' : commitMsg;
        let msg = `Committed & pushed: ${truncated}`;
        if (pullInfo && !pullInfo.upToDate) {
          if (pullInfo.filesChanged != null) {
            msg += ` — pulled ${pullInfo.filesChanged} file${pullInfo.filesChanged !== 1 ? 's' : ''} changed`;
            if (pullInfo.insertions || pullInfo.deletions) {
              const parts = [];
              if (pullInfo.insertions) parts.push(`+${pullInfo.insertions}`);
              if (pullInfo.deletions) parts.push(`-${pullInfo.deletions}`);
              msg += ` (${parts.join(', ')})`;
            }
          } else {
            msg += ' — pulled new changes';
          }
        }
        addToast({ message: msg, type: 'success' });
      }

      setCommitMsg('');
      refreshGit();
    } catch (err) {
      console.error('Sync failed:', err);
      addToast({ message: `Sync failed: ${err.message || 'Unknown error'}`, type: 'error' });
    }
    setLoading(false);
    setSyncStep(null);
    setCompletedSteps(new Set());
  };

  const handleDiscardAll = (files) => {
    setDiscardConfirm({ type: 'all', files });
  };

  const handleStageAll = async (files) => {
    const paths = files.map(f => f.path);
    setOptimisticStaged(prev => { const next = new Set(prev); paths.forEach(p => next.add(p)); return next; });
    await window.foundry?.gitStage(projectPath, paths);
    refreshGit();
  };

  const handleUnstageAll = async (files) => {
    const paths = files.map(f => f.path);
    setOptimisticUnstaged(prev => { const next = new Set(prev); paths.forEach(p => next.add(p)); return next; });
    await window.foundry?.gitUnstage(projectPath, paths);
    refreshGit();
  };

  // Parse staged/unstaged from raw files if the main process hasn't been restarted
  // git status --porcelain: first char = index (staged), second char = working tree (unstaged)
  const { staged, unstaged, conflicts } = useMemo(() => {
    let s, u, c = [];
    if (gitStatus.staged) {
      s = [...gitStatus.staged];
      u = [...(gitStatus.unstaged || [])];
      // If main process provides explicit conflicts list, use it
      if (gitStatus.conflicts) c = [...gitStatus.conflicts];
    } else {
      s = []; u = [];
      for (const f of (gitStatus.files || [])) {
        const raw = f.status;
        if (CONFLICT_STATUS_CODES.has(raw)) {
          c.push({ status: raw, path: f.path, label: conflictLabel(raw) });
        } else if (raw === '??') {
          u.push({ status: 'U', path: f.path });
        } else if (raw.length === 2) {
          if (raw[0] !== ' ') s.push({ status: raw[0], path: f.path });
          if (raw[1] !== ' ') u.push({ status: raw[1], path: f.path });
        } else {
          u.push({ status: raw, path: f.path });
        }
      }
    }
    // Apply optimistic state: move files that are being staged/unstaged
    if (optimisticStaged.size > 0) {
      const moving = u.filter(f => optimisticStaged.has(f.path));
      u = u.filter(f => !optimisticStaged.has(f.path));
      for (const f of moving) {
        if (!s.find(sf => sf.path === f.path)) s.push(f);
      }
    }
    if (optimisticUnstaged.size > 0) {
      const moving = s.filter(f => optimisticUnstaged.has(f.path));
      s = s.filter(f => !optimisticUnstaged.has(f.path));
      for (const f of moving) {
        if (!u.find(uf => uf.path === f.path)) u.push(f);
      }
    }
    return { staged: s, unstaged: u, conflicts: c };
  }, [gitStatus, optimisticStaged, optimisticUnstaged]);

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
    <div className={styles.gitPanelContent}>
      <div className={styles.commitArea}>
        <div className={styles.commitInputWrap}>
          <textarea
            ref={commitInputRef}
            className={styles.commitInput}
            placeholder="Commit message…"
            value={commitMsg}
            onChange={handleCommitMsgChange}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommit(); } }}
            rows={2}
          />
          <AnimatePresence mode="wait">
            {aiLoading && (
              <motion.div
                className={styles.aiLoadingOverlay}
                initial={{ opacity: 0, scale: 0.97, filter: 'blur(4px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 1.01, filter: 'blur(2px)' }}
                transition={{
                  enter: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] },
                  exit: { duration: 0.3, ease: [0.55, 0, 1, 0.45] },
                  default: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] },
                }}
              >
                <div className={styles.aiLoadingDots}>
                  <div className={styles.aiLoadingDot} />
                  <div className={styles.aiLoadingDot} />
                  <div className={styles.aiLoadingDot} />
                </div>
                <span>Generating…</span>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            className={`${styles.aiBtn} ${aiLoading ? styles.aiBtnLoading : ''}`}
            onClick={handleGenerateCommitMsg}
            disabled={aiLoading}
          >
            <IoSparkles size={13} />
          </button>
        </div>
        <button
          className={styles.commitBtn}
          disabled={!commitMsg.trim() && !loading}
          onClick={handleCommit}
        >
          {loading ? <FiRefreshCw size={13} className={styles.spinning} /> : <FiUpload size={13} />}
          <span>{loading ? (STEP_LABELS[syncStep] || 'Syncing…') : 'Commit'}</span>
          {loading && (
            <div className={styles.commitProgress}>
              <div
                className={styles.commitProgressBar}
                style={{ width: `${((completedSteps.size + 0.5) / SYNC_STEPS.length) * 100}%` }}
              />
            </div>
          )}
        </button>
      </div>

      {submodules.length > 0 && (
        <div className={styles.repoSelector}>
          <span className={styles.repoSelectLabel}>Repo</span>
          <select
            className={styles.repoSelect}
            value={selectedRepo}
            onChange={(e) => {
              setSelectedRepo(e.target.value);
              setCommits([]);
              setTotalCommits(0);
              setHasMoreCommits(true);
            }}
          >
            <option value="">{projectPath ? projectPath.split('/').pop() : 'Root'}</option>
            {submodules.map(sub => (
              <option key={sub.path} value={sub.fullPath}>
                {sub.path}{sub.dirty ? ' •' : ''}{sub.uninitialized ? ' (not init)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.changesScrollArea}>
        {conflicts.length > 0 && (
          <div>
            <div className={styles.sectionLabel}>
              <div className={styles.sectionLabelLeft} onClick={() => setConflictsOpen(o => !o)}>
                <span className={styles.sectionChevron} style={{ transform: `rotate(${conflictsOpen ? 90 : 0}deg)` }}>
                  <FiChevronRight size={14} />
                </span>
                <span style={{ color: '#E06C75' }}>Merge Conflicts</span>
              </div>
              <div className={styles.sectionActions}>
                <span className={styles.badge} style={{ color: '#E06C75', background: 'rgba(224,108,117,0.15)' }}>{conflicts.length}</span>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {conflictsOpen && (
                <motion.div
                  key="conflicts-list"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className={styles.changesList}>
                    {conflicts.map((f) => (
                      <ChangeItem key={f.path} f={f} conflict onOpen={handleOpenFile} statusColor={statusColor} isActive={activeFile === projectPath + '/' + f.path} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {staged.length > 0 && (
          <div>
            <div className={styles.sectionLabel}>
              <div className={styles.sectionLabelLeft} onClick={() => setStagedOpen(o => !o)}>
                <span className={styles.sectionChevron} style={{ transform: `rotate(${stagedOpen ? 90 : 0}deg)` }}>
                  <FiChevronRight size={14} />
                </span>
                <span>Staged Changes</span>
              </div>
              <div className={styles.sectionActions}>
                <button className={styles.changeActionBtn} onClick={() => handleUnstageAll(staged)} data-tooltip="Unstage All">
                  <FiMinus size={13} />
                </button>
                <span className={styles.badge}>{staged.length}</span>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {stagedOpen && (
                <motion.div
                  key="staged-list"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className={styles.changesList}>
                    {staged.map((f) => (
                      <ChangeItem key={f.path} f={f} staged onOpen={handleOpenFile} onStage={handleStageFile} onUnstage={handleUnstageFile} onDiscard={handleDiscardFile} statusColor={statusColor} isActive={activeFile === projectPath + '/' + f.path} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div>
          <div className={styles.sectionLabel}>
            <div className={styles.sectionLabelLeft} onClick={() => setChangesOpen(o => !o)}>
              <span className={styles.sectionChevron} style={{ transform: `rotate(${changesOpen ? 90 : 0}deg)` }}>
                <FiChevronRight size={14} />
              </span>
              <span>Changes</span>
            </div>
            <div className={styles.sectionActions}>
              {(unstaged.length > 0 || staged.length > 0) && (
                <button className={styles.changeActionBtn} onClick={handleStash} data-tooltip="Stash All Changes">
                  <FiArchive size={13} />
                </button>
              )}
              {stashes.length > 0 && (
                <button className={styles.changeActionBtn} onClick={() => handleStashPop(stashes[0].ref)} data-tooltip={`Pop Latest Stash (${stashes.length})`}>
                  <FiDownload size={13} />
                </button>
              )}
              {unstaged.length > 0 && (
                <>
                  <button className={styles.changeActionBtn} onClick={() => handleDiscardAll(unstaged)} data-tooltip="Discard All Changes">
                    <FiRotateCcw size={13} />
                  </button>
                  <button className={styles.changeActionBtn} onClick={() => handleStageAll(unstaged)} data-tooltip="Stage All">
                    <FiPlus size={13} />
                  </button>
                </>
              )}
              {unstaged.length > 0 && <span className={styles.badge}>{unstaged.length}</span>}
            </div>
          </div>
          <AnimatePresence initial={false}>
            {changesOpen && (
              <motion.div
                key="changes-list"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                style={{ overflow: 'hidden' }}
              >
                <div className={styles.changesList}>
                  {unstaged.map((f) => (
                    <ChangeItem key={f.path} f={f} onOpen={handleOpenFile} onStage={handleStageFile} onUnstage={handleUnstageFile} onDiscard={handleDiscardFile} statusColor={statusColor} isActive={activeFile === projectPath + '/' + f.path} />
                  ))}
                  {unstaged.length === 0 && staged.length === 0 && conflicts.length === 0 && (
                    <div className={styles.emptyState} style={{ padding: '16px' }}>
                      <span className={styles.emptyText}>Working tree clean</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <CommitGraph
        commits={commits}
        projectPath={projectPath}
        onLoadMore={loadMoreCommits}
        hasMore={hasMoreCommits}
        loadingMore={loadingMore}
        totalCommits={totalCommits}
      />

      <ConfirmationModal
        open={!!discardConfirm}
        title="Discard Changes"
        message={
          discardConfirm?.type === 'all'
            ? `Are you sure you want to discard all changes in ${discardConfirm.files.length} file${discardConfirm.files.length !== 1 ? 's' : ''}? This cannot be undone.`
            : discardConfirm?.path
              ? `Are you sure you want to discard changes in "${discardConfirm.path.split('/').pop()}"? This cannot be undone.`
              : ''
        }
        confirmLabel="Discard"
        danger
        onConfirm={executeDiscard}
        onCancel={() => setDiscardConfirm(null)}
      />
    </div>
  );
}
