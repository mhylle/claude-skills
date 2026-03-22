---
name: forge-review
description: "Forge Review phase skill. Guides multi-dimension code review with parallel specialists. Loaded by the forge orchestrator during the Review phase - not invoked directly."
disable-model-invocation: true
user-invocable: false
---

# Forge: Review Phase

You are in the Review phase of a Forge workflow. Your job is to review the implementation across multiple quality dimensions and produce a review report. This phase has **hard enforcement** - the Stop hook blocks until the review is complete and passing.

## Definition of Ready

- Implementation is complete (Implement phase done, tests pass)
- Modified files are tracked in `.forge/workflow.json` `modified_files` array
- If `.forge/artifacts/SPEC.md` exists, use acceptance criteria as the review baseline

## Steps

### Step 1: Gather context

Read the implementation context:
- `.forge/workflow.json` for the list of modified files
- `.forge/artifacts/SPEC.md` for acceptance criteria (if exists)
- `.forge/artifacts/PLAN.md` for architectural decisions (if exists)
- The actual code changes (read each modified file)

### Step 2: Run parallel review dimensions

Review the code across each dimension configured in `.forge/config.json` `review.dimensions`. The default dimensions are:

**Functionality** - Does the code do what the spec says?
- Each acceptance criterion is implemented
- Edge cases are handled
- Error conditions produce sensible behavior

**Security** - Is the code safe?
- Input validation on all external data
- No injection vulnerabilities (SQL, XSS, command)
- Secrets are not hardcoded
- Authentication/authorization is correct

**Performance** - Is the code efficient?
- No obvious bottlenecks (N+1 queries, blocking I/O in hot paths)
- Appropriate data structures and algorithms
- Resource cleanup (connections, file handles)

**Test Quality** - Are the tests meaningful?
- Tests cover behavior, not implementation details
- Edge cases and error conditions are tested
- Tests would actually catch regressions

**Maintainability** - Is the code readable and changeable?
- Clear naming and consistent style
- No unnecessary complexity
- No dead code or commented-out blocks
- Appropriate abstraction level (not over/under-engineered)

For each dimension, produce a **PASS** or **FAIL** verdict with specific findings. Use the Agent tool to spawn parallel review subagents (one per dimension) to keep reviews independent and thorough.

### Step 3: Compile findings

Aggregate results into categories:
- **Blocking issues**: Must be fixed before shipping (security vulnerabilities, broken functionality, missing error handling)
- **Suggestions**: Should be considered but don't block shipping (style improvements, minor optimizations, test additions)

### Step 4: Write REVIEW.md

Produce the review artifact at `.forge/artifacts/REVIEW.md`. Use the template from [review-template.md](../references/review-template.md).

After writing, update the workflow state:
- Set `phases.review.artifact` to `.forge/artifacts/REVIEW.md`
- Set DoD flags based on results:
  - `dimensions_evaluated`: true (you ran all dimensions)
  - `required_dimensions_pass`: true if >= `config.review.required_pass` dimensions passed
  - `no_blocking_issues`: true if no blocking issues found
  - `artifact_written`: true

### Step 5: Fix blocking issues

If there are blocking issues, fix them before trying to advance. The Stop hook will check the DoD flags. After fixing, re-run the relevant review dimension to confirm the fix.

## Definition of Done (hard)

| Criterion | How it's verified |
|-----------|------------------|
| `dimensions_evaluated` | All configured review dimensions have been assessed |
| `required_dimensions_pass` | At least N dimensions pass (from `config.review.required_pass`) |
| `no_blocking_issues` | No blocking issues remain unfixed |
| `artifact_written` | REVIEW.md exists in `.forge/artifacts/` |

## Integration

- Use the existing **code-review** skill's 5-dimension checklist for detailed review criteria
- Use the existing **security-review** skill's OWASP-based checklist for the security dimension

## Artifact

Output: `.forge/artifacts/REVIEW.md`
