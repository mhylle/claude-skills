# Forge: Extending the Framework

## Modifying Enforcement Levels

Edit `.forge/config.json` to change enforcement per phase:

```json
{
  "enforcement": {
    "design": "hard",
    "review": "soft"
  }
}
```

- `"hard"` phases run measurable checks (test, lint, build) and block until they pass
- `"soft"` phases use AI judgment to evaluate qualitative DoD and warn but don't block

## Adding Custom Standards Commands

Add any command to the `standards` section. The Stop hook runs `test`, `lint`, and `build` during hard enforcement. The verifier agent runs all configured commands.

```json
{
  "standards": {
    "test": "npm test",
    "lint": "npx eslint . && npx stylelint '**/*.css'",
    "build": "npm run build && npm run build:docs"
  }
}
```

Chain multiple commands with `&&` to run them sequentially. The check passes only if all commands succeed (exit 0).

## Customizing Review Dimensions

The default dimensions are: `functionality`, `security`, `performance`, `test_quality`, `maintainability`.

To focus on what matters for your project:

```json
{
  "review": {
    "dimensions": ["functionality", "security"],
    "required_pass": 2
  }
}
```

To add a custom dimension, modify the `forge-reviewer` agent. If installed as a plugin, the agent lives inside the plugin's `agents/` directory. Add a new section to the dimension checklists with your custom criteria.

## Modifying Phase Skills

Phase skills live in the forge skill's `skills/{phase}.md` directory. Each follows the same structure:

1. **Definition of Ready** - What must exist before starting
2. **Steps** - Ordered work items
3. **Definition of Done** - What must be true to complete
4. **Integration** - References to other skills/agents

To customize a phase, edit its skill file. For example, to add a mandatory architecture review step to the Design phase, edit `skills/design.md` and add a step.

## Modifying Artifact Templates

Templates live in the forge skill's `references/{name}-template.md` directory. Phase skills reference these when producing artifacts. Edit them to match your project's conventions.

## Adding a Custom Phase

Forge's phase model is defined in `scripts/lib/state.js`:

```javascript
const PHASE_ORDER = ['discover', 'specify', 'design', 'implement', 'review', 'ship'];
```

To add a phase (e.g., "deploy" after ship):

1. Add the phase name to `PHASE_ORDER` in `scripts/lib/state.js`
2. Add its DoD criteria to `PHASE_DOD` in the same file
3. Add its enforcement level default to `DEFAULTS.enforcement` in `scripts/lib/config.js`
4. Create a phase skill at `skills/forge/skills/{phase}.md`
5. Add hard DoD evaluation logic to `scripts/lib/enforcement.js` if the phase is hard-enforced
6. Update the orchestrator skill at `SKILL.md` to reference the new phase

## Modifying Stop Hook Behavior

The Stop hook has two components:

- **Hard enforcement** (`scripts/stop-hook-hard.js`): Runs commands, checks exit codes. Modify `evaluateHardDod()` in `scripts/lib/enforcement.js` to change what's checked.
- **Soft enforcement** (prompt-type in `hooks-template.json`): Edit the prompt text to change what the AI evaluates.

## Creating Custom Agents

Forge agents live in the plugin's `agents/` directory. Create new specialists following the same format:

```markdown
---
name: forge-custom
description: "What this agent does and when to use it"
model: sonnet
color: orange
---

You are a specialist for [domain]. Your role is to [purpose].

## Process
1. ...
2. ...

## Output Format
...

## Constraints
- ...
```

Reference your custom agent from phase skills by instructing Claude to spawn it via the Agent tool.

## Modifying Hook Scripts

All hook scripts are Node.js files in the forge skill's `scripts/` directory. They follow a common pattern:

1. Read stdin (JSON from Claude Code)
2. Find `.forge/` directory
3. Read workflow state
4. Make a decision
5. Exit 0 (allow) or exit 2 (block) with stderr message

The shared library (`scripts/lib/`) handles all state management. Hook scripts should use library functions rather than reading/writing JSON directly.

## Integrating with CI/CD

Forge's state files are JSON, making them easy to read from CI:

```bash
# In a GitHub Action or similar
PHASE=$(jq -r '.current_phase' .forge/workflow.json)
if [ "$PHASE" != "ship" ]; then
  echo "Warning: PR created before Ship phase"
fi
```

You could also validate that review artifacts exist before allowing merge:

```bash
if [ ! -f ".forge/artifacts/REVIEW.md" ]; then
  echo "Error: No review artifact found"
  exit 1
fi
```

## Uninstalling Forge

If installed as a plugin: `/plugin` > manage > remove forge

If installed manually:
```bash
node ~/.claude/skills/forge/scripts/register-hooks.js --unregister
rm -rf ~/.claude/skills/forge
rm ~/.claude/agents/forge-*.md
```
