# Wireframes (Low Fidelity)

## 1) Overview
```
┌──────────────────────────────────────────────────────────────┐
│ Top Nav: [Overview][Templates][Reviews][Incidents][...]      │
├──────────────────────────────────────────────────────────────┤
│ [Templates] [Active] [Risk eval] [High/Critical] [Coverage]  │
│ [SLA]                                                        │
├───────────────────────────────┬──────────────────────────────┤
│ Overview Insights             │ Quick Actions                │
│ - Latest Activity             │ [Create Template]            │
│ - Risk Trends                 │ [Generate Draft with AI]     │
│                               │ [Review Flagged Drafts]      │
│                               │ Notifications                │
└───────────────────────────────┴──────────────────────────────┘
Primary CTA: Review queues / create template
```

## 2) Templates Library + Editor
```
┌──────────────────────────────────────────────────────────────┐
│ Search [________]  Filters [Category][State][Risk] Sort [v] │
├──────────────────────────────────────────────────────────────┤
│ Template List (Card/Table toggle)                            │
│ - Name | Category | State | Risk | Updated | Actions         │
├──────────────────────────────────────────────────────────────┤
│ Editor (left)                   │ Side panel (right)         │
│ - Content                        │ - Variables                │
│ - Draft status                   │ - Signature checks         │
│                                  │ - Risk result              │
│ Action bar: [Save] [Evaluate] [Activate/Review]              │
└──────────────────────────────────────────────────────────────┘
Primary CTA: Evaluate risk → Activate/Send for review
```

## 3) Reviews Queue (L3)
```
┌──────────────────────────────────────────────────────────────┐
│ Filters: date/category/reason/status/search                 │
├──────────────────────────────────────────────────────────────┤
│ Table: ts | template | category | risk | score | ownerState │
│ [ ] row ...                                                  │
├──────────────────────────────────────────────────────────────┤
│ Detail pane: reason codes, policy adjustments, diff, action │
│ [Acknowledge] [Request revision] [Escalate]                 │
└──────────────────────────────────────────────────────────────┘
Primary CTA: Resolve pending owner actions
```

## 4) Incidents Queue (L4-L5)
```
┌──────────────────────────────────────────────────────────────┐
│ Incident list sorted by severity + age                      │
│ Columns include SLA timer/state                             │
├──────────────────────────────────────────────────────────────┤
│ Detail pane:                                                │
│ - Full risk report                                          │
│ - Required action                                           │
│ - Assignment/Owner decision                                 │
│ [Request edit] [Reject] [Override (if allowed)]             │
└──────────────────────────────────────────────────────────────┘
Primary CTA: Contain incident before SLA breach
```

## 5) Audit Explorer
```
┌──────────────────────────────────────────────────────────────┐
│ Filters: actor/action/date/severity/search                 │
├──────────────────────────────────────────────────────────────┤
│ Timeline/Table                                               │
│ - Event row: action, actor, ts, outcome, risk marker         │
├──────────────────────────────────────────────────────────────┤
│ Event detail + before/after diff                             │
└──────────────────────────────────────────────────────────────┘
Primary CTA: Trace decisions and ownership
```

## 6) Team
```
┌──────────────────────────────────────────────────────────────┐
│ Staff list: name | email | role | status | ...             │
├──────────────────────────────────────────────────────────────┤
│ [Invite staff] modal: email + role                          │
│ Inline actions: enable/disable/promote/demote               │
└──────────────────────────────────────────────────────────────┘
Primary CTA: Maintain least-privilege access
```

## 7) Settings
```
┌──────────────────────────────────────────────────────────────┐
│ Brand profile (logo/colors)                                 │
│ Tone/language                                                │
│ Risk sensitivity modifier                                    │
│ Tenant metadata                                              │
│ [Save config]                                                │
└──────────────────────────────────────────────────────────────┘
Primary CTA: Keep tenant config consistent and safe
```

