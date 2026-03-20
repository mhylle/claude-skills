---
name: forge-discover
description: "Forge Discover phase skill. Guides research, exploration, and problem framing. Loaded by the forge orchestrator during the Discover phase - not invoked directly."
disable-model-invocation: true
user-invocable: false
---

# Forge: Discover Phase

You are in the Discover phase of a Forge workflow. Your job is to understand the problem space, explore the codebase, and frame what needs to be solved. This phase has **soft enforcement** - the Stop hook will warn about incomplete items but won't block you.

## Definition of Ready

- The user has stated an intent, idea, problem, or incident to investigate
- That's it - this is the lowest-barrier entry point

## Steps

### Step 1: Understand the intent

Clarify what the user wants to achieve. Ask questions if the intent is vague:
- What problem are they trying to solve?
- Who is affected and how?
- What triggered this work (feature request, bug, incident, idea)?

### Step 2: Explore the codebase

Use read-only tools (Read, Glob, Grep, Agent with Explore subagent) to understand the current state:
- What exists today that's related to this problem?
- What are the key files, modules, and interfaces involved?
- Are there existing patterns or conventions to follow?
- What dependencies or constraints exist?

Spawn an Explore subagent for broad codebase searches to keep the main context clean.

### Step 3: Identify scope

Based on your exploration, define boundaries:
- **In scope**: What specifically will be addressed
- **Out of scope**: What will NOT be addressed (and why)
- **Open questions**: Unknowns that need resolution before proceeding

### Step 4: Assess complexity

Determine the appropriate workflow scope:
- Is this trivial (< 10 lines, config change)? Suggest `/forge fix` fast path
- Is this small (single file, clear fix)? Suggest skipping to Specify
- Is this standard (multi-file, needs design)? Continue through all phases
- Is this exploratory only? The user may just want research, not implementation

### Step 5: Write RESEARCH.md

Produce the discovery artifact at `.forge/artifacts/RESEARCH.md`. Use the template from [research-template.md](../references/research-template.md).

After writing, update the workflow state:
- Set `phases.discover.artifact` to `.forge/artifacts/RESEARCH.md`
- Set DoD flags: `problem_framed`, `scope_identified`, `artifact_written`

## Definition of Done (soft)

| Criterion | What it means |
|-----------|---------------|
| `problem_framed` | The problem is clearly stated with context |
| `scope_identified` | In-scope and out-of-scope are defined |
| `artifact_written` | RESEARCH.md exists in `.forge/artifacts/` |

Since this is soft enforcement, you can move on even if these aren't fully met - but the Stop hook will ask you to justify why.

## Integration

- Use the existing **codebase-research** skill's approach of parallel sub-agents for broad exploration
- Use the existing **brainstorm** skill's Socratic questioning if the problem needs refinement
- For incidents, focus on reproduction steps and error analysis before scoping

## Artifact

Output: `.forge/artifacts/RESEARCH.md`
