#!/usr/bin/env node
/**
 * Forge Hard Stop Hook (command-type)
 *
 * Fires when Claude tries to stop. For hard-enforcement phases,
 * runs measurable DoD checks (test, lint, build) and blocks if they fail.
 * Soft-enforcement phases are handled by the prompt-type stop hook.
 *
 * Exit codes:
 *   0 = allow stop
 *   2 = block stop (stderr shown to user)
 */

const path = require('path');
const libDir = path.join(__dirname, 'lib');
const { findForgeDir, getWorkflow, isStopHookActive, setStopHookActive, resetRetry, incrementRetry, advancePhase, getNextActivePhase } = require(path.join(libDir, 'state'));
const { getEnforcementLevel, getMaxRetries } = require(path.join(libDir, 'config'));
const { evaluateHardDod, formatDodReport } = require(path.join(libDir, 'enforcement'));
const { shouldEscalate, getEscalationContext, formatRetryMessage, formatEscalationMessage, logToHistory, archiveWorkflow } = require(path.join(libDir, 'recovery'));

function main() {
  let input = '';
  try {
    input = require('fs').readFileSync('/dev/stdin', 'utf8');
  } catch {
    // No stdin is fine
  }

  let stdinData = {};
  try {
    stdinData = JSON.parse(input);
  } catch {
    // Not JSON, that's ok
  }

  const forgeDir = findForgeDir();
  if (!forgeDir) {
    process.exit(0); // No forge project, not our concern
  }

  const workflow = getWorkflow(forgeDir);
  if (!workflow || !workflow.current_phase) {
    process.exit(0); // No active workflow
  }

  // Break infinite loop
  if (workflow.stop_hook_active || stdinData.stop_hook_active) {
    process.exit(0);
  }

  const phase = workflow.current_phase;
  const enforcement = getEnforcementLevel(phase, forgeDir);

  // Only handle hard enforcement phases
  if (enforcement !== 'hard') {
    process.exit(0); // Soft phases handled by prompt-type hook
  }

  // Set flag to prevent re-entry
  setStopHookActive(true, forgeDir);

  try {
    // Run DoD checks
    const dodResult = evaluateHardDod(forgeDir);

    if (dodResult.met) {
      // All checks pass - advance phase
      logToHistory({
        type: 'phase_completed',
        phase: phase,
        dod: dodResult.items.map(i => ({ criterion: i.criterion, met: i.met }))
      }, forgeDir);

      const nextPhase = getNextActivePhase(phase, workflow);
      if (nextPhase) {
        advancePhase(forgeDir);
        process.stderr.write(`[Forge] Phase "${phase}" complete. Advancing to "${nextPhase}".\n`);
      } else {
        // Workflow complete
        advancePhase(forgeDir);
        archiveWorkflow(forgeDir);
        process.stderr.write(`[Forge] All phases complete! Workflow "${workflow.title}" finished.\n`);
      }

      setStopHookActive(false, forgeDir);
      process.exit(0);
    }

    // DoD not met - check retry count
    const maxRetries = getMaxRetries(forgeDir);

    if (shouldEscalate(forgeDir)) {
      // Max retries reached - escalate to user
      const context = getEscalationContext(forgeDir);
      const message = formatEscalationMessage(dodResult, context);

      logToHistory({
        type: 'escalation',
        phase: phase,
        retry_count: context.retryCount,
        failing: dodResult.items.filter(i => !i.met).map(i => i.criterion)
      }, forgeDir);

      resetRetry(forgeDir);
      setStopHookActive(false, forgeDir);
      process.stderr.write(message + '\n');
      process.exit(0); // Allow stop so user can intervene
    }

    // Retry - block and provide feedback
    const retryCount = incrementRetry(
      dodResult.items.filter(i => !i.met).map(i => `${i.criterion}: ${i.detail}`).join('; '),
      forgeDir
    );
    const message = formatRetryMessage(dodResult, retryCount, maxRetries);

    logToHistory({
      type: 'retry',
      phase: phase,
      retry_count: retryCount,
      failing: dodResult.items.filter(i => !i.met).map(i => i.criterion)
    }, forgeDir);

    setStopHookActive(false, forgeDir);
    process.stderr.write(message + '\n');
    process.exit(2); // Block stop

  } catch (err) {
    // On any error, allow stop (don't trap the user)
    setStopHookActive(false, forgeDir);
    process.stderr.write(`[Forge] Stop hook error: ${err.message}\n`);
    process.exit(0);
  }
}

main();
