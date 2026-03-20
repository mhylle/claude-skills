# Forge: Hook-Enforced Development Workflow Framework for Claude Code

## Vision

A self-contained, pluggable framework that provides an end-to-end software development workflow enforced by Claude Code hooks. Skills provide knowledge; hooks ensure compliance. State is git-committed for cross-machine continuity.

**Target**: General-purpose across any codebase. Personal use first, team rollout later, eventually open-source.

---

## Core Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        HOOKS (Engine)                            │
│                                                                  │
│  SessionStart ─→ Load .forge/workflow.yaml, inject phase context │
│  UserPromptSubmit ─→ Detect phase intent, load relevant skill    │
│  PreToolUse ─→ Validate actions for current phase constraints    │
│  PostToolUse ─→ Track progress, auto-format, run fast checks     │
│  Stop ─→ Verify phase Definition of Done before allowing stop    │
│  TaskCompleted ─→ Advance workflow state, checkpoint to git      │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                       SKILLS (Knowledge)                         │
│                                                                  │
│  forge-discover ─→ Research, explore, frame the problem          │
│  forge-specify ─→ Write requirements + acceptance criteria       │
│  forge-design ─→ Plan architecture, write ADRs                   │
│  forge-implement ─→ Build phase-by-phase against the plan        │
│  forge-review ─→ Code review + security review checklists        │
│  forge-ship ─→ Commit, PR, deploy procedures                    │
│  forge-orchestrator ─→ Top-level workflow coordinator            │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                     AGENTS (Specialists)                         │
│                                                                  │
│  forge-researcher ─→ Read-only codebase/domain exploration       │
│  forge-verifier ─→ Run tests, lint, typecheck (Stop hook agent)  │
│  forge-reviewer ─→ Parallel code review specialists              │
│  forge-recovery ─→ Automated error diagnosis + fix attempts      │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                  STATE (.forge/ in project repo)                  │
│                                                                  │
│  .forge/config.yaml ─→ Project-specific tooling + enforcement    │
│  .forge/workflow.yaml ─→ Current phase, step, retry count        │
│  .forge/artifacts/ ─→ Phase outputs (RESEARCH, SPEC, PLAN, etc.) │
│  .forge/history/ ─→ Completed workflow logs                      │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                 CLAUDE.md (Minimal Glue)                         │
│                                                                  │
│  Project-level CLAUDE.md loads forge, points to .forge/config    │
│  Kept under 60 lines per best practices                          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Phase Model

### 6 Phases with Adaptive Enforcement

| # | Phase | Artifact | Enforcement | Entry Gate (DoR) | Exit Gate (DoD) |
|---|-------|----------|-------------|------------------|-----------------|
| 1 | **Discover** | `RESEARCH.md` | Soft | Intent stated | Problem framed, scope identified |
| 2 | **Specify** | `SPEC.md` | Soft | Problem understood | Acceptance criteria defined, testable |
| 3 | **Design** | `PLAN.md` + ADRs | Soft | Requirements clear | Plan reviewed, ADRs written for key decisions |
| 4 | **Implement** | Code + tests | Hard | Plan exists | All acceptance criteria implemented, tests pass, lint clean |
| 5 | **Review** | Review report | Hard | Implementation complete | All review dimensions passed, no blocking issues |
| 6 | **Ship** | Commit/PR | Hard | Review approved | PR created/merged, CI green |

### Enforcement Levels

- **Soft**: Stop hook warns about incomplete DoD items. Claude can proceed if it provides justification. The justification is logged to `.forge/history/`.
- **Hard**: Stop hook blocks until DoD criteria are met. No override without user intervention.

### Fast Paths

Not every change needs 6 phases. The framework detects scope:

| Scope | Phases Used | Detection |
|-------|-------------|-----------|
| **Trivial** (typo fix, config change) | Implement → Ship | User says "quick fix" or change is < 10 lines |
| **Small** (bug fix, minor feature) | Specify → Implement → Review → Ship | Clear scope, single-file or few-file change |
| **Standard** (feature, refactor) | All 6 phases | Default for non-trivial work |
| **Exploratory** (research, spike) | Discover only | User says "explore", "investigate", "research" |

The user can always override: `/forge skip-to implement` or `/forge start discover`.

---

## Entry Points

All entry points converge into the phase model at the appropriate phase:

| Entry | Starting Phase | How |
|-------|---------------|-----|
| "I have a vague idea" | Discover | `/forge discover "idea description"` |
| "I have a ticket/issue" | Specify | `/forge specify --from-issue 123` or paste ticket text |
| "I have a solution description" | Design | `/forge design "solution description"` |
| "Review this PR" | Review | `/forge review --pr 456` or `/forge review` (current branch) |
| "Something broke" | Discover | `/forge incident "error description"` |
| "Just fix this small thing" | Implement | `/forge fix "description"` (fast path) |
| Resume from another machine | Where left off | `/forge status` then `/forge continue` |

---

## Hook Architecture

### Hook Event → Purpose Mapping

```
SessionStart (matcher: "startup|resume")
  → Read .forge/workflow.yaml
  → Inject current phase context into Claude's prompt
  → Report: "Forge: Phase 4/6 (Implement), Step 3/5 (Write unit tests)"

SessionStart (matcher: "compact")
  → Re-inject critical forge state after context compaction
  → Include: current phase, current step, retry count, key decisions

UserPromptSubmit
  → Detect phase-relevant intent from user message
  → If forge workflow active: remind Claude of current phase constraints
  → If no workflow active: suggest starting one if message implies work

PreToolUse (matcher: "Edit|Write")
  → During Review phase: block edits unless review is complete
  → During Discover/Specify/Design: warn if editing code (should be planning)
  → Always: track which files are modified for review scope

PreToolUse (matcher: "Bash")
  → Block dangerous commands (rm -rf, force push, etc.)
  → During Implement: auto-allow test/lint/build commands
  → During Review: restrict to read-only + test commands

PostToolUse (matcher: "Edit|Write")
  → Run formatter (from .forge/config.yaml standards.format)
  → Run fast lint check on modified file
  → Update .forge/workflow.yaml modified_files list

PostToolUse (matcher: "Bash")
  → If test command: capture results, update pass/fail state
  → If build command: capture success/failure

Stop
  → THE CRITICAL HOOK - Agent-type hook that:
    1. Reads .forge/workflow.yaml for current phase + DoD criteria
    2. Checks if all DoD items are satisfied
    3. Soft phase: warns, logs justification if Claude proceeds
    4. Hard phase: blocks with specific "what remains" feedback
    5. Checks stop_hook_active to prevent infinite loops
    6. Updates .forge/workflow.yaml with completion state
    7. If phase complete: advances to next phase
```

### Stop Hook Decision Tree

```
Stop hook fires
  │
  ├─ stop_hook_active == true? → EXIT 0 (break loop)
  │
  ├─ No active forge workflow? → EXIT 0 (not our concern)
  │
  ├─ Read .forge/workflow.yaml
  │   ├─ Get current phase + DoD checklist
  │   ├─ Evaluate each DoD criterion
  │   │
  │   ├─ All DoD met?
  │   │   ├─ YES → Log completion, advance phase, EXIT 0
  │   │   │
  │   │   └─ NO → Check enforcement level
  │   │       ├─ SOFT → Warn about incomplete items
  │   │       │         Ask for justification
  │   │       │         Log justification to history
  │   │       │         EXIT 0 (allow stop)
  │   │       │
  │   │       └─ HARD → Check retry_count
  │   │           ├─ retry_count < max_retries
  │   │           │   → Increment retry_count
  │   │           │   → Return specific feedback: "DoD not met: tests failing"
  │   │           │   → Return decision: block
  │   │           │
  │   │           └─ retry_count >= max_retries
  │   │               → ESCALATE to user
  │   │               → Present: what was attempted, what failed, context
  │   │               → EXIT 0 (let Claude stop so user can intervene)
```

---

## Recovery System

### Retry with Escalation

When a DoD criterion fails during a hard-enforcement phase:

```
Attempt 1: Claude gets the error message
  → Tries to fix based on error output
  → .forge/workflow.yaml retry_count: 1

Attempt 2: Claude gets error + broader context
  → Recovery agent spawns, reads related files
  → Provides additional diagnostic context
  → .forge/workflow.yaml retry_count: 2

Attempt 3: ESCALATE
  → Claude presents to user:
    - What was attempted (all 2 prior attempts)
    - The specific failure (test output, lint errors, etc.)
    - Suggested approaches it hasn't tried
    - Option to: fix manually, skip criterion, abort workflow
  → .forge/workflow.yaml retry_count: 0 (reset after escalation)
```

### Recovery Agent

A specialized subagent (`forge-recovery`) that:
- Has read-only access + test execution
- Analyzes error patterns against common failure modes
- Suggests fixes without implementing them (provides context to main Claude)
- Runs in isolated context to avoid polluting the main conversation

---

## Pluggable Project Configuration

### `.forge/config.yaml`

```yaml
# Forge project configuration
# This file defines project-specific tooling and preferences

# ─── Tooling ───────────────────────────────────────────────
standards:
  # Commands that enforce code standards
  # Set to null or remove lines for tools you don't use
  lint: "npx eslint . --max-warnings 0"
  format: "npx prettier --write"
  typecheck: "npx tsc --noEmit"
  test: "npm test"
  test_single: "npm test -- --testPathPattern={file}"
  security: "npm audit --audit-level=moderate"
  build: "npm run build"

# ─── Enforcement ───────────────────────────────────────────
enforcement:
  discover: soft
  specify: soft
  design: soft
  implement: hard
  review: hard
  ship: hard

# ─── Recovery ──────────────────────────────────────────────
max_retries: 3

# ─── Review ────────────────────────────────────────────────
review:
  # Which review dimensions to run (maps to parallel subagents)
  dimensions:
    - functionality
    - security
    - performance
    - test_quality
    - maintainability
  # Minimum dimensions that must pass for review to succeed
  required_pass: 4

# ─── Ship ──────────────────────────────────────────────────
ship:
  # What "ship" means for this project
  strategy: "pr"  # Options: pr, commit, deploy
  branch_prefix: "forge/"
  pr_template: true  # Generate PR description from artifacts

# ─── Fast Paths ────────────────────────────────────────────
fast_path:
  # Max lines changed to qualify as "trivial"
  trivial_threshold: 10
  # Max files changed to qualify as "small"
  small_threshold: 3
```

### Example: Python Project

```yaml
standards:
  lint: "ruff check ."
  format: "ruff format ."
  typecheck: "mypy ."
  test: "pytest"
  test_single: "pytest {file} -x"
  security: "pip-audit"
  build: null  # No build step for this project
```

### Example: Rust Project

```yaml
standards:
  lint: "cargo clippy -- -D warnings"
  format: "cargo fmt"
  typecheck: null  # Rust compiler handles this
  test: "cargo test"
  test_single: "cargo test {name}"
  security: "cargo audit"
  build: "cargo build"
```

### Example: Go Project

```yaml
standards:
  lint: "golangci-lint run"
  format: "gofmt -w ."
  typecheck: "go vet ./..."
  test: "go test ./..."
  test_single: "go test -run {name} ./..."
  security: "govulncheck ./..."
  build: "go build ./..."
```

---

## Workflow State

### `.forge/workflow.yaml`

```yaml
# Auto-managed by forge hooks. Committed to git for cross-machine sync.
workflow_id: "abc123"
created: "2026-03-20T10:30:00Z"
title: "Add user authentication"

# Current position
current_phase: implement
current_step: 3  # "Write unit tests"
phase_started: "2026-03-20T11:00:00Z"

# Recovery tracking
retry_count: 1
last_error: "3 tests failing in auth.test.ts"

# Progress
phases:
  discover:
    status: completed
    completed_at: "2026-03-20T10:35:00Z"
    artifact: ".forge/artifacts/RESEARCH.md"
  specify:
    status: completed
    completed_at: "2026-03-20T10:45:00Z"
    artifact: ".forge/artifacts/SPEC.md"
  design:
    status: completed
    completed_at: "2026-03-20T10:55:00Z"
    artifact: ".forge/artifacts/PLAN.md"
    adrs:
      - ".forge/artifacts/adr/001-jwt-over-sessions.md"
  implement:
    status: in_progress
    steps:
      - name: "Set up auth module structure"
        status: completed
      - name: "Implement JWT token generation"
        status: completed
      - name: "Write unit tests"
        status: in_progress
      - name: "Implement login endpoint"
        status: pending
      - name: "Implement middleware"
        status: pending
    modified_files:
      - src/auth/token.ts
      - src/auth/login.ts
      - tests/auth/token.test.ts
  review:
    status: pending
  ship:
    status: pending

# Fast path (if applicable)
fast_path: null  # or "trivial" or "small"
```

---

## Artifacts

Each phase produces a durable artifact committed to `.forge/artifacts/`:

### RESEARCH.md (Discover phase)

```markdown
# Research: [Title]

## Problem Statement
What problem are we solving and why does it matter?

## Current State
How does the system work today? What exists?

## Exploration Findings
- Finding 1: ...
- Finding 2: ...

## Scope Assessment
- In scope: ...
- Out of scope: ...
- Open questions: ...

## Recommended Next Step
Proceed to Specify / Needs more research / Not worth pursuing
```

### SPEC.md (Specify phase)

```markdown
# Specification: [Title]

## User Story
As a [actor], I want [action], so that [value].

## Acceptance Criteria
- [ ] AC1: Given X, when Y, then Z
- [ ] AC2: ...

## Non-Functional Requirements
- Performance: ...
- Security: ...

## Out of Scope
- ...

## Dependencies
- ...
```

### PLAN.md (Design phase)

```markdown
# Implementation Plan: [Title]

## Architecture Overview
Brief description of the approach.

## Phases
### Phase 1: [Name]
- What: ...
- Files: ...
- Exit criteria: ...

### Phase 2: [Name]
...

## Key Decisions
- Decision 1: [choice] (see ADR-001)
- Decision 2: [choice] (see ADR-002)

## Risks
- Risk 1: ... Mitigation: ...
```

### ADR Format (Design phase)

```markdown
# ADR-NNN: [Title]

## Status
Accepted | Proposed | Deprecated | Superseded

## Context
What is the issue that we're seeing that is motivating this decision?

## Decision
What is the change that we're proposing and/or doing?

## Consequences
What becomes easier or more difficult because of this change?

## Alternatives Considered
- Alternative 1: ... (rejected because ...)
```

### REVIEW.md (Review phase)

```markdown
# Review Report: [Title]

## Summary
Overall assessment: Ready to Ship | Needs Work | Needs Attention

## Dimensions
### Functionality: PASS/FAIL
- ...

### Security: PASS/FAIL
- ...

### Performance: PASS/FAIL
- ...

### Test Quality: PASS/FAIL
- ...

### Maintainability: PASS/FAIL
- ...

## Blocking Issues
- ...

## Suggestions (non-blocking)
- ...
```

---

## Installation & Directory Structure

Forge is installed as a self-contained package in `~/.claude/`:

```
~/.claude/
├── skills/
│   └── forge/
│       ├── SKILL.md              # Main orchestrator skill
│       ├── skills/
│       │   ├── discover.md       # Discover phase knowledge
│       │   ├── specify.md        # Specify phase knowledge
│       │   ├── design.md         # Design phase knowledge
│       │   ├── implement.md      # Implement phase knowledge
│       │   ├── review.md         # Review phase knowledge
│       │   └── ship.md           # Ship phase knowledge
│       ├── references/
│       │   ├── spec-template.md
│       │   ├── plan-template.md
│       │   ├── adr-template.md
│       │   ├── review-checklist.md
│       │   └── security-checklist.md
│       └── scripts/
│           ├── forge-init.sh         # Initialize .forge/ in a project
│           ├── stop-hook.sh          # The Stop hook enforcement script
│           ├── session-start-hook.sh # SessionStart context loader
│           ├── pre-tool-hook.sh      # PreToolUse validator
│           ├── post-tool-hook.sh     # PostToolUse tracker
│           ├── user-prompt-hook.sh   # UserPromptSubmit phase detector
│           └── lib/
│               ├── state.sh          # Read/write .forge/workflow.yaml
│               ├── config.sh         # Read .forge/config.yaml
│               ├── enforcement.sh    # Soft/hard gate logic
│               └── recovery.sh       # Retry tracking + escalation
│
├── agents/
│   └── forge/
│       ├── researcher.md         # Read-only exploration subagent
│       ├── verifier.md           # Test/lint/build verification subagent
│       ├── reviewer.md           # Code review subagent (parallel)
│       └── recovery.md           # Error diagnosis subagent
│
├── settings.json                 # Hooks configuration (forge registers here)
```

### Project-Level (created by `forge init`):

```
project/
├── .forge/
│   ├── config.yaml              # Project-specific tooling (user edits this)
│   ├── workflow.yaml            # Current workflow state (auto-managed)
│   ├── artifacts/               # Phase outputs
│   │   ├── RESEARCH.md
│   │   ├── SPEC.md
│   │   ├── PLAN.md
│   │   ├── REVIEW.md
│   │   └── adr/
│   │       └── 001-decision.md
│   └── history/                 # Completed workflow logs
│       └── 2026-03-20-auth.yaml
├── CLAUDE.md                    # Minimal: loads forge, project-specific notes
```

---

## Skill Design

### Main Orchestrator (`~/.claude/skills/forge/SKILL.md`)

The top-level skill that:
- Handles all `/forge` commands (status, init, continue, skip-to, etc.)
- Detects which phase to activate
- Delegates to phase-specific sub-skills
- Manages workflow state transitions

### Phase Skills

Each phase skill contains:
1. **What this phase does** (purpose, context)
2. **Steps to follow** (ordered checklist)
3. **Definition of Ready** (what must exist before starting)
4. **Definition of Done** (what must be true to complete)
5. **Artifact template** (what to produce)
6. **Common pitfalls** (what to avoid)

Phase skills are loaded on-demand by the orchestrator, keeping context window usage minimal.

### Key Skill Design Principles

- **Skills are knowledge, not enforcement** - they tell Claude HOW to do the phase
- **Hooks handle enforcement** - they ensure Claude DOES the phase correctly
- **Skills reference templates** - artifact templates live in `references/`, loaded only when needed
- **Skills are short** - under 200 lines each, ideally under 100
- **No skill duplication** - common patterns (like "run tests") are in shared references

---

## Hook Scripts Architecture

### Design Principles

1. **All hooks read `.forge/workflow.yaml` for state** - single source of truth
2. **All hooks read `.forge/config.yaml` for project-specific commands** - pluggable
3. **Hooks are stateless** - all state lives in yaml files
4. **Hooks use `jq` for JSON parsing** (stdin from Claude Code) and `yq` for YAML
5. **Hooks are fast** - shell scripts, no heavy runtimes
6. **The Stop hook is the only agent-type hook** - it needs AI judgment
7. **All other hooks are command-type** - deterministic, fast

### Shared Library (`scripts/lib/`)

```bash
# state.sh - Common state operations
forge_get_phase()      # Returns current phase name
forge_get_step()       # Returns current step number
forge_get_enforcement() # Returns soft|hard for current phase
forge_get_retry_count() # Returns retry count
forge_increment_retry() # Bumps retry count
forge_reset_retry()     # Resets retry count
forge_advance_phase()   # Moves to next phase
forge_complete_step()   # Marks current step complete
forge_is_active()       # Returns 0 if a forge workflow is active

# config.sh - Project config operations
forge_get_command()     # Gets command for a standard (lint, test, etc.)
forge_get_enforcement_level() # Gets enforcement level for a phase
forge_get_max_retries() # Gets max retry count
```

---

## User Commands

| Command | Description |
|---------|-------------|
| `/forge init` | Initialize `.forge/` in current project with config wizard |
| `/forge start [phase]` | Start new workflow at specified phase (default: discover) |
| `/forge status` | Show current workflow state |
| `/forge continue` | Resume where you left off |
| `/forge skip-to <phase>` | Jump to a specific phase (with confirmation) |
| `/forge fix "description"` | Fast path: trivial fix (implement → ship) |
| `/forge incident "description"` | Start from incident (discover with incident context) |
| `/forge history` | Show completed workflow history |
| `/forge config` | Edit project configuration |
| `/forge reset` | Reset current workflow (with confirmation) |

---

## Implementation Priority

### Phase 1: Foundation (MVP)
1. `.forge/config.yaml` schema + reader
2. `.forge/workflow.yaml` schema + state management
3. Stop hook (the enforcement engine) - agent-type
4. SessionStart hook (context injection)
5. Main orchestrator skill (`/forge`)
6. One phase skill as template (implement)

### Phase 2: Core Phases
7. All 6 phase skills with templates
8. PreToolUse hook (phase constraints)
9. PostToolUse hook (progress tracking + formatting)
10. UserPromptSubmit hook (phase detection)
11. Fast path detection

### Phase 3: Intelligence
12. Recovery agent + retry/escalation system
13. Parallel review subagents
14. Researcher subagent
15. Verifier subagent

### Phase 4: Polish
16. `/forge init` configuration wizard
17. Workflow history + analytics
18. Cross-machine sync validation
19. Documentation for open-source release

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Enforcement mechanism | Hooks, not skills | Skills are advisory; hooks are deterministic |
| State persistence | Git-committed YAML files | Cross-machine sharing via git |
| In-session tracking | Claude Code Task tools | Native integration, good UX |
| Stop hook type | Agent (not command/prompt) | Needs AI judgment to evaluate DoD |
| Other hook types | Command (shell scripts) | Fast, deterministic, no AI cost |
| Artifact format | Markdown files | Human-readable, diffable, reviewable |
| Config format | YAML | Human-editable, widely understood |
| Skill architecture | One orchestrator + 6 phase skills | Context-efficient, loaded on demand |
| Agent architecture | 4 specialized subagents | Parallel review, isolated recovery |
| Script language | Bash + jq/yq | No runtime dependencies, fast |
| Directory structure | `~/.claude/` for framework, `.forge/` for project | Self-contained install, project state in repo |
