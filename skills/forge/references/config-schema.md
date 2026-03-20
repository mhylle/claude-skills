# Forge Config Schema

## File: `.forge/config.json`

Project-specific configuration for Forge. Created by `/forge init`, edited by the user.

## Schema

```json
{
  "standards": {
    "lint": "string | null",
    "format": "string | null",
    "typecheck": "string | null",
    "test": "string | null",
    "test_single": "string | null",
    "security": "string | null",
    "build": "string | null"
  },
  "enforcement": {
    "discover": "soft | hard",
    "specify": "soft | hard",
    "design": "soft | hard",
    "implement": "soft | hard",
    "review": "soft | hard",
    "ship": "soft | hard"
  },
  "max_retries": "number",
  "review": {
    "dimensions": ["string"],
    "required_pass": "number"
  },
  "ship": {
    "strategy": "pr | commit | deploy",
    "branch_prefix": "string",
    "pr_template": "boolean"
  },
  "fast_path": {
    "trivial_threshold": "number",
    "small_threshold": "number"
  }
}
```

## Field Reference

### `standards`

Commands that enforce code standards. Set to `null` to skip a check.

| Field | Description | Placeholder |
|-------|-------------|-------------|
| `lint` | Linter command | None |
| `format` | Formatter command | None |
| `typecheck` | Type checker command | None |
| `test` | Full test suite command | None |
| `test_single` | Single file test command | `{file}` replaced with file path |
| `security` | Security audit command | None |
| `build` | Build command | None |

### `enforcement`

Per-phase enforcement level. `"soft"` warns but allows stopping. `"hard"` blocks until DoD is met.

### `max_retries`

Maximum retry attempts before escalating to user. Default: `3`.

### `review`

| Field | Description | Default |
|-------|-------------|---------|
| `dimensions` | Review dimensions to evaluate | `["functionality", "security", "performance", "test_quality", "maintainability"]` |
| `required_pass` | Minimum dimensions that must pass | `4` |

### `ship`

| Field | Description | Default |
|-------|-------------|---------|
| `strategy` | What "ship" means: `"pr"` (create PR), `"commit"` (commit to current branch), `"deploy"` (run deploy command) | `"pr"` |
| `branch_prefix` | Prefix for feature branches | `"forge/"` |
| `pr_template` | Generate PR description from artifacts | `true` |

### `fast_path`

| Field | Description | Default |
|-------|-------------|---------|
| `trivial_threshold` | Max lines changed to qualify as trivial | `10` |
| `small_threshold` | Max files changed to qualify as small | `3` |

## Defaults

When a field is omitted, the following defaults apply:

```json
{
  "standards": {
    "lint": null,
    "format": null,
    "typecheck": null,
    "test": null,
    "test_single": null,
    "security": null,
    "build": null
  },
  "enforcement": {
    "discover": "soft",
    "specify": "soft",
    "design": "soft",
    "implement": "hard",
    "review": "hard",
    "ship": "hard"
  },
  "max_retries": 3,
  "review": {
    "dimensions": ["functionality", "security", "performance", "test_quality", "maintainability"],
    "required_pass": 4
  },
  "ship": {
    "strategy": "pr",
    "branch_prefix": "forge/",
    "pr_template": true
  },
  "fast_path": {
    "trivial_threshold": 10,
    "small_threshold": 3
  }
}
```

## Language-Specific Examples

### Node.js / TypeScript
```json
{
  "standards": {
    "lint": "npx eslint . --max-warnings 0",
    "format": "npx prettier --write .",
    "typecheck": "npx tsc --noEmit",
    "test": "npm test",
    "test_single": "npm test -- --testPathPattern={file}",
    "security": "npm audit --audit-level=moderate",
    "build": "npm run build"
  }
}
```

### Python
```json
{
  "standards": {
    "lint": "ruff check .",
    "format": "ruff format .",
    "typecheck": "mypy .",
    "test": "pytest",
    "test_single": "pytest {file} -x",
    "security": "pip-audit",
    "build": null
  }
}
```

### Go
```json
{
  "standards": {
    "lint": "golangci-lint run",
    "format": "gofmt -w .",
    "typecheck": "go vet ./...",
    "test": "go test ./...",
    "test_single": "go test -run {name} ./...",
    "security": "govulncheck ./...",
    "build": "go build ./..."
  }
}
```

### Rust
```json
{
  "standards": {
    "lint": "cargo clippy -- -D warnings",
    "format": "cargo fmt",
    "typecheck": null,
    "test": "cargo test",
    "test_single": "cargo test {name}",
    "security": "cargo audit",
    "build": "cargo build"
  }
}
```
