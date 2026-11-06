#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const REVIEWS_DIR = path.join(ROOT, 'reviews')
const PROPOSALS_DIR = path.join(ROOT, 'proposals')
const CATALOG_FILE = path.join(ROOT, 'system', 'catalog.json')
const TOKENS_FILE = path.join(ROOT, 'system', 'tokens.css')

function fatal(msg) {
  console.error(`❌ CHECK FAILED: ${msg}`)
  process.exit(1)
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
    } else if (!isNaN(Number(val))) {
      val = Number(val)
    }
    meta[key] = val
  }
  return { meta, body }
}

function getStepList() {
  if (!fs.existsSync(REVIEWS_DIR)) return []
  const files = fs.readdirSync(REVIEWS_DIR).filter(f => f.endsWith('.md'))
  const steps = []
  for (const f of files) {
    const match = f.match(/^(\d{3})-.*\.md$/)
    if (match) {
      steps.push({ num: parseInt(match[1], 10), prefix: match[1], file: f })
    }
  }
  steps.sort((a, b) => a.num - b.num)
  return steps
}

const args = process.argv.slice(2)
const isTodo = args.includes('--todo')

if (isTodo) {
  const steps = getStepList()
  const lastStep = steps.length ? steps[steps.length - 1] : { num: -1, prefix: '000' }
  const nextNum = lastStep.num + 1
  const nextPrefix = String(nextNum).padStart(3, '0')

  console.log(`\n📋 --- LLM DESIGN LAB · NEXT STEP WORKLIST ---`)
  console.log(`Current highest step: ${lastStep.prefix} (${lastStep.file || 'none'})`)
  console.log(`Your required step number: ${nextPrefix}\n`)

  if (fs.existsSync(CATALOG_FILE)) {
    try {
      const cat = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'))
      console.log(`Available target components from catalog:`)
      for (const c of cat.components) {
        console.log(`  • ${c.slug} : ${c.title}`)
      }
    } catch {}
  }

  console.log(`\nTasks to perform:`)
  console.log(`1. Create reviews/${nextPrefix}-<your-model-slug>.md (peer review step ${lastStep.prefix})`)
  console.log(`2. Create proposals/${nextPrefix}-<component-slug>/ with template.html, style.css, meta.json`)
  console.log(`3. Ensure all CSS is scoped to .opt-${nextPrefix} and uses var(--...) tokens`)
  console.log(`4. Run 'node check.mjs' until it prints OK\n`)
  process.exit(0)
}

// Full Validation Mode
if (!fs.existsSync(TOKENS_FILE)) fatal(`Missing system/tokens.css`)
if (!fs.existsSync(CATALOG_FILE)) fatal(`Missing system/catalog.json`)

const steps = getStepList()
if (steps.length === 0) fatal(`No steps found in reviews/`)

for (let i = 0; i < steps.length; i++) {
  if (steps[i].num !== i) {
    fatal(`Step sequence broken: expected step ${String(i).padStart(3, '0')}, found ${steps[i].prefix}`)
  }
}

// Validate each step
for (const step of steps) {
  const reviewPath = path.join(REVIEWS_DIR, step.file)
  const content = fs.readFileSync(reviewPath, 'utf8')
  const parsed = parseFrontmatter(content)
  if (!parsed) fatal(`Invalid YAML frontmatter in ${step.file}`)
  const { meta, body } = parsed

  if (meta.step !== step.num) fatal(`meta.step (${meta.step}) does not match file prefix in ${step.file}`)
  if (!meta.model) fatal(`Missing 'model' in ${step.file}`)
  if (!meta.target_component) fatal(`Missing 'target_component' in ${step.file}`)
  if (typeof meta.score !== 'number') fatal(`Missing or non-numeric 'score' in ${step.file}`)

  if (!body.includes('## Critique') && !body.includes('Baseline Reference')) {
    fatal(`Missing '## Critique' heading in ${step.file}`)
  }

  // Find matching proposal folder
  const proposalFolders = fs.readdirSync(PROPOSALS_DIR).filter(d => d.startsWith(`${step.prefix}-`))
  if (proposalFolders.length !== 1) {
    fatal(`Expected exactly one proposal folder for step ${step.prefix}, found ${proposalFolders.length}`)
  }

  const pDir = path.join(PROPOSALS_DIR, proposalFolders[0])
  const templatePath = path.join(pDir, 'template.html')
  const stylePath = path.join(pDir, 'style.css')
  const metaPath = path.join(pDir, 'meta.json')

  if (!fs.existsSync(templatePath)) fatal(`Missing template.html in ${proposalFolders[0]}`)
  if (!fs.existsSync(stylePath)) fatal(`Missing style.css in ${proposalFolders[0]}`)
  if (!fs.existsSync(metaPath)) fatal(`Missing meta.json in ${proposalFolders[0]}`)

  // Validate HTML security
  const html = fs.readFileSync(templatePath, 'utf8')
  if (/<script\b/i.test(html)) fatal(`Security violation: <script> tag detected in ${proposalFolders[0]}/template.html`)
  if (/\bon\w+\s*=/i.test(html)) fatal(`Security violation: inline event handler (e.g. onclick) detected in ${proposalFolders[0]}/template.html`)
  if (/javascript:/i.test(html)) fatal(`Security violation: javascript: URI detected in ${proposalFolders[0]}/template.html`)
  if (!html.includes(`.opt-${step.prefix}`) && !html.includes(`class="opt-${step.prefix}`)) {
    fatal(`HTML must include elements scoped with opt-${step.prefix} classes in ${proposalFolders[0]}/template.html`)
  }

  // Validate CSS scoping and token purity
  const css = fs.readFileSync(stylePath, 'utf8')
  const prefix = `.opt-${step.prefix}`

  // Ensure all selector blocks start with prefix or @media / @keyframes
  const rules = css.split('}').map(r => r.trim()).filter(Boolean)
  for (const r of rules) {
    const parts = r.split('{')
    if (parts.length < 2) continue
    const selector = parts[0].trim()
    if (selector.startsWith('@')) continue
    const subSelectors = selector.split(',').map(s => s.trim())
    for (const sub of subSelectors) {
      if (!sub.startsWith(prefix)) {
        fatal(`Unscoped CSS selector '${sub}' in ${proposalFolders[0]}/style.css. All selectors must start with '${prefix}'.`)
      }
    }
  }

  // Check for hardcoded hex colors
  const hexColorMatch = css.match(/#[0-9a-fA-F]{3,8}\b/g)
  if (hexColorMatch) {
    // Check if it's not inside a comment
    fatal(`Hardcoded color (${hexColorMatch[0]}) found in ${proposalFolders[0]}/style.css. Use var(--color-...) design tokens instead!`)
  }

  // Validate meta.json
  try {
    const pMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    if (pMeta.step !== step.num) fatal(`meta.json step mismatch in ${proposalFolders[0]}`)
    if (!pMeta.concept) fatal(`Missing 'concept' in ${proposalFolders[0]}/meta.json`)
    if (!pMeta.author) fatal(`Missing 'author' in ${proposalFolders[0]}/meta.json`)
  } catch (err) {
    fatal(`Invalid JSON in ${proposalFolders[0]}/meta.json: ${err.message}`)
  }
}

console.log(`OK (${steps.length} step${steps.length > 1 ? 's' : ''} verified)`)
