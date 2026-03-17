import React, { useState, useRef } from 'react';
import styles from '../Sidebar.module.css';

export default function MiniTooltipBtn({ icon: Icon, label, onClick, size = 16 }) {
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

  const handleEnter = () => {
    setHovered(true);
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
    }
  };

  return (
    <div className={styles.miniTooltipWrap}>
      <button
        ref={btnRef}
        className={styles.miniBtn}
        onClick={onClick}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setHovered(false)}
      >
        <Icon size={size} />
      </button>
      {hovered && pos && (
        <div className={styles.miniTooltip} style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}>
          <span className={styles.miniTooltipText}>{label}</span>
        </div>
      )}
    </div>
  );
}
