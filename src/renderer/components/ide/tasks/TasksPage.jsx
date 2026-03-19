import React, { useState, useEffect, useCallback } from 'react';
import BoardHeader from './BoardHeader';
import BoardColumn from './BoardColumn';
import TaskSidePanel from './TaskSidePanel';
import BoardSettings from './BoardSettings';
import { genId } from './utils';
import styles from '../TasksPage.module.css';

export default function TasksPage({ workspacePath, onClose }) {
  const [boards, setBoards] = useState([]);
  const [activeBoard, setActiveBoard] = useState(null);
  const [columns, setColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dragTask, setDragTask] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  // Side panel state
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelTask, setSidePanelTask] = useState(null); // null = new task
  const [sidePanelDefaultStatus, setSidePanelDefaultStatus] = useState(null);

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);

  // ---- Load boards ---- //
  const loadBoards = useCallback(async () => {
    try {
      const result = await window.foundry?.boardsGetAll(workspacePath || null);
      if (Array.isArray(result) && result.length > 0) {
        setBoards(result);
        // Select first board if none active
        setActiveBoard(prev => {
          if (prev && result.find(b => b.id === prev.id)) return prev;
          return result[0];
        });
      } else {
        // Create a default board if none exist
        const board = await window.foundry?.boardsCreate({
          id: genId('board'),
          name: 'Default Board',
          workspacePath: workspacePath || null,
        });
        if (board) {
          setBoards([board]);
          setActiveBoard(board);
        }
      }
    } catch (err) {
      console.error('[TasksPage] Failed to load boards:', err);
    }
  }, [workspacePath]);

  // ---- Load columns for active board ---- //
  const loadColumns = useCallback(async () => {
    if (!activeBoard) return;
    try {
      const result = await window.foundry?.boardColumnsGetAll(activeBoard.id);
      if (Array.isArray(result)) setColumns(result);
    } catch (err) {
      console.error('[TasksPage] Failed to load columns:', err);
    }
  }, [activeBoard]);

  // ---- Load tasks ---- //
  const loadTasks = useCallback(async () => {
    try {
      const result = await window.foundry?.tasksGetAll(workspacePath || null);
      if (Array.isArray(result)) {
        // Filter tasks for active board
        if (activeBoard) {
          setTasks(result.filter(t => t.board_id === activeBoard.id));
        } else {
          setTasks(result);
        }
      }
    } catch (err) {
      console.error('[TasksPage] Failed to load tasks:', err);
    }
  }, [workspacePath, activeBoard]);

  useEffect(() => { loadBoards(); }, [loadBoards]);
  useEffect(() => { loadColumns(); }, [loadColumns]);
  useEffect(() => { loadTasks(); }, [loadTasks]);

  // ---- Board CRUD ---- //
  const handleCreateBoard = async (data) => {
    try {
      const board = await window.foundry?.boardsCreate(data);
      if (board) {
        setBoards(prev => [...prev, board]);
        setActiveBoard(board);
      }
    } catch (err) {
      console.error('[TasksPage] Failed to create board:', err);
    }
  };

  const handleDeleteBoard = async (boardId) => {
    try {
      await window.foundry?.boardsDelete(boardId);
      setBoards(prev => {
        const next = prev.filter(b => b.id !== boardId);
        if (activeBoard?.id === boardId && next.length > 0) {
          setActiveBoard(next[0]);
        }
        return next;
      });
    } catch (err) {
      console.error('[TasksPage] Failed to delete board:', err);
    }
  };

  // ---- Column CRUD ---- //
  const handleAddColumn = async (data) => {
    try {
      const col = await window.foundry?.boardColumnsCreate(data);
      if (col) setColumns(prev => [...prev, col]);
    } catch (err) {
      console.error('[TasksPage] Failed to create column:', err);
    }
  };

  const handleUpdateColumn = async (id, updates) => {
    try {
      const col = await window.foundry?.boardColumnsUpdate(id, updates);
      if (col) setColumns(prev => prev.map(c => c.id === id ? { ...c, ...col } : c));
    } catch (err) {
      console.error('[TasksPage] Failed to update column:', err);
    }
  };

  const handleDeleteColumn = async (id) => {
    try {
      await window.foundry?.boardColumnsDelete(id);
      setColumns(prev => prev.filter(c => c.id !== id));
      setTasks(prev => prev.filter(t => t.status !== id));
    } catch (err) {
      console.error('[TasksPage] Failed to delete column:', err);
    }
  };

  const handleReorderColumns = async (updates) => {
    try {
      await window.foundry?.boardColumnsReorder(updates);
      // Re-sort locally
      setColumns(prev => {
        const map = {};
        updates.forEach(u => map[u.id] = u.position);
        return [...prev].sort((a, b) => (map[a.id] ?? a.position) - (map[b.id] ?? b.position));
      });
    } catch (err) {
      console.error('[TasksPage] Failed to reorder columns:', err);
    }
  };

  // ---- Task CRUD ---- //
  const handleAddTask = (columnId) => {
    setSidePanelTask(null);
    setSidePanelDefaultStatus(columnId || (columns[0]?.id || ''));
    setSidePanelOpen(true);
  };

  const handleEditTask = (task) => {
    setSidePanelTask(task);
    setSidePanelDefaultStatus(null);
    setSidePanelOpen(true);
  };

  const handleSidePanel = async (data) => {
    if (sidePanelTask) {
      // Update existing
      try {
        const updated = await window.foundry?.tasksUpdate(sidePanelTask.id, data);
        if (updated) {
          setTasks(prev => prev.map(t => t.id === sidePanelTask.id ? { ...t, ...updated } : t));
        }
      } catch (err) {
        console.error('[TasksPage] Failed to update task:', err);
      }
    } else {
      // Create new
      try {
        const task = await window.foundry?.tasksCreate({
          id: genId('task'),
          title: data.title,
          description: data.description,
          status: data.status || sidePanelDefaultStatus || columns[0]?.id || 'todo',
          priority: data.priority,
          color: data.color,
          workspacePath: workspacePath || null,
          boardId: activeBoard?.id || null,
        });
        if (task) setTasks(prev => [...prev, task]);
      } catch (err) {
        console.error('[TasksPage] Failed to create task:', err);
      }
    }
    setSidePanelOpen(false);
    setSidePanelTask(null);
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await window.foundry?.tasksDelete(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      console.error('[TasksPage] Failed to delete task:', err);
    }
  };

  // ---- Drag and drop ---- //
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

  const handleDragLeave = () => setDragOverCol(null);

  const handleDrop = async (e, columnId) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!dragTask || dragTask.status === columnId) {
      setDragTask(null);
      return;
    }
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === dragTask.id ? { ...t, status: columnId } : t));
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

  // ---- Filtering ---- //
  const filteredTasks = searchQuery.trim()
    ? tasks.filter(t => {
        const q = searchQuery.toLowerCase();
        return (t.title && t.title.toLowerCase().includes(q)) ||
               (t.description && t.description.toLowerCase().includes(q));
      })
    : tasks;

  return (
    <div className={styles.root}>
      <BoardHeader
        boards={boards}
        activeBoard={activeBoard}
        totalCount={tasks.length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAddTask={handleAddTask}
        onClose={onClose}
        onSelectBoard={setActiveBoard}
        onCreateBoard={handleCreateBoard}
        onDeleteBoard={handleDeleteBoard}
        onOpenSettings={() => setShowSettings(true)}
        workspacePath={workspacePath}
      />

      <div className={styles.boardContainer}>
        <div className={`${styles.board} ${sidePanelOpen ? styles.boardWithPanel : ''}`}>
          {columns.map(col => (
            <BoardColumn
              key={col.id}
              column={col}
              tasks={filteredTasks}
              dragTask={dragTask}
              dragOverCol={dragOverCol}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onAddTask={handleAddTask}
              onEditTask={handleEditTask}
              onDeleteTask={handleDeleteTask}
            />
          ))}
        </div>

        {sidePanelOpen && (
          <TaskSidePanel
            task={sidePanelTask}
            columns={columns}
            onSave={handleSidePanel}
            onClose={() => { setSidePanelOpen(false); setSidePanelTask(null); }}
            isNew={!sidePanelTask}
          />
        )}
      </div>

      {showSettings && activeBoard && (
        <BoardSettings
          board={activeBoard}
          columns={columns}
          onClose={() => setShowSettings(false)}
          onAddColumn={handleAddColumn}
          onUpdateColumn={handleUpdateColumn}
          onDeleteColumn={handleDeleteColumn}
          onReorderColumns={handleReorderColumns}
        />
      )}
    </div>
  );
}
