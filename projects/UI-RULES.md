# UI rules — Projects Platform

The standard is a professional iOS app: calm, dense where it matters, no decoration
that carries no information. One engineer uses this all day. Every pixel either helps
them decide something or it is noise.

These are rules, not suggestions. If a rule is wrong, change the rule here first.

## 1. No raw checkboxes, ever

A checkbox is a 14px target with a browser-drawn tick. It looks like a form from 2003.

Booleans and multi-select are **pill toggles**: a bordered, rounded button that is
grey when off and the accent colour when on. The whole pill is the target, never just
the box.

```html
<label class="checkline"><input type="checkbox" /> Pesquisa web</label>
```

The markup keeps a real `<input type="checkbox">` because that is what makes it
work with the keyboard and with a screen reader — but it is never visible. `.checkline`
draws the pill; the input is visually hidden and drives the state through `:has()`.

Never style a bare checkbox with `accent-color` and call it done.

## 2. No bullet lists in the interface

Bullets are for prose. An interface list is a set of rows, and rows are separated by a
hairline, not by a dot.

Every `<ul>` that renders data carries a list class (`.survey-list`, `.repo-picker-list`,
`.commit-list`). A bare `<ul>` in rendered UI is a bug — it inherits the browser's
`list-style: disc` and produces the dotted-topic look.

One item per row. Identifier left, metadata right, hairline between. If rows can grow
without limit, cap the height and scroll inside the block, never the page.

## 3. State is a colour, not a sentence

`Activa`, `Ligado`, `Pronto` as body text is wasted space. Use the badge scale:

| Meaning | Badge |
|---|---|
| Working, healthy, done | `badge-green` |
| Waiting for a person | `badge-amber` |
| Stopped, failed, missing | `badge-red` |
| Inert, not applicable | `badge-gray` |

A badge says what something *is*. If the reader has to act, the action is a button next
to it, not a longer sentence.

## 4. Say what is missing, and where to fix it

Never `Indisponível`, `Erro`, `Sem X compatível`. Those describe the platform's
confusion, not the user's problem.

Say the thing that is missing and name the screen that fixes it:

> Sem repositório ligado. Ligue um em **Definições do projecto**.

If there is nothing the user can do, it is not an error message, it is a bug.

## 5. Density with air

- Rows: `4–6px` vertical padding, hairline `0.5px solid var(--line)` between.
- Cards: `10–14px` padding, `10px` radius.
- Blocks: `12px` apart (`.mt-12`), related items `8px` (`.mt-8`).
- Never two nested boxes with visible borders. Pick the outer one.

## 6. Colour comes from the theme, never from a literal

Every colour is a token: `--accent`, `--ok`, `--danger`, `--line`, `--text`, `--muted`.
A hex code in a component is a bug — it breaks the light theme silently.

Accent is identity: it marks what is *on*, *current* or *primary*. It is never
decoration, and never more than one primary action per block.

## 7. Progressive disclosure

The page answers the main question above the fold. Everything else lives in a
`<details>` block that is closed by default and says what is inside, with a count:

> ▸ O que já existe no repositório — 407 ficheiros · 34 rotas

Never show the same information twice on one page in two shapes.

## 8. One concept, one definition

If two parts of the system name the same thing differently, that is not a mapping
problem to be solved with a matcher — it is one concept that was defined twice. Delete
one. See the persona/agent unification in `CONTEXT.md`.

## 9. Portuguese, and plain

All user-facing copy in Portuguese, written the way a person speaks. No jargon that
only makes sense with the source open. `Sem agente compatível` is a stack trace with
accents.
