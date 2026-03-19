import React, { useState } from 'react';
import { FiX, FiPlus, FiTrash2, FiEdit2 } from 'react-icons/fi';
import { genId } from './utils';
import { COLORS } from './constants';
import styles from '../TasksPage.module.css';

export default function BoardSettings({ board, columns, onClose, onAddColumn, onUpdateColumn, onDeleteColumn, onReorderColumns }) {
  const [newColName, setNewColName] = useState('');
  const [newColColor, setNewColColor] = useState('#a78bfa');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const handleAddColumn = async () => {
    if (!newColName.trim()) return;
    await onAddColumn({
      id: genId('col'),
      boardId: board.id,
      name: newColName.trim(),
      color: newColColor,
    });
    setNewColName('');
    setNewColColor('#a78bfa');
  };

  const startEdit = (col) => {
    setEditingId(col.id);
    setEditName(col.name);
    setEditColor(col.color);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editingId) return;
    await onUpdateColumn(editingId, { name: editName.trim(), color: editColor });
    setEditingId(null);
  };

  const moveColumn = async (idx, direction) => {
    const newCols = [...columns];
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= newCols.length) return;
    [newCols[idx], newCols[targetIdx]] = [newCols[targetIdx], newCols[idx]];
    const updates = newCols.map((c, i) => ({ id: c.id, position: i }));
    await onReorderColumns(updates);
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.settingsModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Board Settings - {board?.name}</span>
          <button className={styles.modalCloseBtn} onClick={onClose}>
            <FiX size={16} />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Columns</label>
            <div className={styles.columnList}>
              {columns.map((col, idx) => (
                <div key={col.id} className={styles.columnListItem}>
                  {editingId === col.id ? (
                    <div className={styles.columnEditRow}>
                      <input
                        className={styles.columnEditInput}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                        autoFocus
                      />
                      <div className={styles.columnEditColors}>
                        {COLORS.map(c => (
                          <button
                            key={c}
                            className={`${styles.colorSwatchSmall} ${editColor === c ? styles.colorSwatchSmallActive : ''}`}
                            style={{ background: c }}
                            onClick={() => setEditColor(c)}
                          />
                        ))}
                      </div>
                      <div className={styles.columnEditActions}>
                        <button className={styles.inlineSubmit} onClick={handleSaveEdit}>Save</button>
                        <button className={styles.inlineCancel} onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={styles.columnListItemLeft}>
                        <span className={styles.columnDot} style={{ background: col.color }} />
                        <span className={styles.columnListItemName}>{col.name}</span>
                      </div>
                      <div className={styles.columnListItemActions}>
                        {idx > 0 && (
                          <button className={styles.columnMoveBtn} onClick={() => moveColumn(idx, -1)} title="Move up">
                            &#x25B2;
                          </button>
                        )}
                        {idx < columns.length - 1 && (
                          <button className={styles.columnMoveBtn} onClick={() => moveColumn(idx, 1)} title="Move down">
                            &#x25BC;
                          </button>
                        )}
                        <button className={styles.cardActionBtn} onClick={() => startEdit(col)} title="Edit">
                          <FiEdit2 size={12} />
                        </button>
                        {columns.length > 1 && (
                          <button
                            className={`${styles.cardActionBtn} ${styles.cardActionBtnDanger}`}
                            onClick={() => onDeleteColumn(col.id)}
                            title="Delete column"
                          >
                            <FiTrash2 size={12} />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Add Column</label>
            <div className={styles.addColumnRow}>
              <input
                className={styles.modalInput}
                placeholder="Column name..."
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddColumn(); }}
              />
              <div className={styles.addColumnColors}>
                {COLORS.map(c => (
                  <button
                    key={c}
                    className={`${styles.colorSwatchSmall} ${newColColor === c ? styles.colorSwatchSmallActive : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewColColor(c)}
                  />
                ))}
              </div>
              <button className={styles.inlineSubmit} onClick={handleAddColumn}>
                <FiPlus size={12} /> Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
