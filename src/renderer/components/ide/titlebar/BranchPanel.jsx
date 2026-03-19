import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  FiSearch, FiPlus, FiCheck, FiX,
  FiRefreshCw, FiGitBranch, FiTrash2, FiGlobe,
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../ProjectControls.module.css';

export default function BranchPanel({ isOpen, onClose, dropdownPos, projectPath, currentBranch, onBranchChanged }) {
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
            initial={{ opacity: 0, scale: 0.98, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
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
