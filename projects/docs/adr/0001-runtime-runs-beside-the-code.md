# 1. The agent runtime runs beside the code, and inference is remote

Date: 2026-09-09
Status: Accepted

## Context

The platform is hosted on a Linux server (yourlabpt.com) together with the website.
Agents were expected to run on a MacBook, connected to DeepInfra for inference, while
the repositories were to be checked out on the Linux server.

That arrangement has no owner for the working copy. Code on one machine and the agents
that change it on another leaves two options, and both are wrong: two clones that drift
apart with no answer to "which is the truth", or the agents working across a network
filesystem. It also contradicts the product principle the platform is built around —
*close the laptop, the AI keeps working* — because a runtime on a laptop stops when the
lid closes.

Two facts settled it:

- The platform has **no machine affinity today**. Every repository operation goes
  through the Git provider's HTTP API. There is no `child_process`, no git CLI, no
  filesystem access. `localPath` was stored and displayed but never read.
- **DeepInfra removes the reason to be on the Mac.** With hosted inference the runtime
  is an HTTP client, a git working copy and a test runner. None of that needs a GPU,
  and the Linux box already runs headless Chromium for contract PDFs, so it is already
  sized for the heaviest thing a runtime does.

The Linux server is modest and its GPU is weak. That is not an obstacle while inference
is remote: no model is ever loaded locally.

## Decision

**The agent runtime runs on the Linux server, beside the code. Inference is remote.**

The Mac is not required. It may later pair as a *second* connector, and only for work
that genuinely needs a local GPU — connectors are already a table, so this is an
extension rather than a redesign.

**The platform owns policy. The runtime owns capability. Neither owns both.**

| Platform — authoritative, reviewable | Runtime — declared, discovered |
|---|---|
| Which personas exist, and what each may touch | Which MCP tools it actually implements |
| Model **tier** (`standard`, `heavy`) | Which model backs each tier |
| Budget caps, approval gates, task order | Its own API keys and endpoints |
| What gets committed, and when | Where its working clone lives |

The test for where a setting belongs: **if getting it wrong is a policy mistake it is
the platform's; if it is a fact about an environment it is the runtime's.** "Developer
may only touch its own module" is policy. "standard = a given model on DeepInfra" is an
environment fact. This is why `modelProfileId` maps to a `runtimeTier` and the platform
never names a model.

**The pending change set is content, not a checkout.** The runtime returns changed files
as `path` + `content`; the platform stores and displays them, and commits through the
provider API when a human accepts. The platform therefore still needs no filesystem, and
diffs stay reviewable while the runtime is offline.

## Consequences

- One machine, one clone per project, always on. No drift, and no NAT problem: the
  runtime and the platform are the same trust boundary.
- The Execução budget becomes meaningful. Cost is self-reported by the runtime, which is
  only trustworthy while the runtime is on a machine the operator controls.
- `localPath` stays configurable — it is the sandbox the runtime works in, and being
  able to see and set it is the point. It is now honest, because the runtime that uses
  it and the platform that shows it are co-located.
- `tests.run` is the only variable cost on that box, and it is as heavy as each
  project's own suite. If a project's tests become expensive, that — not inference — is
  the reason to add a second runtime.
- Splitting agent configuration across two machines is rejected. One concept defined in
  two places is what produced the "no compatible agent" failure this platform already
  had to remove.

## Alternatives considered

**Runtime on the Mac, repositories on Linux.** The original plan. Rejected: no owner for
the working copy, and the factory stops when the laptop sleeps.

**Runtime on the Mac owning the working copy too.** Coherent, and it keeps local GPU
inference available. Rejected as the default because it makes an always-on service
depend on a laptop; kept as the optional second-connector path.

**Platform manages the clones itself and reads diffs from disk.** Rejected: it would
trade the platform's machine independence for a capability already obtained by storing
the change set as content.
