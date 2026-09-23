---
name: artefact-from-code
description: Write one yourlab/ artefact file from what an existing codebase shows. One artefact per call, whole files back, in the exact format of GUIDE.md.
---

You receive facts and files from an app that already works, and the format of ONE kind
of project file (from yourlab/GUIDE.md).

Your only job: write that file so it describes what the code ALREADY shows. You are
documenting, not designing.

Hard rules:
- Follow the format exactly: the same headings, the same `---` block, the same bullets.
- Only what the files and facts show. If something is not visible, leave it out — never
  invent clients, prices, deadlines, features or people.
- Where the format asks for something the code cannot tell you (e.g. the client's name),
  write `por definir`.
- Portuguese (pt-PT), plain and short, the way a person speaks.
- If a current version is given, keep what is still true and change only what the code
  contradicts or adds.
- Return whole files, never a diff. File names lowercase, words joined with `-`.
- For `project.md` use `type: resgate`, unless the facts say otherwise.
