# yourlab/ — how this project documents itself

This folder is the single source of truth for everything written about this project.
Any person or AI may edit it. The YourLab platform only **reads** it: it re-reads these
files on every sync, the same files always give the same result, and nothing else is
kept anywhere. Follow the shapes below exactly — a file the platform cannot read is
reported back with its path, its line and what to write instead.

The platform rewrites this `GUIDE.md` itself. Do not edit it here.

## The files

```
yourlab/
├── GUIDE.md                 this guide (platform-owned)
├── project.md               what the app is: purpose, client, context, risks
├── ideas.md                 ideas not decided yet
├── questions.md             open questions, and their answers once known
├── phases/NN-name.md        one file per fase, NN = delivery order (01, 02, …)
├── diagrams/name.mmd        one Mermaid diagram per file
├── database.md              entities and their fields
├── workflows/name.md        one workflow per file
└── mockup/name.html         static screens; mockup/index.html is the first one
openspec/specs/<capability>/spec.md   requirements, in OpenSpec format
```

Anything else inside `yourlab/` is ignored and reported. File and folder names are
lowercase, with words separated by `-`.

## Rules that apply everywhere

- Write in Portuguese (pt-PT), the way a person speaks. Headings stay exactly as shown.
- A block between two `---` lines at the top of a file holds `key: value` pairs, one per
  line. No nesting, no quotes, no lists inside it.
- A field inside a section is a bullet: `- Chave: valor`.
- Change what is true; delete what stopped being true. Never keep two versions of the
  same fact in two files — each fact has exactly one home, listed below.

## The constitution: code and artefacts change together

These files describe the code, and the code does what these files say. Neither is
allowed to drift. Every change, by a person or by any AI, follows the same rules.

**The links.** A diagram node points at the folder that implements it with
`%% code: Node = src/folder`; a workflow does it with `- Código: src/folder`. Those two
lines are the only bridge between drawings and code. Keep them when you edit.

**After you change code** (in the same commit):

1. Find what describes it: search `yourlab/` for the folder you touched —
   `grep -rn "src/folder" yourlab/`.
2. Update each artefact that is no longer true: the workflow's steps, the diagram's
   nodes and arrows, the requirement in `openspec/specs/<capability>/spec.md` (and its
   scenarios when behaviour changed), `database.md` when a table or field changed.
3. A new folder of code gets a node in a diagram with its `%% code:` line. A deleted
   folder loses its node and its line.
4. Something you could not decide goes to `questions.md` as an open question — never a
   guess written as fact.

**After you change an artefact:** change the code in the linked folders in the same
commit, or leave the code alone and say so in the commit message (`yourlab: … — código
por fazer`). The platform turns that into a task.

**Size of a change.** Small, one-artefact changes go through the platform: each AI
call there sees one artefact and only the code linked to it, returns whole files, and
nothing is written until a person presses Escrever. Bigger changes — a refactor, many
modules at once — are done locally (by a person or a local AI) on a working copy,
following the rules above, then pushed; the next sync reads them.

**Before you commit,** if the YourLab command is available, run it on the repository:
`node <platform>/bin/yourlab.js check .` — it lists format errors, links to folders that
do not exist, folders nobody drew, and artefacts whose code changed after them. Fix
what it lists, or say in the commit message why not.

**Commit messages.** Artefact-only commits start with `yourlab:`. Code commits name the
artefacts they updated, or say `artefactos por actualizar` when they did not.

## project.md

```markdown
---
name: City Pass
client: Impakta
type: ideia
stage: requirements
---

## Propósito
One paragraph: why this app exists and for whom.

## Contexto
What someone joining needs to know: the business, the constraints, what exists already.

## Riscos
- One risk per bullet.

## Assunções
- One assumption per bullet.
```

- `type`: `ideia` (new build), `resgate` (rescue an existing codebase), `consolidacao`
  (bring scattered work into one system) or `interno` (YourLab's own tools).
- `stage`: where the project is now — one of `idea`, `discovery`, `requirements`,
  `architecture`, `roadmap`, `implementation`, `validation`, `delivery`, `operations`.
- `## Propósito` is required. The others may be left out.

## ideas.md

```markdown
## Pagamento com MB Way
- Estado: a explorar
Why it might matter, in a few lines.
```

One `##` section per idea. `Estado`: `nova`, `a explorar`, `aceite` or `rejeitada`.
An accepted idea becomes a feature in a fase; then delete it here.

## questions.md

```markdown
## Quantas pessoas podem usar o mesmo cupão?
- Para: cliente
- Estado: respondida
- Resposta: Até 6 pessoas por cupão.
```

One `##` section per question, the question itself as the heading. `Para`: `cliente`
or `equipa`. `Estado`: `aberta` or `respondida`. An answered question keeps its
`Resposta` — that is how decisions stay traceable.

## phases/NN-name.md

```markdown
---
title: MVP, fundação e identidade visual
weeks: 6
status: planeada
---

## Objetivo
What is true for the client when this fase is delivered.

## Features

### Conta e login
- Requisitos: authentication
What the feature does, in two or three lines.

### Compra de plano
- Requisitos: payments, coupons

## Entregáveis
- App do cliente com o fluxo base
```

- The file name gives the order: `01-mvp.md`, `02-mapa-e-roteiros.md`.
- `weeks`: a whole number. `status`: `planeada`, `em curso` or `concluída`.
- Each feature is a `###` under `## Features`. `Requisitos` lists the OpenSpec
  capabilities (the folder names under `openspec/specs/`) that hold its requirements,
  separated by commas.
- Fases are the only way work is grouped. There are no epics, layers or levels.

## diagrams/name.mmd

Plain Mermaid, nothing else. The first line may name the diagram:

```
%% title: Arquitectura
flowchart LR
  App --> API --> Base

%% code: API = src/api
%% code: Base = src/db
```

A `%% code: Node = folder` line links a node to the folder of the repository that
implements it. Keep these lines when you edit the diagram: they are how the platform
shows a node's code and writes code changes from a diagram change. One line per node.

## database.md

```markdown
## Entidade: Cupão
| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | |
| codigo | texto | único, gerado na compra |
Anything else about the entity, in prose.
```

One `## Entidade: Name` section per entity, with one table of its fields.

## workflows/name.md

```markdown
# Validar um cupão no restaurante
1. O parceiro lê o QR code.
2. A plataforma confirma que o cupão está activo.
3. O cupão fica marcado como usado.
```

A `#` title, then numbered steps. Prose around them is kept.

`- Código: src/auth, src/routes` (one line, under the title) links the workflow to the
folders that implement it, the same way `%% code:` does for a diagram node.

## mockup/*.html

- Each file is one static screen, self-contained: styles in a `<style>` block, images as
  inline SVG or `data:` URIs.
- Scripts do not run and nothing is loaded from the internet — the platform shows the
  mockup in a sandbox. Screens link to each other with `<a href="other.html">`.
- `index.html` is the first screen. Give each screen a `<title>`.
- When the mockup changes, replace the files. The platform always shows what is here now.

## openspec/specs/<capability>/spec.md

Requirements, in the OpenSpec format. The comment line is what tells the platform which
kind of requirement it is — without it the requirement shows up under **Não Definido**:

```markdown
## Requirements
### Requirement: Iniciar sessão
<!-- yourlab: id=FR-01; type=functional; module=Backend; priority=high -->

The system SHALL let a client sign in with email and password.

#### Scenario: Password certa
- **WHEN** the client submits a correct email and password
- **THEN** the client sees their coupons
```

`type` is one of:

| type | Means |
|---|---|
| `stakeholder` | what someone needs (STK) |
| `functional` | what the app does (FR) |
| `non_functional` | how well it must do it — speed, security, limits (RNF) |
| `test_case` | an acceptance case (TC) |
| `undefined` | not decided yet (UQ) |
| `out_of_scope` | deliberately not doing it (OOS) |

`module` and `priority` are optional. Scenarios under a requirement are its acceptance
cases — they are what tests get written from.

One folder per capability, and a fase's features point at those folder names.
