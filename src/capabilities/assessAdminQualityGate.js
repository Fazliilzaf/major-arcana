'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isPastDeadline(deadline) {
  const raw = normalizeText(deadline);
  if (!raw) return false;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return false;
  return parsed < Date.now();
}

class AssessAdminQualityGateCapability extends BaseCapability {
  static name = 'AssessAdminQualityGate';
  static version = '1.0.0';

  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];

  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;

  static persistStrategy = 'analysis';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      includeCompleted: { type: 'boolean' },
    },
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: { type: 'object', additionalProperties: true },
      metadata: { type: 'object', additionalProperties: true },
      warnings: { type: 'array', maxItems: 20 },
    },
  };

  async execute(context = {}) {
    const safeContext = context && typeof context === 'object' ? context : {};
    const input =
      safeContext.input && typeof safeContext.input === 'object' ? safeContext.input : {};
    const snapshot =
      safeContext.systemStateSnapshot && typeof safeContext.systemStateSnapshot === 'object'
        ? safeContext.systemStateSnapshot
        : {};

    const includeCompleted = input.includeCompleted === true;
    let tasks = asArray(snapshot.adminTasks);
    if (!includeCompleted) {
      tasks = tasks.filter((task) => {
        const status = normalizeText(task.status).toLowerCase();
        return status !== 'done' && status !== 'completed' && status !== 'closed';
      });
    }

    const warnings = [];
    const issues = [];

    if (tasks.length === 0) {
      warnings.push('Inga adminuppgifter i snapshot.');
    }

    let missingOwner = 0;
    let missingStatus = 0;
    let missingDod = 0;
    let missingNextStep = 0;
    let overdue = 0;

    for (const task of tasks) {
      const id = normalizeText(task.id);
      const title = normalizeText(task.title) || id || 'Namnlös uppgift';
      const owner = normalizeText(task.owner);
      const status = normalizeText(task.status).toLowerCase();
      const dod = normalizeText(task.dod);
      const nextStep = normalizeText(task.nextStep);
      const deadline = normalizeText(task.deadline);

      const taskIssues = [];
      if (!owner) {
        missingOwner += 1;
        taskIssues.push('saknar_owner');
      }
      if (!status) {
        missingStatus += 1;
        taskIssues.push('saknar_status');
      }
      if (!dod) {
        missingDod += 1;
        taskIssues.push('saknar_dod');
      }
      if (!nextStep && status !== 'done' && status !== 'completed') {
        missingNextStep += 1;
        taskIssues.push('saknar_nasta_steg');
      }
      if (deadline && isPastDeadline(deadline) && status !== 'done' && status !== 'completed') {
        overdue += 1;
        taskIssues.push('forfallet_deadline');
      }

      if (taskIssues.length > 0) {
        issues.push({
          taskId: id,
          title,
          workstream: normalizeText(task.workstream) || 'general',
          issues: taskIssues,
          severity: taskIssues.includes('forfallet_deadline') ? 'high' : 'medium',
        });
      }
    }

    const gatePassed =
      missingOwner === 0 &&
      missingStatus === 0 &&
      missingDod === 0 &&
      missingNextStep === 0 &&
      overdue === 0 &&
      tasks.length > 0;

    const summary = gatePassed
      ? `Admin quality gate: godkänd för ${tasks.length} uppgifter.`
      : [
          `Admin quality gate: ${issues.length} uppgift(er) behöver åtgärd.`,
          missingOwner ? `${missingOwner} saknar ägare.` : '',
          missingDod ? `${missingDod} saknar DoD.` : '',
          missingNextStep ? `${missingNextStep} saknar nästa steg.` : '',
          overdue ? `${overdue} förfallna.` : '',
        ]
          .filter(Boolean)
          .join(' ');

    return {
      data: {
        gatePassed,
        totalTasks: tasks.length,
        missingOwner,
        missingStatus,
        missingDod,
        missingNextStep,
        overdue,
        flaggedTasks: issues.slice(0, 30),
        summary,
        generatedAt: new Date().toISOString(),
      },
      metadata: {
        capability: AssessAdminQualityGateCapability.name,
        version: AssessAdminQualityGateCapability.version,
      },
      warnings,
    };
  }
}

module.exports = {
  AssessAdminQualityGateCapability,
};
