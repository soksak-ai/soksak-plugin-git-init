# soksak-plugin-git-init

A soksak plugin that automatically runs `git init` at the root of a new project when no
`.git` directory is present. It only composes existing events (`project.created`) and
commands (`git.init`) — zero lines of its own backend.

## Behavior

When a project is created (`project.created`), the root path is passed to the `git.init`
command. If `.git` already exists, the call is a no-op (idempotent).

## Equivalent via Command

```bash
sok git.init '{"path":"/Users/me/work"}'   # manual run (omit path to use the active project root)
```

## Permissions

- `commands` — executes the `git.init` command
