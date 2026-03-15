import React, { useState, useRef, useCallback, useEffect } from 'react';
import { FiFolder, FiChevronDown, FiSearch, FiPlus, FiCheck, FiX, FiExternalLink } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './WorkspaceDropdown.module.css';

export default function WorkspaceDropdown({ currentProject, onSwitchWorkspace, onOpenFolder }) {
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);
  const [search, setSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const searchRef = useRef(null);

  const fetchWorkspaces = useCallback(async () => {
    const list = await window.foundry?.getWorkspaces();
    if (list) setWorkspaces(list);
  }, []);

  // Register current project as a workspace whenever it changes
  useEffect(() => {
    if (currentProject?.path && currentProject?.name) {
      window.foundry?.addWorkspace(currentProject.name, currentProject.path).then(list => {
        if (list) setWorkspaces(list);
      });
    }
  }, [currentProject?.path, currentProject?.name]);

  useEffect(() => {
    if (open) {
      fetchWorkspaces();
      setSearch('');
      // Position dropdown below trigger
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom + 6, left: rect.left });
      }
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, fetchWorkspaces]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleSwitch = async (workspace) => {
    setOpen(false);
    // Touch to update last_opened
    await window.foundry?.touchWorkspace(workspace.path);
    // Switch to this workspace
    onSwitchWorkspace(workspace);
  };

  const handleRemove = async (e, wsPath) => {
    e.stopPropagation();
    const list = await window.foundry?.removeWorkspace(wsPath);
    if (list) setWorkspaces(list);
  };

  const handleAddFolder = async () => {
    setOpen(false);
    onOpenFolder();
  };

  const handleNewWindow = async (projectPath) => {
    setOpen(false);
    await window.foundry?.newWindow(projectPath || undefined);
  };

  const handleOpenInNewWindow = async (e, wsPath) => {
    e.stopPropagation();
    setOpen(false);
    await window.foundry?.newWindow(wsPath);
  };

  const filtered = workspaces.filter(ws => {
    if (!search) return true;
    const q = search.toLowerCase();
    return ws.name.toLowerCase().includes(q) || ws.path.toLowerCase().includes(q);
  });

  // Shorten path for display
  const shortenPath = (p) => {
    if (!p) return '';
    const home = typeof window !== 'undefined' ? '' : '';
    // Replace common home dir prefixes
    return p.replace(/^\/Users\/[^/]+/, '~').replace(/^C:\\Users\\[^\\]+/, '~');
  };

  const displayName = currentProject?.name || 'No workspace';

  return (
    <div className={styles.wrapper}>
      <button
        ref={triggerRef}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Switch workspace"
      >
        <span className={styles.triggerIcon}>
          <FiFolder size={13} />
        </span>
        <span className={styles.triggerName}>{displayName}</span>
        <span className={`${styles.triggerChevron} ${open ? styles.triggerChevronOpen : ''}`}>
          <FiChevronDown size={12} />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className={styles.overlay} onClick={() => setOpen(false)} />
            <motion.div
              className={styles.dropdown}
              style={{ top: dropdownPos.top, left: dropdownPos.left }}
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {/* Search */}
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

              {/* Actions */}
              <div className={styles.actions}>
                <button className={styles.actionBtn} onClick={handleAddFolder}>
                  <FiPlus size={13} />
                  Open folder...
                </button>
                <button className={styles.actionBtn} onClick={() => handleNewWindow()}>
                  <FiExternalLink size={13} />
                  New window
                </button>
              </div>

              {/* Workspace list */}
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
                          <span className={styles.itemIcon}>
                            <FiFolder size={14} />
                          </span>
                          <div className={styles.itemContent}>
                            <span className={styles.itemName}>{ws.name}</span>
                            <span className={styles.itemPath}>{shortenPath(ws.path)}</span>
                          </div>
                          {isActive && (
                            <span className={styles.itemCheck}>
                              <FiCheck size={14} />
                            </span>
                          )}
                          {!isActive && (
                            <>
                              <button
                                className={styles.itemNewWindow}
                                onClick={(e) => handleOpenInNewWindow(e, ws.path)}
                                title="Open in new window"
                              >
                                <FiExternalLink size={12} />
                              </button>
                              <button
                                className={styles.itemRemove}
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
    </div>
  );
}
