/**
 * Forge State Library
 * Read/write .forge/workflow.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PHASE_ORDER = ['discover', 'specify', 'design', 'implement', 'review', 'ship'];

const PHASE_DOD = {
  discover: { problem_framed: false, scope_identified: false, artifact_written: false },
  specify: { acceptance_criteria_defined: false, criteria_testable: false, artifact_written: false },
  design: { plan_written: false, adrs_written: false, artifact_written: false },
  implement: { tests_pass: false, lint_clean: false, build_succeeds: false, acceptance_criteria_met: false },
  review: { dimensions_evaluated: false, required_dimensions_pass: false, no_blocking_issues: false, artifact_written: false },
  ship: { branch_created: false, committed: false, pr_created: false, ci_green: false }
};

/**
 * Find the .forge/ directory by walking up from cwd.
 * Returns the path to .forge/ or null if not found.
 */
function findForgeDir(startDir) {
  let dir = startDir || process.cwd();
  while (true) {
    const forgeDir = path.join(dir, '.forge');
    if (fs.existsSync(forgeDir) && fs.statSync(forgeDir).isDirectory()) {
      return forgeDir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function getWorkflowPath(forgeDir) {
  return path.join(forgeDir || findForgeDir(), 'workflow.json');
}

/**
 * Read workflow.json. Returns null if no active workflow.
 */
function getWorkflow(forgeDir) {
  const fp = getWorkflowPath(forgeDir);
  if (!fp || !fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Write workflow.json.
 */
function saveWorkflow(workflow, forgeDir) {
  const dir = forgeDir || findForgeDir();
  if (!dir) throw new Error('No .forge/ directory found');
  fs.writeFileSync(path.join(dir, 'workflow.json'), JSON.stringify(workflow, null, 2) + '\n');
}

/**
 * Merge a patch into workflow.json.
 */
function updateWorkflow(patch, forgeDir) {
  const workflow = getWorkflow(forgeDir);
  if (!workflow) throw new Error('No active workflow');
  const updated = { ...workflow, ...patch };
  saveWorkflow(updated, forgeDir);
  return updated;
}

/**
 * Check if there is an active forge workflow.
 */
function isActive(forgeDir) {
  const workflow = getWorkflow(forgeDir);
  return workflow !== null && workflow.current_phase !== null;
}

/**
 * Get current phase name.
 */
function getPhase(forgeDir) {
  const workflow = getWorkflow(forgeDir);
  return workflow ? workflow.current_phase : null;
}

/**
 * Get current step index.
 */
function getStep(forgeDir) {
  const workflow = getWorkflow(forgeDir);
  return workflow ? workflow.current_step : null;
}

/**
 * Get retry count.
 */
function getRetryCount(forgeDir) {
  const workflow = getWorkflow(forgeDir);
  return workflow ? workflow.retry_count : 0;
}

/**
 * Increment retry count and set last error.
 */
function incrementRetry(error, forgeDir) {
  const workflow = getWorkflow(forgeDir);
  if (!workflow) return;
  workflow.retry_count = (workflow.retry_count || 0) + 1;
  workflow.last_error = error || null;
  saveWorkflow(workflow, forgeDir);
  return workflow.retry_count;
}

/**
 * Reset retry count.
 */
function resetRetry(forgeDir) {
  updateWorkflow({ retry_count: 0, last_error: null }, forgeDir);
}

/**
 * Get next phase in order. Returns null if at end.
 */
function getNextPhase(currentPhase) {
  const idx = PHASE_ORDER.indexOf(currentPhase);
  if (idx === -1 || idx >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

/**
 * Advance to next phase.
 */
function advancePhase(forgeDir) {
  const workflow = getWorkflow(forgeDir);
  if (!workflow) throw new Error('No active workflow');

  const oldPhase = workflow.current_phase;
  const newPhase = getNextActivePhase(oldPhase, workflow);

  // Complete old phase
  workflow.phases[oldPhase].status = 'completed';
  workflow.phases[oldPhase].completed_at = new Date().toISOString();

  if (newPhase) {
    // Start new phase
    workflow.current_phase = newPhase;
    workflow.current_step = 0;
    workflow.retry_count = 0;
    workflow.last_error = null;
    workflow.phase_started = new Date().toISOString();
    workflow.phases[newPhase].status = 'in_progress';
    workflow.phases[newPhase].started_at = new Date().toISOString();
    workflow.phases[newPhase].dod = { ...PHASE_DOD[newPhase] };
  } else {
    // Workflow complete
    workflow.current_phase = null;
    workflow.current_step = 0;
  }

  saveWorkflow(workflow, forgeDir);
  return { oldPhase, newPhase, workflowComplete: newPhase === null };
}

/**
 * Complete current step and advance step counter.
 */
function completeStep(forgeDir) {
  const workflow = getWorkflow(forgeDir);
  if (!workflow) return;

  const phase = workflow.phases[workflow.current_phase];
  if (phase.steps && phase.steps[workflow.current_step]) {
    phase.steps[workflow.current_step].status = 'completed';
  }
  workflow.current_step++;
  saveWorkflow(workflow, forgeDir);
}

/**
 * Get modified files list.
 */
function getModifiedFiles(forgeDir) {
  const workflow = getWorkflow(forgeDir);
  return workflow ? (workflow.modified_files || []) : [];
}

/**
 * Add a file to modified files list (deduped).
 */
function addModifiedFile(filePath, forgeDir) {
  const workflow = getWorkflow(forgeDir);
  if (!workflow) return;
  if (!workflow.modified_files) workflow.modified_files = [];
  const normalized = path.normalize(filePath);
  if (!workflow.modified_files.includes(normalized)) {
    workflow.modified_files.push(normalized);
    saveWorkflow(workflow, forgeDir);
  }
}

/**
 * Get DoD object for current phase.
 */
function getDod(forgeDir) {
  const workflow = getWorkflow(forgeDir);
  if (!workflow) return null;
  return workflow.phases[workflow.current_phase]?.dod || null;
}

/**
 * Update DoD criteria for current phase.
 */
function updateDod(patch, forgeDir) {
  const workflow = getWorkflow(forgeDir);
  if (!workflow) return;
  const phase = workflow.phases[workflow.current_phase];
  if (!phase.dod) phase.dod = {};
  Object.assign(phase.dod, patch);
  saveWorkflow(workflow, forgeDir);
}

/**
 * Get/set stop_hook_active flag.
 */
function isStopHookActive(forgeDir) {
  const workflow = getWorkflow(forgeDir);
  return workflow ? workflow.stop_hook_active === true : false;
}

function setStopHookActive(active, forgeDir) {
  updateWorkflow({ stop_hook_active: active }, forgeDir);
}

/**
 * Create a new workflow.
 */
function createWorkflow(title, startingPhase, fastPath, forgeDir) {
  const dir = forgeDir || findForgeDir();
  if (!dir) throw new Error('No .forge/ directory found. Run /forge init first.');

  const workflow = {
    workflow_id: crypto.randomUUID(),
    created: new Date().toISOString(),
    title: title || 'Untitled workflow',
    current_phase: startingPhase || 'discover',
    current_step: 0,
    phase_started: new Date().toISOString(),
    retry_count: 0,
    last_error: null,
    stop_hook_active: false,
    phases: {},
    fast_path: fastPath || null,
    modified_files: []
  };

  // Initialize all phases
  for (const phase of PHASE_ORDER) {
    workflow.phases[phase] = {
      status: 'pending',
      started_at: null,
      completed_at: null,
      artifact: null,
      adrs: [],
      steps: [],
      dod: {},
      justification: null
    };
  }

  // Mark skipped phases based on fast path
  const skippedPhases = getSkippedPhases(fastPath);
  for (const phase of skippedPhases) {
    workflow.phases[phase].status = 'skipped';
    workflow.phases[phase].completed_at = new Date().toISOString();
  }

  // Activate starting phase
  workflow.phases[startingPhase || 'discover'].status = 'in_progress';
  workflow.phases[startingPhase || 'discover'].started_at = new Date().toISOString();
  workflow.phases[startingPhase || 'discover'].dod = { ...PHASE_DOD[startingPhase || 'discover'] };

  saveWorkflow(workflow, dir);
  return workflow;
}

/**
 * Get phases to skip based on fast path.
 */
function getSkippedPhases(fastPath) {
  switch (fastPath) {
    case 'trivial': return ['discover', 'specify', 'design', 'review'];
    case 'small': return ['discover', 'design'];
    case 'exploratory': return ['specify', 'design', 'implement', 'review', 'ship'];
    default: return [];
  }
}

/**
 * Get the next non-skipped phase after the given phase.
 */
function getNextActivePhase(currentPhase, workflow) {
  const idx = PHASE_ORDER.indexOf(currentPhase);
  for (let i = idx + 1; i < PHASE_ORDER.length; i++) {
    if (workflow.phases[PHASE_ORDER[i]].status !== 'skipped') {
      return PHASE_ORDER[i];
    }
  }
  return null;
}

module.exports = {
  PHASE_ORDER,
  PHASE_DOD,
  findForgeDir,
  getWorkflow,
  saveWorkflow,
  updateWorkflow,
  isActive,
  getPhase,
  getStep,
  getRetryCount,
  incrementRetry,
  resetRetry,
  getNextPhase,
  getNextActivePhase,
  advancePhase,
  completeStep,
  getModifiedFiles,
  addModifiedFile,
  getDod,
  updateDod,
  isStopHookActive,
  setStopHookActive,
  createWorkflow,
  getSkippedPhases
};
