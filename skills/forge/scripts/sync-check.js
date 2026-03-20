#!/usr/bin/env node
/**
 * Forge Sync Check
 * Validates .forge/ state for cross-machine consistency.
 *
 * Checks:
 * 1. workflow.json parses as valid JSON
 * 2. current_phase is a valid phase name
 * 3. Referenced artifacts exist on disk
 * 4. Config commands are resolvable
 * 5. No merge conflicts in JSON files
 * 6. Config.json parses as valid JSON
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PHASE_ORDER = ['discover', 'specify', 'design', 'implement', 'review', 'ship'];

function main() {
  const forgeDir = findForgeDir(process.cwd());
  if (!forgeDir) {
    console.log('[Forge Sync Check] No .forge/ directory found.');
    process.exit(1);
  }

  const issues = [];
  const warnings = [];
  const ok = [];

  // Check 1: config.json
  const configPath = path.join(forgeDir, 'config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8');
    if (raw.includes('<<<<<<<') || raw.includes('>>>>>>>')) {
      issues.push('config.json has merge conflicts');
    } else {
      try {
        JSON.parse(raw);
        ok.push('config.json: valid JSON');
      } catch (e) {
        issues.push(`config.json: invalid JSON - ${e.message}`);
      }
    }
  } else {
    warnings.push('config.json not found - run /forge init');
  }

  // Check 2: workflow.json
  const workflowPath = path.join(forgeDir, 'workflow.json');
  if (fs.existsSync(workflowPath)) {
    const raw = fs.readFileSync(workflowPath, 'utf8');
    if (raw.includes('<<<<<<<') || raw.includes('>>>>>>>')) {
      issues.push('workflow.json has merge conflicts');
    } else {
      try {
        const wf = JSON.parse(raw);
        ok.push('workflow.json: valid JSON');

        // Check current_phase
        if (wf.current_phase !== null && !PHASE_ORDER.includes(wf.current_phase)) {
          issues.push(`workflow.json: invalid current_phase "${wf.current_phase}"`);
        } else {
          ok.push(`workflow.json: current_phase "${wf.current_phase || 'none'}" is valid`);
        }

        // Check stop_hook_active isn't stuck
        if (wf.stop_hook_active === true) {
          warnings.push('workflow.json: stop_hook_active is true (may be stuck - set to false if no hook is running)');
        }

        // Check referenced artifacts exist
        for (const [phase, data] of Object.entries(wf.phases || {})) {
          if (data.artifact) {
            const artifactPath = path.resolve(process.cwd(), data.artifact);
            if (fs.existsSync(artifactPath)) {
              ok.push(`artifact ${phase}: ${data.artifact} exists`);
            } else {
              warnings.push(`artifact ${phase}: ${data.artifact} not found on disk`);
            }
          }
          for (const adr of (data.adrs || [])) {
            const adrPath = path.resolve(process.cwd(), adr);
            if (!fs.existsSync(adrPath)) {
              warnings.push(`ADR ${adr} not found on disk`);
            }
          }
        }
      } catch (e) {
        issues.push(`workflow.json: invalid JSON - ${e.message}`);
      }
    }
  } else {
    ok.push('No active workflow (workflow.json not found)');
  }

  // Check 3: Config commands are resolvable
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const standards = config.standards || {};
      for (const [name, cmd] of Object.entries(standards)) {
        if (cmd === null) continue;
        const bin = cmd.split(' ')[0];
        // Check if the binary exists (npx, npm, node are always available)
        if (['npx', 'npm', 'node', 'python', 'python3', 'pip', 'cargo', 'go', 'dotnet'].includes(bin)) {
          continue; // Common tools, skip check
        }
        try {
          execSync(`which ${bin} 2>/dev/null`, { encoding: 'utf8' });
          ok.push(`command ${name}: "${bin}" found`);
        } catch {
          warnings.push(`command ${name}: "${bin}" not found in PATH (may need installing)`);
        }
      }
    } catch {
      // Already reported above
    }
  }

  // Check 4: Directory structure
  const artifactsDir = path.join(forgeDir, 'artifacts');
  const historyDir = path.join(forgeDir, 'history');
  if (!fs.existsSync(artifactsDir)) warnings.push('.forge/artifacts/ directory missing');
  if (!fs.existsSync(historyDir)) warnings.push('.forge/history/ directory missing');

  // Report
  console.log('Forge Sync Check');
  console.log('================\n');

  if (issues.length > 0) {
    console.log('ISSUES (must fix):');
    for (const i of issues) console.log(`  [FAIL] ${i}`);
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('WARNINGS (may need attention):');
    for (const w of warnings) console.log(`  [WARN] ${w}`);
    console.log('');
  }

  if (ok.length > 0) {
    console.log('PASSED:');
    for (const o of ok) console.log(`  [OK]   ${o}`);
    console.log('');
  }

  const summary = issues.length === 0
    ? (warnings.length === 0 ? 'All checks passed.' : `Passed with ${warnings.length} warning(s).`)
    : `${issues.length} issue(s) found. Fix before continuing.`;
  console.log(summary);

  process.exit(issues.length > 0 ? 1 : 0);
}

function findForgeDir(startDir) {
  let dir = startDir;
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

main();
