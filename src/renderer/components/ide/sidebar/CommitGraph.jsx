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

  const LANE_W = 12;
  const ROW_H = 44;
  const DOT_R = 3.5;
  const PAD_L = 6; // left padding so dots aren't clipped

  // Helper: x-center of a lane
  const lx = (li) => PAD_L + li * LANE_W + LANE_W / 2;

  const getAvatarUrl = (row) => avatarMap[`${row.email || ''}||${row.author || ''}`] || null;
  const cardRow = cardHash ? rows.find(r => r.hash === cardHash) : null;
  const cardLaneColor = cardRow ? GRAPH_COLORS[cardRow.lane % GRAPH_COLORS.length] : null;

  // Build a Set for quick lookup
  const newMergeSet = (row) => new Set(row.newMergeLanes || []);
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
              const isFirst = ri === 0;
              const prevActiveLanes = ri > 0 ? rows[ri - 1].activeLanes : [];
              const curActiveLanes = row.activeLanes;
              const newMerges = newMergeSet(row);
              const mergingFrom = mergingFromSet(row);

              // Determine the max lane index we need to render for this row
              const maxLane = Math.max(
                curActiveLanes.length,
                prevActiveLanes.length,
                row.lane + 1,
                ...row.parentLanes.map(p => p + 1),
                ...row.mergingFromLanes.map(m => m + 1)
              );
              // Per-row SVG width — dynamic based on how many lanes this row uses
              const rowGraphW = PAD_L + maxLane * LANE_W + 4;

              const svgElements = [];

              for (let li = 0; li < maxLane; li++) {
                if (li === row.lane) continue; // handled separately below

                const aliveAbove = li < prevActiveLanes.length && prevActiveLanes[li] != null;
                const aliveBelow = li < curActiveLanes.length && curActiveLanes[li] != null;
                const laneColor = GRAPH_COLORS[li % GRAPH_COLORS.length];
                const isNewMerge = newMerges.has(li);
                const isMergingIn = mergingFrom.has(li);

                if (isMergingIn) {
                  // This lane was expecting this commit and converges here.
                  // Draw curve from top of this lane to the commit dot.
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
                } else if (isNewMerge) {
                  // This lane was just created by this commit's merge parent — draw bottom half only.
                  // The merge curve from the dot handles the top connection.
                  svgElements.push(
                    <line
                      key={`new-${li}`}
                      x1={lx(li)} y1={ROW_H / 2}
                      x2={lx(li)} y2={ROW_H}
                      stroke={laneColor}
                      strokeWidth={2}
                      opacity={0.6}
                    />
                  );
                } else if (aliveAbove && aliveBelow) {
                  // Pure pass-through — full vertical line
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
                  // Lane terminates here (but wasn't a merge-in to our dot — just freed)
                  // Draw top half
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
                } else if (!aliveAbove && aliveBelow && !isNewMerge) {
                  // Lane starts fresh (not from our merge) — draw bottom half
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
                  className={`${styles.graphRow} ${hoveredHash === row.hash ? styles.graphRowHovered : ''}`}
                  onMouseEnter={(e) => handleRowMouseEnter(e, row.hash)}
                  onMouseLeave={handleRowMouseLeave}
                >
                  <svg className={styles.graphSvg} width={rowGraphW} height={ROW_H}>
                    {/* Pass-through, merge-in, and new-merge lane lines */}
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
                      // First parent is in a different lane — curve to it
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
                          d={`M ${x1} ${ROW_H / 2} C ${x1} ${ROW_H * 0.85}, ${x2} ${ROW_H * 0.5}, ${x2} ${ROW_H}`}
                          stroke={pColor}
                          strokeWidth={2}
                          fill="none"
                          opacity={0.7}
                        />
                      );
                    })}

                    {/* Commit dot */}
                    {(() => {
                      const isHovered = hoveredHash === row.hash;
                      const cx = lx(row.lane);
                      const cy = ROW_H / 2;
                      const isMerge = row.parents.length > 1;
                      const baseR = isHead ? DOT_R + 1.5 : (isMerge ? DOT_R + 0.5 : DOT_R);
                      const hoverR = baseR + 3;
                      const glowR = hoverR + 4;
                      return (
                        <>
                          <circle
                            className={styles.graphDotGlow}
                            cx={cx} cy={cy}
                            r={isHovered ? glowR : baseR}
                            fill="none"
                            stroke={color}
                            strokeWidth={1.5}
                            opacity={isHovered ? 0.3 : 0}
                          />
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
