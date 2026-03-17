import React, { useState, useRef, useCallback, useEffect } from 'react';
import { FiFolder, FiSearch, FiPlus, FiCheck, FiX, FiExternalLink } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../ProjectControls.module.css';

export default function WorkspacePanel({ isOpen, onClose, dropdownPos, currentProject, onSwitchWorkspace, onOpenFolder }) {
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
