import React, { useEffect, useState } from 'react';

/**
 * Shows the durable, unauthenticated Public Link URL for the Photos page's
 * current capture method, with a one-click copy button. The caller
 * generates (or reuses) the link before opening this modal.
 */
const PublicLinkModal = ({ open, url, isLoading, error, onClose }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) setCopied(false);
  }, [open, url]);

  if (!open) return null;

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        className="modal-body"
        style={{ maxWidth: 480, width: '96%', position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="modal-header">Public Link</h3>

        {isLoading ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Generating link…
          </p>
        ) : error ? (
          <p
            style={{
              color: '#9B4A2F',
              fontSize: 'var(--font-size-sm)',
              margin: 0,
            }}
          >
            {error}
          </p>
        ) : (
          <>
            <p
              style={{
                margin: '0 0 var(--space-md) 0',
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              Anyone with this link can view these photos — no login
              required.
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-sm) var(--space-md)',
                background: 'var(--color-surface-secondary)',
              }}
            >
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--color-primary-dark)',
                  fontWeight: 'var(--font-weight-medium)',
                }}
              >
                {url}
              </a>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCopy}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </>
        )}

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PublicLinkModal;
