/**
 * Forge Enforcement Library
 * DoD evaluation and gate logic
 */

const { execSync } = require('child_process');
const { getConfig, getEnforcementLevel, getCommand } = require('./config');
const { getWorkflow, getDod, findForgeDir } = require('./state');

/**
 * Run a command and return { success, output }.
 */
function runCheck(command, cwd) {
  if (!command) return { success: true, output: 'No command configured (skipped)', skipped: true };
  try {
    const output = execSync(command, {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return { success: true, output: output.trim() };
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    return { success: false, output: output.trim() };
  }
}

/**
 * Evaluate hard DoD criteria by running actual commands.
 * Returns { met, items: [{ criterion, met, detail, skipped }] }
 */
function evaluateHardDod(forgeDir) {
  const dir = forgeDir || findForgeDir();
  const config = getConfig(dir);
  const workflow = getWorkflow(dir);
  if (!workflow) return { met: false, items: [] };

  const phase = workflow.current_phase;
  const items = [];

  if (phase === 'implement') {
    // Run tests
    const testCmd = config.standards.test;
    const testResult = runCheck(testCmd, process.cwd());
    items.push({
      criterion: 'tests_pass',
      met: testResult.success,
      detail: testResult.skipped ? 'No test command configured' : (testResult.success ? 'All tests pass' : testResult.output.slice(-500)),
      skipped: testResult.skipped || false
    });

    // Run lint
    const lintCmd = config.standards.lint;
    const lintResult = runCheck(lintCmd, process.cwd());
    items.push({
      criterion: 'lint_clean',
      met: lintResult.success,
      detail: lintResult.skipped ? 'No lint command configured' : (lintResult.success ? 'Lint clean' : lintResult.output.slice(-500)),
      skipped: lintResult.skipped || false
    });

    // Run build
    const buildCmd = config.standards.build;
    const buildResult = runCheck(buildCmd, process.cwd());
    items.push({
      criterion: 'build_succeeds',
      met: buildResult.success,
      detail: buildResult.skipped ? 'No build command configured' : (buildResult.success ? 'Build succeeds' : buildResult.output.slice(-500)),
      skipped: buildResult.skipped || false
    });

  } else if (phase === 'review') {
    // Check that review artifact exists
    const reviewPath = workflow.phases.review.artifact;
    const hasArtifact = reviewPath && require('fs').existsSync(require('path').resolve(process.cwd(), reviewPath));
    items.push({
      criterion: 'artifact_written',
      met: hasArtifact,
      detail: hasArtifact ? 'Review report exists' : 'REVIEW.md not found'
    });

    // Check DoD flags set by review skill
    const dod = workflow.phases.review.dod || {};
    items.push({
      criterion: 'dimensions_evaluated',
      met: dod.dimensions_evaluated === true,
      detail: dod.dimensions_evaluated ? 'All dimensions evaluated' : 'Review dimensions not yet evaluated'
    });
    items.push({
      criterion: 'required_dimensions_pass',
      met: dod.required_dimensions_pass === true,
      detail: dod.required_dimensions_pass ? 'Required dimensions pass' : 'Not enough review dimensions passing'
    });
    items.push({
      criterion: 'no_blocking_issues',
      met: dod.no_blocking_issues === true,
      detail: dod.no_blocking_issues ? 'No blocking issues' : 'Blocking issues remain'
    });

  } else if (phase === 'ship') {
    // Check DoD flags set by ship skill
    const dod = workflow.phases.ship.dod || {};
    items.push({
      criterion: 'committed',
      met: dod.committed === true,
      detail: dod.committed ? 'Changes committed' : 'Changes not yet committed'
    });
    items.push({
      criterion: 'pr_created',
      met: dod.pr_created === true,
      detail: dod.pr_created ? 'PR created' : 'PR not yet created'
    });
  }

  const met = items.length > 0 && items.every(i => i.met);
  return { met, items };
}

/**
 * Evaluate soft DoD by checking artifact existence and DoD flags.
 * Returns { met, items: [{ criterion, met, detail }] }
 */
function evaluateSoftDod(forgeDir) {
  const dir = forgeDir || findForgeDir();
  const workflow = getWorkflow(dir);
  if (!workflow) return { met: false, items: [] };

  const phase = workflow.current_phase;
  const dod = workflow.phases[phase].dod || {};
  const items = [];

  for (const [key, value] of Object.entries(dod)) {
    items.push({
      criterion: key,
      met: value === true,
      detail: value === true ? 'Done' : 'Not yet completed'
    });
  }

  // Check artifact
  const artifact = workflow.phases[phase].artifact;
  if (artifact) {
    const exists = require('fs').existsSync(require('path').resolve(process.cwd(), artifact));
    items.push({
      criterion: 'artifact_exists',
      met: exists,
      detail: exists ? `${artifact} exists` : `${artifact} not found`
    });
  }

  const met = items.length === 0 || items.every(i => i.met);
  return { met, items };
}

/**
 * Format DoD evaluation result for display.
 */
function formatDodReport(evaluation) {
  const lines = [];
  for (const item of evaluation.items) {
    const icon = item.met ? 'PASS' : (item.skipped ? 'SKIP' : 'FAIL');
    lines.push(`  [${icon}] ${item.criterion}: ${item.detail}`);
  }
  const summary = evaluation.met ? 'All DoD criteria met' : 'DoD criteria NOT met';
  return `${summary}\n${lines.join('\n')}`;
}

/**
 * Determine if a phase should block stopping.
 */
function shouldBlock(forgeDir) {
  const dir = forgeDir || findForgeDir();
  const workflow = getWorkflow(dir);
  if (!workflow) return false;

  const phase = workflow.current_phase;
  const enforcement = getEnforcementLevel(phase, dir);
  return enforcement === 'hard';
}

module.exports = {
  runCheck,
  evaluateHardDod,
  evaluateSoftDod,
  formatDodReport,
  shouldBlock
};
