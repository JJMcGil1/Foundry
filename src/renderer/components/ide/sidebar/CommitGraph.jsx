import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { FiChevronRight, FiRefreshCw } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import GitAvatar from './GitAvatar';
import CommitHoverCard from './CommitHoverCard';
import { buildGraph, parseRefs, GRAPH_COLORS, COMMITS_PAGE_SIZE } from './gitUtils';
import styles from '../Sidebar.module.css';

export default function CommitGraph({ commits, projectPath, onLoadMore, hasMore, loadingMore, totalCommits }) {
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
    <div className={styles.graphSection}>
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
