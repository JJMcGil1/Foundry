import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FiRefreshCw, FiChevronRight, FiExternalLink } from 'react-icons/fi';
import { VscCheck, VscClose, VscLoading, VscCircleFilled, VscWatch } from 'react-icons/vsc';
import { motion, AnimatePresence } from 'framer-motion';
import MiniTooltipBtn from './MiniTooltipBtn';
import styles from '../Sidebar.module.css';
import wfStyles from '../WorkflowsPanel.module.css';

function parseGitHubRepo(remoteUrl) {
  if (!remoteUrl) return null;
  // Handle HTTPS: https://github.com/owner/repo
  // Handle SSH: git@github.com:owner/repo.git
  const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };
  const sshMatch = remoteUrl.match(/github\.com:([^/]+)\/([^/.]+)/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };
  return null;
}

function statusIcon(status, conclusion) {
  if (status === 'queued' || status === 'waiting' || status === 'pending') {
    return <VscWatch size={14} className={wfStyles.statusQueued} />;
  }
  if (status === 'in_progress') {
    return <VscLoading size={14} className={`${wfStyles.statusRunning} ${wfStyles.spinning}`} />;
  }
  if (conclusion === 'success') {
    return <VscCheck size={14} className={wfStyles.statusSuccess} />;
  }
  if (conclusion === 'failure') {
    return <VscClose size={14} className={wfStyles.statusFailure} />;
  }
  if (conclusion === 'cancelled') {
    return <VscCircleFilled size={10} className={wfStyles.statusCancelled} />;
  }
  if (conclusion === 'skipped') {
    return <VscCircleFilled size={10} className={wfStyles.statusSkipped} />;
  }
  return <VscCircleFilled size={10} className={wfStyles.statusQueued} />;
}

function timeAgo(dateStr) {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const secs = Math.floor((now - d) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function durationStr(startedAt, completedAt) {
  if (!startedAt) return '';
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const totalSeconds = Math.round((end - start) / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs}h ${remainMins}m ${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

export default function WorkflowsPanel({ projectPath, isActive }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedRun, setExpandedRun] = useState(null);
  const [jobs, setJobs] = useState({});
  const [jobsLoading, setJobsLoading] = useState({});
  const [repoInfo, setRepoInfo] = useState(null);
  const [tick, setTick] = useState(0);
  const pollRef = useRef(null);
  const tickRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Get repo info from git remote
  useEffect(() => {
    if (!projectPath) { setRepoInfo(null); return; }
    (async () => {
      const url = await window.foundry?.gitRemoteUrl(projectPath);
      const info = parseGitHubRepo(url);
      if (mountedRef.current) setRepoInfo(info);
    })();
  }, [projectPath]);

  const fetchRuns = useCallback(async () => {
    if (!repoInfo) return;
    const token = await window.foundry?.getSetting('github_token');
    if (mountedRef.current) { setLoading(true); setError(null); }
    try {
      const result = await window.foundry?.githubWorkflowRuns(token || '', repoInfo.owner, repoInfo.repo);
      if (!mountedRef.current) return;
      if (result?.error) { setError(result.error); setRuns([]); }
      else { setRuns(result?.runs || []); setError(null); }
    } catch (err) {
      if (mountedRef.current) setError(err?.message || 'Failed to fetch workflows');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [repoInfo]);

  // Initial fetch + polling
  useEffect(() => {
    if (!repoInfo) return;
    fetchRuns();
    pollRef.current = setInterval(fetchRuns, 30000);
    return () => clearInterval(pollRef.current);
  }, [repoInfo, fetchRuns]);

  // 1-second tick for smooth elapsed timers on in-progress runs
  useEffect(() => {
    const hasInProgress = runs.some(r => r.status === 'in_progress');
    if (hasInProgress) {
      tickRef.current = setInterval(() => {
        if (mountedRef.current) setTick(t => t + 1);
      }, 1000);
    } else {
      clearInterval(tickRef.current);
    }
    return () => clearInterval(tickRef.current);
  }, [runs]);

  const fetchJobs = useCallback(async (runId) => {
    if (jobs[runId] || jobsLoading[runId]) return;
    const token = await window.foundry?.getSetting('github_token') || '';
    setJobsLoading(prev => ({ ...prev, [runId]: true }));
    try {
      const result = await window.foundry?.githubWorkflowJobs(token, repoInfo.owner, repoInfo.repo, runId);
      if (mountedRef.current) {
        setJobs(prev => ({ ...prev, [runId]: result?.jobs || [] }));
      }
    } catch { /* ignore */ }
    finally {
      if (mountedRef.current) setJobsLoading(prev => ({ ...prev, [runId]: false }));
    }
  }, [repoInfo, jobs, jobsLoading]);

  const handleToggleRun = useCallback((runId) => {
    setExpandedRun(prev => {
      const next = prev === runId ? null : runId;
      if (next) fetchJobs(runId);
      return next;
    });
  }, [fetchJobs]);

  const handleOpenInBrowser = useCallback((url) => {
    window.foundry?.openExternal(url);
  }, []);

  if (!repoInfo) {
    return (
      <div className={wfStyles.container}>
        <div className={styles.explorerHeader}>
          <span className={`${styles.gitPanelTitle} ${isActive ? styles.gitPanelTitleActive : ''}`}>Workflows</span>
        </div>
        <div className={wfStyles.emptyState}>
          <span className={wfStyles.emptyText}>Not a GitHub repository</span>
          <span className={wfStyles.emptySubtext}>Open a project with a GitHub remote to see workflows</span>
        </div>
      </div>
    );
  }

  return (
    <div className={wfStyles.container}>
      <div className={styles.explorerHeader}>
        <span className={`${styles.gitPanelTitle} ${isActive ? styles.gitPanelTitleActive : ''}`}>Workflows</span>
        <div className={styles.headerActions}>
          <MiniTooltipBtn
            icon={FiRefreshCw}
            label="Refresh"
            onClick={fetchRuns}
            className={loading ? wfStyles.spinning : undefined}
          />
        </div>
      </div>

      <div className={wfStyles.scrollArea}>
        {loading && runs.length === 0 && (
          <div className={wfStyles.loadingState}>
            <FiRefreshCw size={16} className={wfStyles.spinning} />
            <span>Loading workflows…</span>
          </div>
        )}

        {error && error !== 'no_token' && (
          <div className={wfStyles.errorState}>
            <span className={wfStyles.errorText}>{error}</span>
          </div>
        )}

        {!loading && !error && runs.length === 0 && (
          <div className={wfStyles.emptyState}>
            <span className={wfStyles.emptyText}>No workflow runs</span>
            <span className={wfStyles.emptySubtext}>Push code or create a workflow to get started</span>
          </div>
        )}

        <div className={wfStyles.runsList}>
          {runs.map(run => (
            <div key={run.id} className={wfStyles.runItem}>
              <button
                className={`${wfStyles.runHeader} ${expandedRun === run.id ? wfStyles.runHeaderActive : ''}`}
                onClick={() => handleToggleRun(run.id)}
              >
                <span className={wfStyles.runChevron} style={{ transform: expandedRun === run.id ? 'rotate(90deg)' : 'none' }}>
                  <FiChevronRight size={12} />
                </span>
                {statusIcon(run.status, run.conclusion)}
                <div className={wfStyles.runInfo}>
                  <span className={wfStyles.runName}>{run.name}</span>
                  <span className={wfStyles.runMeta}>
                    {run.head_branch && <span className={wfStyles.runBranch}>{run.head_branch}</span>}
                    {run.run_started_at && (
                      <span className={wfStyles.runDuration}>
                        {durationStr(run.run_started_at, run.status === 'in_progress' ? null : run.updated_at)}
                      </span>
                    )}
                    <span className={wfStyles.runTime}>{timeAgo(run.updated_at)}</span>
                  </span>
                </div>
                <span
                  className={wfStyles.externalBtn}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); handleOpenInBrowser(run.html_url); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleOpenInBrowser(run.html_url); } }}
                  title="Open in GitHub"
                >
                  <FiExternalLink size={12} />
                </span>
              </button>

              <AnimatePresence>
                {expandedRun === run.id && (
                  <motion.div
                    className={wfStyles.jobsList}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {jobsLoading[run.id] && (
                      <div className={wfStyles.jobLoading}>
                        <FiRefreshCw size={12} className={wfStyles.spinning} />
                        <span>Loading jobs…</span>
                      </div>
                    )}
                    {(jobs[run.id] || []).map(job => (
                      <button
                        key={job.id}
                        className={wfStyles.jobItem}
                        onClick={() => handleOpenInBrowser(job.html_url)}
                        title={`${job.name} — ${job.conclusion || job.status}`}
                      >
                        {statusIcon(job.status, job.conclusion)}
                        <span className={wfStyles.jobName}>{job.name}</span>
                        {job.started_at && (
                          <span className={wfStyles.jobDuration}>
                            {durationStr(job.started_at, job.completed_at)}
                          </span>
                        )}
                      </button>
                    ))}
                    {!jobsLoading[run.id] && (jobs[run.id] || []).length === 0 && (
                      <div className={wfStyles.jobLoading}>
                        <span>No jobs found</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {repoInfo && (
          <div className={wfStyles.repoFooter}>
            <span className={wfStyles.repoName}>{repoInfo.owner}/{repoInfo.repo}</span>
          </div>
        )}
      </div>
    </div>
  );
}
