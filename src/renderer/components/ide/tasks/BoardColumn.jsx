import React from 'react';
import { FiPlus } from 'react-icons/fi';
import TaskCard from './TaskCard';
import styles from '../TasksPage.module.css';

export default function BoardColumn({
  column,
  tasks,
  dragTask,
  dragOverCol,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onDragEnd,
  onAddTask,
  onEditTask,
  onDeleteTask,
}) {
  const colTasks = tasks.filter(t => t.status === column.id);

  return (
    <div
      className={`${styles.column} ${dragOverCol === column.id ? styles.columnDragOver : ''}`}
      onDragOver={(e) => onDragOver(e, column.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, column.id)}
    >
      <div className={styles.columnHeader}>
        <div className={styles.columnHeaderLeft}>
          <span className={styles.columnDot} style={{ background: column.color }} />
          <span className={styles.columnTitle}>{column.name}</span>
          <span className={styles.columnCount}>{colTasks.length}</span>
        </div>
        <button className={styles.columnAddBtn} onClick={() => onAddTask(column.id)} title="Add task">
          <FiPlus size={14} />
        </button>
      </div>

      <div className={styles.cards}>
        {colTasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            isDragging={dragTask?.id === task.id}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onEdit={onEditTask}
            onDelete={onDeleteTask}
          />
        ))}

        {colTasks.length === 0 && (
          <div className={styles.cardsEmpty}>No tasks</div>
        )}
      </div>
    </div>
  );
}
