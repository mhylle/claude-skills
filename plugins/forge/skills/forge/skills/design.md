---
name: forge-design
description: "Forge Design phase skill. Guides architecture planning and ADR documentation. Loaded by the forge orchestrator during the Design phase - not invoked directly."
disable-model-invocation: true
user-invocable: false
---

# Forge: Design Phase

You are in the Design phase of a Forge workflow. Your job is to plan the architecture, make key technical decisions, and produce an implementation plan. This phase has **soft enforcement**.

## Definition of Ready

- Requirements are clear (Specify phase complete or user provided clear scope)
- If `.forge/artifacts/SPEC.md` exists, read it for acceptance criteria

## Steps

### Step 1: Analyze the solution space

Explore options for how to implement the requirements:
- What approaches are possible?
- What trade-offs does each approach involve?
- What existing patterns in the codebase should be followed?

Use the Explore subagent to examine relevant code without polluting the main context.

### Step 2: Make key decisions

For each significant technical choice, document the decision. A decision is "significant" if:
- It would be expensive to reverse later
- It affects multiple parts of the system
- Reasonable engineers would disagree on the choice

Write ADRs for these decisions at `.forge/artifacts/adr/NNN-title.md`. Use the template from [adr-template.md](../references/adr-template.md). Number them sequentially.

### Step 3: Design the implementation plan

Break the work into ordered phases. Each phase should be:
- **Small enough** to implement and test in one session
- **Independently verifiable** with its own exit criteria
- **Ordered by dependency** (what must exist before what)

For each phase, specify:
- What will be built
- Which files will be created or modified
- Exit criteria (how you'll know this phase is done)

### Step 4: Identify risks

Call out anything that could go wrong:
- Performance risks
- Security concerns
- Integration complexity
- Unknown unknowns (areas where you're guessing)

For each risk, suggest a mitigation strategy.

### Step 5: Write PLAN.md

Produce the plan artifact at `.forge/artifacts/PLAN.md`. Use the template from [plan-template.md](../references/plan-template.md).

After writing, update the workflow state:
- Set `phases.design.artifact` to `.forge/artifacts/PLAN.md`
- Add ADR paths to `phases.design.adrs` array
- Set DoD flags: `plan_written`, `adrs_written`, `artifact_written`

## Definition of Done (soft)

| Criterion | What it means |
|-----------|---------------|
| `plan_written` | Implementation plan with phased steps exists |
| `adrs_written` | ADRs written for significant decisions (or none needed) |
| `artifact_written` | PLAN.md exists in `.forge/artifacts/` |

## Integration

- Use the existing **create-plan** skill's approach for interactive planning
- Use the existing **adr** skill's format for architecture decision records
- Reference the **codebase-research** agents for understanding existing patterns

## Artifact

Output: `.forge/artifacts/PLAN.md` + `.forge/artifacts/adr/*.md`
