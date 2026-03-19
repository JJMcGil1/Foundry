import React from 'react';
import { FiTrash2 } from 'react-icons/fi';
import styles from '../TasksPage.module.css';

const PRIORITY_CONFIG = {
  low: { label: 'Low', color: '#34d399' },
  medium: { label: 'Med', color: '#fbbf24' },
  high: { label: 'High', color: '#f87171' },
  urgent: { label: 'Urgent', color: '#f43f5e' },
};

function stripHtml(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return div.textContent.slice(0, 120);
}

export default function TaskCard({ task, isDragging, onDragStart, onDragEnd, onEdit, onDelete }) {
  const pri = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const desc = stripHtml(task.description);

  return (
    <div
      className={`${styles.card} ${isDragging ? styles.cardDragging : ''}`}
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      onClick={() => onEdit(task)}
    >
      {task.color && <div className={styles.cardAccent} style={{ background: task.color }} />}

      <div className={styles.cardBody}>
        <div className={styles.cardTitleRow}>
          <span className={styles.cardTitle}>{task.title}</span>
        </div>

        {desc && (
          <p className={styles.cardDesc}>{desc}</p>
        )}

        <div className={styles.cardMeta}>
          <span className={styles.cardPriorityPill} style={{
            color: pri.color,
            background: `${pri.color}12`,
          }}>
            <span className={styles.cardPriorityDot} style={{ background: pri.color }} />
            {pri.label}
          </span>

          <button
            className={styles.cardDeleteBtn}
            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
            title="Delete"
          >
            <FiTrash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}
