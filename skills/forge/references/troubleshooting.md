# Forge: Troubleshooting

## Hooks not firing

**Symptom**: Forge doesn't block on Stop, doesn't inject context on SessionStart.

**Cause**: Plugin not enabled or hooks not loaded.

**Fix**:
- If installed as plugin: `/plugin` > ensure forge is enabled, then `/reload-plugins`
- If installed manually: run `node ~/.claude/skills/forge/scripts/register-hooks.js`

## Stop hook infinite loop

**Symptom**: Claude keeps retrying and the Stop hook keeps blocking.

**Cause**: The `stop_hook_active` flag wasn't reset after a crash.

**Fix**: Edit `.forge/workflow.json` and set `"stop_hook_active": false`.

## State corruption

**Symptom**: Errors reading `.forge/workflow.json`, unexpected behavior.

**Fix options**:
1. `/forge reset` - Clears the current workflow, keeps artifacts
2. Manually fix the JSON (validate with `node -e "JSON.parse(require('fs').readFileSync('.forge/workflow.json','utf8'))"`)
3. Delete `.forge/workflow.json` and start fresh

## Commands not found after init

**Symptom**: Stop hook says "No lint/test command configured".

**Cause**: `.forge/config.json` has `null` for those standards.

**Fix**: Edit `.forge/config.json` and set the appropriate commands for your project. See [configuration.md](configuration.md) for examples.

## Merge conflicts in .forge/ files

**Symptom**: Git merge conflicts in `workflow.json` or `config.json`.

**Fix**:
- `config.json`: Manually merge (it's small and human-readable)
- `workflow.json`: Keep whichever version is more recent (check timestamps). If unsure, delete and start a new workflow.
- `artifacts/`: These are markdown - standard merge resolution applies

## Hook performance

**Symptom**: Claude feels slow, hooks timing out.

**Cause**: Hook scripts are taking too long (test suite too slow, etc.).

**Fix**:
- The Stop hook has a 120s timeout, other hooks 5-10s
- If your test suite is slow, consider configuring a faster subset for DoD checks
- The Stop hook runs your full test/lint/build commands - ensure they're not doing unnecessary work

## Coexistence with existing hooks

**Symptom**: Other hooks (prettier, TypeScript check, etc.) stopped working after Forge installation.

**Cause**: Should not happen - plugin hooks are additive and namespaced.

**Fix**:
1. Check that the forge plugin is listed in `/plugin` and enabled
2. Run `/reload-plugins` to re-initialize all plugins
3. If using manual installation, check `~/.claude/hooks.json` for conflicts
