import React, { useState, useCallback, useEffect } from 'react';
import CommitGraph from './CommitGraph';
import { COMMITS_PAGE_SIZE } from './gitUtils';
import styles from '../Sidebar.module.css';

export default function CommitGraphPanel({ projectPath, gitStatus, isActive }) {
  const [commits, setCommits] = useState([]);
  const [totalCommits, setTotalCommits] = useState(0);
  const [hasMoreCommits, setHasMoreCommits] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const effectiveBranch = gitStatus?.branch || null;

  const isRepo = gitStatus?.isRepo;

  // Fetch commit log on mount and when branch changes
  // Only depend on stable values — NOT the gitStatus object reference,
  // which changes on every poll and would reset commits to page 1.
  useEffect(() => {
    if (!projectPath || !isRepo) return;
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
  }, [projectPath, isRepo, effectiveBranch]);

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

  if (!gitStatus?.isRepo) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyText}>Not a Git repository</span>
      </div>
    );
  }

  return (
    <CommitGraph
      commits={commits}
      projectPath={projectPath}
      onLoadMore={loadMoreCommits}
      hasMore={hasMoreCommits}
      loadingMore={loadingMore}
      totalCommits={totalCommits}
      fullPanel
    />
  );
}
