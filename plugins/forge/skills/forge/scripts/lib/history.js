/**
 * Forge History Library
 * Read and summarize workflow history from .forge/history/
 */

const fs = require('fs');
const path = require('path');
const { findForgeDir } = require('./state');

/**
 * List all history entries, sorted by date descending.
 */
function listHistory(forgeDir) {
  const dir = forgeDir || findForgeDir();
  if (!dir) return [];

  const historyDir = path.join(dir, 'history');
  if (!fs.existsSync(historyDir)) return [];

  const files = fs.readdirSync(historyDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  const entries = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8'));
      const completionEvent = (data.events || []).find(e => e.type === 'workflow_completed');
      const retryEvents = (data.events || []).filter(e => e.type === 'retry');
      const escalationEvents = (data.events || []).filter(e => e.type === 'escalation');

      entries.push({
        file,
        title: data.title || 'Untitled',
        workflow_id: data.workflow_id,
        created: data.created,
        completed: completionEvent ? completionEvent.timestamp : null,
        duration_minutes: completionEvent ? completionEvent.duration_minutes : null,
        phases_completed: completionEvent ? completionEvent.phases_completed : [],
        phases_skipped: completionEvent ? completionEvent.phases_skipped : [],
        fast_path: completionEvent ? completionEvent.fast_path : null,
        retries: retryEvents.length,
        escalations: escalationEvents.length,
        events_count: (data.events || []).length
      });
    } catch {
      // Skip corrupt files
    }
  }

  return entries;
}

/**
 * Format history for display.
 */
function formatHistory(entries) {
  if (entries.length === 0) {
    return 'No workflow history found.';
  }

  const lines = ['Forge Workflow History', '=====================', ''];

  for (const entry of entries) {
    const date = entry.created ? entry.created.slice(0, 10) : 'unknown';
    const duration = entry.duration_minutes ? `${entry.duration_minutes}min` : 'incomplete';
    const phases = entry.phases_completed.length > 0 ?
      entry.phases_completed.join(' -> ') : 'no phases completed';
    const fastPath = entry.fast_path ? ` [${entry.fast_path}]` : '';
    const retryInfo = entry.retries > 0 ? ` (${entry.retries} retries)` : '';
    const escInfo = entry.escalations > 0 ? ` (${entry.escalations} escalations)` : '';

    lines.push(`${date}  ${entry.title}${fastPath}`);
    lines.push(`  Duration: ${duration} | Phases: ${phases}${retryInfo}${escInfo}`);
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = { listHistory, formatHistory };
