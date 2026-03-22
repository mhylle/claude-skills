---
name: forge-implement
description: "Forge Implement phase skill. Guides building code against a plan with test-first development. Loaded by the forge orchestrator during the Implement phase - not invoked directly."
disable-model-invocation: true
user-invocable: false
---

# Forge: Implement Phase

You are in the Implement phase of a Forge workflow. Your job is to build working code against the plan, following a test-first approach. This phase has **hard enforcement** - the Stop hook will verify that tests pass, lint is clean, and the build succeeds before allowing you to move on.

## Definition of Ready

Before starting, verify these prerequisites exist:

1. **A plan exists** - Check for `.forge/artifacts/PLAN.md` or a plan communicated in the conversation. If no plan exists, tell the user and suggest running `/forge skip-to design` first.
2. **Acceptance criteria are known** - Check `.forge/artifacts/SPEC.md` or the plan for what "done" looks like. If unclear, ask the user before coding.
3. **Project config exists** - `.forge/config.json` should have `standards.test`, `standards.lint`, and `standards.build` configured so the Stop hook can verify your work.

If any prerequisite is missing, flag it and ask how to proceed rather than guessing.

## Steps

Follow these steps in order. The reason for this ordering is that writing tests first catches design problems early and ensures you build exactly what's needed - nothing more, nothing less.

### Step 1: Understand the scope

Read the plan and acceptance criteria carefully. Identify:
- Which files need to be created or modified
- What the key interfaces and data structures are
- Any dependencies or ordering constraints between pieces

Update `.forge/workflow.json` steps array with the specific implementation tasks for this feature.

### Step 2: Set up module structure

Create the file and directory structure needed. Stub out the main interfaces, types, and module boundaries. This gives you a skeleton to hang tests and implementation on.

Keep it minimal - just enough structure that test files have something to import.

### Step 3: Write tests first

Write tests for each acceptance criterion before writing the implementation. This is the most important step because:
- Tests define exactly what "working" means
- They catch misunderstandings about requirements early
- They give the Stop hook something to verify

Focus on behavior, not implementation details. Test what the code should do, not how it does it internally. Include:
- Happy path for each acceptance criterion
- Key edge cases
- Error conditions mentioned in the spec

Run the tests to confirm they fail for the right reasons (not import errors or syntax issues). Use the test command from `.forge/config.json`:
```
config.standards.test
```

### Step 4: Implement to make tests pass

Write the minimum code needed to make each test pass. Work through tests one at a time or in small batches. Resist the urge to add features not covered by tests - if something seems needed, write a test for it first.

After each batch of changes, run the relevant tests to confirm progress:
```
config.standards.test_single (if available)
```

### Step 5: Run lint and format

Clean up the code using the project's configured tools:
```
config.standards.format (if configured)
config.standards.lint (if configured)
```

Fix any issues. Linting catches real bugs (unused variables, unreachable code) in addition to style issues. Address lint errors thoughtfully - understand why the rule exists before suppressing it.

### Step 6: Run the full test suite

Run the complete test suite, not just the new tests. Your changes may have broken something else:
```
config.standards.test
```

If existing tests fail, fix the regression. If the fix requires changing the approach, revisit step 4.

### Step 7: Verify build

If the project has a build step, run it:
```
config.standards.build (if configured)
```

Also run the type checker if configured:
```
config.standards.typecheck (if configured)
```

Fix any build or type errors.

## Definition of Done

The Stop hook checks these criteria automatically. You cannot advance to the Review phase until all are met:

| Criterion | How it's verified |
|-----------|------------------|
| **Tests pass** | Stop hook runs `config.standards.test` - must exit 0 |
| **Lint clean** | Stop hook runs `config.standards.lint` - must exit 0 |
| **Build succeeds** | Stop hook runs `config.standards.build` - must exit 0 |
| **Acceptance criteria met** | Set `dod.acceptance_criteria_met = true` in workflow.json when all acceptance criteria from the spec are covered by passing tests |

If a criterion's command is `null` in config, it's automatically considered met (skipped).

To mark acceptance criteria as met, update the workflow state:
```
Read .forge/workflow.json, set phases.implement.dod.acceptance_criteria_met = true, write it back
```

Only do this when you're confident all acceptance criteria have passing tests.

## Recovery

If the Stop hook blocks you (tests failing, lint errors, build broken):

- **Attempt 1**: You'll get the specific error output. Read it carefully and fix the issue.
- **Attempt 2**: The recovery agent may provide diagnostic context. Use it.
- **Attempt 3**: The workflow escalates to the user. They'll see what failed and can help.

Don't fight the Stop hook by making tests pass trivially or suppressing lint rules broadly. The enforcement exists to catch real issues.

## Common Pitfalls

- **Implementing without tests**: Skipping step 3 makes step 6 meaningless. Write tests first.
- **Over-engineering**: Build what the spec asks for, not what you think might be needed later.
- **Ignoring lint errors**: Lint rules catch real bugs. Understand the rule before suppressing it.
- **Not running the full suite**: New code can break existing functionality. Always run the full suite in step 6.
- **Scope creep**: If you discover something that should be done but isn't in the plan, note it for a future workflow rather than adding it now.

## Integration with Existing Skills

You can reference these existing skills for additional guidance:
- The **verification-loop** skill provides a comprehensive 6-check verification framework if you want to run a thorough check beyond what the Stop hook does
- The **code-review** skill's checklists can help you self-review before the formal Review phase

## Artifact

This phase does not produce a separate markdown artifact. The code and tests are the artifact. The modified files are tracked in `.forge/workflow.json` `modified_files` array (updated automatically by the PostToolUse hook when available).
