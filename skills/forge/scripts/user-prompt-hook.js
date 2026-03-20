#!/usr/bin/env node
/**
 * Forge UserPromptSubmit Hook
 *
 * When the user submits a prompt:
 * - If a workflow is active: remind Claude of current phase context
 * - If no workflow: suggest starting one if the message implies dev work
 *
 * Output on stdout is added to Claude's context.
 * Always exits 0 (never blocks).
 */

const path = require('path');
const fs = require('fs');
const libDir = path.join(__dirname, 'lib');
const { findForgeDir, getWorkflow, PHASE_ORDER } = require(path.join(libDir, 'state'));
const { getEnforcementLevel } = require(path.join(libDir, 'config'));

function main() {
  let input = '';
  try {
    input = fs.readFileSync('/dev/stdin', 'utf8');
  } catch {
    process.exit(0);
  }

  let data = {};
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const forgeDir = findForgeDir();
  const prompt = (data.prompt || '').toLowerCase();

  // If user is invoking a /forge command, don't add extra context
  if (prompt.startsWith('/forge')) {
    process.exit(0);
  }

  if (!forgeDir) {
    // No .forge/ directory - check if message implies dev work
    if (impliesDevWork(prompt)) {
      process.stdout.write('[Forge] Tip: This project has no Forge workflow. Use /forge init to set up, then /forge start to begin a tracked workflow.\n');
    }
    process.exit(0);
  }

  const workflow = getWorkflow(forgeDir);

  if (!workflow || !workflow.current_phase) {
    // .forge/ exists but no active workflow
    if (impliesDevWork(prompt)) {
      process.stdout.write('[Forge] Tip: No active workflow. Use /forge start to begin tracking this work.\n');
    }
    process.exit(0);
  }

  // Active workflow - inject phase context
  const phase = workflow.current_phase;
  const enforcement = getEnforcementLevel(phase, forgeDir);
  const phaseIdx = PHASE_ORDER.indexOf(phase) + 1;

  const lines = [];
  lines.push(`[Forge] Active: "${workflow.title}" - Phase ${phaseIdx}/6: ${phase} (${enforcement})`);

  // Add phase-specific reminders
  if (phase === 'discover' || phase === 'specify' || phase === 'design') {
    lines.push(`[Forge] Planning phase - focus on analysis and documentation, not code changes.`);
  } else if (phase === 'implement') {
    lines.push(`[Forge] Implementation phase - write tests first, then implement. Stop hook will verify DoD.`);
  } else if (phase === 'review') {
    lines.push(`[Forge] Review phase - evaluate code quality. Code edits are blocked until review is complete.`);
  } else if (phase === 'ship') {
    lines.push(`[Forge] Ship phase - commit, push, and create PR.`);
  }

  if (workflow.retry_count > 0) {
    lines.push(`[Forge] Note: ${workflow.retry_count} retry attempts on current phase.`);
  }

  process.stdout.write(lines.join('\n') + '\n');
  process.exit(0);
}

/**
 * Heuristic: does the user's message imply development work?
 */
function impliesDevWork(prompt) {
  const devPatterns = [
    /\b(implement|build|create|add|fix|refactor|update|change|modify|write|develop)\b/,
    /\b(feature|bug|issue|error|broken|failing|test|deploy)\b/,
    /\b(function|class|component|endpoint|api|service|module)\b/
  ];
  return devPatterns.some(p => p.test(prompt));
}

main();
