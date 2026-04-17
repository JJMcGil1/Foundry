import React, { useState, useRef, useEffect } from 'react';
import { FiSearch, FiSave, FiTrash2, FiEdit2, FiCheck, FiX, FiRefreshCw, FiLayout } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../ProjectControls.module.css';

function formatRelativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function LayoutsPanel({
  isOpen,
  onClose,
  dropdownPos,
  layouts,
  onApply,
  onSaveNew,
  onOverwrite,
  onRename,
  onDelete,
  canSave,
}) {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const searchRef = useRef(null);
  const newNameRef = useRef(null);
  const editNameRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setCreating(false);
      setNewName('');
      setEditingId(null);
      setEditName('');
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (creating) setTimeout(() => newNameRef.current?.focus(), 30);
  }, [creating]);

  useEffect(() => {
    if (editingId) setTimeout(() => editNameRef.current?.focus(), 30);
  }, [editingId]);

  const filtered = (layouts || []).filter(l => {
    if (!search) return true;
    return l.name.toLowerCase().includes(search.toLowerCase());
  });

  const handleApply = (layout) => {
    onClose();
    onApply(layout);
  };

  const handleCommitNew = () => {
    const name = newName.trim();
    if (!name) return;
    onSaveNew(name);
    setCreating(false);
    setNewName('');
  };

  const handleCommitRename = (id) => {
    const name = editName.trim();
    if (!name) { setEditingId(null); return; }
    onRename(id, name);
    setEditingId(null);
    setEditName('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div className={styles.overlay} onClick={onClose} />
          <motion.div
            className={styles.dropdown}
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {creating ? (
              <div className={styles.createForm}>
                <input
                  ref={newNameRef}
                  className={styles.createInput}
                  type="text"
                  placeholder="Layout name..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCommitNew();
                    if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                  }}
                />
                <button
                  className={styles.createConfirm}
                  onClick={handleCommitNew}
                  disabled={!newName.trim()}
                  title="Save layout"
                >
                  <FiCheck size={14} />
                </button>
                <button
                  className={styles.createCancel}
                  onClick={() => { setCreating(false); setNewName(''); }}
                  title="Cancel"
                >
                  <FiX size={14} />
                </button>
              </div>
            ) : (
              <div className={styles.search}>
                <FiSearch size={13} className={styles.searchIcon} />
                <input
                  ref={searchRef}
                  className={styles.searchInput}
                  type="text"
                  placeholder="Search layouts..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filtered.length > 0) handleApply(filtered[0]);
                  }}
                />
              </div>
            )}

            {!creating && (
              <div className={styles.actions}>
                <button
                  className={styles.actionBtn}
                  onClick={() => { setCreating(true); setNewName(''); }}
                  disabled={!canSave}
                  title="Save current arrangement as a new layout"
                >
                  <FiSave size={13} />
                  <span>Save Current Layout</span>
                </button>
              </div>
            )}

            <div className={styles.list}>
              {filtered.length > 0 ? (
                <>
                  <div className={styles.sectionLabel}>Saved Layouts</div>
                  {filtered.map((layout) => {
                    const isEditing = editingId === layout.id;
                    return (
                      <div
                        key={layout.id}
                        className={styles.item}
                        onClick={() => { if (!isEditing) handleApply(layout); }}
                        role="button"
                        tabIndex={0}
                      >
                        <span className={styles.itemIcon}><FiLayout size={13} /></span>
                        <div className={styles.itemContent}>
                          {isEditing ? (
                            <input
                              ref={editNameRef}
                              className={styles.createInput}
                              style={{ padding: '4px 8px', fontSize: '12.5px' }}
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') handleCommitRename(layout.id);
                                if (e.key === 'Escape') { setEditingId(null); setEditName(''); }
                              }}
                            />
                          ) : (
                            <>
                              <span className={styles.itemName}>{layout.name}</span>
                              <span className={styles.itemPath}>
                                {(layout.panels?.length || 0)} panel{(layout.panels?.length || 0) === 1 ? '' : 's'}
                                {' · '}
                                {formatRelativeTime(layout.updatedAt || layout.createdAt)}
                              </span>
                            </>
                          )}
                        </div>
                        {isEditing ? (
                          <>
                            <button
                              className={`${styles.itemAction} ${styles.itemActionAccent}`}
                              style={{ display: 'flex' }}
                              onClick={(e) => { e.stopPropagation(); handleCommitRename(layout.id); }}
                              title="Save name"
                            >
                              <FiCheck size={13} />
                            </button>
                            <button
                              className={styles.itemAction}
                              style={{ display: 'flex' }}
                              onClick={(e) => { e.stopPropagation(); setEditingId(null); setEditName(''); }}
                              title="Cancel"
                            >
                              <FiX size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className={`${styles.itemAction} ${styles.itemActionAccent}`}
                              onClick={(e) => { e.stopPropagation(); onOverwrite(layout.id); }}
                              title="Update with current arrangement"
                            >
                              <FiRefreshCw size={12} />
                            </button>
                            <button
                              className={`${styles.itemAction} ${styles.itemActionAccent}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingId(layout.id);
                                setEditName(layout.name);
                              }}
                              title="Rename"
                            >
                              <FiEdit2 size={12} />
                            </button>
                            <button
                              className={`${styles.itemAction} ${styles.itemActionDanger}`}
                              onClick={(e) => { e.stopPropagation(); onDelete(layout.id); }}
                              title="Delete"
                            >
                              <FiTrash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className={styles.empty}>
                  <FiLayout size={24} className={styles.emptyIcon} />
                  {search ? 'No matching layouts' : 'No saved layouts yet'}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
