/**
 * Forge Recovery Library
 * Retry tracking, escalation logic, history logging
 */

const fs = require('fs');
const path = require('path');
const { getWorkflow, findForgeDir } = require('./state');
const { getMaxRetries } = require('./config');

/**
 * Check if we should escalate to the user.
 */
function shouldEscalate(forgeDir) {
  const dir = forgeDir || findForgeDir();
  const workflow = getWorkflow(dir);
  if (!workflow) return false;
  const maxRetries = getMaxRetries(dir);
  return workflow.retry_count >= maxRetries;
}

/**
 * Get context for escalation message.
 */
function getEscalationContext(forgeDir) {
  const dir = forgeDir || findForgeDir();
  const workflow = getWorkflow(dir);
  if (!workflow) return null;

  return {
    phase: workflow.current_phase,
    step: workflow.current_step,
    retryCount: workflow.retry_count,
    lastError: workflow.last_error,
    modifiedFiles: workflow.modified_files || [],
    title: workflow.title
  };
}

/**
 * Format retry feedback message for Claude.
 */
function formatRetryMessage(dodResult, retryCount, maxRetries) {
  const failing = dodResult.items.filter(i => !i.met && !i.skipped);
  const lines = [
    `[Forge] DoD check failed (attempt ${retryCount}/${maxRetries})`,
    '',
    'Failing criteria:'
  ];
  for (const item of failing) {
    lines.push(`  - ${item.criterion}: ${item.detail}`);
  }
  lines.push('');
  if (retryCount >= 2) {
    // On attempt 2+, suggest using the recovery agent for deeper diagnosis
    lines.push('Previous fix attempt did not resolve the issue. Consider using the forge-recovery agent for deeper diagnosis:');
    lines.push('  Spawn an Agent with subagent_type "forge-recovery" and provide it with:');
    lines.push('  - The failing criteria and error output above');
    lines.push('  - The list of modified files from .forge/workflow.json');
    lines.push('  - The .forge/config.json for understanding which tools are configured');
    lines.push('');
  }
  lines.push('Please fix the issues above and try again.');
  return lines.join('\n');
}

/**
 * Format escalation message for user.
 */
function formatEscalationMessage(dodResult, context) {
  const failing = dodResult.items.filter(i => !i.met && !i.skipped);
  const lines = [
    `[Forge] ESCALATION: Unable to meet DoD after ${context.retryCount} attempts`,
    `Workflow: ${context.title}`,
    `Phase: ${context.phase}`,
    '',
    'Failing criteria:'
  ];
  for (const item of failing) {
    lines.push(`  - ${item.criterion}: ${item.detail}`);
  }
  if (context.lastError) {
    lines.push('');
    lines.push('Last error:');
    lines.push(`  ${context.lastError}`);
  }
  lines.push('');
  lines.push('Modified files:');
  for (const f of context.modifiedFiles.slice(0, 10)) {
    lines.push(`  - ${f}`);
  }
  lines.push('');
  lines.push('Options:');
  lines.push('  1. Fix the issues manually and run /forge continue');
  lines.push('  2. Skip this check: /forge skip-to <next-phase>');
  lines.push('  3. Reset the workflow: /forge reset');
  return lines.join('\n');
}

/**
 * Log an event to workflow history.
 */
function logToHistory(event, forgeDir) {
  const dir = forgeDir || findForgeDir();
  if (!dir) return;

  const historyDir = path.join(dir, 'history');
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }

  const workflow = getWorkflow(dir);
  const slug = (workflow?.title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  const date = new Date().toISOString().slice(0, 10);
  const filename = `${date}-${slug}.json`;
  const filepath = path.join(historyDir, filename);

  let history;
  if (fs.existsSync(filepath)) {
    try {
      history = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch {
      history = { events: [] };
    }
  } else {
    history = {
      workflow_id: workflow?.workflow_id,
      title: workflow?.title,
      created: workflow?.created,
      events: []
    };
  }

  history.events.push({
    timestamp: new Date().toISOString(),
    ...event
  });

  fs.writeFileSync(filepath, JSON.stringify(history, null, 2) + '\n');
}

/**
 * Archive a completed workflow to history.
 */
function archiveWorkflow(forgeDir) {
  const dir = forgeDir || findForgeDir();
  const workflow = getWorkflow(dir);
  if (!workflow) return;

  const retries = {};
  for (const [phase, data] of Object.entries(workflow.phases)) {
    if (data.status === 'completed') {
      retries[phase] = 0; // We track retries per-stop, not per-phase historically
    }
  }

  logToHistory({
    type: 'workflow_completed',
    duration_minutes: Math.round((Date.now() - new Date(workflow.created).getTime()) / 60000),
    phases_completed: Object.entries(workflow.phases)
      .filter(([, d]) => d.status === 'completed')
      .map(([p]) => p),
    phases_skipped: Object.entries(workflow.phases)
      .filter(([, d]) => d.status === 'skipped')
      .map(([p]) => p),
    fast_path: workflow.fast_path,
    modified_files: workflow.modified_files
  }, dir);
}

module.exports = {
  shouldEscalate,
  getEscalationContext,
  formatRetryMessage,
  formatEscalationMessage,
  logToHistory,
  archiveWorkflow
};
