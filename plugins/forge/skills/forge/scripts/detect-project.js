#!/usr/bin/env node
/**
 * Forge Project Detection
 * Detects project type and suggests config defaults.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_TYPES = {
  nodejs: {
    markers: ['package.json'],
    detect: (dir) => {
      const pkgPath = path.join(dir, 'package.json');
      if (!fs.existsSync(pkgPath)) return null;
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const hasTs = fs.existsSync(path.join(dir, 'tsconfig.json'));
        const scripts = pkg.scripts || {};
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        // Detect package manager
        let pm = 'npm';
        if (fs.existsSync(path.join(dir, 'bun.lockb')) || fs.existsSync(path.join(dir, 'bun.lock'))) pm = 'bun';
        else if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) pm = 'pnpm';
        else if (fs.existsSync(path.join(dir, 'yarn.lock'))) pm = 'yarn';

        // Detect test runner
        let testCmd = scripts.test ? `${pm} test` : null;
        let testSingle = null;
        if (deps['jest'] || deps['@jest/core']) {
          testSingle = `${pm === 'npm' ? 'npx' : pm} jest --testPathPattern={file}`;
        } else if (deps['vitest']) {
          testSingle = `${pm === 'npm' ? 'npx' : pm} vitest run {file}`;
        }

        // Detect linter
        let lintCmd = scripts.lint ? `${pm} run lint` : null;
        if (!lintCmd && deps['eslint']) lintCmd = `${pm === 'npm' ? 'npx' : pm} eslint .`;
        if (!lintCmd && deps['biome'] || deps['@biomejs/biome']) lintCmd = `${pm === 'npm' ? 'npx' : pm} biome check .`;

        // Detect formatter
        let formatCmd = null;
        if (deps['prettier']) formatCmd = `${pm === 'npm' ? 'npx' : pm} prettier --write .`;
        if (deps['biome'] || deps['@biomejs/biome']) formatCmd = `${pm === 'npm' ? 'npx' : pm} biome format --write .`;

        // Detect typecheck
        let typecheckCmd = null;
        if (hasTs) typecheckCmd = `${pm === 'npm' ? 'npx' : pm} tsc --noEmit`;

        // Detect build
        let buildCmd = scripts.build ? `${pm} run build` : null;

        return {
          type: hasTs ? 'typescript' : 'nodejs',
          packageManager: pm,
          standards: {
            lint: lintCmd,
            format: formatCmd,
            typecheck: typecheckCmd,
            test: testCmd,
            test_single: testSingle,
            security: `${pm} audit --audit-level=moderate`,
            build: buildCmd
          }
        };
      } catch {
        return null;
      }
    }
  },
  python: {
    markers: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'],
    detect: (dir) => {
      const hasRuff = fs.existsSync(path.join(dir, 'ruff.toml')) ||
        fs.existsSync(path.join(dir, '.ruff.toml'));
      const hasPyproject = fs.existsSync(path.join(dir, 'pyproject.toml'));
      let pyproject = '';
      if (hasPyproject) {
        try { pyproject = fs.readFileSync(path.join(dir, 'pyproject.toml'), 'utf8'); } catch {}
      }

      const hasPoetry = pyproject.includes('[tool.poetry]');
      const hasPdm = pyproject.includes('[tool.pdm]');
      const hasUv = fs.existsSync(path.join(dir, 'uv.lock'));

      let lintCmd = hasRuff || pyproject.includes('ruff') ? 'ruff check .' : 'python -m flake8';
      let formatCmd = hasRuff || pyproject.includes('ruff') ? 'ruff format .' : 'python -m black .';
      let testCmd = pyproject.includes('pytest') || fs.existsSync(path.join(dir, 'pytest.ini')) ?
        'pytest' : 'python -m unittest discover';

      return {
        type: 'python',
        standards: {
          lint: lintCmd,
          format: formatCmd,
          typecheck: 'mypy .',
          test: testCmd,
          test_single: testCmd === 'pytest' ? 'pytest {file} -x' : null,
          security: 'pip-audit',
          build: null
        }
      };
    }
  },
  rust: {
    markers: ['Cargo.toml'],
    detect: () => ({
      type: 'rust',
      standards: {
        lint: 'cargo clippy -- -D warnings',
        format: 'cargo fmt',
        typecheck: null,
        test: 'cargo test',
        test_single: 'cargo test {name}',
        security: 'cargo audit',
        build: 'cargo build'
      }
    })
  },
  go: {
    markers: ['go.mod'],
    detect: () => ({
      type: 'go',
      standards: {
        lint: 'golangci-lint run',
        format: 'gofmt -w .',
        typecheck: 'go vet ./...',
        test: 'go test ./...',
        test_single: 'go test -run {name} ./...',
        security: 'govulncheck ./...',
        build: 'go build ./...'
      }
    })
  },
  dotnet: {
    markers: ['*.csproj', '*.sln'],
    detect: (dir) => {
      const hasCsproj = fs.readdirSync(dir).some(f => f.endsWith('.csproj'));
      if (!hasCsproj && !fs.readdirSync(dir).some(f => f.endsWith('.sln'))) return null;
      return {
        type: 'dotnet',
        standards: {
          lint: 'dotnet format --verify-no-changes',
          format: 'dotnet format',
          typecheck: null,
          test: 'dotnet test',
          test_single: 'dotnet test --filter {name}',
          security: null,
          build: 'dotnet build'
        }
      };
    }
  }
};

/**
 * Detect project type from directory contents.
 */
function detectProjectType(dir) {
  dir = dir || process.cwd();

  for (const [name, config] of Object.entries(PROJECT_TYPES)) {
    const hasMarker = config.markers.some(marker => {
      if (marker.includes('*')) {
        return fs.readdirSync(dir).some(f => f.endsWith(marker.replace('*', '')));
      }
      return fs.existsSync(path.join(dir, marker));
    });

    if (hasMarker) {
      const result = config.detect(dir);
      if (result) return result;
    }
  }

  return { type: 'unknown', standards: {} };
}

/**
 * Build a full config from detected project + defaults.
 */
function suggestConfig(dir) {
  const { getDefaults } = require('./lib/config');
  const detected = detectProjectType(dir);
  const defaults = getDefaults();

  if (detected.type === 'unknown') {
    return { detected: detected.type, config: defaults };
  }

  const config = { ...defaults };
  config.standards = { ...defaults.standards, ...detected.standards };

  return { detected: detected.type, packageManager: detected.packageManager, config };
}

// If run directly, detect and print
if (require.main === module) {
  const result = suggestConfig(process.cwd());
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { detectProjectType, suggestConfig, PROJECT_TYPES };
