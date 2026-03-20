# Forge: Troubleshooting

## Hooks not firing

**Symptom**: Forge doesn't block on Stop, doesn't inject context on SessionStart.

**Cause**: Hooks not registered in `~/.claude/hooks.json`.

**Fix**:
```bash
node ~/.claude/skills/forge/scripts/register-hooks.js
```

Verify: Check `~/.claude/hooks.json` contains entries with `forge/scripts/` paths.

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
- Check timeout values in hooks-template.json (default: 120s for Stop, 5-10s for others)
- If your test suite is slow, consider configuring a faster subset for DoD checks
- The Stop hook runs your full test/lint/build commands - ensure they're not doing unnecessary work

## Coexistence with existing hooks

**Symptom**: Other hooks (prettier, TypeScript check, etc.) stopped working after Forge registration.

**Cause**: Should not happen - Forge appends, never replaces.

**Fix**:
1. Check `~/.claude/hooks.json` - existing hooks should still be there
2. Restore from backup: `cp ~/.claude/hooks.json.backup ~/.claude/hooks.json`
3. Re-register: `node ~/.claude/skills/forge/scripts/register-hooks.js`
