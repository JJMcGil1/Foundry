import React from 'react';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';
import { priorityClass } from './utils';
import styles from '../TasksPage.module.css';

export default function TaskCard({ task, isDragging, onDragStart, onDragEnd, onEdit, onDelete }) {
  return (
    <div
      className={`${styles.card} ${isDragging ? styles.cardDragging : ''}`}
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      onClick={() => onEdit(task)}
    >
      {task.color && <div className={styles.cardColorBar} style={{ background: task.color }} />}
      <div className={styles.cardTitle}>{task.title}</div>
      {task.description && (
        <div
          className={styles.cardDesc}
          dangerouslySetInnerHTML={{
            __html: task.description.length > 120
              ? task.description.replace(/<[^>]*>/g, '').slice(0, 120) + '...'
              : task.description.replace(/<[^>]*>/g, '').slice(0, 120),
          }}
        />
      )}
      <div className={styles.cardFooter}>
        <span className={`${styles.cardPriority} ${priorityClass(task.priority)}`}>
          {task.priority || 'medium'}
        </span>
        <div className={styles.cardActions}>
          <button
            className={styles.cardActionBtn}
            onClick={(e) => { e.stopPropagation(); onEdit(task); }}
            title="Edit"
          >
            <FiEdit2 size={12} />
          </button>
          <button
            className={`${styles.cardActionBtn} ${styles.cardActionBtnDanger}`}
            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
            title="Delete"
          >
            <FiTrash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
