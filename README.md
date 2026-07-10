# soksak-plugin-git-init

A soksak plugin that automatically runs `git init` at the root of a new project when no
`.git` directory is present. It only composes existing events (`project.created`) and
commands (`git.init`) — zero lines of its own backend.

## Behavior

When a project is created (`project.created`), the root path is passed to the `git.init`
command. If `.git` already exists, the call is a no-op (idempotent).

## Commands

The policy exposes its state and a manual entry point as headless commands.

```bash
sok plugin.soksak-plugin-git-init.status   # policy state: observed event, delegate, run counts, last result
sok plugin.soksak-plugin-git-init.run '{"path":"/Users/me/work"}'   # apply the policy to a directory now
```

- `status` returns `{ active, event, delegate, autoRuns, manualRuns, last }`. `last` is the
  most recent delegation result (`source` is `auto` for event-driven runs, `manual` for `run`).
- `run` requires `path` and delegates to `git.init` (initializes only when `.git` is absent).
  The run is recorded in the policy status.

The core command remains available directly:

```bash
sok git.init '{"path":"/Users/me/work"}'   # omit path to use the active project root (not recorded in policy status)
```

## Tests

```bash
node --test   # command surface conformance + policy behavior (mock host, no app required)
```

## Permissions

- `commands` — executes the `git.init` command and registers the plugin's own commands
