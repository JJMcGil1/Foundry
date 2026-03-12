import React, { useState } from 'react';
import { FiFolder, FiFolderPlus, FiRefreshCw, FiFile, FiChevronRight, FiChevronDown, FiPlus, FiSearch, FiGitCommit, FiGitBranch, FiCheck, FiUpload, FiDownload } from 'react-icons/fi';
import styles from './Sidebar.module.css';

// ---- File Tree ---- //
function FileTreeItem({ item, depth = 0, onOpenFile }) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (item.type === 'directory') {
    return (
      <div>
        <button
          className={styles.treeItem}
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
          <FiFolder size={14} className={styles.treeIcon} />
          <span className={styles.treeName}>{item.name}</span>
        </button>
        {expanded && item.children?.map(child => (
          <FileTreeItem key={child.path} item={child} depth={depth + 1} onOpenFile={onOpenFile} />
        ))}
      </div>
    );
  }

  return (
    <button
      className={styles.treeItem}
      style={{ paddingLeft: 12 + depth * 16 }}
      onClick={() => onOpenFile(item.path)}
    >
      <span style={{ width: 14 }} />
      <FiFile size={14} className={styles.treeIconFile} />
      <span className={styles.treeName}>{item.name}</span>
    </button>
  );
}

// ---- Search Panel ---- //
function SearchPanel() {
  const [query, setQuery] = useState('');

  return (
    <div className={styles.panelContent}>
      <div className={styles.searchBox}>
        <FiSearch size={14} className={styles.searchIcon} />
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search files..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {!query && (
        <div className={styles.emptyHint}>Type to search across files</div>
      )}
    </div>
  );
}

// ---- Source Control Panel ---- //
function GitPanel({ gitStatus, projectPath }) {
  const [commitMsg, setCommitMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCommit = async () => {
    if (!commitMsg.trim() || !projectPath) return;
    setLoading(true);
    try {
      // Stage all changes first
      for (const f of gitStatus.files) {
        await window.foundry?.gitStage(projectPath, f.path);
      }
      await window.foundry?.gitCommit(projectPath, commitMsg);
      setCommitMsg('');
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handlePush = async () => {
    if (!projectPath) return;
    setLoading(true);
    await window.foundry?.gitPush(projectPath);
    setLoading(false);
  };

  const handlePull = async () => {
    if (!projectPath) return;
    setLoading(true);
    await window.foundry?.gitPull(projectPath);
    setLoading(false);
  };

  const statusLabel = (s) => {
    const map = { 'M': 'Modified', 'A': 'Added', 'D': 'Deleted', '??': 'Untracked', 'R': 'Renamed' };
    return map[s] || s;
  };

  const statusColor = (s) => {
    const map = { 'M': '#E5C07B', 'A': '#98C379', 'D': '#E06C75', '??': '#61AFEF', 'R': '#C678DD' };
    return map[s] || 'var(--zinc-400)';
  };

  if (!gitStatus.isRepo) {
    return (
      <div className={styles.panelContent}>
        <div className={styles.emptyHint}>Not a Git repository</div>
      </div>
    );
  }

  return (
    <div className={styles.panelContent}>
      <div className={styles.gitHeader}>
        <FiGitBranch size={14} />
        <span className={styles.branchName}>{gitStatus.branch || 'HEAD'}</span>
        <div className={styles.gitActions}>
          <button className={styles.gitActionBtn} onClick={handlePull} title="Pull" disabled={loading}>
            <FiDownload size={14} />
          </button>
          <button className={styles.gitActionBtn} onClick={handlePush} title="Push" disabled={loading}>
            <FiUpload size={14} />
          </button>
        </div>
      </div>

      <div className={styles.commitBox}>
        <input
          type="text"
          className={styles.commitInput}
          placeholder="Commit message"
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCommit()}
        />
        <button
          className={styles.commitBtn}
          disabled={!commitMsg.trim() || loading}
          onClick={handleCommit}
        >
          <FiCheck size={14} />
          Commit
        </button>
      </div>

      <div className={styles.sectionTitle}>
        Changes ({gitStatus.files.length})
      </div>
      <div className={styles.changesList}>
        {gitStatus.files.map((f, i) => (
          <div key={i} className={styles.changeItem}>
            <span className={styles.changeStatus} style={{ color: statusColor(f.status) }}>
              {f.status}
            </span>
            <span className={styles.changePath}>{f.path}</span>
            <span className={styles.changeLabel} style={{ color: statusColor(f.status) }}>
              {statusLabel(f.status)}
            </span>
          </div>
        ))}
        {gitStatus.files.length === 0 && (
          <div className={styles.emptyHint}>No changes</div>
        )}
      </div>
    </div>
  );
}

// ---- Sidebar Container ---- //
export default function Sidebar({ panel, width, project, fileTree, gitStatus, onOpenFile, onOpenFolder, onRefresh, projectPath }) {
  const panelTitles = {
    files: 'Explorer',
    search: 'Search',
    git: 'Source Control',
  };

  return (
    <div className={styles.sidebar} style={{ width }}>
      <div className={styles.header}>
        <span className={styles.panelTitle}>{panelTitles[panel] || 'Explorer'}</span>
        <div className={styles.headerActions}>
          {panel === 'files' && (
            <>
              <button className={styles.headerBtn} onClick={onRefresh} title="Refresh">
                <FiRefreshCw size={14} />
              </button>
              <button className={styles.headerBtn} onClick={onOpenFolder} title="Open Folder">
                <FiFolderPlus size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {panel === 'files' && (
        <div className={styles.panelContent}>
          {project ? (
            <>
              <div className={styles.projectName}>{project.name}</div>
              <div className={styles.treeContainer}>
                {fileTree.map(item => (
                  <FileTreeItem key={item.path} item={item} onOpenFile={onOpenFile} />
                ))}
              </div>
            </>
          ) : (
            <div className={styles.noProject}>
              <p className={styles.noProjectText}>No folder open</p>
              <button className={styles.openFolderBtn} onClick={onOpenFolder}>
                <FiFolder size={16} />
                Open Folder
              </button>
            </div>
          )}
        </div>
      )}

      {panel === 'search' && <SearchPanel />}
      {panel === 'git' && <GitPanel gitStatus={gitStatus} projectPath={projectPath} />}
    </div>
  );
}
