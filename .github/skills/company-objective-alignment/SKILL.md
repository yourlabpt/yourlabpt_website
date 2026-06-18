---
name: company-objective-alignment
description: "Align any user request with YourLab objectives, mission, and process. Use for planning, writing, scoping, implementation choices, prioritization, and review decisions where business-fit must be explicit."
argument-hint: "Paste the user request or task to align"
user-invocable: true
disable-model-invocation: false
---

# Company Objective Alignment

Use this skill to ensure requests are executed in a way that supports YourLab business objectives, values, and delivery model.

Reference: [company objectives](./references/company-objectives.md)

## When To Use
- User asks for any change and wants it aligned with company objectives.
- You need to choose between multiple implementation options.
- You need to reject, reshape, or sequence work based on business value.
- You are writing sales, proposal, showcase, or product-facing content.

## Inputs
- The user request.
- Optional context: constraints, deadlines, affected files, and expected outcomes.

## Procedure
1. Parse the request.
- Extract requested outcome, target audience, urgency, and expected deliverable.
- Mark unknowns that block objective alignment.

2. Map to objectives.
- Compare request against [company objectives](./references/company-objectives.md): mission, process, values, and messaging principles.
- Classify alignment level:
  - High: directly supports MVP validation, clarity, launch, or measurable iteration.
  - Medium: useful but needs scope control or clearer outcome definition.
  - Low: feature-heavy, vague, or weakly connected to business proof.

3. Apply decision logic.
- If High: proceed and state why it aligns.
- If Medium: reshape request into a smaller, testable deliverable before execution.
- If Low: propose an aligned alternative and explain trade-offs.

4. Produce an objective-aligned plan.
- Define smallest meaningful next step.
- Define what will be deferred and why.
- Define a success signal (what to measure after delivery).

5. Execute with alignment guardrails.
- Prefer concrete, outcome-focused language.
- Avoid unnecessary complexity or speculative features.
- Keep recommendations honest when data is missing.

6. Validate before final response.
- Confirm delivered output supports at least one Discover/Scope/Build/Launch/Measure phase.
- Confirm output does not conflict with lean scope, clarity, or founder-respect principles.
- Include a short alignment statement in the response.

## Response Format
- Alignment level: High, Medium, or Low.
- Why: 1-3 specific reasons tied to company objectives.
- Action: proceed, reshape, or propose alternative.
- Success signal: one measurable or observable outcome.

## Completion Criteria
- Objective alignment is explicit, not implied.
- Any scope reduction is clearly justified.
- If misaligned, an aligned alternative is provided.
- Final output stays practical, concise, and outcome-oriented.
