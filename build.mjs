#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const REVIEWS_DIR = path.join(ROOT, 'reviews')
const PROPOSALS_DIR = path.join(ROOT, 'proposals')
const TOKENS_FILE = path.join(ROOT, 'system', 'tokens.css')
const OUTPUT_HTML = path.join(ROOT, 'index.html')
const DIST_DIR = path.join(ROOT, 'dist')
const DIST_HTML = path.join(DIST_DIR, 'index.html')

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return null
  const yamlBlock = match[1]
  const body = match[2]
  const meta = {}
  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let val = line.slice(colonIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    } else if (val !== '' && !isNaN(Number(val))) {
      val = Number(val)
    }
    meta[key] = val
  }
  return { meta, body }
}

const tokensCss = fs.readFileSync(TOKENS_FILE, 'utf8')
const reviews = fs.readdirSync(REVIEWS_DIR).filter(f => f.endsWith('.md')).sort()

const items = []
let combinedCss = tokensCss + '\n\n'

for (const rFile of reviews) {
  const rPath = path.join(REVIEWS_DIR, rFile)
  const parsed = parseFrontmatter(fs.readFileSync(rPath, 'utf8'))
  if (!parsed) continue
  const { meta: rMeta, body: rBody } = parsed
  const prefix = String(rMeta.step).padStart(3, '0')

  const pFolder = fs.readdirSync(PROPOSALS_DIR).find(d => d.startsWith(`${prefix}-`))
  if (!pFolder) continue

  const pDir = path.join(PROPOSALS_DIR, pFolder)
  const template = fs.readFileSync(path.join(pDir, 'template.html'), 'utf8')
  const style = fs.readFileSync(path.join(pDir, 'style.css'), 'utf8')
  const pMeta = JSON.parse(fs.readFileSync(path.join(pDir, 'meta.json'), 'utf8'))

  combinedCss += `/* --- Step ${prefix}: ${escapeHtml(pMeta.concept)} by ${escapeHtml(pMeta.author)} --- */\n` + style + '\n\n'

  items.push({
    step: prefix,
    review: rMeta,
    critique: escapeHtml(rBody.trim()),
    meta: pMeta,
    template
  })
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LLM Design Lab · Autonomous Component Benchmark</title>
  <style>
    ${combinedCss}

    /* Lab Chrome & Gallery Viewer */
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background-color: var(--color-bg);
      font-family: var(--font-sans);
      color: var(--color-text-main);
      -webkit-font-smoothing: antialiased;
    }
    header.lab-header {
      background: var(--color-surface);
      border-bottom: 1px solid var(--color-border);
      padding: 1.25rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 50;
      backdrop-filter: blur(8px);
    }
    .lab-title {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .lab-badge {
      background: var(--color-ink);
      color: var(--color-mint);
      font-family: var(--font-mono);
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border-radius: var(--radius-sm);
      font-weight: 700;
    }
    h1 { margin: 0; font-size: 1.125rem; font-weight: 700; }
    .lab-controls {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .viewport-toggle {
      display: inline-flex;
      background: var(--color-surface2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-standard);
      padding: 0.25rem;
    }
    .viewport-btn {
      background: none;
      border: none;
      padding: 0.35rem 0.75rem;
      border-radius: var(--radius-sm);
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      color: var(--color-text-muted);
      transition: all var(--transition-fast);
    }
    .viewport-btn.active {
      background: var(--color-surface);
      color: var(--color-text-main);
      box-shadow: var(--shadow-card);
    }
    main.lab-grid {
      max-width: 1100px;
      margin: 2rem auto;
      padding: 0 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 2.5rem;
      transition: all var(--transition-smooth);
    }
    body.mode-mobile main.lab-grid {
      max-width: 440px;
      padding: 0 1rem;
    }
    body.mode-mobile .component-frame {
      max-width: 390px;
      margin: 0 auto;
      overflow-x: auto;
    }
    .card-wrapper {
      width: 100%;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-card);
      overflow: hidden;
      box-shadow: var(--shadow-card-md);
      display: flex;
      flex-direction: column;
    }
    .card-topbar {
      background: var(--color-surface2);
      padding: 0.75rem 1.25rem;
      border-bottom: 1px solid var(--color-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card-step {
      font-family: var(--font-mono);
      font-size: 0.8125rem;
      font-weight: 700;
      color: var(--color-accent);
    }
    .card-model {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--color-text-muted);
    }
    .card-score {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      background: var(--color-green-dim);
      color: var(--color-green-custom);
      padding: 0.2rem 0.6rem;
      border-radius: var(--radius-pill);
      font-weight: 700;
    }
    .component-frame {
      padding: 1.5rem;
      background: var(--color-bg);
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .card-details {
      padding: 1.25rem;
      border-top: 1px solid var(--color-border);
      background: var(--color-surface);
      font-size: 0.8125rem;
    }
    .concept-title {
      font-weight: 700;
      font-size: 0.95rem;
      color: var(--color-text-main);
      margin-bottom: 0.5rem;
    }
    .features-list {
      margin: 0;
      padding-left: 1.25rem;
      color: var(--color-text-muted);
      line-height: 1.5;
    }
    .features-list li { margin-bottom: 0.25rem; }
    details.critique-drawer {
      margin-top: 0.75rem;
      border-top: 1px dashed var(--color-border);
      padding-top: 0.75rem;
    }
    details.critique-drawer summary {
      cursor: pointer;
      color: var(--color-accent-strong);
      font-weight: 600;
      user-select: none;
    }
    .critique-box {
      margin-top: 0.5rem;
      background: var(--color-surface2);
      padding: 0.85rem;
      border-radius: var(--radius-sm);
      white-space: pre-wrap;
      font-size: 0.75rem;
      line-height: 1.5;
      color: var(--color-text-muted);
    }
  </style>
</head>
<body>
  <header class="lab-header">
    <div class="lab-title">
      <span class="lab-badge">LTM UI LAB</span>
      <h1>Autonomous UI Evolution &amp; Component Benchmark</h1>
    </div>
    <div class="lab-controls">
      <div class="viewport-toggle">
        <button class="viewport-btn active" onclick="setMode('desktop')">Desktop (1040px)</button>
        <button class="viewport-btn" onclick="setMode('mobile')">Mobile (390px)</button>
      </div>
    </div>
  </header>

  <main class="lab-grid" id="gallery">
    ${items.map(item => `
      <section class="card-wrapper" id="opt-${item.step}">
        <div class="card-topbar">
          <span class="card-step">#${item.step}</span>
          <span class="card-model">${escapeHtml(item.meta.author)}</span>
          <span class="card-score">Score: ${Number(item.review.score || 0)}/100</span>
        </div>
        <div class="component-frame">
          ${item.template}
        </div>
        <div class="card-details">
          <div class="concept-title">${escapeHtml(item.meta.concept)}</div>
          <p style="color: var(--color-text-muted); margin: 0 0 0.5rem 0;">${escapeHtml(item.meta.description || '')}</p>
          <details class="critique-drawer" open>
            <summary>Peer Review &amp; Critique (${escapeHtml(item.review.model)})</summary>
            <div class="critique-box">${item.critique}</div>
          </details>
        </div>
      </section>
    `).join('')}
  </main>

  <script>
    function setMode(mode) {
      document.body.className = mode === 'mobile' ? 'mode-mobile' : 'mode-desktop';
      document.querySelectorAll('.viewport-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().includes(mode));
      });
    }
  </script>
</body>
</html>
`

fs.writeFileSync(OUTPUT_HTML, html, 'utf8')

// Support Daytona/Vercel platform preview via pickSiteRoot:
if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true })
fs.writeFileSync(DIST_HTML, html, 'utf8')

console.log(`✨ Gallery compiled successfully into ${path.relative(ROOT, OUTPUT_HTML)} & ${path.relative(ROOT, DIST_HTML)} (${items.length} options)`)
