const express = require('express');

// Staff onboarding endpoints. Mounted at /api/v1 by server.js.
// Extracted from server.js (legacy monolit) — se ORGANISATION.md §4.
// onboardingStore injiceras (stabil const i server.js).
function createOnboardingRouter({ onboardingStore }) {
  const router = express.Router();

  router.get('/onboarding/:userId', (req, res) => {
    const status = onboardingStore.getStatus(req.params.userId);
    return res.json({ ok: true, ...status });
  });

  router.post('/onboarding/:userId/step/:stepId', async (req, res) => {
    const result = await onboardingStore.completeStep(
      req.params.userId,
      req.params.stepId,
      req.body?.verification
    );
    return res.json(result);
  });

  router.post('/onboarding/:userId/reset', async (req, res) => {
    const result = await onboardingStore.resetProgress(req.params.userId);
    return res.json(result);
  });

  router.get('/onboarding/admin/incomplete', (req, res) => {
    return res.json({ ok: true, users: onboardingStore.listIncomplete() });
  });

  return router;
}

module.exports = { createOnboardingRouter };
