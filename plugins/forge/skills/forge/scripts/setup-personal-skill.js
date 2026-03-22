#!/usr/bin/env node
/**
 * Forge Setup: Install /forge as a personal skill
 *
 * Plugin skills are namespaced (forge:forge), so we create a symlink
 * from ~/.claude/skills/forge -> the plugin's skill directory.
 * This makes /forge available without the plugin namespace prefix.
 *
 * Runs on SessionStart. Idempotent - skips if already set up.
 */

const fs = require('fs');
const path = require('path');

function main() {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) {
    process.exit(0);
  }

  const personalSkillsDir = path.join(homeDir, '.claude', 'skills');
  const personalForgeDir = path.join(personalSkillsDir, 'forge');
  const pluginSkillDir = path.join(__dirname, '..');

  // Already set up - check if symlink/dir exists and has SKILL.md
  try {
    const stat = fs.lstatSync(personalForgeDir);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      const skillPath = path.join(personalForgeDir, 'SKILL.md');
      if (fs.existsSync(skillPath)) {
        process.exit(0);
      }
    }
  } catch {
    // Doesn't exist yet - continue with setup
  }

  // Ensure ~/.claude/skills/ exists
  try {
    fs.mkdirSync(personalSkillsDir, { recursive: true });
  } catch {
    process.exit(0);
  }

  // Try symlink first (works on most systems)
  try {
    fs.symlinkSync(pluginSkillDir, personalForgeDir, 'junction');
    process.stderr.write('[Forge] Installed /forge as personal skill.\n');
    process.exit(0);
  } catch {
    // Symlink failed - fall back to copy
  }

  // Fallback: copy SKILL.md and supporting files
  try {
    copyDirSync(pluginSkillDir, personalForgeDir);
    process.stderr.write('[Forge] Installed /forge as personal skill (copied).\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[Forge] Warning: Could not install /forge personal skill: ${err.message}\n`);
    process.exit(0);
  }
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

main();
