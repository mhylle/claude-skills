# Forge: Configuration Reference

## File: `.forge/config.json`

Created by `/forge init`, customized by the user. All fields are optional - defaults apply for anything omitted.

## Complete Example

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

---

## `standards`

Commands for code quality enforcement. The Stop hook runs these during hard-enforcement phases. Set any field to `null` to skip that check.

| Field | Description | Used by |
|-------|-------------|---------|
| `lint` | Linter command. Must exit 0 when clean. | Stop hook (implement), PostToolUse |
| `format` | Formatter command. Run after edits. | Implement phase skill |
| `typecheck` | Type checker command. | Verifier agent |
| `test` | Full test suite command. Must exit 0 when all pass. | Stop hook (implement), PostToolUse |
| `test_single` | Single-file test. `{file}` is replaced with path. | Implement phase skill |
| `security` | Security audit command. | Verifier agent |
| `build` | Build command. Must exit 0 on success. | Stop hook (implement), PostToolUse |

### Placeholder Substitution

- `{file}` - replaced with the file path (used in `test_single`)
- `{name}` - replaced with test/function name (used in `test_single` for Go/Rust)

### Language Examples

**Node.js / TypeScript:**
```json
{
  "lint": "npx eslint . --max-warnings 0",
  "format": "npx prettier --write .",
  "typecheck": "npx tsc --noEmit",
  "test": "npm test",
  "test_single": "npx jest --testPathPattern={file}",
  "security": "npm audit --audit-level=moderate",
  "build": "npm run build"
}
```

**Python:**
```json
{
  "lint": "ruff check .",
  "format": "ruff format .",
  "typecheck": "mypy .",
  "test": "pytest",
  "test_single": "pytest {file} -x",
  "security": "pip-audit",
  "build": null
}
```

**Go:**
```json
{
  "lint": "golangci-lint run",
  "format": "gofmt -w .",
  "typecheck": "go vet ./...",
  "test": "go test ./...",
  "test_single": "go test -run {name} ./...",
  "security": "govulncheck ./...",
  "build": "go build ./..."
}
```

**Rust:**
```json
{
  "lint": "cargo clippy -- -D warnings",
  "format": "cargo fmt",
  "typecheck": null,
  "test": "cargo test",
  "test_single": "cargo test {name}",
  "security": "cargo audit",
  "build": "cargo build"
}
```

**C# / .NET:**
```json
{
  "lint": "dotnet format --verify-no-changes",
  "format": "dotnet format",
  "typecheck": null,
  "test": "dotnet test",
  "test_single": "dotnet test --filter {name}",
  "security": null,
  "build": "dotnet build"
}
```

---

## `enforcement`

Per-phase enforcement level. Controls how the Stop hook behaves.

| Value | Behavior |
|-------|----------|
| `"soft"` | Stop hook warns about incomplete DoD using a prompt-type hook (AI judgment). Claude can proceed with justification. Justification is logged to history. |
| `"hard"` | Stop hook runs measurable checks (test/lint/build) via command-type hook. Blocks until all pass. Retries with escalation after `max_retries`. |

Default enforcement:
```json
{
  "discover": "soft",
  "specify": "soft",
  "design": "soft",
  "implement": "hard",
  "review": "hard",
  "ship": "hard"
}
```

You can make planning phases hard or execution phases soft:
```json
{
  "design": "hard",
  "review": "soft"
}
```

---

## `max_retries`

Number of retry attempts before escalating to the user during hard-enforcement phases.

- Default: `3`
- After `max_retries` failed attempts, the Stop hook allows Claude to stop and presents the user with options (fix manually, skip phase, reset workflow)
- On retry attempt 2+, the error message suggests spawning the `forge-recovery` agent for deeper diagnosis

---

## `review`

Configuration for the Review phase.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dimensions` | string[] | `["functionality", "security", "performance", "test_quality", "maintainability"]` | Review dimensions to evaluate. Each maps to a checklist in the review agent. |
| `required_pass` | number | `4` | Minimum dimensions that must pass for the review DoD to be met. |

Available dimensions: `functionality`, `security`, `performance`, `test_quality`, `maintainability`.

You can customize which dimensions matter for your project:
```json
{
  "dimensions": ["functionality", "security"],
  "required_pass": 2
}
```

---

## `ship`

Configuration for the Ship phase.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `strategy` | string | `"pr"` | How to ship: `"pr"` (create pull request), `"commit"` (commit to current branch), `"deploy"` (run deploy command) |
| `branch_prefix` | string | `"forge/"` | Prefix for feature branches when strategy is `"pr"` |
| `pr_template` | boolean | `true` | Generate PR description from Forge artifacts (RESEARCH.md, SPEC.md, PLAN.md) |

---

## `fast_path`

Thresholds for automatic fast path detection.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `trivial_threshold` | number | `10` | Maximum lines changed to qualify as trivial (implement -> ship only) |
| `small_threshold` | number | `3` | Maximum files changed to qualify as small (specify -> implement -> review -> ship) |

Fast paths skip phases that aren't needed for small changes:

| Fast Path | Phases Used | Trigger |
|-----------|-------------|---------|
| `trivial` | implement, ship | `/forge fix` or < trivial_threshold lines |
| `small` | specify, implement, review, ship | < small_threshold files |
| `exploratory` | discover only | `/forge start discover` with explore intent |
| `null` (standard) | all 6 phases | Default |
