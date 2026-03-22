#!/usr/bin/env node
/**
 * Forge PostToolUse Hook
 *
 * Tracks progress after tool execution:
 * - Adds modified files to workflow.json on Edit/Write
 * - Captures test/lint/build results from Bash commands
 *
 * Always exits 0 (never blocks).
 */

const path = require('path');
const fs = require('fs');
const libDir = path.join(__dirname, 'lib');
const { findForgeDir, getWorkflow, addModifiedFile, updateDod, saveWorkflow } = require(path.join(libDir, 'state'));
const { getConfig } = require(path.join(libDir, 'config'));

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
  if (!forgeDir) process.exit(0);

  const workflow = getWorkflow(forgeDir);
  if (!workflow || !workflow.current_phase) process.exit(0);

  const toolName = data.tool_name || '';
  const toolInput = data.tool_input || {};
  const toolOutput = data.tool_output || '';

  // Track modified files on Edit/Write
  if (toolName === 'Edit' || toolName === 'Write') {
    const filePath = toolInput.file_path || '';
    if (filePath && !filePath.includes('.forge/')) {
      addModifiedFile(filePath, forgeDir);
    }
    process.exit(0);
  }

  // Capture command results from Bash
  if (toolName === 'Bash') {
    const command = toolInput.command || '';
    const config = getConfig(forgeDir);
    const phase = workflow.current_phase;

    // Only track DoD for implement phase
    if (phase !== 'implement') {
      process.exit(0);
    }

    // Check if this was a test command
    if (config.standards.test && commandMatches(command, config.standards.test)) {
      const exitCode = data.exit_code;
      const passed = exitCode === 0 || exitCode === undefined;
      updateDod({ tests_pass: passed }, forgeDir);
      if (passed) {
        process.stderr.write('[Forge] Tests pass - DoD updated.\n');
      }
    }

    // Check if this was a lint command
    if (config.standards.lint && commandMatches(command, config.standards.lint)) {
      const exitCode = data.exit_code;
      const passed = exitCode === 0 || exitCode === undefined;
      updateDod({ lint_clean: passed }, forgeDir);
      if (passed) {
        process.stderr.write('[Forge] Lint clean - DoD updated.\n');
      }
    }

    // Check if this was a build command
    if (config.standards.build && commandMatches(command, config.standards.build)) {
      const exitCode = data.exit_code;
      const passed = exitCode === 0 || exitCode === undefined;
      updateDod({ build_succeeds: passed }, forgeDir);
      if (passed) {
        process.stderr.write('[Forge] Build succeeds - DoD updated.\n');
      }
    }
  }

  process.exit(0);
}

/**
 * Check if a command matches a configured standard command.
 * Matches if the command starts with or contains the configured command.
 */
function commandMatches(actual, configured) {
  if (!actual || !configured) return false;
  const normalizedActual = actual.trim();
  const normalizedConfigured = configured.trim();
  return normalizedActual === normalizedConfigured ||
    normalizedActual.startsWith(normalizedConfigured + ' ') ||
    normalizedActual.startsWith(normalizedConfigured + '\n');
}

main();
