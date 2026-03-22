# Forge Workflow Schema

## File: `.forge/workflow.json`

Auto-managed by Forge hooks. Committed to git for cross-machine sync. Do not edit manually unless recovering from corruption.

## Schema

```json
{
  "workflow_id": "string",
  "created": "ISO 8601 datetime",
  "title": "string",
  "current_phase": "discover | specify | design | implement | review | ship",
  "current_step": "number (0-indexed within phase)",
  "phase_started": "ISO 8601 datetime",
  "retry_count": "number",
  "last_error": "string | null",
  "stop_hook_active": "boolean",
  "phases": {
    "discover": { "PhaseState" },
    "specify": { "PhaseState" },
    "design": { "PhaseState" },
    "implement": { "PhaseState" },
    "review": { "PhaseState" },
    "ship": { "PhaseState" }
  },
  "fast_path": "null | trivial | small | exploratory",
  "modified_files": ["string"]
}
```

## PhaseState

```json
{
  "status": "pending | in_progress | completed | skipped",
  "started_at": "ISO 8601 datetime | null",
  "completed_at": "ISO 8601 datetime | null",
  "artifact": "string (relative path) | null",
  "adrs": ["string (relative path)"],
  "steps": [
    {
      "name": "string",
      "status": "pending | in_progress | completed | skipped"
    }
  ],
  "dod": {
    "key": "boolean"
  },
  "justification": "string | null"
}
```

## Phase Order

Phases are always ordered: `discover` -> `specify` -> `design` -> `implement` -> `review` -> `ship`.

The `PHASE_ORDER` constant:
```javascript
const PHASE_ORDER = ['discover', 'specify', 'design', 'implement', 'review', 'ship'];
```

## Phase DoD Criteria

Each phase has specific Definition of Done criteria tracked in its `dod` object:

### Discover (soft)
```json
{
  "problem_framed": false,
  "scope_identified": false,
  "artifact_written": false
}
```

### Specify (soft)
```json
{
  "acceptance_criteria_defined": false,
  "criteria_testable": false,
  "artifact_written": false
}
```

### Design (soft)
```json
{
  "plan_written": false,
  "adrs_written": false,
  "artifact_written": false
}
```

### Implement (hard)
```json
{
  "tests_pass": false,
  "lint_clean": false,
  "build_succeeds": false,
  "acceptance_criteria_met": false
}
```

### Review (hard)
```json
{
  "dimensions_evaluated": false,
  "required_dimensions_pass": false,
  "no_blocking_issues": false,
  "artifact_written": false
}
```

### Ship (hard)
```json
{
  "branch_created": false,
  "committed": false,
  "pr_created": false,
  "ci_green": false
}
```

## State Transitions

### Phase Advancement
```
current_phase = PHASE_ORDER[PHASE_ORDER.indexOf(current_phase) + 1]
current_step = 0
retry_count = 0
last_error = null
phase_started = now()
phases[old_phase].status = "completed"
phases[old_phase].completed_at = now()
phases[new_phase].status = "in_progress"
phases[new_phase].started_at = now()
```

### Fast Path Skipping
When `fast_path` is set, skipped phases get:
```json
{
  "status": "skipped",
  "completed_at": "<timestamp when skip was decided>"
}
```

| Fast Path | Phases Used | Phases Skipped |
|-----------|-------------|----------------|
| `trivial` | implement, ship | discover, specify, design, review |
| `small` | specify, implement, review, ship | discover, design |
| `exploratory` | discover | specify, design, implement, review, ship |
| `null` (standard) | all | none |

### Retry Flow
```
retry_count++
last_error = "<error details>"
// Phase stays in_progress, step stays the same
```

### Escalation
```
retry_count = 0
last_error = "<escalation context>"
// Claude stops, user intervenes
```

### Stop Hook Active Flag
```
stop_hook_active = true   // Set when Stop hook starts evaluating
stop_hook_active = false  // Set when Stop hook finishes (pass or fail)
```
This prevents infinite loops where the Stop hook blocks, Claude retries, and the Stop hook fires again immediately.

## Initial Workflow (created by `/forge start`)

```json
{
  "workflow_id": "<uuid>",
  "created": "<now>",
  "title": "<user-provided or auto-detected>",
  "current_phase": "<starting phase>",
  "current_step": 0,
  "phase_started": "<now>",
  "retry_count": 0,
  "last_error": null,
  "stop_hook_active": false,
  "phases": {
    "discover": { "status": "pending", "started_at": null, "completed_at": null, "artifact": null, "adrs": [], "steps": [], "dod": {}, "justification": null },
    "specify": { "status": "pending", "started_at": null, "completed_at": null, "artifact": null, "adrs": [], "steps": [], "dod": {}, "justification": null },
    "design": { "status": "pending", "started_at": null, "completed_at": null, "artifact": null, "adrs": [], "steps": [], "dod": {}, "justification": null },
    "implement": { "status": "pending", "started_at": null, "completed_at": null, "artifact": null, "adrs": [], "steps": [], "dod": {}, "justification": null },
    "review": { "status": "pending", "started_at": null, "completed_at": null, "artifact": null, "adrs": [], "steps": [], "dod": {}, "justification": null },
    "ship": { "status": "pending", "started_at": null, "completed_at": null, "artifact": null, "adrs": [], "steps": [], "dod": {}, "justification": null }
  },
  "fast_path": null,
  "modified_files": []
}
```

The starting phase and any skipped phases are set based on the entry point and fast_path value.
