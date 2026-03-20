# Forge Framework Implementation Plan

## Overview

Complete implementation of the Forge hook-enforced development workflow framework for Claude Code. Forge provides a 6-phase software development lifecycle (Discover, Specify, Design, Implement, Review, Ship) enforced by Claude Code hooks, with skills providing phase knowledge and agents providing specialized capabilities. State is persisted in `.forge/` directories committed to git for cross-machine continuity.

This plan covers all four implementation phases from the concept document, adapted for JSON state files, Node.js hook scripts, coexistence with existing skills/hooks, and the hybrid Stop hook approach.

## Design Decisions (From User Clarifications)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Existing skills | COEXIST | Forge skills live alongside existing skills. Old skills remain for ad-hoc use. |
| Hook migration | COEXIST | Forge hooks merge into existing `~/.claude/hooks.json`. Old hooks stay. |
| Script language | NODE.JS | Use `node -e` with inline JS or Node scripts, matching existing hook patterns. No bash + yq dependency. |
| State format | JSON | `.forge/config.json` and `.forge/workflow.json`. Use `jq` for parsing in hooks or native JSON in Node. |
| Scope | ALL 4 PHASES | Full vision, not just MVP. |
| Stop hook optimization | HYBRID | Command-type Stop hooks for hard-enforcement (measurable criteria). Prompt-type Stop hooks for soft-enforcement (qualitative DoD). |

## Architecture Conventions (Derived from Existing Codebase)

The following conventions are drawn from analyzing the existing `~/.claude/` structure:

### Skills Convention
- Each skill lives in `~/.claude/skills/{name}/SKILL.md`
- SKILL.md frontmatter includes: `name`, `description`, `context` (fork/inherit), `allowed-tools`, `argument-hint`, optionally `agent`, `user-invocable`
- Reference materials in `references/` subdirectory
- Skills are knowledge documents, not enforcement
- Skills under 200 lines preferred, loaded on-demand

### Hooks Convention
- All hooks in `~/.claude/hooks.json` under `hooks` key
- Hook events: `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `PreCompact`, `UserPromptSubmit`
- Each hook entry: `{ "matcher": "...", "hooks": [{ "type": "command"|"prompt"|"skill", ... }] }`
- Existing hooks use `node -e "..."` for inline scripts (established pattern)
- Hooks read stdin as JSON (tool_input, tool_output, etc.), write to stderr for user-visible messages, stdout for passthrough
- Exit codes: 0 = allow, non-zero = block (for command hooks)
- Prompt-type hooks supported on: `Stop`, `SubagentStop`, `UserPromptSubmit`, `PreToolUse`

### Agents Convention
- Agents in `~/.claude/agents/{name}.md`
- Frontmatter: `name`, `description`, `model` (e.g., `sonnet`), `color`
- Agents are specialist subagents spawned by skills/orchestrators

### State Convention
- JSON files for machine-readable state (matching existing `settings.json`, `hooks.json`)
- Markdown files for human-readable artifacts
- Git-committed for cross-machine sync

---

## Phase 1: Foundation

**Goal**: Establish the core infrastructure -- state management, configuration, the Stop hook enforcement engine, the SessionStart context loader, and the main orchestrator skill. Deliver a working Forge that can enforce a single phase (Implement) end-to-end.

**Exit Criteria**: A user can run `/forge init`, `/forge start implement`, work through implementation steps, and the Stop hook blocks completion until tests pass and lint is clean. SessionStart loads Forge context on resume.

---

### Step 1.1: Define JSON Schemas

**What**: Define the shape of `.forge/config.json` and `.forge/workflow.json` as reference documentation. These schemas drive everything else.

**Files to create**:
- `~/.claude/skills/forge/references/config-schema.md` -- Documents config.json fields, defaults, per-language examples
- `~/.claude/skills/forge/references/workflow-schema.md` -- Documents workflow.json fields, state transitions, valid values

**`.forge/config.json` structure**:
```json
{
  "standards": {
    "lint": "npx eslint . --max-warnings 0",
    "format": "npx prettier --write",
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

**`.forge/workflow.json` structure**:
```json
{
  "workflow_id": "abc123",
  "created": "2026-03-20T10:30:00Z",
  "title": "Add user authentication",
  "current_phase": "implement",
  "current_step": 3,
  "phase_started": "2026-03-20T11:00:00Z",
  "retry_count": 1,
  "last_error": "3 tests failing in auth.test.ts",
  "stop_hook_active": false,
  "phases": {
    "discover": { "status": "completed", "completed_at": "...", "artifact": ".forge/artifacts/RESEARCH.md" },
    "specify": { "status": "completed", "completed_at": "...", "artifact": ".forge/artifacts/SPEC.md" },
    "design": { "status": "completed", "completed_at": "...", "artifact": ".forge/artifacts/PLAN.md", "adrs": [] },
    "implement": {
      "status": "in_progress",
      "steps": [
        { "name": "Step description", "status": "completed" },
        { "name": "Current step", "status": "in_progress" }
      ],
      "modified_files": [],
      "dod": {
        "tests_pass": false,
        "lint_clean": false,
        "build_succeeds": false,
        "acceptance_criteria_met": false
      }
    },
    "review": { "status": "pending" },
    "ship": { "status": "pending" }
  },
  "fast_path": null
}
```

**Dependencies**: None
**Estimated effort**: Small

---

### Step 1.2: Create Forge Script Library

**What**: Build the shared Node.js utility library that all hook scripts use to read/write state. This is the equivalent of the concept's `scripts/lib/` but in Node.js.

**Files to create**:
- `~/.claude/skills/forge/scripts/lib/state.js` -- Read/write `.forge/workflow.json`
- `~/.claude/skills/forge/scripts/lib/config.js` -- Read `.forge/config.json`
- `~/.claude/skills/forge/scripts/lib/enforcement.js` -- Soft/hard gate logic, DoD evaluation
- `~/.claude/skills/forge/scripts/lib/recovery.js` -- Retry tracking, escalation logic

**Key functions** (`state.js`):
```javascript
// All functions operate on the .forge/ directory in the current working directory
module.exports = {
  isActive(),          // Returns true if .forge/workflow.json exists and has active workflow
  getPhase(),          // Returns current phase name
  getStep(),           // Returns current step number
  getEnforcement(),    // Returns "soft"|"hard" for current phase
  getRetryCount(),     // Returns retry count
  incrementRetry(),    // Bumps retry count, writes file
  resetRetry(),        // Resets retry count to 0
  advancePhase(),      // Moves to next phase, resets step
  completeStep(),      // Marks current step complete, advances step counter
  getWorkflow(),       // Returns full workflow.json contents
  updateWorkflow(patch), // Merges patch into workflow.json
  getModifiedFiles(),  // Returns list of modified files
  addModifiedFile(f),  // Adds file to modified_files list
  getDod(),            // Returns DoD object for current phase
  updateDod(patch),    // Updates DoD criteria for current phase
  setStopHookActive(bool), // Sets stop_hook_active flag
  isStopHookActive(),  // Returns stop_hook_active flag
};
```

**Key functions** (`config.js`):
```javascript
module.exports = {
  getConfig(),         // Returns full config.json contents (with defaults)
  getCommand(name),    // Gets command string for a standard (lint, test, etc.)
  getEnforcementLevel(phase), // Gets enforcement level for a phase
  getMaxRetries(),     // Gets max retry count
  getDefaults(),       // Returns default config for forge init
};
```

**Key functions** (`enforcement.js`):
```javascript
module.exports = {
  evaluateDod(phase, workflow, config), // Returns { met: bool, items: [{criterion, met, detail}] }
  evaluateHardDod(workflow, config),    // Runs actual commands (test, lint, build), returns results
  formatDodReport(evaluation),          // Formats DoD status for display
  shouldBlock(phase, dodResult, config), // Returns true if phase should block
};
```

**Key functions** (`recovery.js`):
```javascript
module.exports = {
  shouldEscalate(workflow, config),  // Returns true if retry_count >= max_retries
  getEscalationContext(workflow),     // Returns context for escalation message
  formatRetryMessage(workflow, dodResult), // Formats retry feedback
  formatEscalationMessage(workflow, dodResult), // Formats escalation to user
  logToHistory(workflow, event),      // Appends to .forge/history/
};
```

**Design notes**:
- All library functions are synchronous where possible (using `fs.readFileSync`/`fs.writeFileSync`) since hooks run serially
- Functions find `.forge/` by walking up from `process.cwd()` (same pattern as git finding `.git/`)
- Config has sensible defaults merged with user config (so minimal config works)
- Library files are standard CommonJS modules, requirable from hook scripts

**Dependencies**: Step 1.1 (schema definitions)
**Estimated effort**: Medium

---

### Step 1.3: Build the Stop Hook (Hybrid Approach)

**What**: The Stop hook is the enforcement backbone of Forge. This step implements the hybrid approach: **command-type** Stop hooks for hard-enforcement phases (where criteria are measurable: tests pass, lint clean, build succeeds) and **prompt-type** Stop hooks for soft-enforcement phases (where AI judgment evaluates qualitative DoD criteria like "problem framed" or "acceptance criteria defined").

**Files to create**:
- `~/.claude/skills/forge/scripts/stop-hook-hard.js` -- Command-type Stop hook for hard enforcement
- (Prompt-type hook is inline in hooks.json, not a separate file)

**Hard Stop Hook Logic** (`stop-hook-hard.js`):
```
Stop hook fires (command-type, fast, deterministic)
  |
  +-- No .forge/workflow.json? --> EXIT 0 (not our concern)
  |
  +-- stop_hook_active == true? --> EXIT 0 (break infinite loop)
  |
  +-- Get current phase from workflow.json
  |
  +-- Phase enforcement != "hard"? --> EXIT 0 (soft phases handled by prompt hook)
  |
  +-- Set stop_hook_active = true
  |
  +-- Run measurable DoD checks:
  |     - Execute test command from config.json
  |     - Execute lint command from config.json
  |     - Execute build command from config.json
  |     - Check each result
  |
  +-- All checks pass?
  |     YES --> Log completion, advance phase, set stop_hook_active = false, EXIT 0
  |     NO  --> Check retry_count
  |              retry_count < max_retries?
  |                YES --> Increment retry, format feedback to stderr, set stop_hook_active = false, EXIT 2 (block)
  |                NO  --> Format escalation message to stderr, reset retry, set stop_hook_active = false, EXIT 0 (let stop, user intervenes)
```

**Soft Stop Hook** (prompt-type, inline in hooks.json):
```
The prompt evaluates the session transcript to determine:
1. Is there an active Forge workflow?
2. Is the current phase soft-enforcement?
3. Has the phase's Definition of Done been met?
4. If not met, warn and ask Claude to justify or continue working

Prompt hooks return natural language decisions -- they warn but don't block.
```

**Hook registration** (added to `~/.claude/hooks.json`):
```json
{
  "Stop": [
    {
      "name": "forge-stop-hard",
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "node ~/.claude/skills/forge/scripts/stop-hook-hard.js",
          "timeout": 60
        }
      ],
      "description": "Forge: Block stop in hard-enforcement phases until DoD criteria are met (tests, lint, build)"
    },
    {
      "name": "forge-stop-soft",
      "matcher": "*",
      "hooks": [
        {
          "type": "prompt",
          "prompt": "Check if there is an active Forge workflow by looking for .forge/workflow.json in the project. If it exists and the current phase has 'soft' enforcement, evaluate whether the phase's Definition of Done has been met based on the session transcript and artifacts. If DoD is not met: warn about incomplete items, ask Claude to either continue working or provide justification for stopping early. Log any justification to .forge/history/. If no active workflow or phase is hard-enforcement, take no action.",
          "timeout": 30
        }
      ],
      "description": "Forge: Warn about incomplete DoD in soft-enforcement phases (AI judgment)"
    }
  ]
}
```

**Why hybrid**:
- Hard phases (Implement, Review, Ship) have objectively measurable criteria: "tests pass" is a command exit code, not a judgment call. Command-type hooks are faster, cheaper (no LLM call), and deterministic.
- Soft phases (Discover, Specify, Design) have qualitative criteria: "problem framed" requires reading artifacts and judging completeness. Prompt-type hooks are appropriate here.
- This avoids the infinite-loop risk of agent-type Stop hooks (the concept's original design) while still providing enforcement.

**Dependencies**: Step 1.2 (script library)
**Estimated effort**: Large

---

### Step 1.4: Build the SessionStart Hook

**What**: On session start (or resume after compaction), load Forge context into the conversation so Claude knows the current workflow state.

**Files to create**:
- `~/.claude/skills/forge/scripts/session-start-hook.js`

**Logic**:
```
SessionStart fires
  |
  +-- No .forge/workflow.json? --> Print "No active Forge workflow. Use /forge init to get started." to stderr, EXIT 0
  |
  +-- Read workflow.json
  |
  +-- Print to stderr:
  |     "[Forge] Active workflow: {title}"
  |     "[Forge] Phase {N}/6: {phase_name} ({enforcement} enforcement)"
  |     "[Forge] Step {M}/{total}: {step_name}"
  |     "[Forge] Retry count: {count}/{max}"
  |     "[Forge] Modified files: {count}"
  |
  +-- If compact event (matcher detects compact):
  |     Also print critical context:
  |     - Current DoD status
  |     - Key decisions from artifacts
  |     - Last error if retry_count > 0
  |
  +-- EXIT 0
```

**Hook registration**:
```json
{
  "SessionStart": [
    {
      "name": "forge-session-start",
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "node ~/.claude/skills/forge/scripts/session-start-hook.js",
          "timeout": 10
        }
      ],
      "description": "Forge: Load workflow state and inject phase context on session start"
    }
  ]
}
```

**Coexistence**: This hook is additive -- it prints Forge context via stderr alongside existing SessionStart hooks (load-learned-patterns, load-context). No conflicts.

**Dependencies**: Step 1.2 (script library)
**Estimated effort**: Small

---

### Step 1.5: Build the Orchestrator Skill

**What**: The main `/forge` command handler. This skill routes all Forge commands and manages workflow lifecycle. It is the user-facing entry point.

**Files to create**:
- `~/.claude/skills/forge/SKILL.md`

**Commands handled**:
| Command | Action |
|---------|--------|
| `/forge init` | Create `.forge/` directory with `config.json` (Phase 4 wizard, for now: copy defaults) |
| `/forge start [phase]` | Create `workflow.json`, set current_phase, begin workflow |
| `/forge status` | Display current workflow state |
| `/forge continue` | Resume where left off (just displays status + context) |
| `/forge skip-to <phase>` | Jump to phase (with confirmation if skipping hard phases) |
| `/forge fix "desc"` | Fast path: start at implement with trivial scope |
| `/forge incident "desc"` | Start at discover with incident context |
| `/forge history` | Show completed workflow logs from `.forge/history/` |
| `/forge config` | Open/display `.forge/config.json` |
| `/forge reset` | Reset current workflow (with confirmation) |

**Skill design**:
- Frontmatter: `name: forge`, `description: ...`, `context: fork`, `argument-hint: "<command> [args]"`
- When invoked, parses the command argument
- For `start`, creates workflow.json and loads the appropriate phase skill
- For `init`, creates `.forge/` directory structure with default config
- Short skill (~150 lines) -- delegates to phase skills for actual phase knowledge

**Dependencies**: Step 1.1 (schemas), Step 1.2 (library -- for init default generation)
**Estimated effort**: Medium

---

### Step 1.6: Build the Implement Phase Skill

**What**: The first phase skill, serving as the template for all others. This is the most complex phase with hard enforcement.

**Files to create**:
- `~/.claude/skills/forge/skills/implement.md`

**Content structure**:
1. What this phase does (purpose: build against the plan)
2. Definition of Ready (plan exists, design approved)
3. Steps to follow (ordered):
   - Set up module structure
   - Write tests first
   - Implement to make tests pass
   - Run lint + format
   - Run full test suite
   - Verify build succeeds
4. Definition of Done:
   - All acceptance criteria implemented
   - All tests pass
   - Lint clean
   - Build succeeds
   - Modified files list accurate
5. Artifact: Code + tests (no separate markdown artifact)
6. Common pitfalls (skipping tests, not running lint, scope creep)
7. Integration with existing skills: reference `verification-loop` and `code-review` skills

**Design notes**:
- Phase skills are loaded on-demand by the orchestrator
- They instruct Claude HOW to do the phase
- The Stop hook enforces that the DoD is met before moving on
- The skill explicitly references the existing `verification-loop` skill for running checks

**Dependencies**: Step 1.5 (orchestrator skill)
**Estimated effort**: Small

---

### Step 1.7: Integration Test -- End-to-End Workflow

**What**: Validate that all Phase 1 components work together by walking through a complete Implement phase.

**Test scenario**:
1. Run `/forge init` in a test project (creates `.forge/config.json`)
2. Run `/forge start implement` (creates `workflow.json`)
3. Verify SessionStart hook loads context on resume
4. Work through implementation steps
5. Attempt to stop -- verify hard Stop hook blocks (tests haven't been run)
6. Run tests, fix issues
7. Attempt to stop again -- verify Stop hook allows (all DoD met)
8. Verify workflow.json shows implement phase as completed

**Dependencies**: Steps 1.1-1.6
**Estimated effort**: Medium

---

## Phase 2: Core Phases

**Goal**: Implement all 6 phase skills with their templates, add PreToolUse and PostToolUse hooks for phase-aware constraints and progress tracking, add UserPromptSubmit hook for phase intent detection, and implement fast path detection.

**Exit Criteria**: All 6 phases are available, hooks enforce appropriate constraints per phase, fast paths work for trivial/small changes.

---

### Step 2.1: Build Remaining Phase Skills

**What**: Create the 5 remaining phase skills following the template established in Step 1.6.

**Files to create**:
- `~/.claude/skills/forge/skills/discover.md`
- `~/.claude/skills/forge/skills/specify.md`
- `~/.claude/skills/forge/skills/design.md`
- `~/.claude/skills/forge/skills/review.md`
- `~/.claude/skills/forge/skills/ship.md`

**Per-skill content** (each follows the same structure):

**discover.md**:
- Purpose: Research, explore, frame the problem
- DoR: Intent stated by user
- Steps: Understand context, explore codebase, identify scope, assess risks, write RESEARCH.md
- DoD (soft): Problem framed, scope identified, RESEARCH.md written
- Artifact: `.forge/artifacts/RESEARCH.md`
- Integration: Reference `codebase-research` and `brainstorm` existing skills

**specify.md**:
- Purpose: Write requirements and acceptance criteria
- DoR: Problem understood (discover complete or skipped)
- Steps: Define user stories, write acceptance criteria (Given/When/Then), define NFRs, identify out-of-scope
- DoD (soft): Acceptance criteria defined, testable, SPEC.md written
- Artifact: `.forge/artifacts/SPEC.md`

**design.md**:
- Purpose: Plan architecture, write ADRs for key decisions
- DoR: Requirements clear (specify complete or skipped)
- Steps: Analyze options, present trade-offs, decide approach, write implementation plan, document ADRs
- DoD (soft): Plan reviewed, ADRs written for key decisions, PLAN.md written
- Artifact: `.forge/artifacts/PLAN.md` + `.forge/artifacts/adr/`
- Integration: Reference existing `create-plan` and `adr` skills

**review.md**:
- Purpose: Multi-dimension code review + security review
- DoR: Implementation complete (all tests pass)
- Steps: Run review across dimensions (functionality, security, performance, test quality, maintainability), compile report
- DoD (hard): Required review dimensions pass, no blocking issues, REVIEW.md written
- Artifact: `.forge/artifacts/REVIEW.md`
- Integration: Reference existing `code-review` and `security-review` skills

**ship.md**:
- Purpose: Commit, create PR, verify CI
- DoR: Review approved
- Steps: Create feature branch, commit with meaningful message, push, create PR with description from artifacts, verify CI
- DoD (hard): PR created, CI green (or commit on main if that's the strategy)
- No separate artifact (the PR itself is the output)

**Dependencies**: Step 1.6 (template), Step 1.1 (schemas for DoD definitions)
**Estimated effort**: Medium

---

### Step 2.2: Create Artifact Templates

**What**: Create the reference templates for phase artifacts so skills can reference them.

**Files to create**:
- `~/.claude/skills/forge/references/research-template.md`
- `~/.claude/skills/forge/references/spec-template.md`
- `~/.claude/skills/forge/references/plan-template.md`
- `~/.claude/skills/forge/references/adr-template.md`
- `~/.claude/skills/forge/references/review-template.md`

**Design notes**:
- Templates follow the exact formats from FORGE-CONCEPT.md (the RESEARCH.md, SPEC.md, PLAN.md, ADR, REVIEW.md sections)
- Each template includes placeholder text and instructions
- Templates are loaded on-demand by phase skills when producing artifacts
- The existing `adr` skill has its own template at `~/.claude/skills/adr/references/adr-template.md` -- the Forge ADR template should be compatible but include Forge-specific fields (workflow_id, phase reference)

**Dependencies**: Step 2.1 (phase skills reference these)
**Estimated effort**: Small

---

### Step 2.3: Build the PreToolUse Hook

**What**: Validate tool use against current phase constraints. For example, block code edits during the Review phase, warn about code edits during planning phases.

**Files to create**:
- `~/.claude/skills/forge/scripts/pre-tool-hook.js`

**Logic**:
```
PreToolUse fires (on Edit, Write, Bash)
  |
  +-- No active workflow? --> EXIT 0
  |
  +-- Read current phase from workflow.json
  |
  +-- Tool is Edit or Write?
  |     Phase is Review? --> stderr: "[Forge] BLOCKED: Cannot edit files during Review phase. Complete review first." EXIT 2
  |     Phase is Discover/Specify/Design? --> stderr: "[Forge] WARNING: Editing code during {phase} phase. Consider completing planning first." EXIT 0
  |     Phase is Implement? --> EXIT 0 (expected)
  |     Phase is Ship? --> EXIT 0 (minor edits for PR prep acceptable)
  |
  +-- Tool is Bash?
  |     Read command from stdin
  |     Phase is Review? --> Block dangerous commands (git push, rm), allow read-only + test
  |     Command is destructive (rm -rf, git push --force, etc.)? --> stderr: "[Forge] BLOCKED: Dangerous command during active workflow." EXIT 2
  |     Otherwise --> EXIT 0
  |
  +-- EXIT 0
```

**Hook registration**:
```json
{
  "PreToolUse": [
    {
      "name": "forge-pre-tool",
      "matcher": "tool == \"Edit\" || tool == \"Write\" || tool == \"Bash\"",
      "hooks": [
        {
          "type": "command",
          "command": "node ~/.claude/skills/forge/scripts/pre-tool-hook.js",
          "timeout": 5
        }
      ],
      "description": "Forge: Validate tool use against current phase constraints"
    }
  ]
}
```

**Coexistence**: This hook adds Forge-specific constraints. Existing PreToolUse hooks (dev server block, tmux reminder, doc file warning, strategic-compact-monitor) continue to fire independently. No conflicts -- Forge constraints are additive.

**Dependencies**: Step 1.2 (script library)
**Estimated effort**: Medium

---

### Step 2.4: Build the PostToolUse Hook

**What**: Track progress after tool execution. Auto-format after edits, capture test results, update modified files list.

**Files to create**:
- `~/.claude/skills/forge/scripts/post-tool-hook.js`

**Logic**:
```
PostToolUse fires (on Edit, Write, Bash)
  |
  +-- No active workflow? --> EXIT 0
  |
  +-- Tool is Edit or Write?
  |     Add file to workflow.json modified_files list
  |     (Auto-format is already handled by existing PostToolUse prettier hook -- no duplication)
  |
  +-- Tool is Bash?
  |     Read command + output from stdin
  |     Is test command (matches config.standards.test pattern)?
  |       Parse pass/fail, update workflow.json dod.tests_pass
  |     Is build command (matches config.standards.build pattern)?
  |       Parse success/failure, update workflow.json dod.build_succeeds
  |     Is lint command (matches config.standards.lint pattern)?
  |       Parse clean/dirty, update workflow.json dod.lint_clean
  |
  +-- Passthrough: echo stdin to stdout
  +-- EXIT 0
```

**Hook registration**:
```json
{
  "PostToolUse": [
    {
      "name": "forge-post-tool",
      "matcher": "tool == \"Edit\" || tool == \"Write\" || tool == \"Bash\"",
      "hooks": [
        {
          "type": "command",
          "command": "node ~/.claude/skills/forge/scripts/post-tool-hook.js",
          "timeout": 10
        }
      ],
      "description": "Forge: Track progress, capture test/build/lint results, update modified files"
    }
  ]
}
```

**Coexistence**: Existing PostToolUse hooks (PR URL logger, prettier, TypeScript check, console.log warning) continue independently. The Forge hook adds workflow tracking. The existing prettier hook handles formatting, so Forge does NOT duplicate that -- it only tracks files and captures command results.

**Dependencies**: Step 1.2 (script library)
**Estimated effort**: Medium

---

### Step 2.5: Build the UserPromptSubmit Hook

**What**: When the user submits a prompt, detect phase-relevant intent and remind Claude of the current phase context. If no workflow is active but the message implies development work, suggest starting one.

**Files to create**:
- `~/.claude/skills/forge/scripts/user-prompt-hook.js`

**Logic**:
```
UserPromptSubmit fires
  |
  +-- Read user message from stdin
  |
  +-- Active workflow?
  |     YES --> stderr: "[Forge] Current: {phase} phase, step {N}. Remember to follow phase constraints."
  |     NO  --> Does message imply dev work?
  |              Pattern match: "implement", "fix", "build", "create", "add feature", "bug", etc.
  |              YES --> stderr: "[Forge] Consider starting a Forge workflow: /forge start"
  |              NO  --> EXIT 0
  |
  +-- Passthrough stdin to stdout
  +-- EXIT 0
```

**Hook registration**:
```json
{
  "UserPromptSubmit": [
    {
      "name": "forge-user-prompt",
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "node ~/.claude/skills/forge/scripts/user-prompt-hook.js",
          "timeout": 5
        }
      ],
      "description": "Forge: Detect phase intent, remind of current phase, suggest starting workflow"
    }
  ]
}
```

**Dependencies**: Step 1.2 (script library)
**Estimated effort**: Small

---

### Step 2.6: Implement Fast Path Detection

**What**: Not every change needs 6 phases. Detect scope and offer fast paths.

**Where**: Logic added to the orchestrator skill (Step 1.5) and the UserPromptSubmit hook (Step 2.5).

**Fast paths**:
| Scope | Phases Used | Detection |
|-------|-------------|-----------|
| **Trivial** | Implement -> Ship | User says "quick fix"/"typo"/"small change" OR change is < trivial_threshold lines |
| **Small** | Specify -> Implement -> Review -> Ship | Clear scope, single-file or few-file change |
| **Standard** | All 6 phases | Default for non-trivial work |
| **Exploratory** | Discover only | User says "explore"/"investigate"/"research" |

**Implementation**:
- Orchestrator skill's `/forge fix` command triggers trivial fast path
- Orchestrator skill's `/forge start discover` with "explore" intent triggers exploratory path
- UserPromptSubmit hook detects scope keywords and sets `fast_path` field in workflow.json
- Phase skills check `fast_path` to know which DoD criteria apply
- Stop hook respects fast_path: skipped phases are marked "skipped" not "pending"

**Dependencies**: Steps 1.5, 2.5
**Estimated effort**: Small

---

### Step 2.7: Integration Test -- Multi-Phase Workflow

**What**: Validate the complete phase pipeline works end-to-end.

**Test scenario**:
1. `/forge init` + `/forge start discover`
2. Work through Discover phase, produce RESEARCH.md
3. Stop -- soft enforcement warns if incomplete, allows with justification
4. Advance to Specify, produce SPEC.md
5. Advance through Design, produce PLAN.md + ADR
6. Enter Implement with hard enforcement
7. Verify PreToolUse blocks edits during Review
8. Verify PostToolUse tracks file modifications
9. Complete full workflow through Ship
10. Test `/forge fix "typo"` fast path (skip to implement)
11. Test `/forge status` and `/forge history`

**Dependencies**: Steps 2.1-2.6
**Estimated effort**: Large

---

## Phase 3: Intelligence

**Goal**: Add the specialist subagents -- recovery agent for retry/escalation, parallel review agents, researcher agent for read-only exploration, and verifier agent for automated checks. These agents make Forge smarter, not just enforceable.

**Exit Criteria**: Recovery agent diagnoses and suggests fixes on retry. Review agent provides multi-dimension reviews in parallel. Researcher agent explores codebases safely. Verifier agent runs comprehensive checks.

---

### Step 3.1: Build the Recovery Agent

**What**: A specialist subagent that activates when a hard-enforcement DoD check fails. It diagnoses errors and suggests fixes without implementing them directly.

**Files to create**:
- `~/.claude/agents/forge-recovery.md`

**Agent design**:
- Model: `sonnet` (fast, cheap, good at diagnosis)
- Color: `red`
- Role: Error diagnosis + fix suggestion
- Constraints: Read-only access + test execution. Cannot edit files.
- Input: Error output, modified files list, relevant code context
- Output: Diagnosis (root cause), suggested fixes (specific file:line changes), alternative approaches

**Integration with Stop hook**:
- On retry attempt 2+ (after first simple retry fails), the hard Stop hook spawns the recovery agent
- Recovery agent reads error output, examines related files, runs diagnostic commands
- Returns structured diagnosis to main Claude context
- Main Claude uses diagnosis to attempt fix

**Recovery escalation flow**:
```
Attempt 1: Claude gets raw error message, tries basic fix
Attempt 2: Recovery agent spawns, provides diagnostic context + suggestions
Attempt 3: ESCALATE to user with full context (what was tried, what failed, suggestions)
```

**Dependencies**: Step 1.3 (Stop hook calls recovery on retry)
**Estimated effort**: Medium

---

### Step 3.2: Build the Verifier Agent

**What**: A specialist subagent that runs comprehensive verification checks. Used by the hard Stop hook and can be invoked independently.

**Files to create**:
- `~/.claude/agents/forge-verifier.md`

**Agent design**:
- Model: `sonnet`
- Color: `green`
- Role: Run tests, lint, typecheck, build and report results
- Constraints: Read-only + execution of verification commands only
- Input: Config (which commands to run), modified files list
- Output: Structured verification report (pass/fail per check, error details)

**Integration**:
- The existing `verification-loop` skill provides the framework for 6-check verification
- The verifier agent is the Forge-specific wrapper that uses `.forge/config.json` commands
- Called by the hard Stop hook when evaluating DoD
- Also callable via `/forge verify` command

**Design note**: The verifier agent complements (not replaces) the existing `verification-loop` skill. The skill provides the methodology; the agent provides the Forge-specific execution context.

**Dependencies**: Step 1.2 (config library for command lookup)
**Estimated effort**: Medium

---

### Step 3.3: Build the Researcher Agent

**What**: A read-only codebase exploration subagent used during Discover and Design phases.

**Files to create**:
- `~/.claude/agents/forge-researcher.md`

**Agent design**:
- Model: `sonnet`
- Color: `blue`
- Role: Explore codebase, find patterns, understand architecture, map dependencies
- Constraints: Strictly read-only (Read, Glob, Grep, Bash read-only commands). No Write/Edit.
- Input: Research question, scope (directories, file patterns)
- Output: Structured findings with file:line references

**Integration**:
- Discover phase skill spawns the researcher to explore the codebase
- Design phase skill spawns the researcher to understand existing patterns
- Complements existing `codebase-research`, `codebase-locator`, `codebase-analyzer`, `codebase-pattern-finder` agents -- the Forge researcher is specifically scoped to Forge workflow context (reads .forge/artifacts for prior phase context)

**Dependencies**: None (standalone agent)
**Estimated effort**: Small

---

### Step 3.4: Build the Review Agent (Parallel Multi-Dimension)

**What**: Specialist review subagents that run in parallel, each evaluating one review dimension.

**Files to create**:
- `~/.claude/agents/forge-reviewer.md` -- Base reviewer agent (parameterized by dimension)

**Agent design**:
- Model: `sonnet`
- Color: `purple`
- Role: Evaluate one review dimension (functionality, security, performance, test quality, maintainability)
- Input: Dimension to evaluate, modified files list, acceptance criteria from SPEC.md
- Output: PASS/FAIL with findings for that dimension

**Integration**:
- Review phase skill spawns N parallel reviewer agents (one per configured dimension)
- Each runs independently, returns pass/fail
- Results aggregated into REVIEW.md artifact
- Review phase DoD: `required_pass` dimensions must pass (from config)

**Design note**: Single agent file parameterized by dimension (not 5 separate agent files). The dimension context is passed as input when spawning.

**Dependencies**: Step 2.1 (review phase skill)
**Estimated effort**: Medium

---

### Step 3.5: Enhance Stop Hook with Recovery Integration

**What**: Update the hard Stop hook to integrate the recovery agent on retry attempts.

**Changes to**: `~/.claude/skills/forge/scripts/stop-hook-hard.js`

**Updated flow**:
```
DoD check fails
  |
  +-- retry_count == 0?
  |     Increment retry, return raw error message to Claude
  |
  +-- retry_count == 1?
  |     Increment retry, spawn forge-recovery agent
  |     Return recovery agent's diagnosis + suggestions to Claude
  |
  +-- retry_count >= max_retries?
  |     Format escalation with full history (all attempts, all errors, all suggestions)
  |     Reset retry count
  |     EXIT 0 (let Claude stop, user intervenes)
```

**Dependencies**: Steps 3.1, 3.2 (recovery and verifier agents)
**Estimated effort**: Small

---

### Step 3.6: Integration Test -- Intelligent Recovery

**What**: Validate the recovery and escalation system works correctly.

**Test scenarios**:
1. Introduce a failing test during Implement phase
2. Attempt to stop -- verify Stop hook blocks and returns error
3. Make a bad fix attempt
4. Attempt to stop again -- verify recovery agent spawns and provides diagnosis
5. Make another bad fix
6. Attempt to stop -- verify escalation to user with full context
7. User fixes issue manually
8. Verify workflow completes cleanly

**Dependencies**: Steps 3.1-3.5
**Estimated effort**: Medium

---

## Phase 4: Polish

**Goal**: Add the user-friendly init wizard, workflow history/analytics, cross-machine sync validation, comprehensive documentation, and PreCompact hook for context preservation during compaction.

**Exit Criteria**: `forge init` provides an interactive configuration experience. History shows past workflows. Documentation is complete for open-source release.

---

### Step 4.1: Build the Init Configuration Wizard

**What**: Make `/forge init` interactive -- detect project type, suggest appropriate commands, let user customize.

**Changes to**: Orchestrator skill (Step 1.5) and new init helper script.

**Files to create**:
- `~/.claude/skills/forge/scripts/detect-project.js` -- Detect project type and suggest config

**Init wizard flow**:
1. Detect project type (package.json -> Node.js, Cargo.toml -> Rust, go.mod -> Go, etc.)
2. Suggest standard commands based on detected type
3. Present to user for confirmation/customization
4. Detect existing patterns (is there an eslint config? a prettier config? a test runner?)
5. Generate `.forge/config.json` with detected/confirmed settings
6. Create `.forge/artifacts/` and `.forge/history/` directories
7. Suggest adding `.forge/` to git tracking
8. Print success message with next steps

**Project detection** (`detect-project.js`):
```javascript
// Detects project type and returns suggested config
// Uses the same detection patterns as the existing verification-loop skill
module.exports = {
  detectProjectType(),    // Returns "nodejs"|"typescript"|"python"|"go"|"rust"|"unknown"
  detectPackageManager(), // Returns "npm"|"pnpm"|"yarn"|"bun" for Node.js projects
  suggestConfig(type),    // Returns default config.json for detected type
};
```

**Dependencies**: Step 1.5 (orchestrator skill)
**Estimated effort**: Medium

---

### Step 4.2: Build Workflow History and Analytics

**What**: Track completed workflows in `.forge/history/` and provide analytics.

**Changes to**: Script library (Step 1.2), orchestrator skill (Step 1.5).

**Files to create/modify**:
- Add to `~/.claude/skills/forge/scripts/lib/history.js`

**History entry format** (`.forge/history/{date}-{slug}.json`):
```json
{
  "workflow_id": "abc123",
  "title": "Add user authentication",
  "created": "2026-03-20T10:30:00Z",
  "completed": "2026-03-20T14:00:00Z",
  "duration_minutes": 210,
  "fast_path": null,
  "phases_completed": ["discover", "specify", "design", "implement", "review", "ship"],
  "phases_skipped": [],
  "retries": {
    "implement": 2,
    "review": 0,
    "ship": 0
  },
  "escalations": 0,
  "artifacts": [
    ".forge/artifacts/RESEARCH.md",
    ".forge/artifacts/SPEC.md",
    ".forge/artifacts/PLAN.md",
    ".forge/artifacts/REVIEW.md"
  ],
  "modified_files": ["src/auth/token.ts", "src/auth/login.ts"],
  "justifications": [
    {
      "phase": "specify",
      "reason": "Requirements are clear from ticket, no formal spec needed",
      "timestamp": "2026-03-20T10:45:00Z"
    }
  ]
}
```

**`/forge history` command**:
- Lists completed workflows with summary stats
- Shows: date, title, duration, phases used, retry count
- Optional: filter by date range, fast path type

**Analytics** (future enhancement, basic version now):
- Average workflow duration by scope
- Most common retry phases
- Fast path usage frequency

**Dependencies**: Step 1.2 (script library), Step 1.5 (orchestrator)
**Estimated effort**: Small

---

### Step 4.3: Build PreCompact Hook

**What**: Before compaction, ensure Forge context is preserved. Save critical state so it survives compaction and can be re-injected by SessionStart.

**Files to create**:
- `~/.claude/skills/forge/scripts/pre-compact-hook.js`

**Logic**:
```
PreCompact fires
  |
  +-- No active workflow? --> EXIT 0
  |
  +-- Print to stderr:
  |     "[Forge] Saving workflow context before compaction..."
  |     "[Forge] Current: {phase} phase, step {N}/{total}"
  |     "[Forge] DoD status: {summary}"
  |     "[Forge] Modified files: {count}"
  |     "[Forge] Key context: {last_error if any}"
  |
  +-- Ensure workflow.json is written to disk (it should be, but verify)
  |
  +-- EXIT 0
```

**Hook registration**:
```json
{
  "PreCompact": [
    {
      "name": "forge-pre-compact",
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "node ~/.claude/skills/forge/scripts/pre-compact-hook.js",
          "timeout": 5
        }
      ],
      "description": "Forge: Preserve workflow context before compaction"
    }
  ]
}
```

**Coexistence**: Existing PreCompact hooks (continuous-learning-before-compact, save-context-before-compact) run independently. The Forge hook adds workflow-specific context preservation.

**Dependencies**: Step 1.2 (script library)
**Estimated effort**: Small

---

### Step 4.4: Cross-Machine Sync Validation

**What**: Ensure `.forge/` state works correctly when committed to git and checked out on another machine.

**Implementation**:
- Add a `/forge sync-check` command to the orchestrator skill
- Validates that workflow.json is valid and consistent
- Checks that referenced artifacts exist
- Warns if config.json references commands that don't exist on current machine
- Reports any issues

**Changes to**: Orchestrator skill (add sync-check command)

**Validation checks**:
1. `.forge/workflow.json` parses as valid JSON
2. `current_phase` is a valid phase name
3. Referenced artifacts exist on disk
4. Config commands are resolvable (which {command} returns path)
5. No merge conflicts in JSON files
6. workflow_id matches across files

**Dependencies**: Step 1.5 (orchestrator)
**Estimated effort**: Small

---

### Step 4.5: Write Documentation for Open-Source Release

**What**: Comprehensive documentation covering installation, configuration, usage, and extension.

**Files to create**:
- `~/.claude/skills/forge/references/getting-started.md` -- Quick start guide
- `~/.claude/skills/forge/references/configuration.md` -- Full config reference
- `~/.claude/skills/forge/references/extending.md` -- How to add custom phases, modify enforcement
- `~/.claude/skills/forge/references/troubleshooting.md` -- Common issues and solutions

**Documentation structure**:

**getting-started.md**:
- Prerequisites (Claude Code installed)
- Installation (copy forge/ to ~/.claude/skills/, merge hooks into hooks.json)
- First workflow walkthrough
- Fast path examples

**configuration.md**:
- Full config.json schema with all fields explained
- Per-language examples (Node.js, Python, Go, Rust)
- Enforcement level customization
- Review dimension configuration
- Ship strategy options

**extending.md**:
- How to add a custom phase
- How to modify enforcement levels
- How to add custom DoD criteria
- How to add custom agents
- How to integrate with CI/CD

**troubleshooting.md**:
- Stop hook not firing
- Infinite loop in Stop hook (stop_hook_active)
- State corruption recovery
- Cross-machine sync issues
- Coexistence conflicts with other hooks

**Dependencies**: All previous steps (documentation covers full system)
**Estimated effort**: Medium

---

### Step 4.6: Hook Registration Script

**What**: A one-time setup script that merges Forge hooks into the existing `~/.claude/hooks.json` without overwriting existing hooks.

**Files to create**:
- `~/.claude/skills/forge/scripts/register-hooks.js`

**Logic**:
```javascript
// Read existing hooks.json
// Read forge-hooks.json (template of all Forge hooks)
// For each hook event (Stop, SessionStart, PreToolUse, etc.):
//   Append Forge hooks to existing array (don't replace)
//   Skip if Forge hook with same name already exists (idempotent)
// Write merged hooks.json
// Backup original to hooks.json.backup
```

**Files to create**:
- `~/.claude/skills/forge/hooks-template.json` -- All Forge hooks in the standard format (used by register script)

**Coexistence guarantee**: The registration script:
1. Never removes existing hooks
2. Appends Forge hooks after existing ones
3. Uses `name` field to detect duplicates (idempotent re-runs)
4. Creates backup before modification
5. Validates JSON before writing

**Dependencies**: All hook steps (compiles the full hook set)
**Estimated effort**: Small

---

### Step 4.7: Final Integration Test -- Complete System

**What**: End-to-end validation of the complete Forge system.

**Test scenarios**:
1. Fresh install: run register-hooks.js, verify hooks.json is correctly merged
2. `/forge init` on Node.js project: verify detection and config generation
3. Full 6-phase workflow: Discover through Ship
4. Fast path: `/forge fix "typo fix"` -- verify only Implement + Ship phases
5. Recovery: introduce failures in Implement, verify retry + escalation
6. Cross-machine: commit `.forge/`, verify resume on clean checkout
7. Coexistence: verify existing hooks (prettier, TypeScript, console.log) still fire
8. Compaction: verify PreCompact preserves state, SessionStart re-injects it

**Dependencies**: All steps
**Estimated effort**: Large

---

## File Inventory

### Complete list of files to create

**Skills** (`~/.claude/skills/forge/`):
```
SKILL.md                              # Main orchestrator skill (/forge command)
skills/
  discover.md                          # Discover phase knowledge
  specify.md                           # Specify phase knowledge
  design.md                            # Design phase knowledge
  implement.md                         # Implement phase knowledge
  review.md                            # Review phase knowledge
  ship.md                              # Ship phase knowledge
references/
  config-schema.md                     # config.json documentation
  workflow-schema.md                   # workflow.json documentation
  research-template.md                 # RESEARCH.md artifact template
  spec-template.md                     # SPEC.md artifact template
  plan-template.md                     # PLAN.md artifact template
  adr-template.md                      # ADR artifact template
  review-template.md                   # REVIEW.md artifact template
  getting-started.md                   # Quick start guide
  configuration.md                     # Full config reference
  extending.md                         # Extension guide
  troubleshooting.md                   # Common issues
scripts/
  lib/
    state.js                           # Workflow state read/write
    config.js                          # Config read with defaults
    enforcement.js                     # DoD evaluation logic
    recovery.js                        # Retry/escalation tracking
    history.js                         # History logging
  stop-hook-hard.js                    # Hard enforcement Stop hook
  session-start-hook.js                # SessionStart context loader
  pre-tool-hook.js                     # PreToolUse phase constraints
  post-tool-hook.js                    # PostToolUse progress tracking
  user-prompt-hook.js                  # UserPromptSubmit intent detection
  pre-compact-hook.js                  # PreCompact context preservation
  detect-project.js                    # Project type detection for init
  register-hooks.js                    # Merge Forge hooks into hooks.json
hooks-template.json                    # All Forge hooks (used by register script)
```

**Agents** (`~/.claude/agents/`):
```
forge-recovery.md                      # Error diagnosis agent
forge-verifier.md                      # Verification runner agent
forge-researcher.md                    # Read-only exploration agent
forge-reviewer.md                      # Parallel review dimension agent
```

**Project-level** (created by `forge init`):
```
.forge/
  config.json                          # Project-specific tooling config
  workflow.json                        # Current workflow state (auto-managed)
  artifacts/                           # Phase outputs
    adr/                               # Architecture Decision Records
  history/                             # Completed workflow logs
```

---

## Dependency Graph

```
Phase 1: Foundation
  1.1 JSON Schemas
   |
   v
  1.2 Script Library --------+--------+--------+
   |                          |        |        |
   v                          v        v        v
  1.3 Stop Hook          1.4 Session  |     1.5 Orchestrator
   |                      Start Hook  |        |
   |                                  |        v
   |                                  |     1.6 Implement Skill
   |                                  |        |
   v                                  v        v
  1.7 Integration Test (all Phase 1)

Phase 2: Core Phases
  2.1 Remaining Phase Skills (depends on 1.6)
   |
  2.2 Artifact Templates (depends on 2.1)
   |
  2.3 PreToolUse Hook (depends on 1.2)
   |
  2.4 PostToolUse Hook (depends on 1.2)
   |
  2.5 UserPromptSubmit Hook (depends on 1.2)
   |
  2.6 Fast Path Detection (depends on 1.5, 2.5)
   |
  2.7 Integration Test (all Phase 2)

Phase 3: Intelligence
  3.1 Recovery Agent (standalone)
   |
  3.2 Verifier Agent (depends on 1.2)
   |
  3.3 Researcher Agent (standalone)
   |
  3.4 Review Agent (depends on 2.1)
   |
  3.5 Stop Hook + Recovery Integration (depends on 3.1, 3.2)
   |
  3.6 Integration Test (all Phase 3)

Phase 4: Polish
  4.1 Init Wizard (depends on 1.5)
  4.2 History/Analytics (depends on 1.2, 1.5)
  4.3 PreCompact Hook (depends on 1.2)
  4.4 Cross-Machine Sync (depends on 1.5)
  4.5 Documentation (depends on all)
  4.6 Hook Registration Script (depends on all hooks)
  4.7 Final Integration Test (depends on all)
```

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Stop hook infinite loop | Medium | High | `stop_hook_active` flag in workflow.json; command-type hooks for hard enforcement avoid agent loops entirely |
| Hook performance (slow hooks block Claude) | Medium | Medium | All hooks have timeouts (5-60s). Library uses synchronous fs operations. No network calls in hooks. |
| State corruption (concurrent writes) | Low | High | Single-writer (hooks run serially in Claude Code). Backup before writes. `/forge reset` as escape hatch. |
| Coexistence conflicts | Medium | Medium | Forge hooks append to existing arrays, never replace. Name-based dedup prevents duplicates. |
| JSON parse errors in state files | Low | Medium | All reads wrapped in try/catch with fallback to defaults. Register script validates JSON before write. |
| Cross-machine command differences | Medium | Low | Init wizard detects local tooling. Config allows null commands (skip that check). Sync-check validates. |
| Context window pressure from hooks | Medium | Medium | Hook stderr output is concise (1-3 lines). Phase skills loaded on-demand. Templates only loaded when producing artifacts. |
| Prompt-type Stop hook inconsistency | Medium | Medium | Only used for soft phases where inconsistency is acceptable (warn, not block). Hard phases use deterministic command hooks. |

---

## Implementation Order Summary

| Step | Phase | Effort | Dependencies | Creates |
|------|-------|--------|--------------|---------|
| 1.1 | Foundation | S | None | Schema docs |
| 1.2 | Foundation | M | 1.1 | Script library (state, config, enforcement, recovery) |
| 1.3 | Foundation | L | 1.2 | Hard + soft Stop hooks |
| 1.4 | Foundation | S | 1.2 | SessionStart hook |
| 1.5 | Foundation | M | 1.1 | Orchestrator skill (SKILL.md) |
| 1.6 | Foundation | S | 1.5 | Implement phase skill |
| 1.7 | Foundation | M | 1.1-1.6 | Integration test |
| 2.1 | Core | M | 1.6 | 5 phase skills |
| 2.2 | Core | S | 2.1 | 5 artifact templates |
| 2.3 | Core | M | 1.2 | PreToolUse hook |
| 2.4 | Core | M | 1.2 | PostToolUse hook |
| 2.5 | Core | S | 1.2 | UserPromptSubmit hook |
| 2.6 | Core | S | 1.5, 2.5 | Fast path logic |
| 2.7 | Core | L | 2.1-2.6 | Integration test |
| 3.1 | Intelligence | M | 1.3 | Recovery agent |
| 3.2 | Intelligence | M | 1.2 | Verifier agent |
| 3.3 | Intelligence | S | None | Researcher agent |
| 3.4 | Intelligence | M | 2.1 | Reviewer agent |
| 3.5 | Intelligence | S | 3.1, 3.2 | Enhanced Stop hook |
| 3.6 | Intelligence | M | 3.1-3.5 | Integration test |
| 4.1 | Polish | M | 1.5 | Init wizard + project detection |
| 4.2 | Polish | S | 1.2, 1.5 | History library + command |
| 4.3 | Polish | S | 1.2 | PreCompact hook |
| 4.4 | Polish | S | 1.5 | Sync validation command |
| 4.5 | Polish | M | All | Documentation (4 files) |
| 4.6 | Polish | S | All hooks | Hook registration script |
| 4.7 | Polish | L | All | Final integration test |
