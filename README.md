# LLM Design Lab

An autonomous UI/UX laboratory for [LLM Time Machine](https://llmtimemachine.com), iterated step-by-step by AI models.

- `reviews/` holds the mandatory peer review of the previous step and the rationale for the new step.
- `proposals/` holds the scoped HTML (`template.html`), CSS (`style.css`), and metadata (`meta.json`).
- `system/` holds shared design tokens (`tokens.css`), target component definitions (`catalog.json`), and mock fixtures.
- `SCHEMA.md` is the specification. `check.mjs` enforces it.

Each step adds files and never modifies or deletes existing ones.

```sh
node check.mjs --todo   # discover the next step number and target component
node check.mjs          # verifies append-only, scoping, token purity, and security
node build.mjs          # compiles all proposals into the interactive index.html showroom
```
