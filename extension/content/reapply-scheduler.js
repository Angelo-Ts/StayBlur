(() => {
  'use strict';

  const MAX_ATTEMPTS = 6;
  const DELAYS = [0, 60, 180, 400, 800, 1500];
  const pending = new Map();

  function schedule(ruleId, run) {
    cancel(ruleId);
    let attempt = 0;

    const execute = async () => {
      if (!pending.has(ruleId)) return;
      const ok = await run(attempt);
      if (ok || attempt >= MAX_ATTEMPTS - 1) {
        pending.delete(ruleId);
        return;
      }
      attempt += 1;
      const timer = setTimeout(execute, DELAYS[attempt]);
      pending.set(ruleId, timer);
    };

    pending.set(ruleId, true);
    execute();
  }

  function cancel(ruleId) {
    const timer = pending.get(ruleId);
    if (timer && timer !== true) clearTimeout(timer);
    pending.delete(ruleId);
  }

  globalThis.__stayBlurReapplyScheduler = { schedule, cancel };
})();
