# Forge: Getting Started

## Prerequisites

- [Claude Code](https://claude.com/claude-code) installed
- Node.js 18+ (for hook scripts)

## Installation

1. Copy the `forge/` directory to `~/.claude/skills/forge/`
2. Copy the agent files to `~/.claude/agents/`:
   - `forge-recovery.md`
   - `forge-verifier.md`
   - `forge-researcher.md`
   - `forge-reviewer.md`
3. Register hooks:
   ```bash
   node ~/.claude/skills/forge/scripts/register-hooks.js
   ```

This merges Forge hooks into your existing `~/.claude/hooks.json` without overwriting anything. A backup is created automatically.

To unregister: `node ~/.claude/skills/forge/scripts/register-hooks.js --unregister`

## Quick Start

### Initialize a project

```
/forge init
```

Forge detects your project type (Node.js, Python, Go, Rust, .NET) and generates `.forge/config.json` with appropriate commands for testing, linting, formatting, and building.

### Start a workflow

```
/forge start
```

This creates a new workflow starting at the Discover phase. Forge will guide you through:

1. **Discover** - Research and frame the problem
2. **Specify** - Write testable requirements
3. **Design** - Plan architecture, write ADRs
4. **Implement** - Build with test-first development
5. **Review** - Multi-dimension code review
6. **Ship** - Commit, PR, deploy

### Fast paths

Not everything needs 6 phases:

```
/forge fix "fix typo in README"     # Trivial: implement -> ship
/forge start specify                 # Skip discovery, start at specify
/forge skip-to implement             # Jump to implementation
```

### Check status

```
/forge status                        # Current workflow state
/forge history                       # Past workflows
```

## How Enforcement Works

Forge uses Claude Code hooks to enforce workflow compliance:

- **Soft enforcement** (Discover, Specify, Design): The Stop hook warns about incomplete items but lets you proceed with justification
- **Hard enforcement** (Implement, Review, Ship): The Stop hook blocks until measurable criteria are met (tests pass, lint clean, build succeeds)

When hard enforcement blocks you:
1. Claude gets the error and tries to fix it
2. On retry 2+, the recovery agent provides deeper diagnosis
3. After max retries, Forge escalates to you with full context

## Project Configuration

Edit `.forge/config.json` to customize:

```json
{
  "standards": {
    "test": "npm test",
    "lint": "npx eslint .",
    "build": "npm run build"
  },
  "enforcement": {
    "implement": "hard",
    "review": "hard"
  },
  "max_retries": 3
}
```

See [configuration.md](configuration.md) for the full reference.

## Cross-Machine Workflow

The `.forge/` directory is committed to git. When switching machines:

1. `git pull` brings the workflow state
2. Start a new Claude Code session
3. The SessionStart hook loads your workflow context
4. Run `/forge continue` to resume
