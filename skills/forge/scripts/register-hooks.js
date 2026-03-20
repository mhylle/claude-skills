#!/usr/bin/env node
/**
 * Forge Hook Registration Script
 *
 * Merges Forge hooks into ~/.claude/hooks.json (or settings.json hooks section)
 * without overwriting existing hooks. Idempotent - safe to re-run.
 *
 * Usage: node register-hooks.js [--unregister]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOOKS_JSON_PATH = path.join(os.homedir(), '.claude', 'hooks.json');
const SETTINGS_JSON_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const FORGE_TEMPLATE_PATH = path.join(__dirname, '..', 'hooks-template.json');

// Unique identifier prefix for forge hooks
const FORGE_MARKER = 'node ~/.claude/skills/forge/scripts/';

function main() {
  const unregister = process.argv.includes('--unregister');

  // Read forge hooks template
  if (!fs.existsSync(FORGE_TEMPLATE_PATH)) {
    console.error('Error: hooks-template.json not found at', FORGE_TEMPLATE_PATH);
    process.exit(1);
  }
  const forgeHooks = JSON.parse(fs.readFileSync(FORGE_TEMPLATE_PATH, 'utf8')).hooks;

  // Determine target file - prefer hooks.json if it exists, else settings.json
  let targetPath;
  let targetData;
  let hooksKey;

  if (fs.existsSync(HOOKS_JSON_PATH)) {
    targetPath = HOOKS_JSON_PATH;
    try {
      targetData = JSON.parse(fs.readFileSync(HOOKS_JSON_PATH, 'utf8'));
    } catch {
      targetData = {};
    }
    hooksKey = 'hooks';
  } else {
    targetPath = SETTINGS_JSON_PATH;
    try {
      targetData = JSON.parse(fs.readFileSync(SETTINGS_JSON_PATH, 'utf8'));
    } catch {
      targetData = {};
    }
    hooksKey = 'hooks';
  }

  if (!targetData[hooksKey]) {
    targetData[hooksKey] = {};
  }

  // Create backup
  const backupPath = targetPath + '.backup';
  fs.writeFileSync(backupPath, JSON.stringify(targetData, null, 2) + '\n');
  console.log(`Backup created: ${backupPath}`);

  if (unregister) {
    // Remove all forge hooks
    for (const event of Object.keys(targetData[hooksKey])) {
      const eventHooks = targetData[hooksKey][event];
      if (Array.isArray(eventHooks)) {
        targetData[hooksKey][event] = eventHooks.filter(entry => {
          const hooks = entry.hooks || [];
          return !hooks.some(h => isForgeHook(h));
        });
        // Clean up empty arrays
        if (targetData[hooksKey][event].length === 0) {
          delete targetData[hooksKey][event];
        }
      }
    }
    console.log('Forge hooks removed.');
  } else {
    // Merge forge hooks
    for (const [event, entries] of Object.entries(forgeHooks)) {
      if (!targetData[hooksKey][event]) {
        targetData[hooksKey][event] = [];
      }

      for (const entry of entries) {
        // Check if this forge hook already exists (by command string)
        const alreadyExists = targetData[hooksKey][event].some(existing => {
          const existingHooks = existing.hooks || [];
          const newHooks = entry.hooks || [];
          return newHooks.some(nh =>
            existingHooks.some(eh => isForgeHook(eh) && eh.command === nh.command && eh.type === nh.type)
          );
        });

        if (alreadyExists) {
          console.log(`  [skip] ${event}: already registered`);
        } else {
          targetData[hooksKey][event].push(entry);
          const hookType = entry.hooks?.[0]?.type || 'unknown';
          const hookCmd = entry.hooks?.[0]?.command?.split('/').pop() || entry.hooks?.[0]?.type || '';
          console.log(`  [add]  ${event}: ${hookCmd} (${hookType})`);
        }
      }
    }
  }

  // Validate JSON before writing
  try {
    JSON.parse(JSON.stringify(targetData));
  } catch (e) {
    console.error('Error: generated invalid JSON. Aborting. Backup preserved at', backupPath);
    process.exit(1);
  }

  fs.writeFileSync(targetPath, JSON.stringify(targetData, null, 2) + '\n');
  console.log(`\nWritten to: ${targetPath}`);

  if (!unregister) {
    console.log('\nForge hooks registered successfully.');
    console.log('Run with --unregister to remove forge hooks.');
  }
}

function isForgeHook(hook) {
  if (hook.command && hook.command.includes(FORGE_MARKER)) return true;
  if (hook.prompt && hook.prompt.includes('.forge/workflow.json')) return true;
  return false;
}

main();
