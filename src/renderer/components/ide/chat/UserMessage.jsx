import React from 'react';
import { FiUser } from 'react-icons/fi';
import styles from './UserMessage.module.css';

export default function UserMessage({ msg }) {
  return (
    <div className={styles.message}>
      <div className={styles.header}>
        <div className={styles.avatar}>
          <FiUser size={12} />
        </div>
        <span className={styles.role}>You</span>
        {msg.timestamp && (
          <span className={styles.time}>{msg.timestamp}</span>
        )}
      </div>
      <div className={styles.content}>{msg.content}</div>
    </div>
  );
}
