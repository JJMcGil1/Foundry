import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiFolder, FiFolderPlus, FiGitBranch, FiTerminal, FiArrowRight } from 'react-icons/fi';
import FoundryLogo from './FoundryLogo';
import styles from './WelcomeScreen.module.css';

/* ---- Animation ---- */
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
};
const fade = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const actions = [
  { icon: FiFolder,     label: 'Open Project',    kbd: '⌘ O',   desc: 'Open an existing folder' },
  { icon: FiFolderPlus, label: 'New Project',      kbd: '⌘ ⇧ N', desc: 'Start from scratch' },
  { icon: FiGitBranch,  label: 'Clone Repo',       kbd: '⌘ ⇧ G', desc: 'Clone from a URL' },
  { icon: FiTerminal,   label: 'Terminal',          kbd: '⌘ `',   desc: 'Open integrated terminal' },
];

export default function WelcomeScreen() {
  const [hovered, setHovered] = useState(null);

  return (
    <div className={styles.root}>
      <div className={styles.ambientOrb1} />
      <div className={styles.ambientOrb2} />

      <div className={`${styles.titlebar} titlebar-drag`} />

      <motion.div
        className={styles.center}
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Logo */}
        <motion.div variants={fade} style={{ display: 'inline-flex', marginBottom: 32 }}>
          <FoundryLogo size={40} />
        </motion.div>

        {/* Heading */}
        <motion.h1 className={styles.heading} variants={fade}>
          Get Started
        </motion.h1>

        {/* Actions grid */}
        <motion.div className={styles.grid} variants={fade}>
          {actions.map((action, i) => {
            const Icon = action.icon;
            return (
              <motion.button
                key={action.label}
                className={styles.card}
                variants={fade}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                whileTap={{ scale: 0.97 }}
              >
                <div className={styles.cardIcon}>
                  <Icon size={20} />
                </div>
                <div className={styles.cardBody}>
                  <span className={styles.cardLabel}>{action.label}</span>
                  <span className={styles.cardDesc}>{action.desc}</span>
                </div>
                <FiArrowRight
                  size={14}
                  className={styles.cardArrow}
                  style={{ opacity: hovered === i ? 1 : 0 }}
                />
              </motion.button>
            );
          })}
        </motion.div>

        {/* Shortcut hint */}
        <motion.p className={styles.hint} variants={fade}>
          <kbd className={styles.kbd}>⌘ K</kbd>
          <span>to open command palette</span>
        </motion.p>
      </motion.div>
    </div>
  );
}
