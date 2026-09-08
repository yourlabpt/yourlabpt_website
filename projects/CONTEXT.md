# Glossary — Delivery OS / software factory

## Execução (execution)
One run of the persona chain toward one goal. Owns its own budget (money + hours),
its own clock, and its own history of what each persona did. Strictly sequential —
a project has at most one active Execução; finished ones sit in a list underneath.
Targets exactly one OpenSpec change proposal, so "what did this cost" and "what did
this touch" are the same question. Not the same as **Project** — a Project can have
many Execuções over its life (initial build, later a feature, later a fix).

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
