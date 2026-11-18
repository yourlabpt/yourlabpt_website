# Digitu CRM: first contact and follow-up

**Decision proposed:** extend Foco, the CRM already used for Digitu. Do not merge it with the older guided demo-sales process or change the separate YourLab custom-project pipeline. This is a plan, not a change to live leads.

## What exists today

- [Foco contact cards and message composer](../../js/foco.js) already resolve available channels and fill templates. WhatsApp and email open external composers; desktop Instagram opens a profile with the message copied. The composer can log copying as messaging. The WhatsApp batch screen counts opening the link as sent, even before the CRM write succeeds.
- [The message endpoint](../../../server/server.js) checks whether the seller can edit the contact, saves the text and channel, and can schedule follow-up. It infers “link sent” from a URL in the message. That is not evidence that the recipient clicked.
- [The Digitu funnel](../../../server/lib/digitalizept-foco.js) already distinguishes uncontacted, contacted, link sent, beta use and activation. Foco also has a reply flag, search, shared templates, editable branding, bulk updates and app usage sync. The composer chooses its default by match/order rather than an explicit active template.

## Seller experience

Available on Digitu cards and in the WhatsApp batch: choose **Alterar mensagem padrão**, edit the reusable wording with slots such as `{nome}`, then choose **Usar agora e no próximo envio**. The next run in the same browser loads that seller's default for the channel. The ordinary contact message remains a one-off edit. Shared templates are not changed.

Select cold leads once, then start **Primeiro contacto**. Each card shows the business, available channels, last interaction, current step and next action. No mandatory note, template editor or full contact form.

1. Choose **WhatsApp**, **Instagram** or **Email** on the card. Use the active message for that channel and step, with the business name and Digitu link already filled. Show a preview without requiring an extra click.
2. Send in the external app, then choose **Enviei · próximo** on return. The CRM records the seller-confirmed send, schedules the next step and advances after saving. **Saltar** or cancel never logs a send. If saving fails, retry the record, not the message.

This is **two CRM actions**, not necessarily two total clicks. Instagram in particular can require opening a conversation, pasting and sending. If two total clicks and automatic confirmation are non-negotiable, first validate approved sending integrations and cold-outreach eligibility per channel; do not promise that arbitrary Instagram accounts can be messaged via API.

When a salon replies on Instagram, the seller searches `@handle`, presses **Respondeu**, and sees it leave the cold queue immediately. A positive or neutral reply starts a conversation; a refusal or opt-out stops outreach instead. When a recipient opens a tracked product link without replying, show **Clicou no link**, not **Respondeu**. If they reply later, retain both facts.

## Delivery order and tasks

### 1. Make send history trustworthy (REQ-001)
- [ ] T001 [Plan:1] In `server/server.js`, separate preparation from confirmation; atomically save one confirmed touch, resulting status and due date per attempt. Preserve seller permissions. Repeated confirmation must return the saved result without duplicating history. Keep older records as historical records, not newly verified sends.
- [ ] T002 [Plan:1] In `digitalizept/js/foco.js`, remove send side effects from copy/open and reuse one confirmation path in the card and batch flows. Preserve the current card after errors. Start with one seller and a small set of eligible contacts.

### 2. Make defaults and the batch queue usable on the card (REQ-002, REQ-003)
- [ ] T003 [Plan:2] Extend template settings in `server/lib/digitalizept-equipa.js` and `server/server.js`. Keep existing templates. Resolve a batch override first, then the active Digitu step/channel default, then a compatible existing fallback. Expose which one won. Limit changes to shared defaults to authorized users.
- [ ] T004 [Plan:2] In `digitalizept/js/foco.js`, add **Usar neste lote** and **Definir como padrão** next to the preview. Editing one draft must not change the default. Reuse brand settings for “Digitu by YourLab”; do not hardcode the product into every message.
- [ ] T005 [Plan:2] Generalize the existing WhatsApp batch to one queue for all three channels. Start from the selection or current filter, show eligible/skipped counts and reasons, claim shared leads under existing ownership rules, and recheck eligibility before each contact. Resume without resending; never open a mass of external tabs.

### 3. Add searchable replies, steps and simple rules (REQ-004, REQ-005)
- [ ] T006 [Plan:3] Extend Foco search and result cards in `digitalizept/js/foco.js` for business name, normalized phone, Instagram handle and email. Add inline reply, declined and do-not-contact actions, an optional note, and the next due date. Respect visibility boundaries in search and batch selection.
- [ ] T007 [Plan:3] In `server/lib/digitalizept-foco.js` and `server/server.js`, separate the **relationship stage** from the **next task**. Suggested starting stages: Cold, Contacted, Qualified by reply, Engaged by link, Beta, Activated. Keep reply and click timestamps independently. Neither a late click nor a new rule can move a beta, activated or closed lead backwards.
- [ ] T008 [Plan:3] Add a small Digitu settings table in the Foco UI: step name/order, eligible channel, default template, delay, trigger and next action. Example: “first send confirmed → wait 3 days → follow up if no reply”; “reply → cancel cold follow-up → seller responds”. Preview affected counts before publishing. Changes apply to future actions; do not silently rewrite pending tasks. Keep opt-outs as a non-overridable stop.

### 4. Add attributed click signals and pilot (REQ-006)
- [ ] T009 [Plan:4] Inspect the existing redirect and Digitu usage paths before adding tracking. Reuse a suitable per-contact link if it identifies an actual visit; otherwise use an opaque, scoped redirect to the configured product URL. Distinguish previews/scanners where possible, deduplicate repeated visits, and treat uncertain clicks as signals, not proof of intent. Sending a URL alone never triggers this rule.
- [ ] T010 [Plan:4] Preview the mapping of current Digitu records before rollout: unworked leads start Cold; preserve later stages, history, ownership, follow-up dates and closed states. Compare results with legacy reports and verify the YourLab custom pipeline is unchanged. Pilot with one seller before enabling shared defaults for everyone.

## Acceptance and measurement

| Requirement | Plan items | Evidence needed before rollout |
|---|---|---|
| REQ-001 Accurate first contact | 1 | On each supported channel, confirm advances once; opening, copying, cancelling and failed saves produce zero confirmed sends. |
| REQ-002 Change the active message in place | 2 | Switch the default on a card; the next matching card uses it. No template is deleted; unrelated channels and historical text are unchanged. |
| REQ-003 Work a batch | 2 | A mixed queue handles missing handles, opted-out leads, refreshes and retries without duplicate contacts or sends. |
| REQ-004 Find and qualify replies | 3 | Search by handle, phone or email across authorized contacts; recording a reply removes the lead from cold follow-up without opening a full edit form. |
| REQ-005 Configurable steps and rules | 3 | An admin changes a delay/default without deploying; preview explains the change; the next eligible lead follows it. |
| REQ-006 Recognize engagement | 4 | Link sent, link opened, reply, beta use and activation remain distinguishable, including when events arrive out of order. |

**Pilot success signal:** over 20 eligible first contacts, measure CRM actions and elapsed time per confirmed send against the current flow. Target at most two CRM actions per ordinary lead after batch setup, zero sends recorded for cancelled attempts, and no duplicates. Compare replies and beta starts by template using confirmed sends as the denominator. Defer a general automation builder, inbox sync and direct-send integrations until seller feedback or the total-click requirement justifies them.
