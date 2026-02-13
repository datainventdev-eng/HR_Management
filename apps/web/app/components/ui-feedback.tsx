'use client';

import { useEffect, useState } from 'react';

export function FeedbackMessage({ message }: { message: string }) {
  if (!message?.trim()) return null;

  const lower = message.toLowerCase();
  const isError =
    lower.includes('failed') ||
    lower.includes('invalid') ||
    lower.includes('required') ||
    lower.includes('not found') ||
    lower.includes('unauthorized') ||
    lower.includes('error');

  return <small className={`feedback-message ${isError ? 'error' : 'success'}`}>{message}</small>;
}

export function NetworkProgressBar() {
  const [activeCount, setActiveCount] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    let hideTimer: number | null = null;
    let shownAt = 0;

    window.fetch = async (...args) => {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
      if (!visible) {
        shownAt = Date.now();
        setVisible(true);
      }
      setActiveCount((count) => count + 1);
      try {
        return await originalFetch(...args);
      } finally {
        setActiveCount((count) => {
          const next = Math.max(0, count - 1);
          if (next === 0) {
            const elapsed = Date.now() - shownAt;
            const remaining = Math.max(0, 550 - elapsed);
            hideTimer = window.setTimeout(() => setVisible(false), remaining);
          }
          return next;
        });
      }
    };

    return () => {
      if (hideTimer) window.clearTimeout(hideTimer);
      window.fetch = originalFetch;
    };
  }, [visible]);

  return (
    <div className={`network-progress ${visible ? 'active' : ''}`} aria-hidden={!visible}>
      <div className="network-progress-bar" />
    </div>
  );
}
