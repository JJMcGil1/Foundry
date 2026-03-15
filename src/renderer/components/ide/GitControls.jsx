import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  FiGitBranch, FiChevronRight, FiCheck, FiX,
  FiPlus, FiRefreshCw, FiSearch, FiTrash2, FiGlobe,
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './GitControls.module.css';

/* ── Branch Selector ── */
function BranchSelector({ projectPath, currentBranch, onBranchChanged }) {
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState({ local: [], remote: [] });
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const searchRef = useRef(null);
  const newBranchRef = useRef(null);
  const triggerRef = useRef(null);

  const fetchBranches = useCallback(async () => {
    if (!projectPath) return;
    const result = await window.foundry?.gitListBranches(projectPath);
    if (result && !result.error) {
      setBranches({ local: result.local || [], remote: result.remote || [] });
    }
  }, [projectPath]);

  useEffect(() => {
    if (open) {
      fetchBranches();
      setSearch('');
      setCreating(false);
      setNewBranchName('');
      setError('');
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, fetchBranches]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleCheckout = async (branchName) => {
    setLoading(true);
    setError('');
    const result = await window.foundry?.gitCheckout(projectPath, branchName);
    if (result?.error) { setError('Checkout failed. Stash or commit changes first.'); setLoading(false); return; }
    setLoading(false);
    setOpen(false);
    onBranchChanged?.();
  };

  const handleCheckoutRemote = async (remoteBranch) => {
    setLoading(true);
    setError('');
    const result = await window.foundry?.gitCheckoutRemoteBranch(projectPath, remoteBranch);
    if (result?.error) { setError('Failed to checkout remote branch.'); setLoading(false); return; }
    setLoading(false);
    setOpen(false);
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
    setOpen(false);
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
    <div className={styles.branchSelector}>
      <button ref={triggerRef} className={styles.branchTrigger} onClick={() => {
        if (!open && triggerRef.current) {
          const rect = triggerRef.current.getBoundingClientRect();
          setDropdownPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 320) });
        }
        setOpen(!open);
      }}>
        <FiGitBranch size={12} />
        <span className={styles.branchTriggerName}>{currentBranch || 'HEAD'}</span>
        <motion.span
          className={styles.branchTriggerChevron}
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          <FiChevronRight size={10} style={{ transform: 'rotate(90deg)' }} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <>
          <motion.div
            className={styles.branchOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            className={styles.branchDropdown}
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
          >
            <div className={styles.branchSearch}>
              <FiSearch size={12} className={styles.branchSearchIcon} />
              <input
                ref={searchRef}
                type="text"
                className={styles.branchSearchInput}
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

            {error && <div className={styles.branchError}>{error}</div>}

            {!creating && (
              <button className={styles.branchCreateBtn} onClick={() => {
                setCreating(true);
                setNewBranchName(search.trim());
                setTimeout(() => newBranchRef.current?.focus(), 50);
              }}>
                <FiPlus size={12} />
                <span>Create new branch{search.trim() ? `: ${search.trim()}` : ''}</span>
              </button>
            )}

            {creating && (
              <div className={styles.branchCreateForm}>
                <input
                  ref={newBranchRef}
                  type="text"
                  className={styles.branchCreateInput}
                  placeholder="new-branch-name"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value.replace(/\s/g, '-'))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') { setCreating(false); setNewBranchName(''); }
                  }}
                />
                <button className={styles.branchCreateConfirm} onClick={handleCreate} disabled={!newBranchName.trim() || loading}>
                  {loading ? <FiRefreshCw size={11} className={styles.spinning} /> : <FiCheck size={11} />}
                </button>
                <button className={styles.branchCreateCancel} onClick={() => { setCreating(false); setNewBranchName(''); }}>
                  <FiX size={11} />
                </button>
              </div>
            )}

            <div className={styles.branchList}>
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
                <div className={styles.branchGroup}>
                  <div className={styles.branchGroupLabel}>Remote</div>
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
                </div>
              )}

              {filteredLocal.length === 0 && filteredRemote.length === 0 && search && (
                <div className={styles.branchEmpty}>No branches match "{search}"</div>
              )}
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Git Controls (titlebar pill: branch + sync) ── */
export default function GitControls({ gitStatus, projectPath, onRefresh }) {
  const [syncing, setSyncing] = useState(false);
  const [hovered, setHovered] = useState(false);

  if (!gitStatus?.isRepo) return null;

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

  const behind = gitStatus.behind || 0;
  const ahead = gitStatus.ahead || 0;
  const totalUpdates = behind + ahead;

  return (
    <div className={styles.controls}>
      <BranchSelector
        projectPath={projectPath}
        currentBranch={gitStatus.branch}
        onBranchChanged={onRefresh}
      />
      <div
        className={styles.syncWrap}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button
          className={`${styles.syncBtn} ${syncing ? styles.syncBtnActive : ''}`}
          onClick={handleSync}
          disabled={syncing}
        >
          <FiRefreshCw size={12} className={syncing ? styles.syncSpinning : ''} />
          <span className={styles.syncLabel}>{syncing ? 'Syncing' : 'Sync'}</span>
          {totalUpdates > 0 && !syncing && (
            <span className={styles.syncBadge}>{totalUpdates}</span>
          )}
        </button>
        {hovered && !syncing && totalUpdates > 0 && (
          <div className={styles.tooltip}>
            <span className={styles.tooltipText}>
              {behind > 0 ? `${behind}\u2193 behind` : ''}{behind > 0 && ahead > 0 ? ' \u00B7 ' : ''}{ahead > 0 ? `${ahead}\u2191 ahead` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
