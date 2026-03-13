import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCamera, FiCheck, FiArrowRight, FiSun, FiMoon, FiMonitor, FiEye, FiEyeOff } from 'react-icons/fi';
import FoundryLogo from './FoundryLogo';
import styles from './AccountSetup.module.css';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};
const fade = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const themes = [
  { id: 'dark',   label: 'Dark',   icon: FiMoon,    colors: ['#09090B', '#18181B', '#A78BFA'] },
  { id: 'light',  label: 'Light',  icon: FiSun,     colors: ['#FAFAFA', '#E4E4E7', '#7C3AED'] },
  { id: 'system', label: 'System', icon: FiMonitor,  colors: ['#09090B', '#FAFAFA', '#A78BFA'] },
];

export default function AccountSetup({ onComplete }) {
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [photoData, setPhotoData] = useState(null);
  const [theme, setTheme] = useState('dark');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  const canProceed = firstName.trim().length > 0 && lastName.trim().length > 0
    && email.trim().length > 0 && password.trim().length >= 6;

  async function handlePickPhoto() {
    if (window.foundry?.pickPhoto) {
      const data = await window.foundry.pickPhoto();
      if (data) setPhotoData(data);
    } else {
      fileInputRef.current?.click();
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoData(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleFinish() {
    setSaving(true);
    try {
      if (window.foundry?.createProfile) {
        await window.foundry.createProfile({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password: password,
          profilePhoto: photoData,
          theme,
        });
      }
      onComplete?.({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        profilePhoto: photoData,
        theme,
      });
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.ambientOrb1} />
      <div className={styles.ambientOrb2} />
      <div className={`${styles.titlebar} titlebar-drag`} />

      <div className={styles.center}>
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              className={styles.stepContainer}
              variants={container}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, y: -20, transition: { duration: 0.25 } }}
            >
              <motion.div variants={fade} style={{ display: 'inline-flex', marginBottom: 24 }}>
                <FoundryLogo size={36} />
              </motion.div>

              <motion.h1 className={styles.heading} variants={fade}>
                Set up your account
              </motion.h1>
              <motion.p className={styles.subtitle} variants={fade}>
                Let's personalize your Foundry experience
              </motion.p>

              {/* Avatar */}
              <motion.div variants={fade} className={styles.avatarSection}>
                <button className={styles.avatarButton} onClick={handlePickPhoto}>
                  {photoData ? (
                    <img src={photoData} alt="Profile" className={styles.avatarImage} />
                  ) : (
                    <div className={styles.avatarPlaceholder}>
                      {initials || <FiCamera size={24} />}
                    </div>
                  )}
                  <div className={styles.avatarOverlay}>
                    <FiCamera size={16} />
                  </div>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
                <span className={styles.avatarHint}>Upload a photo</span>
              </motion.div>

              {/* Name fields */}
              <motion.div variants={fade} className={styles.fields}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>First name</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Enter your first name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Last name</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Enter your last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </motion.div>

              {/* Email */}
              <motion.div variants={fade} className={styles.fullField}>
                <label className={styles.fieldLabel}>Email</label>
                <input
                  type="email"
                  className={styles.input}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </motion.div>

              {/* Password */}
              <motion.div variants={fade} className={styles.fullField}>
                <label className={styles.fieldLabel}>Password</label>
                <div className={styles.passwordWrapper}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className={styles.input}
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && canProceed && setStep(2)}
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowPassword(v => !v)}
                    tabIndex={-1}
                  >
                    {showPassword ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                  </button>
                </div>
              </motion.div>

              {/* Next button */}
              <motion.button
                variants={fade}
                className={`${styles.primaryBtn} ${!canProceed ? styles.primaryBtnDisabled : ''}`}
                disabled={!canProceed}
                onClick={() => setStep(2)}
                whileTap={canProceed ? { scale: 0.97 } : {}}
              >
                Continue
                <FiArrowRight size={16} />
              </motion.button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              className={styles.stepContainer}
              variants={container}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, y: -20, transition: { duration: 0.25 } }}
            >
              <motion.div variants={fade} style={{ display: 'inline-flex', marginBottom: 24 }}>
                <FoundryLogo size={36} />
              </motion.div>

              <motion.h1 className={styles.heading} variants={fade}>
                Choose your theme
              </motion.h1>
              <motion.p className={styles.subtitle} variants={fade}>
                You can always change this later in settings
              </motion.p>

              {/* Theme cards */}
              <motion.div variants={fade} className={styles.themeGrid}>
                {themes.map((t) => {
                  const Icon = t.icon;
                  const selected = theme === t.id;
                  return (
                    <motion.button
                      key={t.id}
                      className={`${styles.themeCard} ${selected ? styles.themeCardSelected : ''}`}
                      onClick={() => setTheme(t.id)}
                      whileTap={{ scale: 0.97 }}
                      variants={fade}
                    >
                      <div className={styles.themePreview}>
                        <div
                          className={styles.themePreviewBg}
                          style={{ background: t.colors[0] }}
                        >
                          <div
                            className={styles.themePreviewBar}
                            style={{ background: t.colors[1] }}
                          />
                          <div className={styles.themePreviewContent}>
                            <div
                              className={styles.themePreviewAccent}
                              style={{ background: t.colors[2] }}
                            />
                            <div
                              className={styles.themePreviewLine}
                              style={{ background: t.colors[1] }}
                            />
                            <div
                              className={styles.themePreviewLineShort}
                              style={{ background: t.colors[1] }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className={styles.themeInfo}>
                        <Icon size={16} />
                        <span>{t.label}</span>
                      </div>
                      {selected && (
                        <motion.div
                          className={styles.themeCheck}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                        >
                          <FiCheck size={14} />
                        </motion.div>
                      )}
                    </motion.button>
                  );
                })}
              </motion.div>

              {/* Actions */}
              <motion.div variants={fade} className={styles.actions}>
                <button className={styles.secondaryBtn} onClick={() => setStep(1)}>
                  Back
                </button>
                <button
                  className={styles.primaryBtn}
                  onClick={handleFinish}
                  disabled={saving}
                >
                  {saving ? 'Setting up...' : 'Get Started'}
                  {!saving && <FiCheck size={16} />}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step indicator */}
        <div className={styles.dots}>
          <div className={`${styles.dot} ${step === 1 ? styles.dotActive : ''}`} />
          <div className={`${styles.dot} ${step === 2 ? styles.dotActive : ''}`} />
        </div>
      </div>
    </div>
  );
}
