const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createReleaseGovernanceStore } = require('../../src/ops/releaseGovernanceStore');

test('release governance store supports full sign-off and gate evaluation flow', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-release-governance-'));
  const filePath = path.join(tmpDir, 'release-governance.json');
  const pentestPath = path.join(tmpDir, 'pentest-latest.txt');

  try {
    await fs.writeFile(
      pentestPath,
      [
        '# External Security Review Evidence',
        '',
        '- Vendor: Arcana Security Labs',
        '- Scope date: 2026-02-20',
        '- Report date: 2026-02-24',
        '- Scope: API, auth, tenant isolation, patient channel',
        '- Severity summary:',
        '  - Critical: 0',
        '  - High: 0',
        '  - Medium: 1',
        '  - Low: 2',
        '- Required fixes completed: yes',
        '- Residual accepted risk: low non-exploitable informational findings.',
        '- Signed report reference: ARCANA-PENTEST-2026-Q1',
        '',
      ].join('\n'),
      'utf8'
    );
    const store = await createReleaseGovernanceStore({
      filePath,
      maxCycles: 200,
    });

    const started = await store.startCycle({
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
      note: 'cycle one',
    });
    assert.ok(started.id);

    const evidence = await store.recordGateEvidence({
      tenantId: 'tenant-a',
      cycleId: started.id,
      source: 'preflight_latest',
      readiness: {
        score: 92,
        band: 'controlled_go',
        goAllowed: true,
        blockerChecksCount: 0,
        triggeredNoGoCount: 0,
      },
      strict: {
        passed: true,
        failuresCount: 0,
        failures: [],
      },
      requiredChecks: {
        noP0P1Blockers: true,
        patientSafetyApproved: true,
        restoreDrillsVerified: true,
        governanceRunbooksReady: true,
      },
      noGoWindow: {
        days: 14,
        evidenceCount: 14,
        clean: true,
      },
      pentestEvidencePath: pentestPath,
      notes: 'evidence captured',
    });
    assert.equal(evidence.gateEvidence.readiness.goAllowed, true);
    assert.equal(evidence.gateEvidence.pentest.exists, true);
    assert.equal(evidence.gateEvidence.pentest.contentValid, true);

    await store.recordSignoff({
      tenantId: 'tenant-a',
      cycleId: started.id,
      signoffRole: 'owner',
      actorUserId: 'owner-1',
      actorMembershipRole: 'OWNER',
      requireDistinctUsers: true,
    });
    await store.recordSignoff({
      tenantId: 'tenant-a',
      cycleId: started.id,
      signoffRole: 'risk_owner',
      actorUserId: 'risk-1',
      actorMembershipRole: 'STAFF',
      requireDistinctUsers: true,
    });
    await store.recordSignoff({
      tenantId: 'tenant-a',
      cycleId: started.id,
      signoffRole: 'ops_owner',
      actorUserId: 'ops-1',
      actorMembershipRole: 'STAFF',
      requireDistinctUsers: true,
    });

    const evalBeforeLaunch = await store.evaluateCycle({
      tenantId: 'tenant-a',
      cycleId: started.id,
      requiredNoGoFreeDays: 14,
      requirePentestEvidence: true,
      pentestMaxAgeDays: 120,
      requireDistinctSignoffUsers: true,
    });
    assert.equal(evalBeforeLaunch.evaluation.releaseGatePassed, true);
    assert.equal(evalBeforeLaunch.evaluation.blockers.length, 0);

    const launched = await store.recordLaunch({
      tenantId: 'tenant-a',
      cycleId: started.id,
      actorUserId: 'owner-1',
      strategy: 'canary',
      batchLabel: 'tenant-batch-a',
      rollbackPlan: 'Rollback within 10 minutes on critical',
    });
    assert.equal(launched.status, 'launched');
    assert.ok(launched.launch.launchedAt);

    const review = await store.addPostLaunchReview({
      tenantId: 'tenant-a',
      cycleId: started.id,
      reviewerUserId: 'ops-1',
      status: 'ok',
      note: 'day 1 clear',
      openIncidents: 0,
      breachedIncidents: 0,
      triggeredNoGoCount: 0,
    });
    assert.equal(review.review.status, 'ok');

    const evalAfterLaunch = await store.evaluateCycle({
      tenantId: 'tenant-a',
      cycleId: started.id,
      requiredNoGoFreeDays: 14,
      requirePentestEvidence: true,
      pentestMaxAgeDays: 120,
      postLaunchReviewWindowDays: 30,
      requireDistinctSignoffUsers: true,
      realityAuditIntervalDays: 90,
    });
    assert.equal(evalAfterLaunch.evaluation.signoffComplete, true);
    assert.equal(evalAfterLaunch.evaluation.releaseGatePassed, true);
    assert.equal(evalAfterLaunch.evaluation.blockers.length, 0);
    assert.equal(evalAfterLaunch.evaluation.finalLiveSignoff.locked, false);

    const evalRequireFinalBeforeLock = await store.evaluateCycle({
      tenantId: 'tenant-a',
      cycleId: started.id,
      requiredNoGoFreeDays: 14,
      requirePentestEvidence: true,
      pentestMaxAgeDays: 120,
      postLaunchReviewWindowDays: 30,
      requireDistinctSignoffUsers: true,
      realityAuditIntervalDays: 90,
      requireFinalLiveSignoff: true,
    });
    assert.ok(
      (evalRequireFinalBeforeLock.evaluation.blockers || []).some(
        (item) => item.id === 'final_live_signoff_missing'
      )
    );

    const finalLocked = await store.recordFinalLiveSignoff({
      tenantId: 'tenant-a',
      cycleId: started.id,
      actorUserId: 'owner-1',
      note: 'final lock',
    });
    assert.ok(finalLocked.governance.finalLiveSignoffAt);
    assert.equal(finalLocked.governance.finalLiveSignoffBy, 'owner-1');

    const evalRequireFinalAfterLock = await store.evaluateCycle({
      tenantId: 'tenant-a',
      cycleId: started.id,
      requiredNoGoFreeDays: 14,
      requirePentestEvidence: true,
      pentestMaxAgeDays: 120,
      postLaunchReviewWindowDays: 30,
      requireDistinctSignoffUsers: true,
      realityAuditIntervalDays: 90,
      requireFinalLiveSignoff: true,
    });
    assert.equal(evalRequireFinalAfterLock.evaluation.finalLiveSignoff.locked, true);
    assert.ok(
      !(evalRequireFinalAfterLock.evaluation.blockers || []).some(
        (item) => item.id === 'final_live_signoff_missing'
      )
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('release governance store marks reality audit overdue based on launch date when missing', async () => {
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-release-governance-reality-audit-overdue-')
  );
  const filePath = path.join(tmpDir, 'release-governance.json');

  try {
    const nowMs = Date.now();
    const launchTs = new Date(nowMs - 120 * 24 * 60 * 60 * 1000).toISOString();
    const createdTs = new Date(nowMs - 130 * 24 * 60 * 60 * 1000).toISOString();
    const reviewTs = new Date(nowMs - 119 * 24 * 60 * 60 * 1000).toISOString();

    const seededState = {
      version: 1,
      createdAt: createdTs,
      updatedAt: new Date(nowMs).toISOString(),
      cycles: [
        {
          id: 'rel_old_launch',
          tenantId: 'tenant-a',
          status: 'launched',
          createdAt: createdTs,
          updatedAt: new Date(nowMs).toISOString(),
          createdBy: 'owner-1',
          targetEnvironment: 'production',
          rolloutStrategy: 'tenant_batch',
          note: 'seeded cycle',
          signoffs: {
            owner: {
              role: 'owner',
              userId: 'owner-1',
              membershipRole: 'OWNER',
              approvedAt: createdTs,
              note: '',
            },
            risk_owner: {
              role: 'risk_owner',
              userId: 'risk-1',
              membershipRole: 'STAFF',
              approvedAt: createdTs,
              note: '',
            },
            ops_owner: {
              role: 'ops_owner',
              userId: 'ops-1',
              membershipRole: 'STAFF',
              approvedAt: createdTs,
              note: '',
            },
          },
          gateEvidence: {
            capturedAt: createdTs,
            source: 'seed',
            notes: '',
            readiness: {
              score: 93,
              band: 'controlled_go',
              goAllowed: true,
              blockerChecksCount: 0,
              triggeredNoGoCount: 0,
            },
            strict: {
              passed: true,
              failuresCount: 0,
              failures: [],
            },
            requiredChecks: {
              noP0P1Blockers: true,
              patientSafetyApproved: true,
              restoreDrillsVerified: true,
              governanceRunbooksReady: true,
            },
            noGoWindow: {
              days: 14,
              evidenceCount: 14,
              clean: true,
            },
            pentest: {
              path: null,
              exists: false,
              updatedAt: null,
              ageDays: null,
              sizeBytes: 0,
              sha256: null,
            },
          },
          launch: {
            launchedAt: launchTs,
            launchedBy: 'owner-1',
            strategy: 'tenant_batch',
            batchLabel: null,
            rollbackPlan: 'rollback plan',
          },
          postLaunchReviews: [
            {
              id: 'rr_seed_1',
              ts: reviewTs,
              reviewerUserId: 'ops-1',
              status: 'ok',
              note: 'seed review',
              openIncidents: 0,
              breachedIncidents: 0,
              triggeredNoGoCount: 0,
            },
          ],
          governance: {
            lastRealityAuditAt: null,
            lastRealityAuditBy: null,
            nextRealityAuditDueAt: null,
            changeGovernanceVersion: null,
            note: '',
          },
        },
      ],
    };

    await fs.writeFile(filePath, `${JSON.stringify(seededState, null, 2)}\n`, 'utf8');

    const store = await createReleaseGovernanceStore({
      filePath,
      maxCycles: 200,
    });

    const evaluation = await store.evaluateCycle({
      tenantId: 'tenant-a',
      cycleId: 'rel_old_launch',
      requiredNoGoFreeDays: 14,
      requirePentestEvidence: false,
      postLaunchReviewWindowDays: 1,
      realityAuditIntervalDays: 90,
      requireDistinctSignoffUsers: true,
    });

    const expectedDueAt = new Date(
      Date.parse(launchTs) + 90 * 24 * 60 * 60 * 1000
    ).toISOString();
    assert.equal(evaluation.evaluation.realityAudit.healthy, false);
    assert.equal(evaluation.evaluation.realityAudit.dueAt, expectedDueAt);
    assert.equal(evaluation.evaluation.releaseGatePassed, true);
    assert.ok(
      (evaluation.evaluation.blockers || []).some(
        (item) => item.id === 'quarterly_reality_audit_overdue'
      )
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('release governance store can enforce post-launch stabilization no-go window', async () => {
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-release-governance-stabilization-window-')
  );
  const filePath = path.join(tmpDir, 'release-governance.json');

  try {
    const nowMs = Date.now();
    const launchTsMs = nowMs - 20 * 24 * 60 * 60 * 1000;
    const launchTs = new Date(launchTsMs).toISOString();
    const createdTs = new Date(nowMs - 25 * 24 * 60 * 60 * 1000).toISOString();
    const reviews = [];
    for (let dayOffset = 0; dayOffset < 20; dayOffset += 1) {
      const ts = new Date(launchTsMs + dayOffset * 24 * 60 * 60 * 1000 + 60_000).toISOString();
      reviews.push({
        id: `rr_seed_${dayOffset + 1}`,
        ts,
        reviewerUserId: 'ops-1',
        status: dayOffset === 5 ? 'incident' : 'ok',
        note: dayOffset === 5 ? 'incident triggered' : 'daily review',
        openIncidents: dayOffset === 5 ? 1 : 0,
        breachedIncidents: dayOffset === 5 ? 1 : 0,
        triggeredNoGoCount: dayOffset === 5 ? 1 : 0,
      });
    }

    const seededState = {
      version: 1,
      createdAt: createdTs,
      updatedAt: new Date(nowMs).toISOString(),
      cycles: [
        {
          id: 'rel_stabilization_seed',
          tenantId: 'tenant-a',
          status: 'launched',
          createdAt: createdTs,
          updatedAt: new Date(nowMs).toISOString(),
          createdBy: 'owner-1',
          targetEnvironment: 'production',
          rolloutStrategy: 'tenant_batch',
          note: 'seeded stabilization cycle',
          signoffs: {
            owner: {
              role: 'owner',
              userId: 'owner-1',
              membershipRole: 'OWNER',
              approvedAt: createdTs,
              note: '',
            },
            risk_owner: {
              role: 'risk_owner',
              userId: 'risk-1',
              membershipRole: 'STAFF',
              approvedAt: createdTs,
              note: '',
            },
            ops_owner: {
              role: 'ops_owner',
              userId: 'ops-1',
              membershipRole: 'STAFF',
              approvedAt: createdTs,
              note: '',
            },
          },
          gateEvidence: {
            capturedAt: createdTs,
            source: 'seed',
            notes: '',
            readiness: {
              score: 94,
              band: 'controlled_go',
              goAllowed: true,
              blockerChecksCount: 0,
              triggeredNoGoCount: 0,
            },
            strict: {
              passed: true,
              failuresCount: 0,
              failures: [],
            },
            requiredChecks: {
              noP0P1Blockers: true,
              patientSafetyApproved: true,
              restoreDrillsVerified: true,
              governanceRunbooksReady: true,
            },
            noGoWindow: {
              days: 14,
              evidenceCount: 14,
              clean: true,
            },
            pentest: {
              path: null,
              exists: false,
              updatedAt: null,
              ageDays: null,
              sizeBytes: 0,
              sha256: null,
            },
          },
          launch: {
            launchedAt: launchTs,
            launchedBy: 'owner-1',
            strategy: 'tenant_batch',
            batchLabel: null,
            rollbackPlan: 'rollback plan',
          },
          postLaunchReviews: reviews,
          governance: {
            lastRealityAuditAt: null,
            lastRealityAuditBy: null,
            nextRealityAuditDueAt: null,
            changeGovernanceVersion: null,
            note: '',
          },
        },
      ],
    };

    await fs.writeFile(filePath, `${JSON.stringify(seededState, null, 2)}\n`, 'utf8');

    const store = await createReleaseGovernanceStore({
      filePath,
      maxCycles: 200,
    });

    const evaluation = await store.evaluateCycle({
      tenantId: 'tenant-a',
      cycleId: 'rel_stabilization_seed',
      requiredNoGoFreeDays: 14,
      requirePentestEvidence: false,
      postLaunchReviewWindowDays: 30,
      postLaunchStabilizationDays: 14,
      enforcePostLaunchStabilization: true,
      realityAuditIntervalDays: 90,
      requireDistinctSignoffUsers: true,
    });

    assert.equal(evaluation.evaluation.releaseGatePassed, true);
    assert.equal(evaluation.evaluation.postLaunchStabilization.enforced, true);
    assert.equal(evaluation.evaluation.postLaunchStabilization.completed, true);
    assert.equal(evaluation.evaluation.postLaunchStabilization.healthy, false);
    assert.equal(evaluation.evaluation.postLaunchStabilization.hasNoGoTrigger, true);
    assert.ok(
      (evaluation.evaluation.blockers || []).some((item) => item.id === 'post_launch_no_go_triggered')
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('release governance store rejects pentest placeholders when evidence is required', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-release-governance-pentest-'));
  const filePath = path.join(tmpDir, 'release-governance.json');
  const pentestPath = path.join(tmpDir, 'pentest-placeholder.md');

  try {
    await fs.writeFile(
      pentestPath,
      [
        '# External Security Review Evidence',
        '- Vendor: `<fill>`',
        '- Scope date: `<YYYY-MM-DD>`',
        '- Report date: `<YYYY-MM-DD>`',
        '- Required fixes completed: `<yes/no>`',
        '- Residual accepted risk: `<text>`',
      ].join('\n'),
      'utf8'
    );

    const store = await createReleaseGovernanceStore({
      filePath,
      maxCycles: 100,
    });
    const started = await store.startCycle({
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
      note: 'cycle with placeholder pentest',
    });

    await store.recordGateEvidence({
      tenantId: 'tenant-a',
      cycleId: started.id,
      source: 'preflight_latest',
      readiness: {
        score: 95,
        band: 'controlled_go',
        goAllowed: true,
        blockerChecksCount: 0,
        triggeredNoGoCount: 0,
      },
      strict: {
        passed: true,
        failuresCount: 0,
        failures: [],
      },
      requiredChecks: {
        noP0P1Blockers: true,
        patientSafetyApproved: true,
        restoreDrillsVerified: true,
        governanceRunbooksReady: true,
      },
      noGoWindow: {
        days: 14,
        evidenceCount: 14,
        clean: true,
      },
      pentestEvidencePath: pentestPath,
      notes: 'placeholder evidence',
    });

    await store.recordSignoff({
      tenantId: 'tenant-a',
      cycleId: started.id,
      signoffRole: 'owner',
      actorUserId: 'owner-1',
      actorMembershipRole: 'OWNER',
      requireDistinctUsers: true,
    });
    await store.recordSignoff({
      tenantId: 'tenant-a',
      cycleId: started.id,
      signoffRole: 'risk_owner',
      actorUserId: 'risk-1',
      actorMembershipRole: 'STAFF',
      requireDistinctUsers: true,
    });
    await store.recordSignoff({
      tenantId: 'tenant-a',
      cycleId: started.id,
      signoffRole: 'ops_owner',
      actorUserId: 'ops-1',
      actorMembershipRole: 'STAFF',
      requireDistinctUsers: true,
    });

    const evaluation = await store.evaluateCycle({
      tenantId: 'tenant-a',
      cycleId: started.id,
      requiredNoGoFreeDays: 14,
      requirePentestEvidence: true,
      pentestMaxAgeDays: 120,
      requireDistinctSignoffUsers: true,
    });

    assert.equal(evaluation.evaluation.releaseGatePassed, false);
    assert.ok(
      (evaluation.evaluation.blockers || []).some((item) => item.id === 'pentest_evidence_missing')
    );
    assert.equal(evaluation.cycle.gateEvidence.pentest.contentValid, false);
    assert.ok(
      Array.isArray(evaluation.cycle.gateEvidence.pentest.contentIssues) &&
        evaluation.cycle.gateEvidence.pentest.contentIssues.length > 0
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('release governance store enforces distinct sign-off users when enabled', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-release-governance-distinct-'));
  const filePath = path.join(tmpDir, 'release-governance.json');

  try {
    const store = await createReleaseGovernanceStore({
      filePath,
      maxCycles: 200,
    });
    const started = await store.startCycle({
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });

    await store.recordSignoff({
      tenantId: 'tenant-a',
      cycleId: started.id,
      signoffRole: 'owner',
      actorUserId: 'same-user',
      actorMembershipRole: 'OWNER',
      requireDistinctUsers: true,
    });

    await assert.rejects(
      () =>
        store.recordSignoff({
          tenantId: 'tenant-a',
          cycleId: started.id,
          signoffRole: 'risk_owner',
          actorUserId: 'same-user',
          actorMembershipRole: 'STAFF',
          requireDistinctUsers: true,
        }),
      /tre olika användare/i
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('createReleaseGovernanceStore rejects missing filePath', async () => {
  await assert.rejects(() => createReleaseGovernanceStore({}), /filePath saknas/i);
  await assert.rejects(() => createReleaseGovernanceStore({ filePath: '' }), /filePath saknas/i);
});

test('startCycle throws when tenantId is blank', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-release-gov-tenant-'));
  const filePath = path.join(tmpDir, 'release-governance.json');
  try {
    const store = await createReleaseGovernanceStore({ filePath, maxCycles: 200 });
    await assert.rejects(() => store.startCycle({ tenantId: '   \n' }), /tenantId/i);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('listCycles returns empty when tenantId is blank', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-release-gov-list-'));
  const filePath = path.join(tmpDir, 'release-governance.json');
  try {
    const store = await createReleaseGovernanceStore({ filePath, maxCycles: 200 });
    await store.startCycle({ tenantId: 'tenant-list', actorUserId: 'a1' });
    const out = await store.listCycles({ tenantId: '' });
    assert.equal(out.count, 0);
    assert.deepEqual(out.cycles, []);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('evaluateCycle returns null cycle and evaluation when cycleId is unknown', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-release-gov-eval-miss-'));
  const filePath = path.join(tmpDir, 'release-governance.json');
  try {
    const store = await createReleaseGovernanceStore({ filePath, maxCycles: 200 });
    await store.startCycle({ tenantId: 'tenant-eval', actorUserId: 'a1' });
    const res = await store.evaluateCycle({
      tenantId: 'tenant-eval',
      cycleId: 'rel_does_not_exist_00000000',
    });
    assert.equal(res.cycle, null);
    assert.equal(res.evaluation, null);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('recordSignoff rejects unknown signoffRole', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-release-gov-role-'));
  const filePath = path.join(tmpDir, 'release-governance.json');
  try {
    const store = await createReleaseGovernanceStore({ filePath, maxCycles: 200 });
    const started = await store.startCycle({ tenantId: 'tenant-role', actorUserId: 'owner-1' });
    await assert.rejects(
      () =>
        store.recordSignoff({
          tenantId: 'tenant-role',
          cycleId: started.id,
          signoffRole: 'security_champion',
          actorUserId: 'user-1',
          actorMembershipRole: 'OWNER',
        }),
      /signoffRole/i
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
