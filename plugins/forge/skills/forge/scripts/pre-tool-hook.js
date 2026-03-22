#!/usr/bin/env node
/**
 * Forge PreToolUse Hook
 *
 * Validates tool use against current phase constraints.
 * - Blocks edits during Review phase
 * - Warns about edits during planning phases (Discover, Specify, Design)
 * - Blocks dangerous Bash commands during active workflow
 *
 * Exit codes:
 *   0 = allow
 *   2 = block (stderr shown to Claude)
 */

const path = require('path');
const fs = require('fs');
const libDir = path.join(__dirname, 'lib');
const { findForgeDir, getWorkflow } = require(path.join(libDir, 'state'));

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

  const phase = workflow.current_phase;
  const toolName = data.tool_name || '';
  const toolInput = data.tool_input || {};

  // Edit/Write constraints
  if (toolName === 'Edit' || toolName === 'Write') {
    const filePath = toolInput.file_path || '';

    // Allow edits to .forge/ files always (workflow management)
    if (filePath.includes('.forge/')) {
      process.exit(0);
    }

    if (phase === 'review') {
      // Block code edits during Review - should be reviewing, not changing
      process.stderr.write(`[Forge] Review phase: editing code is blocked until review is complete. Fix blocking issues found during review, or advance to Ship first.\n`);
      process.exit(2);
    }

    if (phase === 'discover' || phase === 'specify' || phase === 'design') {
      // Warn about code edits during planning - not blocked, just a reminder
      process.stderr.write(`[Forge] Warning: editing code during ${phase} phase. Consider completing planning before implementation.\n`);
      process.exit(0);
    }
  }

  // Bash constraints
  if (toolName === 'Bash') {
    const command = toolInput.command || '';

    // Block dangerous commands during any active workflow
    const dangerous = [
      /rm\s+-rf\s+\//,
      /git\s+push\s+(-f|--force)\s+(origin\s+)?main/,
      /git\s+push\s+(-f|--force)\s+(origin\s+)?master/,
      /git\s+reset\s+--hard/,
      /DROP\s+TABLE/i,
      /DROP\s+DATABASE/i
    ];

    for (const pattern of dangerous) {
      if (pattern.test(command)) {
        process.stderr.write(`[Forge] Blocked: dangerous command detected during active workflow. Use /forge reset if you need to start over.\n`);
        process.exit(2);
      }
    }

    // During Review phase, restrict to read-only + test commands
    if (phase === 'review') {
      const readOnly = /^(cat|head|tail|less|grep|rg|find|ls|tree|wc|diff|git\s+(log|diff|status|show|blame))/;
      const testLike = /^(npm\s+test|npx\s+|jest|pytest|cargo\s+test|go\s+test|ruff|eslint|tsc|mypy)/;
      const nodeRun = /^node\s/;

      if (!readOnly.test(command) && !testLike.test(command) && !nodeRun.test(command) && command.trim() !== '') {
        // Not blocking - just warning. Review phase may need to run things.
        process.stderr.write(`[Forge] Review phase: consider whether this command is appropriate during review.\n`);
      }
    }
  }

  process.exit(0);
}

main();
