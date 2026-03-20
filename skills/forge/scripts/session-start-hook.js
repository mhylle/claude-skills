#!/usr/bin/env node
/**
 * Forge SessionStart Hook
 *
 * Fires on session start, resume, or after compaction.
 * Loads Forge workflow context and injects it into the conversation.
 *
 * Output on stdout is added to Claude's context.
 * Output on stderr is shown to the user.
 */

const path = require('path');
const libDir = path.join(__dirname, 'lib');
const { findForgeDir, getWorkflow, PHASE_ORDER } = require(path.join(libDir, 'state'));
const { getConfig, getEnforcementLevel } = require(path.join(libDir, 'config'));

function main() {
  let input = '';
  try {
    input = require('fs').readFileSync('/dev/stdin', 'utf8');
  } catch {
    // No stdin
  }

  let stdinData = {};
  try {
    stdinData = JSON.parse(input);
  } catch {
    // Not JSON
  }

  const forgeDir = findForgeDir();
  if (!forgeDir) {
    // No forge project - silent, don't clutter output
    process.exit(0);
  }

  const workflow = getWorkflow(forgeDir);
  if (!workflow || !workflow.current_phase) {
    process.stderr.write('[Forge] No active workflow. Use /forge start to begin.\n');
    process.exit(0);
  }

  const phase = workflow.current_phase;
  const phaseIdx = PHASE_ORDER.indexOf(phase) + 1;
  const enforcement = getEnforcementLevel(phase, forgeDir);
  const phaseData = workflow.phases[phase];

  // Build status lines
  const lines = [];
  lines.push(`[Forge] Active workflow: "${workflow.title}"`);
  lines.push(`[Forge] Phase ${phaseIdx}/6: ${phase} (${enforcement} enforcement)`);

  // Show step info if steps are defined
  if (phaseData.steps && phaseData.steps.length > 0) {
    const currentStep = phaseData.steps[workflow.current_step];
    const stepName = currentStep ? currentStep.name : 'unknown';
    lines.push(`[Forge] Step ${workflow.current_step + 1}/${phaseData.steps.length}: ${stepName}`);
  }

  // Show retry count if non-zero
  if (workflow.retry_count > 0) {
    const config = getConfig(forgeDir);
    lines.push(`[Forge] Retry count: ${workflow.retry_count}/${config.max_retries}`);
  }

  // Show modified files count
  if (workflow.modified_files && workflow.modified_files.length > 0) {
    lines.push(`[Forge] Modified files: ${workflow.modified_files.length}`);
  }

  // Show fast path if active
  if (workflow.fast_path) {
    lines.push(`[Forge] Fast path: ${workflow.fast_path}`);
  }

  // If resuming after compaction, add extra context
  const source = stdinData.source || '';
  if (source === 'compact') {
    lines.push('');
    lines.push('[Forge] Context restored after compaction:');

    // Show DoD status
    if (phaseData.dod) {
      const dodEntries = Object.entries(phaseData.dod);
      if (dodEntries.length > 0) {
        lines.push('[Forge] DoD status:');
        for (const [key, met] of dodEntries) {
          lines.push(`  ${met ? 'PASS' : 'TODO'}: ${key}`);
        }
      }
    }

    // Show last error if any
    if (workflow.last_error) {
      lines.push(`[Forge] Last error: ${workflow.last_error}`);
    }

    // Show artifact paths
    const artifactPhases = PHASE_ORDER.filter(p => workflow.phases[p].artifact);
    if (artifactPhases.length > 0) {
      lines.push('[Forge] Artifacts:');
      for (const p of artifactPhases) {
        lines.push(`  ${p}: ${workflow.phases[p].artifact}`);
      }
    }
  }

  // Write to stdout (injected into Claude's context)
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

main();
