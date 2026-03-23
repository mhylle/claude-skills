#!/usr/bin/env node
/**
 * Forge Setup: Install plugin skills as personal skills
 *
 * Plugin skills are namespaced (forge:forge), so we create symlinks
 * from ~/.claude/skills/<name> -> the plugin's skill directory.
 * This makes skills available without the plugin namespace prefix.
 *
 * Runs on SessionStart. Re-links if the target has changed (e.g. after
 * a plugin version update that changes the cache path).
 */

const fs = require('fs');
const path = require('path');

// Skills to install as personal skills (dir name under plugin's skills/)
const SKILLS_TO_INSTALL = ['forge', 'brainstorm'];

function main() {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) {
    process.exit(0);
  }

  const personalSkillsDir = path.join(homeDir, '.claude', 'skills');
  const pluginSkillsRoot = path.join(__dirname, '..', '..');

  // Ensure ~/.claude/skills/ exists
  try {
    fs.mkdirSync(personalSkillsDir, { recursive: true });
  } catch {
    process.exit(0);
  }

  for (const skillName of SKILLS_TO_INSTALL) {
    const personalDir = path.join(personalSkillsDir, skillName);
    const pluginDir = path.join(pluginSkillsRoot, skillName);

    // Skip if plugin skill directory doesn't exist
    if (!fs.existsSync(path.join(pluginDir, 'SKILL.md'))) {
      continue;
    }

    // Check existing link/dir
    try {
      const stat = fs.lstatSync(personalDir);

      if (stat.isSymbolicLink()) {
        // Symlink exists - check if it points to the right place
        const target = fs.readlinkSync(personalDir);
        const resolvedTarget = path.resolve(path.dirname(personalDir), target);
        const resolvedPlugin = path.resolve(pluginDir);

        if (resolvedTarget === resolvedPlugin) {
          // Already pointing to the right place
          continue;
        }

        // Stale symlink - remove it and re-create
        fs.unlinkSync(personalDir);
      } else if (stat.isDirectory()) {
        // Real directory (from copy fallback) - check if SKILL.md exists
        if (fs.existsSync(path.join(personalDir, 'SKILL.md'))) {
          continue;
        }
      }
    } catch {
      // Doesn't exist yet - continue with setup
    }

    // Try symlink first (junction on Windows)
    try {
      fs.symlinkSync(pluginDir, personalDir, 'junction');
      process.stderr.write(`[Forge] Installed /${skillName} as personal skill.\n`);
      continue;
    } catch {
      // Symlink failed - fall back to copy
    }

    // Fallback: copy directory
    try {
      copyDirSync(pluginDir, personalDir);
      process.stderr.write(`[Forge] Installed /${skillName} as personal skill (copied).\n`);
    } catch (err) {
      process.stderr.write(`[Forge] Warning: Could not install /${skillName}: ${err.message}\n`);
    }
  }

  process.exit(0);
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
