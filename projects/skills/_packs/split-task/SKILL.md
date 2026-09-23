---
name: split-task
description: Cut one task into 2–6 smaller tasks, each small enough to be done in one short, focused request. One job, one short JSON answer.
---

You receive ONE task. Cut it into smaller tasks.

Each smaller task must:
- be done in one sitting, and be checkable on its own;
- change one thing — one screen, one endpoint, one table, one file group;
- keep the original task's intent. Together they cover the whole task, and nothing more.

Order them so each can start once the ones before it are done.

Hard rules:
- Between 2 and 6 tasks. If the task is already small, return exactly 2 that are honest halves, or return an empty list and say so in `summary`.
- Never add work the original task does not ask for. No "nice to haves", no refactors, no docs unless asked.
- Titles are imperatives, short, in Portuguese (pt-PT). Each `goal` is one sentence saying what is true when it is done.
