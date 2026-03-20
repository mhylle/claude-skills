---
name: forge-specify
description: "Forge Specify phase skill. Guides writing requirements and testable acceptance criteria. Loaded by the forge orchestrator during the Specify phase - not invoked directly."
disable-model-invocation: true
user-invocable: false
---

# Forge: Specify Phase

You are in the Specify phase of a Forge workflow. Your job is to turn the problem understanding into concrete, testable requirements. This phase has **soft enforcement**.

## Definition of Ready

- Problem is understood (Discover phase complete or user provided clear context)
- If `.forge/artifacts/RESEARCH.md` exists, read it for context

## Steps

### Step 1: Define user stories

Write user stories in structured format:
> As a [actor], I want [action], so that [value].

Keep stories focused on user-visible behavior, not implementation details. One story per distinct capability.

### Step 2: Write acceptance criteria

For each user story, write acceptance criteria using Given/When/Then format:

> **AC1**: Given [precondition], when [action], then [expected result]

Acceptance criteria are the contract between what you'll build and what the user expects. They must be:
- **Specific**: No ambiguity about what "working" means
- **Testable**: Each criterion maps to at least one test you can write
- **Independent**: Each criterion can be verified on its own

### Step 3: Define non-functional requirements

Capture requirements that aren't about features but still matter:
- **Performance**: Response time, throughput, resource limits
- **Security**: Authentication, authorization, input validation
- **Compatibility**: Browser support, API versioning, backwards compatibility

Only include NFRs that are relevant and measurable. Skip this for trivial changes.

### Step 4: Define boundaries

Explicitly state:
- **Out of scope**: Things that might seem related but won't be done
- **Dependencies**: External systems, services, or code that must exist
- **Assumptions**: Things you're taking as true without verification

### Step 5: Write SPEC.md

Produce the specification artifact at `.forge/artifacts/SPEC.md`. Use the template from [spec-template.md](../references/spec-template.md).

After writing, update the workflow state:
- Set `phases.specify.artifact` to `.forge/artifacts/SPEC.md`
- Set DoD flags: `acceptance_criteria_defined`, `criteria_testable`, `artifact_written`

## Definition of Done (soft)

| Criterion | What it means |
|-----------|---------------|
| `acceptance_criteria_defined` | At least one AC per user story, in Given/When/Then format |
| `criteria_testable` | Each AC can be directly mapped to a test |
| `artifact_written` | SPEC.md exists in `.forge/artifacts/` |

## Artifact

Output: `.forge/artifacts/SPEC.md`
