Production bug: every POST /api/task crashes with Vercel's plain-text "A server error has occurred" page, and the browser shows `Unexpected token 'A', "A server e"... is not valid JSON`.

Root cause: the deployed ANTHROPIC_MODEL (claude-sonnet-5-5) rejects forced tool use with 400 `tool_choice: type "tool" and "any" are not supported for this model`. The throw from anthropic.messages.create is uncaught in api/task.ts, so the function crashes.

Fix:

1. server/research.ts
   - Remove the forced `tool_choice` (use the default auto). Keep the system prompts that tell the agent to always use hire_specialist.
   - If Claude returns no hire_specialist tool_use block, don't fail. Fall back deterministically and hire the Specialist with `request = the original user task` (trimmed, at most 2000 chars), with the tier taken from the request's urgent flag. Pass `urgent: boolean` into runTask deps or params; don't parse "This is urgent." out of the text.
   - Even when Claude does call the tool, ignore its tier and use the urgent flag. The price must follow the user's explicit choice so the cap rejection is deterministic.
   - Wrap the Anthropic call so an API error returns `{ ok: false, kind: "error", message: "Agent model error: <status> <short message>" }` instead of throwing.

2. api/task.ts
   - Wrap the whole runTask call (and anything after preflight) in try/catch, so any thrown error returns status 500 JSON `{ ok: false, kind: "error", message }`. The handler must never let an exception escape.
   - Do the same in api/specialist.ts, api/agents.ts, and api/vault-events.ts.

3. Frontend (src/components/TaskPanel.tsx)
   - Read the response as text, then JSON.parse in a try. If parsing fails, show "Server error (HTTP <status>). Please try again." instead of the raw parser message.

4. Tests:
   - Anthropic throws → error result, no transaction sent.
   - No tool_use → fallback hires with the user task, and the tier follows urgent.
   - Tool_use with tier "priority" while urgent=false → standard price.
   - Keep the existing tests passing, adjusting them for the new behavior.

Run typecheck (both tsconfigs), vitest, and build, and show the output.
