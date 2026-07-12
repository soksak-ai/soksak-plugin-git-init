# soksak-plugin-git-init

A soksak plugin that automatically runs `git init` at the root of a new project when no
`.git` directory is present. It only composes an existing event (`project.created`) with an
existing command — zero lines of its own backend, and zero git of its own.

## Behavior

When a project is created (`project.created`), the root path is passed to the `init` command of
the plugin implementing **`soksak-git-spec@1`**. If `.git` already exists, the call is a no-op
(idempotent).

The provider is found **by contract, never by name** (`plugin.implementers` → the enabled
implementer), so a different implementer takes over without an edit here. With no enabled
implementer the policy keeps observing and refuses loudly (`NO_GIT_PROVIDER`) instead of silently
skipping — `status` then reports `provider: null`, which is the difference between "nothing to do"
and "nothing able to do it".

The manifest still declares `dependencies: { "soksak-plugin-git-core": "^0.1.0" }`. That is **not**
this plugin's choice: the core's cross-plugin gate currently admits a call only when the target's
plugin id appears in `dependencies`, so a contract-pinned consumer cannot reach its provider without
it. **Remove that line when the core accepts a contract-pin declaration on the consumer side** — the
code needs no change, because the code already names no implementer.

## Commands

The policy exposes its state and a manual entry point as headless commands.

```bash
sok plugin.soksak-plugin-git-init.status   # policy state: observed event, delegate, run counts, last result
sok plugin.soksak-plugin-git-init.run '{"path":"/Users/me/work"}'   # apply the policy to a directory now
```

- `status` returns `{ active, event, contract, provider, delegate, autoRuns, manualRuns, last }`.
  `contract` is fixed; `provider` is whoever implements it right now (`null` when nobody does), and
  `delegate` is the command that resolves to. `last` is the most recent delegation result (`source`
  is `auto` for event-driven runs, `manual` for `run`).
- `run` requires `path` and delegates to the provider's `init` (initializes only when `.git` is
  absent). The run is recorded in the policy status.

## Tests

```bash
node --test   # command surface conformance + policy behavior (mock host, no app required)
```

## Permissions

- `commands` — executes the provider's `init` command and registers the plugin's own commands
