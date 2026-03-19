import styles from '../TasksPage.module.css';

export function genId(prefix = 'task') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function priorityClass(p) {
  if (p === 'low') return styles.priorityLow;
  if (p === 'high') return styles.priorityHigh;
  if (p === 'urgent') return styles.priorityUrgent;
  return styles.priorityMedium;
}
