import React, { useState, useRef } from 'react';
import { FiCheck, FiEye, FiEyeOff, FiUser, FiSave, FiCamera, FiEdit2 } from 'react-icons/fi';
import PhotoEditorModal from './PhotoEditorModal';
import styles from '../SettingsPage.module.css';

export default function AccountSection({ profile, onProfileChange }) {
  const [firstName, setFirstName] = useState(profile?.first_name || profile?.firstName || '');
  const [lastName, setLastName] = useState(profile?.last_name || profile?.lastName || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [password, setPassword] = useState(profile?.password || '');
  const [showPassword, setShowPassword] = useState(false);
  const [photoData, setPhotoData] = useState(profile?.profile_photo_data || null);
  const [photoZoom, setPhotoZoom] = useState(profile?.photo_zoom || 1);
  const [photoPos, setPhotoPos] = useState(profile?.photo_pos || { x: 0, y: 0 });
  const [profileSaved, setProfileSaved] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const fileInputRef = useRef(null);

  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  // Dirty state — has anything changed from the saved profile?
  const profileDirty =
    firstName !== (profile?.first_name || profile?.firstName || '') ||
    lastName !== (profile?.last_name || profile?.lastName || '') ||
    email !== (profile?.email || '') ||
    password !== (profile?.password || '') ||
    photoData !== (profile?.profile_photo_data || null);

  const handlePickPhoto = async () => {
    if (window.foundry?.pickPhoto) {
      const data = await window.foundry.pickPhoto();
      if (data) {
        setPhotoData(data);
        setPhotoZoom(1);
        setPhotoPos({ x: 0, y: 0 });
        setShowEditor(true);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoData(reader.result);
      setPhotoZoom(1);
      setPhotoPos({ x: 0, y: 0 });
      setShowEditor(true);
    };
    reader.readAsDataURL(file);
  };

  const handleEditorSave = (zoom, pos) => {
    setPhotoZoom(zoom);
    setPhotoPos(pos);
    setShowEditor(false);
  };

  const handleSaveProfile = async () => {
    const updates = { firstName, lastName, email, password, photoZoom, photoPos };
    if (photoData && photoData !== profile?.profile_photo_data) {
      updates.profilePhoto = photoData;
    }
    await window.foundry?.updateProfile(updates);
    if (onProfileChange) await onProfileChange();
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  // Compute avatar background styles — same math as the modal
  const avatarBgStyle = photoData ? {
    backgroundImage: `url(${photoData})`,
    backgroundSize: `${photoZoom * 100}%`,
    backgroundPosition: `calc(50% + ${photoPos.x * (72 / 240)}px) calc(50% + ${photoPos.y * (72 / 240)}px)`,
    backgroundRepeat: 'no-repeat',
  } : {};

  return (
    <div className={styles.section}>
      {showEditor && photoData && (
        <PhotoEditorModal
          photoData={photoData}
          initialZoom={photoZoom}
          initialPos={photoPos}
          onSave={handleEditorSave}
          onCancel={() => setShowEditor(false)}
        />
      )}

      <h3 className={styles.sectionTitle}>Account</h3>
      <p className={styles.sectionDesc}>Manage your profile information</p>

      <div className={styles.card}>
        {/* Profile Photo */}
        <div className={styles.photoSection}>
          <div className={styles.photoAvatarWrap}>
            <button
              className={styles.photoButton}
              onClick={handlePickPhoto}
              style={avatarBgStyle}
            >
              {!photoData && (
                <div className={styles.photoPlaceholder}>
                  {initials || <FiUser size={20} />}
                </div>
              )}
              <div className={styles.photoOverlay}>
                <FiCamera size={14} />
              </div>
            </button>
            {photoData && (
              <button
                className={styles.photoEditBtn}
                onClick={() => setShowEditor(true)}
                title="Edit photo"
              >
                <FiEdit2 size={10} />
              </button>
            )}
          </div>
          <div className={styles.photoInfo}>
            <span className={styles.photoName}>{firstName} {lastName}</span>
            <button className={styles.photoChangeBtn} onClick={handlePickPhoto}>
              Change photo
            </button>
            {photoData && (
              <button
                className={styles.photoChangeBtn}
                onClick={() => setShowEditor(true)}
              >
                Edit crop
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>First name</label>
            <input
              type="text"
              className={styles.input}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Last name</label>
            <input
              type="text"
              className={styles.input}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.field} style={{ marginBottom: 20 }}>
          <label className={styles.fieldLabel}>Email</label>
          <input
            type="email"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className={styles.field} style={{ marginBottom: 20 }}>
          <label className={styles.fieldLabel}>Password</label>
          <div className={styles.tokenInputWrapper}>
            <input
              type={showPassword ? 'text' : 'password'}
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
            <button
              className={styles.toggleBtn}
              onClick={() => setShowPassword(v => !v)}
            >
              {showPassword ? <FiEyeOff size={14} /> : <FiEye size={14} />}
            </button>
          </div>
        </div>

        <button className={`${styles.saveBtn} ${profileDirty ? styles.saveBtnActive : ''}`} disabled={!profileDirty && !profileSaved} onClick={handleSaveProfile}>
          {profileSaved ? <FiCheck size={14} /> : <FiSave size={14} />}
          {profileSaved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
