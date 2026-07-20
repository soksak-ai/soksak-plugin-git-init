# soksak-plugin-git-init

A soksak plugin that automatically runs `git init` at the root of a new project when no
`.git` directory is present. It only composes an existing event (`project.created`) with an
existing command — zero lines of its own backend, and zero git of its own.

## Behavior

When a project is created (`project.created`), the root path is passed to the `init` command of
the plugin implementing **`soksak-spec-plugin-git`**. If `.git` already exists, the call is a no-op
(idempotent).

The provider is found **by contract, never by name** — discovery calls
`plugin.implementers { id: "soksak-spec-plugin-git" }` (the contract's identity, version-free) and
takes the enabled implementer. A different implementer takes over without an edit here. With no enabled
implementer the policy keeps observing and refuses loudly (`NO_GIT_PROVIDER`) instead of silently
skipping — `status` then reports `provider: null`, which is the difference between "nothing to do"
and "nothing able to do it".

The manifest declares `consumes: ["soksak-spec-plugin-git"]` — the consumer side of the contract pin.
The host's call gate reads that declaration, so **no implementer's plugin id appears anywhere in
this plugin**: not in its code, not in its manifest.

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
