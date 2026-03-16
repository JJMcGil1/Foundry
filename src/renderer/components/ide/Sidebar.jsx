import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  FiFolderPlus, FiFilePlus, FiRefreshCw, FiChevronRight,
  FiCheck, FiPlus, FiMinus, FiRotateCcw,
} from 'react-icons/fi';
import { IoSparkles } from 'react-icons/io5';
import { motion, AnimatePresence } from 'framer-motion';
import FileIcon from './FileIcon';
import styles from './Sidebar.module.css';

/* ── Mini Tooltip Button ── */
function MiniTooltipBtn({ icon: Icon, label, onClick, size = 16 }) {
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

  const handleEnter = () => {
    setHovered(true);
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
    }
  };

  return (
    <div className={styles.miniTooltipWrap}>
      <button
        ref={btnRef}
        className={styles.miniBtn}
        onClick={onClick}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setHovered(false)}
      >
        <Icon size={size} />
      </button>
      {hovered && pos && (
        <div className={styles.miniTooltip} style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}>
          <span className={styles.miniTooltipText}>{label}</span>
        </div>
      )}
    </div>
  );
}

/* ── File Tree ── */
const INDENT_SIZE = 14;
const TREE_BASE_PAD = 10;

function IndentGuides({ depth }) {
  if (depth <= 0) return null;
  const guides = [];
  for (let i = 0; i < depth; i++) {
    guides.push(
      <span
        key={i}
        className={styles.indentGuide}
        style={{ left: TREE_BASE_PAD + i * INDENT_SIZE + 7 }}
      />
    );
  }
  return guides;
}

function FileTreeItem({ item, depth = 0, onOpenFile, activeFile, parentDimmed = false, expandedPaths, onToggleExpand }) {
  const expanded = expandedPaths.has(item.path);
  const dimmed = parentDimmed || item.ignored;
  const indent = TREE_BASE_PAD + depth * INDENT_SIZE;

  if (item.type === 'directory') {
    return (
      <div>
        <button
          className={`${styles.treeItem} ${dimmed ? styles.treeItemDimmed : ''}`}
          style={{ paddingLeft: indent }}
          onClick={() => onToggleExpand(item.path)}
        >
          <IndentGuides depth={depth} />
          <motion.span
            className={styles.chevron}
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
          >
            <FiChevronRight size={14} />
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
      style={{ paddingLeft: indent + 10 }}
      onClick={() => onOpenFile(item.path)}
    >
      <IndentGuides depth={depth} />
      <FileIcon name={item.name} type="file" size={16} />
      <span className={styles.treeName}>{item.name}</span>
    </button>
  );
}

/* ── Source Control Panel ── */
function ChangeItem({ f, index = 0, onOpen, onStage, onUnstage, onDiscard, staged, statusColor, isActive }) {
  const fileName = f.path.split('/').pop();
  const dirPath = f.path.split('/').slice(0, -1).join('/');
  // Stagger enter only — exits fire together so multi-file ops feel unified
  const enterDelay = Math.min(index, 6) * 0.035;
  return (
    <motion.div
      key={f.path}
      initial={{ opacity: 0, y: -7 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: enterDelay } }}
      exit={{ opacity: 0, y: 5, transition: { duration: 0.22, ease: [0.4, 0, 0.8, 1] } }}
      className={`${styles.changeItem} ${isActive ? styles.changeItemActive : ''}`}
      onClick={() => onOpen(f.path)}
    >
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
    </motion.div>
  );
}

/* ── Commit Graph ── */
const COMMITS_PAGE_SIZE = 15;
const GRAPH_COLORS = ['#F97316', '#FB923C', '#FDBA74', '#D97706', '#EA580C', '#C2410C'];

function buildGraph(commits) {
  const lanes = [];
  const rows = [];

  for (const commit of commits) {
    let lane = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === commit.hash) { lane = i; break; }
    }
    if (lane === -1) {
      const empty = lanes.indexOf(null);
      lane = empty !== -1 ? empty : lanes.length;
      if (empty !== -1) lanes[empty] = commit.hash;
      else lanes.push(commit.hash);
    }

    const parentLanes = [];
    for (let pi = 0; pi < commit.parents.length; pi++) {
      const parentHash = commit.parents[pi];
      if (pi === 0) {
        lanes[lane] = parentHash;
        parentLanes.push(lane);
      } else {
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

    if (commit.parents.length === 0) lanes[lane] = null;
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

function parseRefs(refsStr) {
  if (!refsStr) return { branches: [], tags: [], isHead: false };
  const parts = refsStr.split(',').map(s => s.trim()).filter(Boolean);
  const branches = [];
  const tags = [];
  let isHead = false;

  for (const part of parts) {
    if (part === 'HEAD') {
      isHead = true;
    } else if (part.startsWith('HEAD -> ')) {
      isHead = true;
      branches.push(part.replace('HEAD -> ', ''));
    } else if (part.startsWith('tag: ')) {
      tags.push(part.replace('tag: ', ''));
    } else if (part.startsWith('origin/')) {
      // skip remote-only refs if local already shown
      if (!branches.includes(part.replace('origin/', ''))) {
        branches.push(part);
      }
    } else {
      branches.push(part);
    }
  }
  return { branches, tags, isHead };
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#61AFEF', '#C678DD', '#98C379', '#E5C07B', '#E06C75', '#56B6C2', '#D19A66', '#BE5046'];
  return colors[Math.abs(hash) % colors.length];
}

function formatFullDate(isoDate) {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + ' at ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return isoDate; }
}

function GitAvatar({ author, avatarUrl, size = 16, className }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={author}
        title={author}
        className={className}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      className={className}
      title={author}
      style={{ width: size, height: size, borderRadius: '50%', background: getAvatarColor(author), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.max(7, size * 0.4), fontWeight: 700, color: '#fff', flexShrink: 0, letterSpacing: '0.02em' }}
    >
      {getInitials(author)}
    </div>
  );
}

function CommitHoverCard({ row, avatarUrl, style, onMouseEnter, onMouseLeave, laneColor, remoteUrl }) {
  const { branches, tags } = parseRefs(row.refs);
  const filesChanged = row.filesChanged || 0;
  const insertions = row.insertions || 0;
  const deletions = row.deletions || 0;
  const [copied, setCopied] = useState(false);

  const handleCopyHash = useCallback((e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(row.hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [row.hash]);

  const handleViewOnGitHub = useCallback((e) => {
    e.stopPropagation();
    if (remoteUrl) {
      window.foundry?.openExternal(`${remoteUrl}/commit/${row.hash}`);
    }
  }, [remoteUrl, row.hash]);

  return (
    <motion.div
      className={styles.commitCard}
      style={style}
      initial={{ opacity: 0, x: -8, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -8, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={styles.commitCardHeader}>
        <span className={`${styles.commitCardHash} ${copied ? styles.commitCardHashCopied : ''}`} onClick={handleCopyHash} title="Click to copy full hash">
          {copied ? (
            <>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>
              Copied!
            </>
          ) : (
            <>
              {row.short}
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className={styles.commitCardCopyIcon}><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25ZM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>
            </>
          )}
        </span>
        <span className={styles.commitCardDate}>{row.date}</span>
        {row.isoDate && <span className={styles.commitCardFullDate}>({formatFullDate(row.isoDate)})</span>}
      </div>
      {remoteUrl && (
        <button className={styles.commitCardGitHubLink} onClick={handleViewOnGitHub} title="View on GitHub">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>
          View on GitHub
        </button>
      )}
      {(branches.length > 0 || tags.length > 0) && (
        <div className={styles.commitCardRefs}>
          {branches.map(b => (
            <span key={b} className={`${styles.refBadge} ${styles.refBranch}`}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Z"/></svg>
              {b}
            </span>
          ))}
          {tags.map(t => (
            <span key={t} className={`${styles.refBadge} ${styles.refTag}`}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775ZM6 5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/></svg>
              {t}
            </span>
          ))}
        </div>
      )}
      <div className={styles.commitCardMessage}>{row.message}</div>
      <div className={styles.commitCardFooter}>
        <div className={styles.commitCardAuthor}>
          <GitAvatar author={row.author} avatarUrl={avatarUrl} size={20} />
          <span className={styles.commitCardAuthorName}>{row.author}</span>
        </div>
        <div className={styles.commitCardStats}>
          <span className={styles.commitCardFiles}>{filesChanged} file{filesChanged !== 1 ? 's' : ''}</span>
          <span className={styles.commitCardIns}>+{insertions}</span>
          <span className={styles.commitCardDel}>-{deletions}</span>
        </div>
      </div>
    </motion.div>
  );
}

function CommitGraph({ commits, projectPath, onLoadMore, hasMore, loadingMore, totalCommits }) {
  const [graphOpen, setGraphOpen] = useState(true);
  const [graphHeight, setGraphHeight] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [hoveredHash, setHoveredHash] = useState(null);
  const [cardHash, setCardHash] = useState(null);
  const [cardPos, setCardPos] = useState(null);
  const [avatarMap, setAvatarMap] = useState({});
  const [remoteUrl, setRemoteUrl] = useState(null);
  const graphRef = useRef(null);
  const cardTimerRef = useRef(null);
  const rows = useMemo(() => buildGraph(commits), [commits]);

  // Resolve remote URL for "View on GitHub" link
  useEffect(() => {
    if (!projectPath) return;
    let cancelled = false;
    window.foundry?.gitRemoteUrl?.(projectPath).then(url => {
      if (!cancelled) setRemoteUrl(url || null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [projectPath]);

  // Resolve GitHub avatars for all unique authors
  useEffect(() => {
    if (!commits.length) return;
    const uniqueAuthors = [];
    const seen = new Set();
    for (const c of commits) {
      const key = `${c.email || ''}||${c.author || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueAuthors.push({ author: c.author, email: c.email });
      }
    }
    let cancelled = false;
    window.foundry?.gitResolveAvatars?.(uniqueAuthors).then(result => {
      if (!cancelled && result) setAvatarMap(prev => ({ ...prev, ...result }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [commits]);

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

  const cardLeaveTimerRef = useRef(null);

  // Instant hover for dot magnification + row highlight
  const handleRowMouseEnter = useCallback((e, hash) => {
    setHoveredHash(hash);
    // Cancel any pending card dismissal
    clearTimeout(cardLeaveTimerRef.current);
    // Delayed flyout card
    clearTimeout(cardTimerRef.current);
    const target = e.currentTarget;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    cardTimerRef.current = setTimeout(() => {
      const viewportH = window.innerHeight;
      const viewportW = window.innerWidth;
      const cardW = 400;
      const cardEstimatedH = 180;
      let left = rect.right + 8;
      if (left + cardW > viewportW - 10) left = viewportW - cardW - 10;
      let top = rect.top - 8;
      if (top + cardEstimatedH > viewportH - 10) top = viewportH - cardEstimatedH - 10;
      if (top < 10) top = 10;
      setCardPos({ top, left });
      setCardHash(hash);
    }, 400);
  }, []);

  const dismissCard = useCallback(() => {
    setHoveredHash(null);
    clearTimeout(cardTimerRef.current);
    setCardHash(null);
    setCardPos(null);
  }, []);

  const handleRowMouseLeave = useCallback(() => {
    clearTimeout(cardTimerRef.current);
    // Delay dismissal so user can move mouse to the card
    clearTimeout(cardLeaveTimerRef.current);
    cardLeaveTimerRef.current = setTimeout(() => {
      dismissCard();
    }, 200);
  }, [dismissCard]);

  const handleCardMouseEnter = useCallback(() => {
    // Cancel dismissal when mouse enters the card
    clearTimeout(cardLeaveTimerRef.current);
  }, []);

  const handleCardMouseLeave = useCallback(() => {
    // Dismiss when mouse leaves the card
    clearTimeout(cardLeaveTimerRef.current);
    cardLeaveTimerRef.current = setTimeout(() => {
      dismissCard();
    }, 150);
  }, [dismissCard]);

  // Infinite scroll — load more when near bottom
  const handleScroll = useCallback((e) => {
    const el = e.target;
    const threshold = 80;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
      onLoadMore?.();
    }
  }, [onLoadMore]);

  if (commits.length === 0) return null;

  const LANE_W = 14;
  const ROW_H = 44;
  const DOT_R = 3.5;
  const maxLanes = Math.max(rows.reduce((m, r) => Math.max(m, r.totalLanes), 1), 1);
  const graphW = maxLanes * LANE_W + 6;

  const getAvatarUrl = (row) => avatarMap[`${row.email || ''}||${row.author || ''}`] || null;
  const cardRow = cardHash ? rows.find(r => r.hash === cardHash) : null;
  const cardLaneColor = cardRow ? GRAPH_COLORS[cardRow.lane % GRAPH_COLORS.length] : null;

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
        <span>Graph</span>
        <div className={styles.sectionActions}>
          <span className={styles.badge}>{totalCommits || commits.length}</span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {graphOpen && (
          <motion.div
            ref={graphRef}
            className={styles.commitGraph}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: graphHeight, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={isResizing ? { duration: 0 } : { duration: 0.15, ease: 'easeOut' }}
            style={{ overflow: 'auto', position: 'relative' }}
            onScroll={handleScroll}
          >
            {rows.map((row, ri) => {
              const color = GRAPH_COLORS[row.lane % GRAPH_COLORS.length];
              const { branches, tags, isHead } = parseRefs(row.refs);
              const hasRefs = branches.length > 0 || tags.length > 0;
              const isLast = ri === rows.length - 1;

              return (
                <div
                  key={row.hash}
                  className={`${styles.graphRow} ${hoveredHash === row.hash ? styles.graphRowHovered : ''}`}
                  onMouseEnter={(e) => handleRowMouseEnter(e, row.hash)}
                  onMouseLeave={handleRowMouseLeave}
                >
                  <svg className={styles.graphSvg} width={graphW} height={ROW_H}>
                    {/* Vertical lane lines for all active lanes */}
                    {row.activeLanes.map((laneHash, li) => {
                      if (laneHash === null) return null;
                      const isFirst = ri === 0 && li === row.lane;
                      return (
                        <line
                          key={`v-${li}`}
                          x1={li * LANE_W + LANE_W / 2}
                          y1={isFirst ? ROW_H / 2 : 0}
                          x2={li * LANE_W + LANE_W / 2}
                          y2={isLast && li === row.lane ? ROW_H / 2 : ROW_H}
                          stroke={GRAPH_COLORS[li % GRAPH_COLORS.length]}
                          strokeWidth={1.5}
                          opacity={0.35}
                        />
                      );
                    })}
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
                    {/* Commit dot — magnifies on row hover */}
                    {(() => {
                      const isHovered = hoveredHash === row.hash;
                      const cx = row.lane * LANE_W + LANE_W / 2;
                      const cy = ROW_H / 2;
                      const baseR = isHead ? DOT_R + 1.5 : DOT_R;
                      const hoverR = baseR + 3;
                      const glowR = hoverR + 4;
                      return (
                        <>
                          {/* Glow ring */}
                          <circle
                            className={styles.graphDotGlow}
                            cx={cx} cy={cy}
                            r={isHovered ? glowR : baseR}
                            fill="none"
                            stroke={color}
                            strokeWidth={1.5}
                            opacity={isHovered ? 0.3 : 0}
                          />
                          {/* Main dot */}
                          <circle
                            className={styles.graphDot}
                            cx={cx} cy={cy}
                            r={isHovered ? hoverR : baseR}
                            fill={isHovered || isHead ? color : 'var(--surface-1)'}
                            stroke={color}
                            strokeWidth={isHovered ? 2 : (isHead ? 2.5 : 1.5)}
                          />
                        </>
                      );
                    })()}
                  </svg>
                  <div className={styles.graphContent}>
                    <div className={styles.graphLine1}>
                      {hasRefs && (
                        <div className={styles.graphRefs}>
                          {branches.map(b => (
                            <span key={b} className={`${styles.refBadgeInline} ${styles.refBranchInline}`}>
                              {b}
                            </span>
                          ))}
                          {tags.map(t => (
                            <span key={t} className={`${styles.refBadgeInline} ${styles.refTagInline}`}>
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <span className={styles.graphMsg}>{row.message}</span>
                    </div>
                    <div className={styles.graphLine2}>
                      <GitAvatar author={row.author} avatarUrl={getAvatarUrl(row)} size={14} />
                      <span className={styles.graphDate}>{row.date}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Infinite scroll loading indicator */}
            {loadingMore && (
              <div className={styles.graphLoadMore}>
                <FiRefreshCw size={12} className={styles.spinning} />
                <span>Loading…</span>
              </div>
            )}
            {!hasMore && commits.length > COMMITS_PAGE_SIZE && (
              <div className={styles.graphLoadMore}>
                <span>All commits loaded</span>
              </div>
            )}

          </motion.div>
        )}
      </AnimatePresence>

      {/* Hover card — flies out to the right of the sidebar */}
      <AnimatePresence>
        {cardRow && cardPos && (
          <CommitHoverCard row={cardRow} avatarUrl={getAvatarUrl(cardRow)} laneColor={cardLaneColor} remoteUrl={remoteUrl} style={{ position: 'fixed', top: cardPos.top, left: cardPos.left, width: 400 }} onMouseEnter={handleCardMouseEnter} onMouseLeave={handleCardMouseLeave} />
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

  // Fetch commit log for the selected repo on mount and after refreshes
  useEffect(() => {
    if (!effectivePath || !gitStatus.isRepo) return;
    let cancelled = false;
    (async () => {
      const [log, count] = await Promise.all([
        window.foundry?.gitLog(effectivePath, COMMITS_PAGE_SIZE),
        window.foundry?.gitCommitCount(effectivePath),
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
  }, [effectivePath, gitStatus]);

  const refreshGit = async () => {
    onRefreshGit?.();
    const [log, count] = await Promise.all([
      window.foundry?.gitLog(effectivePath, COMMITS_PAGE_SIZE),
      window.foundry?.gitCommitCount(effectivePath),
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
      const more = await window.foundry?.gitLog(effectivePath, COMMITS_PAGE_SIZE, commits.length);
      if (more && more.length > 0) {
        setCommits(prev => [...prev, ...more]);
        setHasMoreCommits(more.length >= COMMITS_PAGE_SIZE);
      } else {
        setHasMoreCommits(false);
      }
    } catch { setHasMoreCommits(false); }
    setLoadingMore(false);
  }, [loadingMore, hasMoreCommits, effectivePath, commits.length]);

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

  const handleCommitMsgChange = useCallback((e) => {
    setCommitMsg(e.target.value);
    autoResize(e.target);
  }, [autoResize]);

  // AI commit message generation from diff
  const handleGenerateCommitMsg = async () => {
    if (aiLoading || !projectPath) return;
    setAiLoading(true);
    try {
      const result = await window.foundry?.gitGenerateCommitMsg(projectPath);
      if (result && !result.error) {
        setCommitMsg(result.message);
        // Trigger auto-resize after setting message
        setTimeout(() => autoResize(commitInputRef.current), 0);
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

  const statusColor = (s) => {
    const map = {
      'M': '#E5C07B',  // Modified — yellow
      'A': '#98C379',  // Added — green
      'D': '#E06C75',  // Deleted — red
      'U': '#73C991',  // Untracked — green (VS Code style)
      'R': '#C678DD',  // Renamed — purple
      'C': '#C678DD',  // Copied — purple
      'T': '#E5C07B',  // Type changed — yellow
      '!': 'var(--zinc-500)', // Ignored
    };
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
    <div className={styles.panelScroll}>
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
          <button
            className={`${styles.aiBtn} ${aiLoading ? styles.aiBtnLoading : ''}`}
            onClick={handleGenerateCommitMsg}
            disabled={aiLoading}
          >
            <IoSparkles size={13} className={aiLoading ? styles.spinning : ''} />
          </button>
        </div>
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

      <CommitGraph commits={commits} projectPath={effectivePath} onLoadMore={loadMoreCommits} hasMore={hasMoreCommits} loadingMore={loadingMore} totalCommits={totalCommits} />
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
          </motion.div>
        </AnimatePresence>
      </div>
      <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />
    </motion.div>
  );
}
