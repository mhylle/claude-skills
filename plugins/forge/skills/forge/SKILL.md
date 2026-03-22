---
name: forge
description: "Hook-enforced development workflow framework for Claude Code. Manages the full software development lifecycle through 6 phases: Discover, Specify, Design, Implement, Review, Ship. Use this skill whenever the user invokes /forge commands (init, start, status, continue, skip-to, fix, incident, history, config, reset). This skill is the main entry point for all Forge workflow operations."
disable-model-invocation: true
argument-hint: "<command> [args]"
allowed-tools: "Read, Write, Edit, Glob, Grep, Bash, Agent, TaskCreate, TaskUpdate, TaskList"
---

# Forge Orchestrator

You are the Forge workflow orchestrator. Forge enforces a 6-phase development lifecycle through Claude Code hooks. Your role is to manage workflow state and delegate to phase-specific skills for the actual work.

## Architecture

- **Hooks enforce** compliance (Stop hook blocks until DoD is met)
- **Skills provide knowledge** (you and phase skills guide HOW to do each phase)
- **`.forge/` stores state** (committed to git for cross-machine sync)

The enforcement levels are adaptive: planning phases (Discover, Specify, Design) use soft enforcement (warn but allow), while execution phases (Implement, Review, Ship) use hard enforcement (block until criteria are met).

## Commands

Parse `$ARGUMENTS` to determine which command the user wants.

### `/forge init`

Initialize Forge in the current project.

1. Check if `.forge/` already exists. If yes, ask the user if they want to reinitialize.
2. Create the directory structure:
   ```
   .forge/
   ├── config.json
   ├── artifacts/
   │   └── adr/
   └── history/
   ```
3. Detect the project type by checking for marker files:
   - `package.json` -> Node.js/TypeScript
   - `Cargo.toml` -> Rust
   - `go.mod` -> Go
   - `pyproject.toml` or `requirements.txt` -> Python
   - `*.csproj` -> .NET
4. Generate `config.json` with sensible defaults for the detected project type. See [config-schema.md](references/config-schema.md) for the full schema and language-specific examples.
5. Show the user the generated config and ask if they want to adjust anything.
6. Suggest adding `.forge/` to git tracking.

### `/forge start [phase]`

Start a new workflow. Default phase is `discover`.

1. Check if there is already an active workflow (`.forge/workflow.json` exists with a `current_phase`). If yes, warn the user and ask to confirm (they may need `/forge reset` first).
2. Ask the user for a title/description of what they're working on.
3. Create `workflow.json` using the state library. See [workflow-schema.md](references/workflow-schema.md) for the schema.
4. Display the workflow status.
5. Load the appropriate phase skill from `phases/{phase}.md` and begin working.

Valid phases: `discover`, `specify`, `design`, `implement`, `review`, `ship`.

### `/forge status`

Display the current workflow state.

1. Read `.forge/workflow.json`
2. Show: title, current phase (N/6), enforcement level, current step, retry count, modified files count, fast path if active
3. Show DoD progress for the current phase
4. Show completed/skipped phases

If no active workflow, say so and suggest `/forge start` or `/forge init`.

### `/forge continue`

Resume where you left off.

1. Read `.forge/workflow.json` and display status (same as `/forge status`)
2. Load the current phase skill from `phases/{phase}.md`
3. Continue working from the current step

### `/forge skip-to <phase>`

Jump to a specific phase.

1. If skipping a hard-enforcement phase, warn the user and ask for confirmation
2. Mark skipped phases as `"skipped"` in workflow.json
3. Set the new current phase
4. Load the phase skill and begin

### `/forge fix "description"`

Fast path for trivial fixes.

1. Create a workflow with `fast_path: "trivial"` starting at `implement`
2. Phases skipped: discover, specify, design, review
3. The title is the provided description
4. Load the implement phase skill

### `/forge incident "description"`

Start an incident investigation.

1. Create a workflow starting at `discover` with the incident description as context
2. The title is "Incident: {description}"
3. Load the discover phase skill with incident context

### `/forge history`

Show completed workflow history.

1. Read all JSON files from `.forge/history/`
2. Display: date, title, duration, phases used, fast path, retry count
3. If no history, say so

### `/forge config`

Display and optionally edit the project configuration.

1. Read and display `.forge/config.json`
2. Explain what each section does
3. Ask if the user wants to change anything

### `/forge sync-check`

Validate `.forge/` state for cross-machine consistency. Run this after pulling from git on a different machine.

1. Find and run the sync-check script from the forge skill's `scripts/sync-check.js`
2. Report the results to the user
3. If issues are found, suggest fixes

Checks: valid JSON, valid phase names, artifacts exist on disk, commands are available, no merge conflicts, directory structure intact.

### `/forge reset`

Reset the current workflow.

1. Ask for confirmation ("This will discard the current workflow state. Are you sure?")
2. If confirmed, delete `.forge/workflow.json`
3. Keep artifacts and history intact

## Phase Transitions

When a phase completes (DoD met, Stop hook allows), the workflow automatically advances to the next non-skipped phase. You will see this in the session via the Stop hook output. When entering a new phase:

1. Read the updated `workflow.json`
2. Load the new phase skill from `phases/{phase}.md`
3. Begin the new phase's work

## Phase Skills

Each phase has a dedicated skill in `phases/`:

- `phases/discover.md` - Research, explore, frame the problem
- `phases/specify.md` - Write requirements and acceptance criteria
- `phases/design.md` - Plan architecture, write ADRs
- `phases/implement.md` - Build against the plan, write tests
- `phases/review.md` - Multi-dimension code review
- `phases/ship.md` - Commit, PR, deploy

Load the relevant skill when entering a phase. The phase skill contains the DoR (entry gate), steps, DoD (exit gate), and artifact template for that phase.

## Error Handling

If you encounter errors reading `.forge/` files:
- Missing `.forge/` -> suggest `/forge init`
- Corrupt JSON -> attempt to parse what you can, suggest `/forge reset` if unrecoverable
- Missing phase skill -> warn and provide inline guidance for the phase

## State Files

- `.forge/config.json` - Project configuration (see [config-schema.md](references/config-schema.md))
- `.forge/workflow.json` - Current workflow state (see [workflow-schema.md](references/workflow-schema.md))
- `.forge/artifacts/` - Phase output documents
- `.forge/history/` - Completed workflow logs
