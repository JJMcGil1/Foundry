import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MdTaskAlt } from 'react-icons/md';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiSearch } from 'react-icons/fi';
import styles from '../TasksPage.module.css';

const COLUMNS = [
  { id: 'todo', label: 'To Do', color: '#a78bfa' },
  { id: 'in_progress', label: 'In Progress', color: '#fbbf24' },
  { id: 'review', label: 'Review', color: '#38bdf8' },
  { id: 'done', label: 'Done', color: '#34d399' },
];

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const COLORS = ['#f87171', '#fb923c', '#fbbf24', '#34d399', '#38bdf8', '#a78bfa', '#f472b6', '#94a3b8'];

function genId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function priorityClass(p) {
  if (p === 'low') return styles.priorityLow;
  if (p === 'high') return styles.priorityHigh;
  if (p === 'urgent') return styles.priorityUrgent;
  return styles.priorityMedium;
}

export default function TasksPage({ workspacePath }) {
  const [tasks, setTasks] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [addingTo, setAddingTo] = useState(null); // column id
  const [editTask, setEditTask] = useState(null); // task object being edited
  const [dragTask, setDragTask] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  // Inline add form state
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const titleInputRef = useRef(null);

  // Edit modal state
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPriority, setEditPriority] = useState('medium');
  const [editColor, setEditColor] = useState(null);
  const [editStatus, setEditStatus] = useState('todo');

  const loadTasks = useCallback(async () => {
    try {
      const result = await window.foundry?.tasksGetAll(workspacePath || null);
      if (Array.isArray(result)) setTasks(result);
    } catch (err) {
      console.error('[TasksPage] Failed to load tasks:', err);
    }
  }, [workspacePath]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Focus title input when adding
  useEffect(() => {
    if (addingTo && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [addingTo]);

  const handleAdd = async (columnId) => {
    if (!newTitle.trim()) return;
    try {
      const task = await window.foundry?.tasksCreate({
        id: genId(),
        title: newTitle.trim(),
        description: newDesc.trim() || null,
        status: columnId,
        priority: 'medium',
        color: null,
        workspacePath: workspacePath || null,
      });
      if (task) {
        setTasks(prev => [...prev, task]);
        setNewTitle('');
        setNewDesc('');
        setAddingTo(null);
      }
    } catch (err) {
      console.error('[TasksPage] Failed to create task:', err);
    }
  };

  const handleDelete = async (taskId) => {
    try {
      await window.foundry?.tasksDelete(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      console.error('[TasksPage] Failed to delete task:', err);
    }
  };

  const openEdit = (task) => {
    setEditTask(task);
    setEditTitle(task.title);
    setEditDesc(task.description || '');
    setEditPriority(task.priority || 'medium');
    setEditColor(task.color || null);
    setEditStatus(task.status);
  };

  const handleEditSave = async () => {
    if (!editTask || !editTitle.trim()) return;
    try {
      const updated = await window.foundry?.tasksUpdate(editTask.id, {
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        priority: editPriority,
        color: editColor,
        status: editStatus,
      });
      if (updated) {
        setTasks(prev => prev.map(t => t.id === editTask.id ? { ...t, ...updated } : t));
        setEditTask(null);
      }
    } catch (err) {
      console.error('[TasksPage] Failed to update task:', err);
    }
  };

  // Drag and drop
  const handleDragStart = (e, task) => {
    setDragTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(columnId);
  };

  const handleDragLeave = () => {
    setDragOverCol(null);
  };

  const handleDrop = async (e, columnId) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!dragTask) return;

    if (dragTask.status === columnId) {
      setDragTask(null);
      return;
    }

    // Optimistic update
    const updatedTasks = tasks.map(t =>
      t.id === dragTask.id ? { ...t, status: columnId } : t
    );
    setTasks(updatedTasks);

    // Persist
    try {
      await window.foundry?.tasksUpdate(dragTask.id, { status: columnId });
    } catch (err) {
      console.error('[TasksPage] Failed to update task status:', err);
    }
    setDragTask(null);
  };

  const handleDragEnd = () => {
    setDragTask(null);
    setDragOverCol(null);
  };

  const totalCount = tasks.length;

  const filteredTasks = searchQuery.trim()
    ? tasks.filter(t => {
        const q = searchQuery.toLowerCase();
        return (t.title && t.title.toLowerCase().includes(q)) ||
               (t.description && t.description.toLowerCase().includes(q));
      })
    : tasks;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.headerLeft}>
            <MdTaskAlt size={22} className={styles.headerIcon} />
            <span className={styles.headerTitle}>Tasks</span>
            {totalCount > 0 && <span className={styles.headerCount}>{totalCount}</span>}
          </div>
          <div className={styles.headerRight}>
            <div className={styles.searchBar}>
              <FiSearch size={14} className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className={styles.addBtn} onClick={() => setAddingTo('todo')}>
              <FiPlus size={14} />
              Add Task
            </button>
          </div>
        </div>
      </div>

      <div className={styles.board}>
        {COLUMNS.map(col => {
          const colTasks = filteredTasks.filter(t => t.status === col.id);
          return (
            <div
              key={col.id}
              className={`${styles.column} ${dragOverCol === col.id ? styles.columnDragOver : ''}`}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
            >
              <div className={styles.columnHeader}>
                <div className={styles.columnHeaderLeft}>
                  <span className={styles.columnDot} style={{ background: col.color }} />
                  <span className={styles.columnTitle}>{col.label}</span>
                  <span className={styles.columnCount}>{colTasks.length}</span>
                </div>
                <button className={styles.columnAddBtn} onClick={() => { setAddingTo(col.id); setNewTitle(''); setNewDesc(''); }}>
                  <FiPlus size={14} />
                </button>
              </div>

              <div className={styles.cards}>
                {addingTo === col.id && (
                  <div className={styles.inlineForm}>
                    <input
                      ref={titleInputRef}
                      className={styles.inlineInput}
                      placeholder="Task title..."
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAdd(col.id);
                        if (e.key === 'Escape') setAddingTo(null);
                      }}
                    />
                    <textarea
                      className={styles.inlineTextarea}
                      placeholder="Description (optional)"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      rows={2}
                    />
                    <div className={styles.inlineActions}>
                      <button className={styles.inlineSubmit} onClick={() => handleAdd(col.id)}>Add</button>
                      <button className={styles.inlineCancel} onClick={() => setAddingTo(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                {colTasks.map(task => (
                  <div
                    key={task.id}
                    className={`${styles.card} ${dragTask?.id === task.id ? styles.cardDragging : ''}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task)}
                    onDragEnd={handleDragEnd}
                  >
                    {task.color && <div className={styles.cardColorBar} style={{ background: task.color }} />}
                    <div className={styles.cardTitle}>{task.title}</div>
                    {task.description && <div className={styles.cardDesc}>{task.description}</div>}
                    <div className={styles.cardFooter}>
                      <span className={`${styles.cardPriority} ${priorityClass(task.priority)}`}>
                        {task.priority || 'medium'}
                      </span>
                      <div className={styles.cardActions}>
                        <button className={styles.cardActionBtn} onClick={() => openEdit(task)} title="Edit">
                          <FiEdit2 size={12} />
                        </button>
                        <button className={`${styles.cardActionBtn} ${styles.cardActionBtnDanger}`} onClick={() => handleDelete(task.id)} title="Delete">
                          <FiTrash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {colTasks.length === 0 && addingTo !== col.id && (
                  <div className={styles.cardsEmpty}>No tasks</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editTask && (
        <div className={styles.modalBackdrop} onClick={() => setEditTask(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Edit Task</span>
              <button className={styles.modalCloseBtn} onClick={() => setEditTask(null)}>
                <FiX size={16} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Title</label>
                <input
                  className={styles.modalInput}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(); }}
                />
              </div>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Description</label>
                <textarea
                  className={styles.modalTextarea}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                />
              </div>
              <div className={styles.modalRow}>
                <div className={styles.modalField} style={{ flex: 1 }}>
                  <label className={styles.modalLabel}>Status</label>
                  <select className={styles.modalSelect} value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                    {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div className={styles.modalField} style={{ flex: 1 }}>
                  <label className={styles.modalLabel}>Priority</label>
                  <select className={styles.modalSelect} value={editPriority} onChange={(e) => setEditPriority(e.target.value)}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Color Label</label>
                <div className={styles.colorPicker}>
                  <button
                    className={`${styles.colorSwatch} ${styles.colorSwatchNone} ${editColor === null ? styles.colorSwatchActive : ''}`}
                    onClick={() => setEditColor(null)}
                    title="No color"
                  >
                    <FiX size={10} />
                  </button>
                  {COLORS.map(c => (
                    <button
                      key={c}
                      className={`${styles.colorSwatch} ${editColor === c ? styles.colorSwatchActive : ''}`}
                      style={{ background: c }}
                      onClick={() => setEditColor(c)}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.modalCancelBtn} onClick={() => setEditTask(null)}>Cancel</button>
              <button className={styles.modalSaveBtn} onClick={handleEditSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
