import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  FiRefreshCw, FiChevronRight,
  FiCheck, FiPlus, FiMinus, FiRotateCcw, FiUpload,
} from 'react-icons/fi';
import { IoSparkles } from 'react-icons/io5';
import { motion, AnimatePresence } from 'framer-motion';
import ChangeItem from './ChangeItem';
import CommitGraph from './CommitGraph';
import { COMMITS_PAGE_SIZE, statusColor } from './gitUtils';
import { useToast } from '../ToastProvider';
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

export default function GitPanel({ gitStatus, projectPath, onOpenFile, onRefreshGit, activeFile }) {
  const addToast = useToast();
  const [commitMsg, setCommitMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [syncStep, setSyncStep] = useState(null);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [stagedOpen, setStagedOpen] = useState(true);
  const [changesOpen, setChangesOpen] = useState(true);
  // Optimistic staging state — files mid-transition
  const [optimisticStaged, setOptimisticStaged] = useState(new Set());   // paths being staged
  const [optimisticUnstaged, setOptimisticUnstaged] = useState(new Set()); // paths being unstaged

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

  const [commits, setCommits] = useState([]);
  const [totalCommits, setTotalCommits] = useState(0);
  const [hasMoreCommits, setHasMoreCommits] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const commitInputRef = useRef(null);

  // Submodule & repo connection state
  const [submodules, setSubmodules] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(''); // '' = root repo

  // Detect submodules
  useEffect(() => {
    if (!projectPath || !gitStatus.isRepo) return;
    let cancelled = false;
    window.foundry?.gitListSubmodules?.(projectPath).then(subs => {
      if (!cancelled && subs) setSubmodules(subs);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [projectPath, gitStatus]);

  // The effective path for git operations (root or submodule)
  const effectivePath = selectedRepo ? selectedRepo : projectPath;

  // Always show commits for the current branch
  const effectiveBranch = gitStatus.branch || null;

  // Fetch commit log for the selected repo on mount and after refreshes
  useEffect(() => {
    if (!effectivePath || !gitStatus.isRepo) return;
    let cancelled = false;
    (async () => {
      const [log, count] = await Promise.all([
        window.foundry?.gitLog(effectivePath, COMMITS_PAGE_SIZE, 0, effectiveBranch),
        window.foundry?.gitCommitCount(effectivePath, effectiveBranch),
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
  }, [effectivePath, gitStatus, effectiveBranch]);

  const refreshGit = async () => {
    onRefreshGit?.();
    const [log, count] = await Promise.all([
      window.foundry?.gitLog(effectivePath, COMMITS_PAGE_SIZE, 0, effectiveBranch),
      window.foundry?.gitCommitCount(effectivePath, effectiveBranch),
    ]);
    if (log) {
      setCommits(log);
      setHasMoreCommits(log.length >= COMMITS_PAGE_SIZE);
    }
    if (count != null) setTotalCommits(count);
  };

  const loadMoreCommits = useCallback(async () => {
    if (loadingMore || !hasMoreCommits || !effectivePath) return;
    setLoadingMore(true);
    try {
      const more = await window.foundry?.gitLog(effectivePath, COMMITS_PAGE_SIZE, commits.length, effectiveBranch);
      if (more && more.length > 0) {
        setCommits(prev => [...prev, ...more]);
        setHasMoreCommits(more.length >= COMMITS_PAGE_SIZE);
      } else {
        setHasMoreCommits(false);
      }
    } catch { setHasMoreCommits(false); }
    setLoadingMore(false);
  }, [loadingMore, hasMoreCommits, effectivePath, commits.length, effectiveBranch]);

  const handleStageFile = async (filePath) => {
    setOptimisticStaged(prev => new Set(prev).add(filePath));
    await window.foundry?.gitStage(projectPath, filePath);
    refreshGit(); // effect below clears optimistic once gitStatus confirms the move
  };

  const handleUnstageFile = async (filePath) => {
    setOptimisticUnstaged(prev => new Set(prev).add(filePath));
    await window.foundry?.gitUnstage(projectPath, filePath);
    refreshGit(); // effect below clears optimistic once gitStatus confirms the move
  };

  const handleDiscardFile = async (filePath) => {
    await window.foundry?.gitDiscard(projectPath, filePath);
    refreshGit();
  };

  const handleOpenFile = (filePath) => {
    const fullPath = projectPath + '/' + filePath;
    onOpenFile?.(fullPath);
  };

  // Auto-resize textarea
  const autoResize = useCallback((el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  // Auto-resize whenever commitMsg changes (covers AI generation + typing)
  useEffect(() => {
    autoResize(commitInputRef.current);
  }, [commitMsg, autoResize]);

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
      const staged = gitStatus.staged || [];
      if (staged.length === 0) {
        for (const f of (gitStatus.files || [])) {
          await window.foundry?.gitStage(projectPath, f.path);
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

  const handleDiscardAll = async (files) => {
    for (const f of files) {
      await window.foundry?.gitDiscard(projectPath, f.path);
    }
    refreshGit();
  };

  const handleStageAll = async (files) => {
    const paths = files.map(f => f.path);
    setOptimisticStaged(prev => { const next = new Set(prev); paths.forEach(p => next.add(p)); return next; });
    await Promise.all(files.map(f => window.foundry?.gitStage(projectPath, f.path)));
    refreshGit(); // effect below clears optimistic once gitStatus confirms
  };

  const handleUnstageAll = async (files) => {
    const paths = files.map(f => f.path);
    setOptimisticUnstaged(prev => { const next = new Set(prev); paths.forEach(p => next.add(p)); return next; });
    await Promise.all(files.map(f => window.foundry?.gitUnstage(projectPath, f.path)));
    refreshGit(); // effect below clears optimistic once gitStatus confirms
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

  // Parse staged/unstaged from raw files if the main process hasn't been restarted
  // git status --porcelain: first char = index (staged), second char = working tree (unstaged)
  const { staged, unstaged } = useMemo(() => {
    let s, u;
    if (gitStatus.staged) {
      s = [...gitStatus.staged];
      u = [...(gitStatus.unstaged || [])];
    } else {
      s = []; u = [];
      for (const f of (gitStatus.files || [])) {
        const raw = f.status;
        if (raw === '??') {
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
    return { staged: s, unstaged: u };
  }, [gitStatus, optimisticStaged, optimisticUnstaged]);

  return (
    <div className={styles.gitPanelContent}>
      <div className={styles.gitPanelHeader}>
        <span className={styles.gitPanelTitle}>Source Control</span>
      </div>
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
        <AnimatePresence initial={false}>
          {staged.length > 0 && (
            <motion.div
              key="staged-section"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div className={styles.sectionLabel} role="button" tabIndex={0} onClick={() => setStagedOpen(!stagedOpen)}>
                <motion.span
                  className={styles.sectionChevron}
                  animate={{ rotate: stagedOpen ? 90 : 0 }}
                  transition={{ duration: 0.14, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <FiChevronRight size={14} />
                </motion.span>
                <span>Staged Changes</span>
                <div className={styles.sectionActions}>
                  <button className={styles.changeActionBtn} onClick={(e) => { e.stopPropagation(); handleUnstageAll(staged); }} title="Unstage All">
                    <FiMinus size={13} />
                  </button>
                  <span className={styles.badge}>{staged.length}</span>
                </div>
              </div>
              <AnimatePresence initial={false}>
                {stagedOpen && (
                  <motion.div
                    className={styles.changesList}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <AnimatePresence initial={false}>
                      {staged.map((f, i) => (
                        <ChangeItem key={f.path} f={f} index={i} staged onOpen={handleOpenFile} onStage={handleStageFile} onUnstage={handleUnstageFile} onDiscard={handleDiscardFile} statusColor={statusColor} isActive={activeFile === projectPath + '/' + f.path} />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={styles.sectionLabel} role="button" tabIndex={0} onClick={() => setChangesOpen(!changesOpen)}>
          <motion.span
            className={styles.sectionChevron}
            animate={{ rotate: changesOpen ? 90 : 0 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
          >
            <FiChevronRight size={14} />
          </motion.span>
          <span>Changes</span>
          <div className={styles.sectionActions}>
            {unstaged.length > 0 && (
              <>
                <button className={styles.changeActionBtn} onClick={(e) => { e.stopPropagation(); handleDiscardAll(unstaged); }} title="Discard All Changes">
                  <FiRotateCcw size={13} />
                </button>
                <button className={styles.changeActionBtn} onClick={(e) => { e.stopPropagation(); handleStageAll(unstaged); }} title="Stage All">
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
              className={styles.changesList}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <AnimatePresence initial={false}>
                {unstaged.map((f, i) => (
                  <ChangeItem key={f.path} f={f} index={i} onOpen={handleOpenFile} onStage={handleStageFile} onUnstage={handleUnstageFile} onDiscard={handleDiscardFile} statusColor={statusColor} isActive={activeFile === projectPath + '/' + f.path} />
                ))}
              </AnimatePresence>
              {unstaged.length === 0 && staged.length === 0 && (
                <div className={styles.emptyState} style={{ padding: '16px' }}>
                  <span className={styles.emptyText}>Working tree clean</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <CommitGraph
        commits={commits}
        projectPath={effectivePath}
        onLoadMore={loadMoreCommits}
        hasMore={hasMoreCommits}
        loadingMore={loadingMore}
        totalCommits={totalCommits}
      />
    </div>
  );
}
