# Glossary — Delivery OS / software factory

## Execução (execution)
One run of the persona chain toward one goal. Owns its own budget (money + hours),
its own clock, and its own history of what each persona did. Strictly sequential —
a project has at most one active Execução; finished ones sit in a list underneath.
Targets exactly one OpenSpec change proposal, so "what did this cost" and "what did
this touch" are the same question. Not the same as **Project** — a Project can have
many Execuções over its life (initial build, later a feature, later a fix).

## Kind of Execução — construção vs levantamento
Which direction the work runs in.

**Construção** is the full chain: an intention becomes a mockup, then requirements,
then modules, then code. The default.

**Levantamento** is the opposite direction. The app already exists and works; what is
missing is the writing-down. It runs only the personas that read and describe (Product
Owner, then Module Architect) and stops. Asking for a mockup to be approved before
describing an app that is already live would make no sense, which is why the kind
travels with the Execução rather than being a flag on the project.

A levantamento always ends in a question, whatever the personas' own approval flags
say: what it produces becomes the project's requirements and module map, the ground
everything after is built on, so it is never accepted merely because the chain
finished without erroring.

## Survey (levantamento do repositório)
What the platform itself read in a linked repository: structure, routes, manifests,
docs, schema. Computed without a model and without an agent, so it works even with the
runtime off. It is **evidence, not conclusions** — it never derives a requirement. Its
job is to give the personas (and the person reviewing them) something concrete to point
at, so a requirement nobody can trace back to the code is visibly suspect. Stored on the
project and replaced whole on each run: two surveys side by side would only be ambiguous.

## Briefing de persona
What a persona is told before it starts, assembled in `lib/persona-briefing.js` from the
policy it already has: what its stage must produce, when that stage counts as done, that
its output is not final until a person accepts it, and what changing that output would
put in doubt. On a refinamento it also says why it is running out of sequence, and to
adjust what is needed **and no more**.

None of this reached the agent before — it had to infer the method from the prompt, and
inferring the method is how an agent ends up building something plausible nobody asked
for. It travels twice: appended to the instructions as prose, and in
`context.policy` as structure, so a runtime can act on the rules rather than parse them.

Facts and rules only. Nothing here tells a persona *how* to think; that is its own
business.

## Conhecimento de persona (knowledge)
Notes attached to a persona in Agentes — house rules, conventions, things learned the
hard way — that travel with it into every task it runs. Stored as data on the persona
override, so **the platform gets better at its job by being told things, not by being
redeployed**. Written as blocks separated by a blank line, the first line of each being
its title, because typing a structured list is worse than typing prose.

## Propagação de alterações
What else a change puts in doubt, in `lib/change-propagation.js`. Two directions, and
only one of them is declarable.

**Downstream is derived.** If an artifact changes, everything built on it may no longer
hold — and `consumes`/`produces` already says who built on it. It follows
`approvalTransforms` on the way, because the personas downstream of a mockup consume
`ux_mockup_approved`, not `ux_mockup`.

**Upstream is judgement.** No graph can tell you that a new screen means the *idea* was
incomplete rather than the screen being wrong. Those rules are written by hand in the
build policy, each carrying the sentence that explains it, and the persona receives the
sentence rather than a bare instruction.

## Refinamento (a third kind of Execução)
Changes one artifact that already exists and absorbs the consequences. Its persona
sequence is **not declared anywhere** — it is computed from what the change touches, so
it runs the few who must reconcile and nobody else. Changing a mockup runs `ux`,
`product_owner`, `module_architect` and `tech_lead`; `orchestrator`, `developer` and
`tester` never enter the list. That is what makes a late change an increment on what is
built rather than a reason to redo it.

Order matters: the producer first (the change is theirs to make), then reconciliation,
then rebuilding. Fixing the idea and then building on the corrected idea is the point —
the other way round rebuilds on something already known to be wrong.

Each reconciliation arrives as a **decision on its own task**, proposed and awaiting a
ruling. The one thing that stops the chain instead of recording and carrying on: a
reconcile target whose stage a human already approved. Rewriting that silently would
make the approval meaningless, so it asks once, and remembers the answer in
`execucao.acknowledged`.

## Decisão (decision on a task)
A record that something moved, that it puts something earlier in doubt, and what is
proposed about it. It rides on an ordinary task update — same feed, same order, next to
everything else that happened to that task — because a decision filed somewhere separate
is a decision nobody reads.

`{ artifact, affects[], proposal, rationale, changedBy: 'human' | 'agent',
status: 'proposed' | 'accepted' | 'rejected', decidedBy, decidedAt }`

**Nothing counts until a person rules on it.** A persona may propose that an earlier
phase is no longer true; only acceptance makes that so. And once ruled on, the record is
frozen: rewriting it would mean the thing that was accepted is not the thing that
stands, so an edit is refused and a new decision must be recorded instead.

`changedBy` distinguishes a ripple from your own hand-edit from one an agent caused —
the two are treated identically by the chain (see snapshots above), but a person reading
the task deserves to know which it was.

## Snapshot e fingerprint — como se sabe que algo mudou
A snapshot is what a run was built on; a fingerprint is the cheap way to ask whether it
has changed since. Shared by stage transitions and the persona chain, in
`lib/work-snapshot.js`.

**A human edit and an agent edit are the same event.** Nothing here asks *who* changed
something, which is exactly why a hand-edited idea is picked up on the next run instead
of being overwritten by whatever the AI last produced.

A persona depends on **what it reads**, not where it writes: `stagesFeedingPersona`
derives the stages from `consumes`, so writing to a stage does not make you sensitive to
changes there. Every run records the fingerprint it saw; a persona whose inputs have
moved becomes eligible again, and the chain resumes at that point rather than starting
over. After `STALE_RERUN_LIMIT` reruns the project is oscillating rather than
converging, and it halts for a person.

Two identities, deliberately different. `contextSnapshot` (stage transitions) includes
`updatedAt`, so any save counts. `stageSnapshot`/`stagesSnapshot` (staleness) are
**content only** — a write timestamp moves on every save, including the save that
records the run itself, so including it would mark every persona stale the instant it
finished and re-dispatch it forever.

## Tipo de produto e política de construção
What is being built decides how it is built. `project.productType` (today only
`web_app`) selects a **build policy** in `lib/build-policies/` — a declarative module
that says, per stage: who owns it, what it must produce, which intake answers it needs,
and what "done" means. A second product type is a sibling file, never a branch in code.

The policy **guides and rarely blocks**. Exactly two things refuse: a required intake
question left unanswered, and (later) a change to an artifact a human already approved.
Everything else it has to say is a finding recorded on a task. This is a platform for
building new things — a wall of preconditions would defeat the point.

`approvalTransforms` makes human approval a producer: approving `ux_mockup` is what
creates `ux_mockup_approved`. Before it was declared, three personas consumed that
artifact and nothing produced it. `validatePolicy()` fails on exactly that class of
drift, and is run as a test.

## Definição do projecto (intake)
The fixed set of questions a project must answer before agents work on it, in
`lib/intake/`. Each question declares the stage and artifact it feeds, and carries a
`why` shown to the person answering — a question whose purpose is invisible gets a
throwaway answer, and a throwaway answer is what sends an agent off building the wrong
thing.

The intake **produces the root artifacts** (`intention`, `project_context`,
`visual_reference`) that personas consume and no persona produces. The Product Owner
asks follow-up rounds on top, where an answer is thin; the core set works with the
runtime offline, so a project is never blocked on an agent in order to be defined.

## Plataforma vs Runtime — política e capacidade
Where a setting belongs, decided once so it stops being re-litigated.

**The platform owns policy. The runtime owns capability. Neither owns both.**

The platform is authoritative for what personas exist and what each may touch, the
model **tier**, budget caps, approval gates, task order, and what gets committed. The
runtime declares which MCP tools it actually implements, which model backs each tier,
its own keys and endpoints, and where its working clone lives.

The test: **if getting it wrong is a policy mistake it is the platform's; if it is a
fact about an environment it is the runtime's.** "Developer may only touch its own
module" is policy. "standard = a given model on DeepInfra" is an environment fact —
which is why `modelProfileId` maps to a `runtimeTier` and the platform never names a
model.

The runtime runs beside the code, and inference is remote. See
`docs/adr/0001-runtime-runs-beside-the-code.md`. One concept defined in two places is
what produced the "no compatible agent" failure this platform had to remove; splitting
agent configuration across two machines would rebuild it.

## Sandbox (pasta local do projecto)
The working clone the runtime changes code in, one per project. It is the human-control
loop made physical: **alterar → testar → rever → commit.** Agents write here and never
to the provider; tests run here against the real changes; the diff is reviewed; only a
human's acceptance sends anything to GitHub.

The pending change set reaches the platform as **content** (`path` + `content`), not as
a checkout — so the platform still needs no filesystem of its own, and a diff stays
reviewable while the runtime is offline.

## Ferramenta MCP (MCP tool)
A capability an agent-persona is allowed to use, named `area.verb` — `openspec.write`,
`repo.patch`, `tests.run`. A persona declares the tools it needs; the runtime declares
the tools it has; the difference is what the platform reports as missing.

Each tool belongs to one of two **surfaces**, and that is the whole answer to "how do
I provide this one":

- **platform** — the runtime calls back into the platform's HTTP API with its connector
  token. Nothing to install; the call just has to be implemented.
- **local** — the runtime acts on the working clone and the machine it runs on. Needs
  filesystem access, and for `tests.run`, a runner it can execute.

The catalogue lives in `lib/agent-tools.js` and is the single place a tool is explained.
A tool a persona can require but nobody can describe is a bug, and a test enforces that.

Declaring a tool the runtime does not actually implement moves the failure from
configuration time to execution time — worse, not better.

## Linha de produção (production line)
The nine-stage Delivery OS pipeline (Ideia → Descoberta → Requisitos → Arquitectura →
Roteiro → Implementação → Validação → Entrega → Operação) IS the **Entrega tab** —
not a separate new page. Entrega opens on the dashboard (stage-dot strip, current
activity, and — partner/admin only — the Execução panel and Tarefas recentes);
clicking a stage dot drills into that stage's human-readable detail page.

## Artefactos (was "Documentos")
Broadened concept: anything uploaded or generated for the project — imported source
text, generated technical packages, client files. The mockup a persona produces is
NOT filed here; it lives inline on the Descoberta stage's detail page.

## Configuração vs Execução
Two different surfaces, deliberately kept apart: **Configuração** (Definições) holds
only fields you set once and save — git account, provider token, persona model
overrides. It never contains an action button ("push", "pull", "init") — those are
things the chain does for you, or things you trigger from the Execução panel, never
from a settings screen.

## Tarefa (task)
The unit both AI and humans work from — a task is a task regardless of who does it,
distinguished only by an "IA" / "Humano" badge. Only meaningful, already-decided
tasks are created (with a real specification of what to achieve), not one task per
internal agent step — the goal is a followable activity log, not a bottleneck of
busywork.

## Visibilidade por papel (client vs partner/admin)
The project front page is shared, but not identical: a **client** sees only the nine
stage dots and each stage's plain-language summary — never money, never persona
names, never "who is working on what." **Partner/admin** additionally sees the
Execução panel (goal, cost, clock, start/stop) and Tarefas recentes. Same URL, same
page, role-gated sections — not a separate client screen to maintain.

## Pergunta (question / clarification)
Not a separate page or a separate kind of Tarefa — a small inline block on the
specific Tarefa it concerns ("precisa de resposta"), whether raised by a persona
(blocks the Execução's clock) or logged manually from a meeting. There is no
standalone "Perguntas" list; a question you haven't answered shows up wherever that
task already shows up.

## Diagrama / mockup — three forms of the same thing
1. **Text source** (Mermaid — already the storage format today) — what personas
   read and write. Machine-native, never the thing a human looks at directly.
2. **HTML render** — generated from the text source, for YourLab only (partner/
   admin). This is the working view: reviewable, and the thing that stays easy to
   change on the platform.
3. **PDF export, watermarked** — generated from the HTML render, for the client.
   A client never opens live HTML for these artifacts; they only ever receive an
   exported, watermarked PDF. No client-side anti-copy tricks needed — the
   protection is that the client's role simply has no route to the live HTML.

## Ata (meeting minute)
Not a page, not a separate object — a Tarefa tagged `Ata`, containing a summary of
a client conversation. Creating one triggers the Reverse Engineer persona to check
its impact against the repository's latest commit, the same reconciliation used for
an external code push, so a decision from a call and a decision from a diff are
handled by one mechanism, not two.

## Feed (task activity)
The single mechanism for "what happened": every decision, change, or improvement —
from a persona or a human — posts to the relevant Tarefa's existing comment/update
feed (`taskActivity`), chat-like, scoped to that task's goal. Replaces both a
separate Atividade/Log page and any parallel activity-log API shape: one endpoint
pattern, not several.

## Fases (commercial plan)
Unrelated to the nine delivery stages despite the name collision — a chronological
plan (weeks, objectives) that becomes the headline of the commercial proposal
generated in Gerar. Full requirements detail moves to an appendix of that proposal,
not its centerpiece.

## Camada (planning layer)

The *size* of what is being decided, as opposed to `Fase`, which is the *kind* of work.
Zero refines an intention against a mockup and is throwaway; one is the vision; two an
Epic; three a Feature; four a task an agent can finish in one run. An Epic runs its own
pass through the nine `Fases`.

There is deliberately no `camada` field on anything — each layer is already a distinct
record, and a field repeating that would be a fifth vocabulary to keep in step with the
other four. `lib/camadas.js` reads the layer off what something already is.

## Epic

A coherent slice of the `Visão`, weeks wide. **An Epic is not an `Execução`**: an Epic is
a scope, an Execução is a budgeted run against part of one, and a medium-to-large Epic is
built by several runs over weeks. The run therefore carries an `epicId` rather than being
the Epic.

## Feature

Camada 3: a coordination `Tarefa` carrying an `epicId`. Not its own record, which is what
keeps the work-item tree two levels deep — `Epic → Feature → Tarefa` where only the last
two are work items.

## Constituição (constitution)

The rules that must stay true whatever gets built — `O sistema deve sempre …`. Distinct
from `Visão`, which says what this is *for*: a vision is a direction, a constitution is an
invariant. Declared as an artifact so a spec change can be sent back up to it as a
recorded decision rather than a silent contradiction.

## Skill (método) vs Knowledge (conhecimento)

Two different things on a `Persona`, deliberately kept apart:

- **knowledge** — what this persona *knows*. Reference material, house rules.
- **skill** — how this persona *works*. A procedure with steps, red flags and a
  verification section.

A skill is **content the platform ships inside the task package**, never a capability the
runtime must advertise. A skill therefore cannot block a dispatch; only a missing
`Ferramenta MCP` can, because a tool either exists in the runtime or it does not.

Skills are bound per persona *and* per camada, so a persona cutting work into tasks is not
also handed the launch checklist. The bundle is budgeted against the model profile the run
will use — the index of every matched method always travels, and only the bodies are
capped, so a truncated bundle says what was left out instead of quietly shrinking.

Vendored under `skills/`, from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)
(MIT, Copyright Addy Osmani — see `skills/LICENSE`). Adding one of your own is a folder
plus an entry in `lib/skills.js`.

## Registo de decisões (decisions log)

Every decision the project has taken, newest first. **Not a store** — a reader over the
two that already exist, because they are different things and each is already owned by
something:

- `workItem.updates[].decision` — a change put something else in doubt: the proposal, the
  rationale, and the ruling on it.
- `project.decisions` — a decision taken in a phase, often promoted from an `Ata`.

Read when something moved, not out of habit: the count on the nav item is the point. It is
kept per device in `localStorage`, which is the honest weight for a nudge rather than an
audit trail.

## Um salto de artefacto (one artifact hop)

`reconcilePlan` covers what a change touches **directly** and stops there. It does not
follow `intention` on to everything built on `intention` — that bound is the difference
between revising the affected layer and revising the project.

The second hop has to be **earned**: `nextHop` opens what was built on the reconciled
artifact only once somebody *accepts* the decision. A proposal nobody has ruled on has
changed nothing yet, and a rejected one changed nothing by definition.

## Ficheiros gerados no repositório

`openspec/vision.md`, `constitution.md` and `decisions.md` are **renderings of platform
state**, never a second copy of it. They exist so an agent with `repo.read` and a person
reading the repository see what the platform holds. Each carries a comment saying it is
generated and will be replaced on the next sync — a generated file that does not announce
itself gets edited by hand and then silently overwritten.

`design.md` (the Camada-3 plan) is named in `openspec-format.js` and still not written:
nothing reads it yet, and a document with no reader is a file to keep in step for no one.
