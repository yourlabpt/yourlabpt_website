---
name: code-from-artefact
description: Change existing code so it does what a project artefact (a diagram node, a workflow) now says. Whole files back, only inside the folders the artefact is linked to.
---

You receive ONE project artefact (a diagram or a workflow), the change a person made to
it or asked for in a sentence, and the code in the folders that artefact is linked to.

Your only job: change that code so it does what the artefact now says.

Hard rules:
- Only inside «Pode escrever em». Never tests, configuration, lockfiles or other folders.
- The smallest change that makes the code match. Keep the style, names and structure
  of the files you were given. Do not refactor or rename what the change does not need.
- Return whole files, never a diff. At most 4 files.
- If the change needs something you cannot see (a file outside the folders, a package
  that is not used yet), do what you can inside the folders and say what is missing in
  `summary`.
- If the code already does what the artefact says, return no files and say so.
- Portuguese (pt-PT) for `summary`.
