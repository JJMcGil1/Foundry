import React, { useState, useRef, useEffect } from 'react';
import { FiSearch, FiPlus } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../ProjectControls.module.css';

export default function AddPanelPanel({ isOpen, onClose, dropdownPos, items, onAddPanel }) {
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = items.filter(item => {
    if (!search) return true;
    return item.title.toLowerCase().includes(search.toLowerCase());
  });

  const handlePick = (type) => {
    onClose();
    onAddPanel(type);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div className={styles.overlay} onClick={onClose} />
          <motion.div
            className={styles.dropdown}
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className={styles.search}>
              <FiSearch size={13} className={styles.searchIcon} />
              <input
                ref={searchRef}
                className={styles.searchInput}
                type="text"
                placeholder="Search panels..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filtered.length > 0) {
                    handlePick(filtered[0].type);
                  }
                }}
              />
            </div>

            <div className={styles.list}>
              {filtered.length > 0 ? (
                <>
                  <div className={styles.sectionLabel}>Add Panel</div>
                  {filtered.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <div
                        key={item.type}
                        className={styles.item}
                        onClick={() => handlePick(item.type)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') handlePick(item.type); }}
                      >
                        <span className={styles.itemIcon}><ItemIcon size={13} /></span>
                        <div className={styles.itemContent}>
                          <span className={styles.itemName}>{item.title}</span>
                        </div>
                        <span className={styles.itemCheck}><FiPlus size={12} /></span>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className={styles.empty}>
                  <FiPlus size={24} className={styles.emptyIcon} />
                  {search ? 'No matching panels' : 'All panels open'}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
