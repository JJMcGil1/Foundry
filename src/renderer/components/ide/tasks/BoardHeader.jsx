import React, { useState } from 'react';
import { MdTaskAlt } from 'react-icons/md';
import { FiPlus, FiX, FiSearch, FiSettings, FiChevronDown, FiTrash2 } from 'react-icons/fi';
import { genId } from './utils';
import styles from '../TasksPage.module.css';

export default function BoardHeader({
  boards,
  activeBoard,
  totalCount,
  searchQuery,
  onSearchChange,
  onAddTask,
  onClose,
  onSelectBoard,
  onCreateBoard,
  onDeleteBoard,
  onOpenSettings,
  workspacePath,
}) {
  const [showBoardMenu, setShowBoardMenu] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');

  const handleCreateBoard = async () => {
    const name = newBoardName.trim();
    if (!name) return;
    await onCreateBoard({ id: genId('board'), name, workspacePath: workspacePath || null });
    setNewBoardName('');
  };

  return (
    <div className={styles.header}>
      <div className={styles.headerTop}>
        <div className={styles.headerLeft}>
          <MdTaskAlt size={22} className={styles.headerIcon} />
          <div className={styles.boardSelector}>
            <button
              className={styles.boardSelectorBtn}
              onClick={() => setShowBoardMenu(!showBoardMenu)}
            >
              <span className={styles.headerTitle}>
                {activeBoard?.name || 'Tasks'}
              </span>
              <FiChevronDown size={14} className={styles.boardSelectorChevron} />
            </button>
            {showBoardMenu && (
              <div className={styles.boardMenu}>
                {boards.map(b => (
                  <div
                    key={b.id}
                    className={`${styles.boardMenuItem} ${b.id === activeBoard?.id ? styles.boardMenuItemActive : ''}`}
                  >
                    <button
                      className={styles.boardMenuItemBtn}
                      onClick={() => { onSelectBoard(b); setShowBoardMenu(false); }}
                    >
                      {b.name}
                    </button>
                    {boards.length > 1 && (
                      <button
                        className={styles.boardMenuItemDelete}
                        onClick={(e) => { e.stopPropagation(); onDeleteBoard(b.id); }}
                        title="Delete board"
                      >
                        <FiTrash2 size={11} />
                      </button>
                    )}
                  </div>
                ))}
                <div className={styles.boardMenuCreate}>
                  <input
                    className={styles.boardMenuInput}
                    placeholder="New board name..."
                    value={newBoardName}
                    onChange={(e) => setNewBoardName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBoard(); }}
                  />
                  <button className={styles.boardMenuCreateBtn} onClick={handleCreateBoard}>
                    <FiPlus size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
          {totalCount > 0 && <span className={styles.headerCount}>{totalCount}</span>}
        </div>
        <div className={styles.headerRight}>
          <div className={styles.searchBar}>
            <FiSearch size={14} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <button className={styles.settingsBtn} onClick={onOpenSettings} title="Board settings">
            <FiSettings size={14} />
          </button>
          <button className={styles.addBtn} onClick={() => onAddTask(null)}>
            <FiPlus size={14} />
            Add Task
          </button>
          {onClose && (
            <button className={styles.closeBtn} onClick={onClose} title="Close Tasks">
              <FiX size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
