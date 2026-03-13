import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  FiFolderPlus, FiRefreshCw, FiChevronRight,
  FiGitBranch, FiCheck, FiUpload, FiDownload, FiX,
  FiPlus, FiMinus, FiRotateCcw, FiExternalLink, FiGitCommit,
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import FileIcon from './FileIcon';
import styles from './Sidebar.module.css';

/* ── File Tree ── */
function FileTreeItem({ item, depth = 0, onOpenFile, activeFile, parentDimmed = false, expandedPaths, onToggleExpand }) {
  const expanded = expandedPaths.has(item.path);
  const dimmed = parentDimmed || item.ignored;

  if (item.type === 'directory') {
    return (
      <div>
        <button
          className={`${styles.treeItem} ${dimmed ? styles.treeItemDimmed : ''}`}
          style={{ paddingLeft: 12 + depth * 8 }}
          onClick={() => onToggleExpand(item.path)}
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
                  expandedPaths={expandedPaths}
                  onToggleExpand={onToggleExpand}
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
function ChangeItem({ f, onOpen, onStage, onUnstage, onDiscard, staged, statusColor, isActive }) {
  const fileName = f.path.split('/').pop();
  const dirPath = f.path.split('/').slice(0, -1).join('/');
  return (
    <div className={`${styles.changeItem} ${isActive ? styles.changeItemActive : ''}`} onClick={() => onOpen(f.path)}>
      <FileIcon name={fileName} type="file" size={14} />
      <span className={styles.changeFileName}>{fileName}</span>
      {dirPath && <span className={styles.changeDirPath}>{dirPath}</span>}
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
      <span className={styles.changeLabel} style={{ color: statusColor(f.status) }}>{f.status}</span>
    </div>
  );
}

/* ── Commit Graph ── */
const GRAPH_COLORS = ['#61AFEF', '#C678DD', '#98C379', '#E5C07B', '#E06C75', '#56B6C2'];

function buildGraph(commits) {
  // Assign each commit a lane (column) for the graph visualization
  const lanes = []; // array of active branch hashes occupying each lane
  const rows = [];

  for (const commit of commits) {
    let lane = -1;

    // Find if this commit is already expected in a lane
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === commit.hash) {
        lane = i;
        break;
      }
    }

    // If not found, take the first empty lane or append
    if (lane === -1) {
      const empty = lanes.indexOf(null);
      lane = empty !== -1 ? empty : lanes.length;
      if (empty !== -1) lanes[empty] = commit.hash;
      else lanes.push(commit.hash);
    }

    // Build merge lines: for each parent, find or assign a lane
    const parentLanes = [];
    for (let pi = 0; pi < commit.parents.length; pi++) {
      const parentHash = commit.parents[pi];
      if (pi === 0) {
        // First parent continues in the same lane
        lanes[lane] = parentHash;
        parentLanes.push(lane);
      } else {
        // Merge parent — find existing lane or open a new one
        let pLane = lanes.indexOf(parentHash);
        if (pLane === -1) {
          const empty = lanes.indexOf(null);
          pLane = empty !== -1 ? empty : lanes.length;
          if (empty !== -1) lanes[empty] = parentHash;
          else lanes.push(parentHash);
        }
        lanes[pLane] = parentHash;
        parentLanes.push(pLane);
      }
    }

    // If commit has no parents (root), free the lane
    if (commit.parents.length === 0) {
      lanes[lane] = null;
    }

    // Trim trailing nulls
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();

    rows.push({
      ...commit,
      lane,
      parentLanes,
      activeLanes: [...lanes],
      totalLanes: Math.max(lanes.length, 1),
    });
  }

  return rows;
}

function CommitGraph({ commits }) {
  const [graphOpen, setGraphOpen] = useState(true);
  const [graphHeight, setGraphHeight] = useState(240);
  const [isResizing, setIsResizing] = useState(false);
  const rows = useMemo(() => buildGraph(commits), [commits]);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = graphHeight;
    setIsResizing(true);

    const onMove = (e) => {
      const delta = startY - e.clientY;
      setGraphHeight(Math.max(80, Math.min(600, startH + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setIsResizing(false);
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [graphHeight]);

  if (commits.length === 0) return null;

  const LANE_W = 14;
  const ROW_H = 24;
  const DOT_R = 3;
  const maxLanes = Math.max(rows.reduce((m, r) => Math.max(m, r.totalLanes), 1), 1);
  const graphW = maxLanes * LANE_W + 6;

  return (
    <div className={styles.graphSection} style={graphOpen ? { flexShrink: 0 } : undefined}>
      <div className={styles.graphResizeHandle} onMouseDown={handleResizeStart} />
      <button className={`${styles.sectionLabel} ${styles.graphSectionLabel}`} onClick={() => setGraphOpen(!graphOpen)}>
        <motion.span
          className={styles.sectionChevron}
          animate={{ rotate: graphOpen ? 90 : 0 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
        >
          <FiChevronRight size={14} />
        </motion.span>
        <span>Commit Graph</span>
        <div className={styles.sectionActions}>
          <span className={styles.badge}>{commits.length}</span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {graphOpen && (
          <motion.div
            className={styles.commitGraph}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: graphHeight, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={isResizing ? { duration: 0 } : { duration: 0.15, ease: 'easeOut' }}
            style={{ overflow: 'auto' }}
          >
            {rows.map((row, ri) => {
              const color = GRAPH_COLORS[row.lane % GRAPH_COLORS.length];
              const isHead = row.refs && row.refs.includes('HEAD');
              const isLast = ri === rows.length - 1;

              return (
                <div key={row.hash} className={styles.graphRow} title={`${row.short} — ${row.message}\n${row.author}, ${row.date}`}>
                  <svg className={styles.graphSvg} width={graphW} height={ROW_H}>
                    {/* Vertical lane lines for all active lanes */}
                    {row.activeLanes.map((laneHash, li) => {
                      if (laneHash === null) return null;
                      return (
                        <line
                          key={`v-${li}`}
                          x1={li * LANE_W + LANE_W / 2}
                          y1={0}
                          x2={li * LANE_W + LANE_W / 2}
                          y2={isLast && li === row.lane ? ROW_H / 2 : ROW_H}
                          stroke={GRAPH_COLORS[li % GRAPH_COLORS.length]}
                          strokeWidth={1.5}
                          opacity={0.4}
                        />
                      );
                    })}
                    {/* Top half of this commit's lane (connect from above) */}
                    {ri > 0 && (
                      <line
                        x1={row.lane * LANE_W + LANE_W / 2}
                        y1={0}
                        x2={row.lane * LANE_W + LANE_W / 2}
                        y2={ROW_H / 2}
                        stroke={color}
                        strokeWidth={1.5}
                        opacity={0.6}
                      />
                    )}
                    {/* Bottom half — connect to first parent */}
                    {row.parents.length > 0 && (
                      <line
                        x1={row.lane * LANE_W + LANE_W / 2}
                        y1={ROW_H / 2}
                        x2={row.parentLanes[0] * LANE_W + LANE_W / 2}
                        y2={ROW_H}
                        stroke={color}
                        strokeWidth={1.5}
                        opacity={0.6}
                      />
                    )}
                    {/* Merge lines to additional parents */}
                    {row.parentLanes.slice(1).map((pLane, pi) => {
                      const x1 = row.lane * LANE_W + LANE_W / 2;
                      const x2 = pLane * LANE_W + LANE_W / 2;
                      return (
                        <path
                          key={`m-${pi}`}
                          d={`M ${x1} ${ROW_H / 2} C ${x1} ${ROW_H * 0.85}, ${x2} ${ROW_H * 0.5}, ${x2} ${ROW_H}`}
                          stroke={GRAPH_COLORS[pLane % GRAPH_COLORS.length]}
                          strokeWidth={1.5}
                          fill="none"
                          opacity={0.5}
                        />
                      );
                    })}
                    {/* Commit dot */}
                    <circle
                      cx={row.lane * LANE_W + LANE_W / 2}
                      cy={ROW_H / 2}
                      r={isHead ? DOT_R + 1 : DOT_R}
                      fill={isHead ? color : 'var(--surface-1)'}
                      stroke={color}
                      strokeWidth={isHead ? 2 : 1.5}
                    />
                  </svg>
                  <span className={styles.graphMsg}>{row.message}</span>
                  <span className={styles.graphDate}>{row.date}</span>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const SYNC_STEPS = ['pull', 'stage', 'commit', 'push'];
const STEP_LABELS = { pull: 'Pulling…', stage: 'Staging…', commit: 'Committing…', push: 'Pushing…' };

function GitPanel({ gitStatus, projectPath, onOpenFile, onRefreshGit, activeFile }) {
  const [commitMsg, setCommitMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncStep, setSyncStep] = useState(null); // current step name
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [stagedOpen, setStagedOpen] = useState(true);
  const [changesOpen, setChangesOpen] = useState(true);
  const [commits, setCommits] = useState([]);

  // Fetch commit log on mount and after refreshes
  useEffect(() => {
    if (!projectPath || !gitStatus.isRepo) return;
    let cancelled = false;
    (async () => {
      const log = await window.foundry?.gitLog(projectPath, 30);
      if (!cancelled && log) setCommits(log);
    })();
    return () => { cancelled = true; };
  }, [projectPath, gitStatus]);

  const refreshGit = async () => {
    onRefreshGit?.();
    // Also refresh commits
    const log = await window.foundry?.gitLog(projectPath, 30);
    if (log) setCommits(log);
  };

  const handleStageFile = async (filePath) => {
    await window.foundry?.gitStage(projectPath, filePath);
    refreshGit();
  };

  const handleUnstageFile = async (filePath) => {
    await window.foundry?.gitUnstage(projectPath, filePath);
    refreshGit();
  };

  const handleDiscardFile = async (filePath) => {
    await window.foundry?.gitDiscard(projectPath, filePath);
    refreshGit();
  };

  const handleOpenFile = (filePath) => {
    const fullPath = projectPath + '/' + filePath;
    onOpenFile?.(fullPath);
  };

  const markDone = (step) => setCompletedSteps(prev => new Set([...prev, step]));

  const handleCommit = async () => {
    if (!commitMsg.trim() || !projectPath) return;
    setLoading(true);
    setSyncStep(null);
    setCompletedSteps(new Set());

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
      }
      markDone('commit');

      // Step 4: Push
      setSyncStep('push');
      const pushResult = await window.foundry?.gitPush(projectPath);
      if (pushResult?.error) {
        console.error('Push failed:', pushResult.error);
      }
      markDone('push');

      setCommitMsg('');
      refreshGit();
    } catch (err) {
      console.error('Sync failed:', err);
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
    for (const f of files) {
      await window.foundry?.gitStage(projectPath, f.path);
    }
    refreshGit();
  };

  const handleUnstageAll = async (files) => {
    for (const f of files) {
      await window.foundry?.gitUnstage(projectPath, f.path);
    }
    refreshGit();
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

  // Parse staged/unstaged from raw files if the main process hasn't been restarted
  // git status --porcelain: first char = index (staged), second char = working tree (unstaged)
  const { staged, unstaged } = (() => {
    if (gitStatus.staged) return { staged: gitStatus.staged, unstaged: gitStatus.unstaged || [] };
    // Parse from files array (old format where status is the raw 2-char code)
    const s = [], u = [];
    for (const f of (gitStatus.files || [])) {
      const raw = f.status;
      if (raw === '??') {
        u.push({ status: 'U', path: f.path });
      } else if (raw.length === 2) {
        // e.g. "M " = staged only, " M" = unstaged only, "MM" = both
        if (raw[0] !== ' ') s.push({ status: raw[0], path: f.path });
        if (raw[1] !== ' ') u.push({ status: raw[1], path: f.path });
      } else {
        // Single char like "M" — treat as unstaged
        u.push({ status: raw, path: f.path });
      }
    }
    return { staged: s, unstaged: u };
  })();

  return (
    <div className={styles.panelScroll}>
      <div className={styles.gitBranch}>
        <FiGitBranch size={12} />
        <span className={styles.branchName}>{gitStatus.branch || 'HEAD'}</span>
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
        <button
          className={styles.commitBtn}
          disabled={!commitMsg.trim() && !loading}
          onClick={handleCommit}
        >
          {loading ? <FiRefreshCw size={12} className={styles.spinning} /> : <FiCheck size={12} />}
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

      {staged.length > 0 && (
        <>
          <button className={styles.sectionLabel} onClick={() => setStagedOpen(!stagedOpen)}>
            <motion.span
              className={styles.sectionChevron}
              animate={{ rotate: stagedOpen ? 90 : 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
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
          </button>
          <AnimatePresence initial={false}>
            {stagedOpen && (
              <motion.div
                className={styles.changesList}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                style={{ overflow: 'hidden' }}
              >
                {staged.map((f, i) => (
                  <ChangeItem key={`s-${i}`} f={f} staged onOpen={handleOpenFile} onStage={handleStageFile} onUnstage={handleUnstageFile} onDiscard={handleDiscardFile} statusColor={statusColor} isActive={activeFile === projectPath + '/' + f.path} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      <button className={styles.sectionLabel} onClick={() => setChangesOpen(!changesOpen)}>
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
      </button>
      <AnimatePresence initial={false}>
        {changesOpen && (
          <motion.div
            className={styles.changesList}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            {unstaged.map((f, i) => (
              <ChangeItem key={`u-${i}`} f={f} onOpen={handleOpenFile} onStage={handleStageFile} onUnstage={handleUnstageFile} onDiscard={handleDiscardFile} statusColor={statusColor} isActive={activeFile === projectPath + '/' + f.path} />
            ))}
            {unstaged.length === 0 && staged.length === 0 && (
              <div className={styles.emptyState} style={{ padding: '16px' }}>
                <span className={styles.emptyText}>Working tree clean</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <CommitGraph commits={commits} projectPath={projectPath} />
    </div>
  );
}

/* ── Sidebar ── */
const TREE_STATE_KEY = 'file_tree_expanded_paths';
let persistTimer = null;

export default function Sidebar({
  panel, width, project, fileTree, gitStatus,
  onOpenFile, onOpenFolder, onRefresh, projectPath,
  onWidthChange, activeFile
}) {
  const panelTitles = { files: 'Explorer', git: 'Source Control' };
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
          </motion.div>
        </AnimatePresence>
      </div>
      <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />
    </motion.div>
  );
}
