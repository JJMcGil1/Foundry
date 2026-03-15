import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  FiFolder, FiChevronDown, FiSearch, FiPlus, FiCheck, FiX,
  FiExternalLink, FiRefreshCw, FiGitBranch, FiTrash2, FiGlobe,
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './ProjectControls.module.css';

/* ══════════════════════════════════════
   Workspace Dropdown Panel
   ══════════════════════════════════════ */
function WorkspacePanel({ isOpen, onClose, dropdownPos, currentProject, onSwitchWorkspace, onOpenFolder }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);

  const fetchWorkspaces = useCallback(async () => {
    const list = await window.foundry?.getWorkspaces();
    if (list) setWorkspaces(list);
  }, []);

  useEffect(() => {
    if (currentProject?.path && currentProject?.name) {
      window.foundry?.addWorkspace(currentProject.name, currentProject.path).then(list => {
        if (list) setWorkspaces(list);
      });
    }
  }, [currentProject?.path, currentProject?.name]);

  useEffect(() => {
    if (isOpen) {
      fetchWorkspaces();
      setSearch('');
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen, fetchWorkspaces]);

  const handleSwitch = async (ws) => {
    onClose();
    await window.foundry?.touchWorkspace(ws.path);
    onSwitchWorkspace(ws);
  };

  const handleRemove = async (e, wsPath) => {
    e.stopPropagation();
    const list = await window.foundry?.removeWorkspace(wsPath);
    if (list) setWorkspaces(list);
  };

  const handleNewWindow = async (projectPath) => {
    onClose();
    await window.foundry?.newWindow(projectPath || undefined);
  };

  const handleOpenInNewWindow = async (e, wsPath) => {
    e.stopPropagation();
    onClose();
    await window.foundry?.newWindow(wsPath);
  };

  const shortenPath = (p) => {
    if (!p) return '';
    return p.replace(/^\/Users\/[^/]+/, '~').replace(/^C:\\Users\\[^\\]+/, '~');
  };

  const filtered = workspaces.filter(ws => {
    if (!search) return true;
    const q = search.toLowerCase();
    return ws.name.toLowerCase().includes(q) || ws.path.toLowerCase().includes(q);
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div className={styles.overlay} onClick={onClose} />
          <motion.div
            className={styles.dropdown}
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className={styles.search}>
              <FiSearch size={13} className={styles.searchIcon} />
              <input
                ref={searchRef}
                className={styles.searchInput}
                type="text"
                placeholder="Search workspaces..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className={styles.actions}>
              <button className={styles.actionBtn} onClick={() => { onClose(); onOpenFolder(); }}>
                <FiPlus size={13} />
                Open folder...
              </button>
              <button className={styles.actionBtn} onClick={() => handleNewWindow()}>
                <FiExternalLink size={13} />
                New window
              </button>
            </div>

            <div className={styles.list}>
              {filtered.length > 0 ? (
                <>
                  <div className={styles.sectionLabel}>Workspaces</div>
                  {filtered.map((ws) => {
                    const isActive = currentProject?.path === ws.path;
                    return (
                      <button
                        key={ws.id}
                        className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
                        onClick={() => !isActive && handleSwitch(ws)}
                      >
                        <span className={styles.itemIcon}><FiFolder size={14} /></span>
                        <div className={styles.itemContent}>
                          <span className={styles.itemName}>{ws.name}</span>
                          <span className={styles.itemPath}>{shortenPath(ws.path)}</span>
                        </div>
                        {isActive && (
                          <span className={styles.itemCheck}><FiCheck size={14} /></span>
                        )}
                        {!isActive && (
                          <>
                            <button
                              className={`${styles.itemAction} ${styles.itemActionAccent}`}
                              onClick={(e) => handleOpenInNewWindow(e, ws.path)}
                              title="Open in new window"
                            >
                              <FiExternalLink size={12} />
                            </button>
                            <button
                              className={`${styles.itemAction} ${styles.itemActionDanger}`}
                              onClick={(e) => handleRemove(e, ws.path)}
                              title="Remove from workspaces"
                            >
                              <FiX size={13} />
                            </button>
                          </>
                        )}
                      </button>
                    );
                  })}
                </>
              ) : (
                <div className={styles.empty}>
                  <FiFolder size={24} className={styles.emptyIcon} />
                  {search ? 'No matching workspaces' : 'No workspaces yet'}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ══════════════════════════════════════
   Branch Dropdown Panel
   ══════════════════════════════════════ */
function BranchPanel({ isOpen, onClose, dropdownPos, projectPath, currentBranch, onBranchChanged }) {
  const [branches, setBranches] = useState({ local: [], remote: [] });
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const searchRef = useRef(null);
  const newBranchRef = useRef(null);

  const fetchBranches = useCallback(async () => {
    if (!projectPath) return;
    const result = await window.foundry?.gitListBranches(projectPath);
    if (result && !result.error) {
      setBranches({ local: result.local || [], remote: result.remote || [] });
    }
  }, [projectPath]);

  useEffect(() => {
    if (isOpen) {
      fetchBranches();
      setSearch('');
      setCreating(false);
      setNewBranchName('');
      setError('');
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen, fetchBranches]);

  const handleCheckout = async (branchName) => {
    setLoading(true);
    setError('');
    const result = await window.foundry?.gitCheckout(projectPath, branchName);
    if (result?.error) { setError('Checkout failed. Stash or commit changes first.'); setLoading(false); return; }
    setLoading(false);
    onClose();
    onBranchChanged?.();
  };

  const handleCheckoutRemote = async (remoteBranch) => {
    setLoading(true);
    setError('');
    const result = await window.foundry?.gitCheckoutRemoteBranch(projectPath, remoteBranch);
    if (result?.error) { setError('Failed to checkout remote branch.'); setLoading(false); return; }
    setLoading(false);
    onClose();
    onBranchChanged?.();
  };

  const handleCreate = async () => {
    const name = newBranchName.trim();
    if (!name) return;
    setLoading(true);
    setError('');
    const result = await window.foundry?.gitCreateBranch(projectPath, name, true);
    if (result?.error) { setError(result.error.includes('already exists') ? 'Branch already exists.' : 'Failed to create branch.'); setLoading(false); return; }
    setLoading(false);
    onClose();
    setCreating(false);
    setNewBranchName('');
    onBranchChanged?.();
  };

  const handleDelete = async (e, branchName) => {
    e.stopPropagation();
    if (branchName === currentBranch) return;
    const result = await window.foundry?.gitDeleteBranch(projectPath, branchName, false);
    if (result?.error) {
      const force = await window.foundry?.gitDeleteBranch(projectPath, branchName, true);
      if (force?.error) { setError('Cannot delete branch.'); return; }
    }
    fetchBranches();
  };

  const lowerSearch = search.toLowerCase();
  const filteredLocal = branches.local.filter(b => b.name.toLowerCase().includes(lowerSearch));
  const filteredRemote = branches.remote.filter(b => b.shortName.toLowerCase().includes(lowerSearch));

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div className={styles.overlay} onClick={onClose} />
          <motion.div
            className={styles.dropdown}
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className={styles.search}>
              <FiSearch size={12} className={styles.searchIcon} />
              <input
                ref={searchRef}
                type="text"
                className={styles.searchInput}
                placeholder="Select a branch or tag to checkout..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filteredLocal.length === 0 && filteredRemote.length === 0 && search.trim()) {
                    setCreating(true);
                    setNewBranchName(search.trim());
                    setTimeout(() => newBranchRef.current?.focus(), 50);
                  }
                }}
              />
            </div>

            {error && <div className={styles.error}>{error}</div>}

            {!creating && (
              <button className={styles.actionBtn} style={{ width: '100%', padding: '7px 10px', borderBottom: '1px solid var(--border)', borderRadius: 0 }} onClick={() => {
                setCreating(true);
                setNewBranchName(search.trim());
                setTimeout(() => newBranchRef.current?.focus(), 50);
              }}>
                <FiPlus size={12} />
                <span>Create new branch{search.trim() ? `: ${search.trim()}` : ''}</span>
              </button>
            )}

            {creating && (
              <div className={styles.createForm}>
                <input
                  ref={newBranchRef}
                  type="text"
                  className={styles.createInput}
                  placeholder="new-branch-name"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value.replace(/\s/g, '-'))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') { setCreating(false); setNewBranchName(''); }
                  }}
                />
                <button className={styles.createConfirm} onClick={handleCreate} disabled={!newBranchName.trim() || loading}>
                  {loading ? <FiRefreshCw size={11} className={styles.spinning} /> : <FiCheck size={11} />}
                </button>
                <button className={styles.createCancel} onClick={() => { setCreating(false); setNewBranchName(''); }}>
                  <FiX size={11} />
                </button>
              </div>
            )}

            <div className={styles.list}>
              {filteredLocal.map(b => (
                <button
                  key={b.name}
                  className={`${styles.branchItem} ${b.current ? styles.branchItemCurrent : ''}`}
                  onClick={() => !b.current && handleCheckout(b.name)}
                  disabled={loading}
                >
                  <FiGitBranch size={13} className={styles.branchItemIcon} />
                  <div className={styles.branchItemContent}>
                    <div className={styles.branchItemRow}>
                      <span className={styles.branchItemName}>{b.name}</span>
                      {b.date && <span className={styles.branchItemDate}>{b.date}</span>}
                    </div>
                    {b.author && (
                      <div className={styles.branchItemMeta}>
                        {b.author}{b.hash ? ` \u2022 ${b.hash}` : ''}{b.message ? ` \u2022 ${b.message}` : ''}
                      </div>
                    )}
                  </div>
                  {b.current && <FiCheck size={12} className={styles.branchItemCheck} />}
                  {!b.current && b.name !== 'main' && b.name !== 'master' && (
                    <button className={styles.branchItemDelete} onClick={(e) => handleDelete(e, b.name)} title="Delete branch">
                      <FiTrash2 size={11} />
                    </button>
                  )}
                </button>
              ))}

              {filteredRemote.length > 0 && (
                <>
                  <div className={styles.sectionLabel}>Remote</div>
                  {filteredRemote.map(b => (
                    <button key={b.name} className={styles.branchItem} onClick={() => handleCheckoutRemote(b.name)} disabled={loading}>
                      <FiGlobe size={13} className={styles.branchItemIcon} />
                      <div className={styles.branchItemContent}>
                        <div className={styles.branchItemRow}>
                          <span className={styles.branchItemName}>{b.shortName}</span>
                          {b.date && <span className={styles.branchItemDate}>{b.date}</span>}
                        </div>
                        {b.author && (
                          <div className={styles.branchItemMeta}>
                            {b.author}{b.hash ? ` \u2022 ${b.hash}` : ''}{b.message ? ` \u2022 ${b.message}` : ''}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </>
              )}

              {filteredLocal.length === 0 && filteredRemote.length === 0 && search && (
                <div className={styles.empty}>No branches match "{search}"</div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ══════════════════════════════════════
   ProjectControls — unified pill
   ══════════════════════════════════════ */
export default function ProjectControls({
  currentProject,
  onSwitchWorkspace,
  onOpenFolder,
  gitStatus,
  projectPath,
  onRefresh,
}) {
  const [wsOpen, setWsOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncHovered, setSyncHovered] = useState(false);
  const [wsDropdownPos, setWsDropdownPos] = useState({ top: 0, left: 0 });
  const [branchDropdownPos, setBranchDropdownPos] = useState({ top: 0, left: 0 });
  const pillRef = useRef(null);
  const wsRef = useRef(null);
  const branchRef = useRef(null);

  // Escape closes any open panel
  useEffect(() => {
    if (!wsOpen && !branchOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') { setWsOpen(false); setBranchOpen(false); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [wsOpen, branchOpen]);

  const openWorkspaceDropdown = () => {
    if (branchOpen) setBranchOpen(false);
    if (!wsOpen && wsRef.current) {
      const rect = wsRef.current.getBoundingClientRect();
      setWsDropdownPos({ top: rect.bottom + 6, left: rect.left });
    }
    setWsOpen(v => !v);
  };

  const openBranchDropdown = () => {
    if (wsOpen) setWsOpen(false);
    if (!branchOpen && pillRef.current) {
      const pillRect = pillRef.current.getBoundingClientRect();
      setBranchDropdownPos({ top: pillRect.bottom + 6, left: Math.max(8, pillRect.right - 320) });
    }
    setBranchOpen(v => !v);
  };

  const handleSync = async (e) => {
    e.stopPropagation();
    if (syncing) return;
    setSyncing(true);
    try {
      await window.foundry?.gitPull(projectPath);
      await window.foundry?.gitPush(projectPath);
      onRefresh?.();
    } catch (err) {
      console.error('Sync failed:', err);
    }
    setSyncing(false);
  };

  const isRepo = gitStatus?.isRepo;
  const behind = gitStatus?.behind || 0;
  const ahead = gitStatus?.ahead || 0;
  const totalUpdates = behind + ahead;
  const displayName = currentProject?.name || 'No workspace';

  return (
    <>
      <div ref={pillRef} className={styles.pill}>
        {/* ── Workspace segment ── */}
        <button
          ref={wsRef}
          className={`${styles.segment} ${wsOpen ? styles.segmentOpen : ''}`}
          onClick={openWorkspaceDropdown}
          style={{ borderRadius: !isRepo ? '7px' : '7px 0 0 7px' }}
        >
          <span className={styles.segmentIcon}><FiFolder size={13} /></span>
          <span className={styles.segmentName}>{displayName}</span>
          <motion.span
            className={styles.segmentChevron}
            animate={{ rotate: wsOpen ? 180 : 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <FiChevronDown size={11} />
          </motion.span>
        </button>

        {/* ── Branch + Sync segment (only when in a git repo) ── */}
        {isRepo && (
          <>
            <div className={styles.segmentDivider} />
            <button
              ref={branchRef}
              className={`${styles.segment} ${branchOpen ? styles.segmentOpen : ''}`}
              onClick={openBranchDropdown}
              style={{ paddingRight: '6px' }}
            >
              <span className={styles.segmentIcon}><FiGitBranch size={12} /></span>
              <span className={styles.segmentName}>{gitStatus.branch || 'HEAD'}</span>
              <motion.span
                className={styles.segmentChevron}
                animate={{ rotate: branchOpen ? 180 : 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                <FiChevronDown size={11} />
              </motion.span>
            </button>
            <button
              className={`${styles.syncIcon} ${syncing ? styles.syncIconActive : ''}`}
              onClick={handleSync}
              disabled={syncing}
              onMouseEnter={() => setSyncHovered(true)}
              onMouseLeave={() => setSyncHovered(false)}
              title={syncing ? 'Syncing...' : totalUpdates > 0
                ? `Sync — ${behind > 0 ? `${behind}\u2193 behind` : ''}${behind > 0 && ahead > 0 ? ' \u00B7 ' : ''}${ahead > 0 ? `${ahead}\u2191 ahead` : ''}`
                : 'Sync'}
            >
              <FiRefreshCw size={12} className={syncing ? styles.syncSpinning : ''} />
              {totalUpdates > 0 && !syncing && (
                <span className={styles.syncDot} />
              )}
              {syncHovered && !syncing && totalUpdates > 0 && (
                <div className={styles.tooltip}>
                  <span className={styles.tooltipText}>
                    {behind > 0 ? `${behind}\u2193 behind` : ''}{behind > 0 && ahead > 0 ? ' \u00B7 ' : ''}{ahead > 0 ? `${ahead}\u2191 ahead` : ''}
                  </span>
                </div>
              )}
            </button>
          </>
        )}
      </div>

      {/* ── Workspace dropdown ── */}
      <WorkspacePanel
        isOpen={wsOpen}
        onClose={() => setWsOpen(false)}
        dropdownPos={wsDropdownPos}
        currentProject={currentProject}
        onSwitchWorkspace={onSwitchWorkspace}
        onOpenFolder={onOpenFolder}
      />

      {/* ── Branch dropdown ── */}
      <BranchPanel
        isOpen={branchOpen}
        onClose={() => setBranchOpen(false)}
        dropdownPos={branchDropdownPos}
        projectPath={projectPath}
        currentBranch={gitStatus?.branch}
        onBranchChanged={onRefresh}
      />
    </>
  );
}
