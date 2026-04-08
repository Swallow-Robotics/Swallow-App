import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context';

const ProfilePage = () => {
  const { user, profile, logout, refreshProfile, updateProfile, updateLogin } =
    useAuth();

  const [isEditingUser, setIsEditingUser] = useState(false);
  const [isEditingLogin, setIsEditingLogin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [userForm, setUserForm] = useState({
    firstName: '',
    lastName: '',
  });
  const [loginForm, setLoginForm] = useState({
    password: '',
  });
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    refreshProfile({ ensureExists: true });
  }, [refreshProfile]);

  useEffect(() => {
    if (!isEditingUser) {
      setUserForm({
        firstName: profile?.firstName || '',
        lastName: profile?.lastName || '',
      });
    }
    if (!isEditingLogin) {
      setLoginForm({ password: '' });
    }
  }, [profile, user, isEditingUser, isEditingLogin]);

  const displayName = useMemo(() => {
    const parts = [profile?.firstName, profile?.lastName].filter(Boolean);
    return parts.length ? parts.join(' ') : 'Add your name';
  }, [profile]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to logout', err);
    }
  };

  const handleSaveUser = async () => {
    setError('');
    setStatus('');

    if (!userForm.firstName.trim() || !userForm.lastName.trim()) {
      setError('Name is required (first and last).');
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({
        firstName: userForm.firstName,
        lastName: userForm.lastName,
      });
      setStatus('Profile updated.');
      setIsEditingUser(false);
    } catch (err) {
      setError(err?.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveLogin = async () => {
    setError('');
    setStatus('');

    if (!loginForm.password.trim()) {
      setError('Please enter a new password.');
      return;
    }

    setIsSaving(true);
    try {
      await updateLogin({ password: loginForm.password });
      setStatus('Password updated.');
      setIsEditingLogin(false);
      setLoginForm({ password: '' });
    } catch (err) {
      setError(err?.message || 'Failed to update password.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      <div className="page-header">
        <div className="page-header__left" />
        <div className="page-header__center">
          <h2 className="page-header__title">Profile</h2>
        </div>
        <div className="page-header__right" />
      </div>
      <div className="profile-page">
        {(error || status) && (
          <div
            className={`profile-page__alert ${
              error ? 'profile-page__alert--error' : 'profile-page__alert--info'
            }`}
          >
            {error || status}
          </div>
        )}

        <div className="profile-section" style={{ marginTop: 0 }}>
          <div className="profile-section__header">
            <h3>User</h3>
            {!isEditingUser ? (
              <button
                type="button"
                className="profile-section__edit profile-section__edit--ghost"
                onClick={() => {
                  setUserForm({
                    firstName: profile?.firstName || '',
                    lastName: profile?.lastName || '',
                  });
                  setIsEditingUser(true);
                  setError('');
                  setStatus('');
                }}
              >
                Edit
              </button>
            ) : null}
          </div>
          <div className="profile-section__body">
            <div
              className={`profile-card ${isEditingUser ? 'profile-card--edit' : ''}`}
            >
              <div className="profile-card__row">
                <strong>Name:</strong>
                {isEditingUser ? (
                  <div
                    className="profile-card__inputs"
                    onClick={e => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      name="firstName"
                      value={userForm.firstName}
                      onChange={e =>
                        setUserForm(prev => ({
                          ...prev,
                          firstName: e.target.value,
                        }))
                      }
                      autoFocus
                      placeholder="First name"
                      required
                    />
                    <input
                      type="text"
                      name="lastName"
                      value={userForm.lastName}
                      onChange={e =>
                        setUserForm(prev => ({
                          ...prev,
                          lastName: e.target.value,
                        }))
                      }
                      placeholder="Last name"
                      required
                    />
                  </div>
                ) : (
                  <span>{displayName}</span>
                )}
              </div>
              <div className="profile-card__row">
                <strong>Email:</strong>
                <span>{profile?.email || user?.email || 'Unknown'}</span>
              </div>
              <div className="profile-card__row">
                <strong>Organization:</strong>
                <span>{profile?.orgName || '—'}</span>
              </div>
              {isEditingUser && (
                <div className="profile-card__actions">
                  <button
                    type="button"
                    onClick={handleSaveUser}
                    disabled={isSaving}
                    className="btn-primary"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingUser(false);
                      setError('');
                      setStatus('');
                      setUserForm({
                        firstName: profile?.firstName || '',
                        lastName: profile?.lastName || '',
                      });
                    }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="profile-section">
          <div className="profile-section__header">
            <h3>Login</h3>
            {!isEditingLogin ? (
              <button
                type="button"
                className="profile-section__edit profile-section__edit--ghost"
                onClick={() => {
                  setLoginForm({ password: '' });
                  setIsEditingLogin(true);
                  setError('');
                  setStatus('');
                }}
              >
                Edit
              </button>
            ) : null}
          </div>
          <div className="profile-section__body">
            <div
              className={`profile-card ${isEditingLogin ? 'profile-card--edit' : ''}`}
            >
              <div className="profile-card__row">
                <strong>Password:</strong>
                {isEditingLogin ? (
                  <input
                    type="password"
                    name="loginPassword"
                    value={loginForm.password}
                    onChange={e =>
                      setLoginForm(prev => ({
                        ...prev,
                        password: e.target.value,
                      }))
                    }
                    placeholder="Leave blank to keep current password"
                  />
                ) : (
                  <span>••••••••</span>
                )}
              </div>
              {isEditingLogin && (
                <div className="profile-card__actions">
                  <button
                    type="button"
                    onClick={handleSaveLogin}
                    disabled={isSaving}
                    className="btn-primary"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingLogin(false);
                      setError('');
                      setStatus('');
                      setLoginForm({ password: '' });
                    }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn-critical"
          onClick={handleLogout}
          style={{ marginTop: 'var(--space-lg)' }}
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default ProfilePage;
