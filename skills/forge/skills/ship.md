---
name: forge-ship
description: "Forge Ship phase skill. Guides committing, creating PRs, and verifying CI. Loaded by the forge orchestrator during the Ship phase - not invoked directly."
disable-model-invocation: true
user-invocable: false
---

# Forge: Ship Phase

You are in the Ship phase of a Forge workflow. Your job is to get the reviewed code committed, pushed, and into a PR (or deployed, depending on config). This phase has **hard enforcement**.

## Definition of Ready

- Review is complete (Review phase done or skipped via fast path)
- All modified files are tracked in `.forge/workflow.json`
- Code is in a clean state (tests pass, lint clean)

## Steps

The ship strategy is defined in `.forge/config.json` `ship.strategy`. Follow the appropriate path:

### Strategy: `pr` (default)

#### Step 1: Create a feature branch

Create a branch using the configured prefix:
```
git checkout -b {config.ship.branch_prefix}{slug}
```

Where `{slug}` is derived from the workflow title (lowercase, hyphens, max 40 chars).

Update DoD: `phases.ship.dod.branch_created = true`

#### Step 2: Stage and commit

Stage the modified files (from `workflow.json.modified_files`). Write a meaningful commit message that:
- Summarizes what was changed and why
- References the Forge artifacts if useful
- Follows the project's commit conventions

Do NOT use `git add -A` or `git add .` — only stage the files that were intentionally modified.

Update DoD: `phases.ship.dod.committed = true`

#### Step 3: Push and create PR

Push the branch and create a PR. If `config.ship.pr_template` is true, generate the PR description from Forge artifacts:

- **Summary**: From RESEARCH.md and SPEC.md (problem + solution)
- **Changes**: List of modified files with brief description of each change
- **Testing**: What tests were added/modified
- **Decisions**: Key ADRs referenced (if any)

Use `gh pr create` to create the PR.

Update DoD: `phases.ship.dod.pr_created = true`

#### Step 4: Verify CI (if observable)

If the project has CI visible via `gh pr checks`, wait briefly and check status. If CI fails, diagnose and fix.

Update DoD: `phases.ship.dod.ci_green = true`

If CI is not observable or takes too long, set `ci_green = true` and note that CI should be checked manually.

### Strategy: `commit`

For projects that commit directly to the current branch:

1. Stage and commit (same as Step 2 above)
2. Set `branch_created = true`, `committed = true`, `pr_created = true`, `ci_green = true`

### Strategy: `deploy`

For projects with a deploy command:

1. Stage and commit
2. Run the deploy command (must be configured separately in config)
3. Set all DoD flags

## Definition of Done (hard)

| Criterion | How it's verified |
|-----------|------------------|
| `branch_created` | Feature branch exists (or using commit strategy) |
| `committed` | Changes are committed with a meaningful message |
| `pr_created` | PR exists (or commit strategy used) |
| `ci_green` | CI passes (or not observable) |

## Workflow Completion

When the Ship phase DoD is met and the Stop hook allows advancement, the workflow is complete. The Stop hook will:
1. Log the completion to `.forge/history/`
2. Archive the workflow

The `.forge/workflow.json` will show `current_phase: null` indicating the workflow is finished. Artifacts remain in `.forge/artifacts/` for reference.

## Artifact

No separate markdown artifact. The commit, PR, and CI status are the outputs of this phase.
