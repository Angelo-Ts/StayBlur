(() => {
  'use strict';

  // A content script can outlive the extension context while developing or after
  // the extension is reloaded/updated. Chrome then rejects pending extension API
  // calls with "Extension context invalidated". Treat that as a stale content
  // script rather than an application error, while leaving unrelated errors
  // untouched.
  const isContextInvalidated = value => {
    const message = String(value?.message || value || '').toLowerCase();
    return message.includes('extension context invalidated');
  };

  window.addEventListener('unhandledrejection', event => {
    if (!isContextInvalidated(event.reason)) return;
    event.preventDefault();
  });

  window.addEventListener('error', event => {
    if (!isContextInvalidated(event.error || event.message)) return;
    event.preventDefault();
  });
})();
