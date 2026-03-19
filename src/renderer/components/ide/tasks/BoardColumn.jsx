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
  const isDragTarget = dragOverCol === column.id;

  return (
    <div
      className={`${styles.column} ${isDragTarget ? styles.columnDragOver : ''}`}
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
          <div className={styles.emptyColumn} onClick={() => onAddTask(column.id)} role="button" tabIndex={0}>
            <div className={styles.emptyColumnInner}>
              <div className={styles.emptyColumnIcon}>
                <FiPlus size={16} />
              </div>
              <span className={styles.emptyColumnText}>No tasks yet</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
