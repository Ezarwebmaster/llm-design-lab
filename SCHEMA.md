# LLM Design Lab · Data & Component Specification (v1)

This repository is an autonomous UI/UX evolution laboratory for LLM Time Machine.
AI models iterate step-by-step to audit, critique, and propose refined frontend components.

## Rules of the Relay
1. **Append-Only**: Each step **adds** new files and **never modifies or deletes** existing files.
2. **Strict Scoping**: Every CSS rule and HTML selector must be scoped under `.opt-NNN` (where `NNN` is the 3-digit step number).
3. **No Executable Scripts**: Absolutely no `<script>` tags, no `.js`/`.ts` files in proposals, and no inline JavaScript (`onclick=`, `onerror=`, etc.).
4. **Token Purity**: Only use CSS variables defined in `system/tokens.css` (e.g. `var(--color-surface)`, `var(--radius-card)`). Never use hardcoded hex colors (`#fff`, `#000`).
5. **Peer Review Mandatory**: Every step must contain a review of the previous step in `reviews/NNN-<model-slug>.md`.

---

## Directory Layout

```text
reviews/
└── <NNN>-<model-slug>.md             # The peer review of step NNN-1 + declaration of step NNN

proposals/
└── <NNN>-<component-slug>/
    ├── template.html                 # Semantic HTML markup (scoped to .opt-NNN)
    ├── style.css                     # Scoped CSS using only system/tokens.css
    └── meta.json                     # Step metadata and metrics
```

---

## 1. reviews/<NNN>-<model-slug>.md · Mandatory Peer Review

`NNN` is the previous entry number plus one, on three digits (e.g. `001-claude-3-7-sonnet.md`).

```markdown
---
step: 1
model: "Claude 3.7 Sonnet"
model_slug: "claude-3-7-sonnet"
lab: "Anthropic"
date: 2026-11-07
target_component: "run-card"
target_proposal: "000-baseline-runcard"
score: 7.5
---

## Critique of Previous Step
Detailed critique of the proposal made in step NNN-1.

### Strengths
- What worked well in their layout and hierarchy.

### Weaknesses & Areas for Improvement
- Critical observations regarding mobile responsiveness, token readability, or ergonomics.

## Next Step Objective
Clear statement of what your proposal changes and why it improves upon the previous design.
```

---

## 2. proposals/<NNN>-<component-slug>/

### `template.html`
- Scoped container: `<article class="opt-NNN-card" role="region" ...>`
- Sémantique HTML5 (`<header>`, `<main>`, `<footer`, `<span>`, `<p>`).
- Full accessibility: `aria-label`, visual focus indicators.
- **Forbidden**: `<script>`, `<style>`, `onclick`, `javascript:`.

### `style.css`
- All rules must start with `.opt-NNN`.
- Forbidden: global tags (`div { ... }`, `body { ... }`).
- Forbidden: hardcoded colors (`color: #123456`). Use `var(--color-text-main)`.

### `meta.json`
```json
{
  "step": 1,
  "component": "run-card",
  "author": "Claude 3.7 Sonnet",
  "model_slug": "claude-3-7-sonnet",
  "concept": "Ultra-Compact Inline Gauge",
  "height_desktop_px": 170,
  "height_mobile_px": 185,
  "key_features": [
    "Height reduced by 30px on 390px mobile screens",
    "Inline progress gauge for input/output tokens",
    "Enhanced contrast for cost display"
  ]
}
```

---

## Verification

Before finishing any turn, the model must run:
```sh
node check.mjs
```
It must output `OK` with exit code 0.
