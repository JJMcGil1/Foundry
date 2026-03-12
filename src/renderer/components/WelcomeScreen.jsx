import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  FolderOpen,
  FolderPlus,
  GitBranch,
  Terminal,
  Sparkles,
  ArrowRight,
  Clock,
  ExternalLink,
  BookOpen,
  Settings,
  Keyboard,
} from 'lucide-react';
import FoundryLogo from './FoundryLogo';
import styles from './WelcomeScreen.module.css';

/* ---- Stagger helpers ---- */
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.3 } },
};
const item = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] } },
};

/* ---- Mock recent projects ---- */
const recentProjects = [
  { name: 'foundry-core',       path: '~/projects/foundry-core',       lang: 'TypeScript', time: '2 hours ago' },
  { name: 'acme-dashboard',     path: '~/projects/acme-dashboard',     lang: 'React',      time: 'Yesterday' },
  { name: 'ml-pipeline',        path: '~/projects/ml-pipeline',        lang: 'Python',     time: '3 days ago' },
];

const quickActions = [
  { icon: FolderOpen, label: 'Open Project',   kbd: '⌘ O',       desc: 'Open an existing project folder' },
  { icon: FolderPlus, label: 'New Project',     kbd: '⌘ ⇧ N',     desc: 'Create a new project from scratch' },
  { icon: GitBranch,  label: 'Clone Repository',kbd: '⌘ ⇧ G',    desc: 'Clone from GitHub, GitLab, or URL' },
  { icon: Terminal,   label: 'Open Terminal',   kbd: '⌘ `',       desc: 'Launch the integrated terminal' },
];

export default function WelcomeScreen() {
  const [hoveredAction, setHoveredAction] = useState(null);

  return (
    <div className={styles.root}>
      {/* ---- Ambient background ---- */}
      <div className={styles.ambientOrb1} />
      <div className={styles.ambientOrb2} />
      <div className={styles.gridOverlay} />

      {/* ---- Titlebar drag region ---- */}
      <div className={`${styles.titlebar} titlebar-drag`} />

      {/* ---- Main layout ---- */}
      <motion.div
        className={styles.wrapper}
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Left column – Branding + Actions */}
        <div className={styles.left}>
          {/* Logo + wordmark */}
          <motion.div className={styles.brand} variants={item}>
            <FoundryLogo size={56} />
            <div className={styles.brandText}>
              <h1 className={styles.wordmark}>Foundry</h1>
              <span className={styles.version}>v1.0.0</span>
            </div>
          </motion.div>

          <motion.p className={styles.tagline} variants={item}>
            The modern forge for building software.
          </motion.p>

          {/* Quick Actions */}
          <motion.div className={styles.actions} variants={item}>
            <h2 className={styles.sectionTitle}>Start</h2>
            {quickActions.map((action, i) => (
              <motion.button
                key={action.label}
                className={styles.actionBtn}
                variants={item}
                onMouseEnter={() => setHoveredAction(i)}
                onMouseLeave={() => setHoveredAction(null)}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className={styles.actionIcon}>
                  <action.icon size={18} strokeWidth={1.8} />
                </div>
                <div className={styles.actionContent}>
                  <span className={styles.actionLabel}>{action.label}</span>
                  <span className={styles.actionDesc}>{action.desc}</span>
                </div>
                <kbd className={styles.kbd}>{action.kbd}</kbd>
                <ArrowRight
                  size={14}
                  className={styles.actionArrow}
                  style={{ opacity: hoveredAction === i ? 1 : 0 }}
                />
              </motion.button>
            ))}
          </motion.div>

          {/* Bottom links */}
          <motion.div className={styles.bottomLinks} variants={item}>
            <a href="#" className={styles.link}>
              <BookOpen size={14} /> Docs
            </a>
            <a href="#" className={styles.link}>
              <Keyboard size={14} /> Shortcuts
            </a>
            <a href="#" className={styles.link}>
              <Settings size={14} /> Settings
            </a>
          </motion.div>
        </div>

        {/* Right column – Recent Projects */}
        <div className={styles.right}>
          <motion.div className={styles.recentHeader} variants={item}>
            <h2 className={styles.sectionTitle}>
              <Clock size={16} strokeWidth={1.8} />
              Recent Projects
            </h2>
          </motion.div>

          <div className={styles.recentList}>
            {recentProjects.map((project) => (
              <motion.button
                key={project.name}
                className={styles.projectCard}
                variants={item}
                whileHover={{ y: -2, transition: { duration: 0.2 } }}
                whileTap={{ scale: 0.98 }}
              >
                <div className={styles.projectIcon}>
                  <FolderOpen size={20} strokeWidth={1.5} />
                </div>
                <div className={styles.projectInfo}>
                  <span className={styles.projectName}>{project.name}</span>
                  <span className={styles.projectPath}>{project.path}</span>
                </div>
                <div className={styles.projectMeta}>
                  <span className={styles.projectLang}>{project.lang}</span>
                  <span className={styles.projectTime}>{project.time}</span>
                </div>
                <ExternalLink size={14} className={styles.projectArrow} />
              </motion.button>
            ))}
          </div>

          {/* Tip card */}
          <motion.div className={styles.tipCard} variants={item}>
            <div className={styles.tipIcon}>
              <Sparkles size={18} strokeWidth={1.8} />
            </div>
            <div className={styles.tipContent}>
              <span className={styles.tipTitle}>Pro Tip</span>
              <span className={styles.tipText}>
                Press <kbd className={styles.kbdInline}>⌘ K</kbd> anywhere to open the command palette.
              </span>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
