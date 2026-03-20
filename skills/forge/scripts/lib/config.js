/**
 * Forge Config Library
 * Read .forge/config.json with defaults
 */

const fs = require('fs');
const path = require('path');
const { findForgeDir } = require('./state');

const DEFAULTS = {
  standards: {
    lint: null,
    format: null,
    typecheck: null,
    test: null,
    test_single: null,
    security: null,
    build: null
  },
  enforcement: {
    discover: 'soft',
    specify: 'soft',
    design: 'soft',
    implement: 'hard',
    review: 'hard',
    ship: 'hard'
  },
  max_retries: 3,
  review: {
    dimensions: ['functionality', 'security', 'performance', 'test_quality', 'maintainability'],
    required_pass: 4
  },
  ship: {
    strategy: 'pr',
    branch_prefix: 'forge/',
    pr_template: true
  },
  fast_path: {
    trivial_threshold: 10,
    small_threshold: 3
  }
};

/**
 * Deep merge two objects. Source values override target.
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Read config.json merged with defaults.
 */
function getConfig(forgeDir) {
  const dir = forgeDir || findForgeDir();
  if (!dir) return { ...DEFAULTS };

  const configPath = path.join(dir, 'config.json');
  if (!fs.existsSync(configPath)) return { ...DEFAULTS };

  try {
    const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return deepMerge(DEFAULTS, userConfig);
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Get a specific standard command. Returns null if not configured.
 */
function getCommand(name, forgeDir) {
  const config = getConfig(forgeDir);
  return config.standards[name] || null;
}

/**
 * Get enforcement level for a phase.
 */
function getEnforcementLevel(phase, forgeDir) {
  const config = getConfig(forgeDir);
  return config.enforcement[phase] || 'soft';
}

/**
 * Get max retries.
 */
function getMaxRetries(forgeDir) {
  const config = getConfig(forgeDir);
  return config.max_retries;
}

/**
 * Get defaults for forge init.
 */
function getDefaults() {
  return JSON.parse(JSON.stringify(DEFAULTS));
}

/**
 * Write config.json.
 */
function saveConfig(config, forgeDir) {
  const dir = forgeDir || findForgeDir();
  if (!dir) throw new Error('No .forge/ directory found');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config, null, 2) + '\n');
}

module.exports = {
  DEFAULTS,
  getConfig,
  getCommand,
  getEnforcementLevel,
  getMaxRetries,
  getDefaults,
  saveConfig,
  deepMerge
};
