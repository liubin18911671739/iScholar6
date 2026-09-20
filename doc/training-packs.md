# Training task packs

> 目标架构中，任务包由后端存储（PostgreSQL），校验与展开在服务端完成；API 经 BFF 代理。迁移见 `IMPLEMENTATION_PLAN.md` Stage 1/6。

## Schema versions

### v1 — full task definitions

Custom tasks with full `title` / `steps` / `agent` / `dimension` payloads. Validated by `trainingTaskPackSchema` in `lib/training/task-pack-schema.ts`.

### v2 — curriculum references (built-in only)

```json
{
  "schemaVersion": 2,
  "key": "spring-camp",
  "name": "春季训练营课表",
  "version": "1.0.0",
  "tasks": [
    { "taskId": "research-question", "required": true },
    { "taskId": "retrieval-query", "required": true }
  ]
}
```

- `taskId` must be one of the 8 built-in `MVP_TRAINING_TASKS` ids.
- Server expands v2 → v1 via `expandCurriculumPack` before storage.
- Unknown ids → `UNKNOWN_TASK_ID`.

## Management UI

`/training/manage` → Task packs panel:

1. Check built-in tasks and reorder.
2. **生成 Pack JSON** writes a v2 document into the editor.
3. **Upload** posts to `POST /api/training/task-packs` (staff only).

Advanced users can still paste full v1 JSON.

## Relation to program curriculum

Camp curriculum (`program-tasks-panel`) selects which built-in tasks appear for a program. Packs are reusable templates; applying a pack typically means uploading it and mapping task ids into the program curriculum.
