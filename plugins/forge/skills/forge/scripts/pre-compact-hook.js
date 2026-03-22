#!/usr/bin/env node
/**
 * Forge PreCompact Hook
 *
 * Before compaction, output workflow context to stdout so it
 * survives in the compacted summary. The SessionStart hook will
 * re-inject full context when the session resumes after compaction.
 */

const path = require('path');
const fs = require('fs');
const libDir = path.join(__dirname, 'lib');
const { findForgeDir, getWorkflow, PHASE_ORDER } = require(path.join(libDir, 'state'));
const { getEnforcementLevel } = require(path.join(libDir, 'config'));

function main() {
  const forgeDir = findForgeDir();
  if (!forgeDir) process.exit(0);

  const workflow = getWorkflow(forgeDir);
  if (!workflow || !workflow.current_phase) process.exit(0);

  const phase = workflow.current_phase;
  const phaseIdx = PHASE_ORDER.indexOf(phase) + 1;
  const enforcement = getEnforcementLevel(phase, forgeDir);
  const phaseData = workflow.phases[phase];

  const lines = [
    `[Forge] Preserving workflow context before compaction:`,
    `[Forge] Workflow: "${workflow.title}" (${workflow.workflow_id})`,
    `[Forge] Phase ${phaseIdx}/6: ${phase} (${enforcement} enforcement)`,
  ];

  // DoD status
  if (phaseData.dod) {
    const entries = Object.entries(phaseData.dod);
    if (entries.length > 0) {
      lines.push('[Forge] DoD:');
      for (const [key, met] of entries) {
        lines.push(`  ${met ? 'PASS' : 'TODO'}: ${key}`);
      }
    }
  }

  // Modified files
  if (workflow.modified_files && workflow.modified_files.length > 0) {
    lines.push(`[Forge] Modified files (${workflow.modified_files.length}):`);
    for (const f of workflow.modified_files.slice(0, 10)) {
      lines.push(`  - ${f}`);
    }
    if (workflow.modified_files.length > 10) {
      lines.push(`  ... and ${workflow.modified_files.length - 10} more`);
    }
  }

  // Retry state
  if (workflow.retry_count > 0) {
    lines.push(`[Forge] Retry count: ${workflow.retry_count}`);
    if (workflow.last_error) {
      lines.push(`[Forge] Last error: ${workflow.last_error}`);
    }
  }

  // Artifacts
  const artifacts = PHASE_ORDER
    .filter(p => workflow.phases[p].artifact)
    .map(p => `${p}: ${workflow.phases[p].artifact}`);
  if (artifacts.length > 0) {
    lines.push('[Forge] Artifacts:');
    for (const a of artifacts) {
      lines.push(`  - ${a}`);
    }
  }

  // Ensure workflow.json is flushed to disk
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

main();
