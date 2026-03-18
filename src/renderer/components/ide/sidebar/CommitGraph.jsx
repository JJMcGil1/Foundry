import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { FiChevronRight, FiRefreshCw } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import GitAvatar from './GitAvatar';
import CommitHoverCard from './CommitHoverCard';
import { buildGraph, parseRefs, GRAPH_COLORS, COMMITS_PAGE_SIZE } from './gitUtils';
import styles from '../Sidebar.module.css';

function formatRelativeTime(isoDate) {
  if (!isoDate) return '';
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function CommitGraph({
  commits, projectPath, onLoadMore, hasMore, loadingMore, totalCommits,
}) {
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
    clearTimeout(cardLeaveTimerRef.current);
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
    clearTimeout(cardLeaveTimerRef.current);
    cardLeaveTimerRef.current = setTimeout(() => {
      dismissCard();
    }, 200);
  }, [dismissCard]);

  const handleCardMouseEnter = useCallback(() => {
    clearTimeout(cardLeaveTimerRef.current);
  }, []);

  const handleCardMouseLeave = useCallback(() => {
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

  if (commits.length === 0 && !loadingMore) return null;

  const LANE_W = 12;
  const ROW_H = 44;
  const DOT_R = 3.5;
  const PAD_L = 6;

  const lx = (li) => PAD_L + li * LANE_W + LANE_W / 2;

  const getAvatarUrl = (row) => avatarMap[`${row.email || ''}||${row.author || ''}`] || null;
  const cardRow = cardHash ? rows.find(r => r.hash === cardHash) : null;
  const cardLaneColor = cardRow ? GRAPH_COLORS[cardRow.lane % GRAPH_COLORS.length] : null;

  const mergingFromSet = (row) => new Set(row.mergingFromLanes || []);

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
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={isResizing ? { duration: 0 } : { duration: 0.15, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            {/* Graph Content */}
            <motion.div
              ref={graphRef}
              className={styles.commitGraph}
              initial={false}
              animate={{ height: graphHeight }}
              transition={isResizing ? { duration: 0 } : { duration: 0.15, ease: 'easeOut' }}
              style={{ overflow: 'auto', position: 'relative' }}
              onScroll={handleScroll}
            >
              {rows.map((row, ri) => {
                const color = GRAPH_COLORS[row.lane % GRAPH_COLORS.length];
                const { branches: refBranches, tags, isHead } = parseRefs(row.refs);
                const hasRefs = refBranches.length > 0 || tags.length > 0;
                const isLast = ri === rows.length - 1;
                const isFirst = ri === 0;
                const prevActiveLanes = ri > 0 ? rows[ri - 1].activeLanes : [];
                const curActiveLanes = row.activeLanes;
                const mergingFrom = mergingFromSet(row);
                // ALL merge parent lanes (both new and existing) — merge-out curves handle outgoing
                const allMergeParentLanes = new Set(
                  row.parentLanes.slice(1).filter(pl => pl !== row.lane)
                );

                const maxLane = Math.max(
                  curActiveLanes.length,
                  prevActiveLanes.length,
                  row.lane + 1,
                  ...row.parentLanes.map(p => p + 1),
                  ...row.mergingFromLanes.map(m => m + 1)
                );
                const rowGraphW = PAD_L + maxLane * LANE_W + 4;

                const svgElements = [];

                for (let li = 0; li < maxLane; li++) {
                  if (li === row.lane) continue;

                  const aliveAbove = li < prevActiveLanes.length && prevActiveLanes[li] != null;
                  const aliveBelow = li < curActiveLanes.length && curActiveLanes[li] != null;
                  const laneColor = GRAPH_COLORS[li % GRAPH_COLORS.length];
                  const isMergingIn = mergingFrom.has(li);
                  const isMergeParent = allMergeParentLanes.has(li);

                  if (isMergingIn) {
                    // Lane was expecting THIS commit — curve into the dot
                    svgElements.push(
                      <path
                        key={`join-${li}`}
                        d={`M ${lx(li)} 0 C ${lx(li)} ${ROW_H * 0.45}, ${lx(row.lane)} ${ROW_H * 0.15}, ${lx(row.lane)} ${ROW_H / 2}`}
                        stroke={laneColor}
                        strokeWidth={2}
                        fill="none"
                        opacity={0.7}
                      />
                    );
                  } else if (isMergeParent && aliveAbove) {
                    // Existing merge parent — curve from above into the dot.
                    // The merge-out curve (below) handles the outgoing connection.
                    // Do NOT draw a passthrough — the branch terminates at the merge.
                    svgElements.push(
                      <path
                        key={`merge-in-${li}`}
                        d={`M ${lx(li)} 0 C ${lx(li)} ${ROW_H * 0.45}, ${lx(row.lane)} ${ROW_H * 0.15}, ${lx(row.lane)} ${ROW_H / 2}`}
                        stroke={laneColor}
                        strokeWidth={2}
                        fill="none"
                        opacity={0.7}
                      />
                    );
                  } else if (isMergeParent) {
                    // New merge parent lane — merge-out curve handles it entirely.
                    // Draw nothing here to avoid a redundant straight line.
                  } else if (aliveAbove && aliveBelow) {
                    svgElements.push(
                      <line
                        key={`pass-${li}`}
                        x1={lx(li)} y1={0}
                        x2={lx(li)} y2={ROW_H}
                        stroke={laneColor}
                        strokeWidth={2}
                        opacity={0.6}
                      />
                    );
                  } else if (aliveAbove && !aliveBelow) {
                    svgElements.push(
                      <line
                        key={`end-${li}`}
                        x1={lx(li)} y1={0}
                        x2={lx(li)} y2={ROW_H / 2}
                        stroke={laneColor}
                        strokeWidth={2}
                        opacity={0.6}
                      />
                    );
                  } else if (!aliveAbove && aliveBelow) {
                    svgElements.push(
                      <line
                        key={`start-${li}`}
                        x1={lx(li)} y1={ROW_H / 2}
                        x2={lx(li)} y2={ROW_H}
                        stroke={laneColor}
                        strokeWidth={2}
                        opacity={0.6}
                      />
                    );
                  }
                }

                return (
                  <div
                    key={row.hash}
                    className={`${styles.graphRow} ${hoveredHash === row.hash ? styles.graphRowHovered : ''} ${isHead ? styles.graphRowHead : ''}`}
                    onMouseEnter={(e) => handleRowMouseEnter(e, row.hash)}
                    onMouseLeave={handleRowMouseLeave}
                  >
                    <svg className={styles.graphSvg} width={rowGraphW} height={ROW_H}>
                      <defs>
                        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                          <feGaussianBlur stdDeviation="3" result="blur" />
                          <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                          </feMerge>
                        </filter>
                      </defs>
                      {svgElements}

                      {/* Commit's own lane — incoming line from top to dot */}
                      {!isFirst && (
                        <line
                          x1={lx(row.lane)} y1={0}
                          x2={lx(row.lane)} y2={ROW_H / 2}
                          stroke={color}
                          strokeWidth={2}
                          opacity={0.85}
                        />
                      )}

                      {/* Outgoing: dot to first parent */}
                      {row.parents.length > 0 && (() => {
                        const x1 = lx(row.lane);
                        const x2 = lx(row.parentLanes[0]);
                        if (x1 === x2) {
                          return (
                            <line
                              x1={x1} y1={ROW_H / 2}
                              x2={x2} y2={isLast ? ROW_H / 2 : ROW_H}
                              stroke={color}
                              strokeWidth={2}
                              opacity={0.85}
                            />
                          );
                        }
                        return (
                          <path
                            d={`M ${x1} ${ROW_H / 2} C ${x1} ${ROW_H * 0.8}, ${x2} ${ROW_H * 0.55}, ${x2} ${ROW_H}`}
                            stroke={color}
                            strokeWidth={2}
                            fill="none"
                            opacity={0.85}
                          />
                        );
                      })()}

                      {/* Merge-out curves: dot to additional parent lanes */}
                      {row.parentLanes.slice(1).map((pLane, pi) => {
                        const x1 = lx(row.lane);
                        const x2 = lx(pLane);
                        const pColor = GRAPH_COLORS[pLane % GRAPH_COLORS.length];
                        return (
                          <path
                            key={`merge-${pi}`}
                            d={`M ${x1} ${ROW_H / 2} C ${x1} ${ROW_H * 0.7}, ${x2} ${ROW_H * 0.65}, ${x2} ${ROW_H}`}
                            stroke={pColor}
                            strokeWidth={2}
                            fill="none"
                            opacity={0.7}
                          />
                        );
                      })}

                      {/* Commit dot — distinct visuals for HEAD, merge, and regular */}
                      {(() => {
                        const isHovered = hoveredHash === row.hash;
                        const cx = lx(row.lane);
                        const cy = ROW_H / 2;
                        const isMerge = row.parents.length > 1;

                        if (isHead) {
                          // HEAD: double circle with cutout effect
                          const outerR = isHovered ? DOT_R + 3 : DOT_R + 2.5;
                          const innerR = isHovered ? DOT_R + 0.5 : DOT_R;
                          return (
                            <>
                              {isHovered && (
                                <circle
                                  className={styles.graphDotGlow}
                                  cx={cx} cy={cy}
                                  r={outerR + 3}
                                  fill={color}
                                  opacity={0.15}
                                  filter="url(#glow)"
                                />
                              )}
                              <circle
                                cx={cx} cy={cy}
                                r={outerR}
                                fill={color}
                                stroke={color}
                                strokeWidth={2}
                              />
                              <circle
                                className={styles.graphDot}
                                cx={cx} cy={cy}
                                r={innerR}
                                fill="var(--surface-1)"
                                stroke={color}
                                strokeWidth={2}
                              />
                            </>
                          );
                        } else if (isMerge) {
                          // Merge: double filled circle
                          const outerR = isHovered ? DOT_R + 2 : DOT_R + 1.5;
                          const innerR = isHovered ? DOT_R : DOT_R - 0.5;
                          return (
                            <>
                              {isHovered && (
                                <circle
                                  className={styles.graphDotGlow}
                                  cx={cx} cy={cy}
                                  r={outerR + 3}
                                  fill={color}
                                  opacity={0.15}
                                  filter="url(#glow)"
                                />
                              )}
                              <circle
                                cx={cx} cy={cy}
                                r={outerR}
                                fill={color}
                                stroke={color}
                                strokeWidth={1.5}
                              />
                              <circle
                                className={styles.graphDot}
                                cx={cx} cy={cy}
                                r={innerR}
                                fill={color}
                                stroke="none"
                              />
                            </>
                          );
                        } else {
                          // Regular: single filled circle
                          const baseR = DOT_R;
                          const hoverR = baseR + 1;
                          return (
                            <>
                              {isHovered && (
                                <circle
                                  className={styles.graphDotGlow}
                                  cx={cx} cy={cy}
                                  r={hoverR + 3}
                                  fill={color}
                                  opacity={0.15}
                                  filter="url(#glow)"
                                />
                              )}
                              <circle
                                className={styles.graphDot}
                                cx={cx} cy={cy}
                                r={isHovered ? hoverR : baseR}
                                fill={isHovered ? color : 'var(--surface-1)'}
                                stroke={color}
                                strokeWidth={isHovered ? 2 : 1.5}
                              />
                            </>
                          );
                        }
                      })()}
                    </svg>
                    <div className={styles.graphContent}>
                      <div className={styles.graphLine1}>
                        {hasRefs && (
                          <div className={styles.graphRefs}>
                            {refBranches.map(b => (
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
                        <span className={`${styles.graphMsg} ${isHead ? styles.graphMsgHead : ''}`}>{row.message}</span>
                      </div>
                      <div className={styles.graphLine2}>
                        <GitAvatar author={row.author} avatarUrl={getAvatarUrl(row)} size={14} />
                        <span className={styles.graphAuthor}>{row.author}</span>
                        <span className={styles.graphDate}>{formatRelativeTime(row.isoDate)}</span>
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
