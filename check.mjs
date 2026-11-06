#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

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
    } else if (val !== '' && !isNaN(Number(val))) {
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
if (args.includes('--todo')) {
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
  console.log(`3. Ensure all CSS is scoped to .opt-${nextPrefix} (or .opt-${nextPrefix}-*) and uses var(--...) tokens`)
  console.log(`4. Run 'node check.mjs' until it prints OK\n`)
  process.exit(0)
}

// 1. Structure Verification
if (!fs.existsSync(TOKENS_FILE)) fatal(`Missing system/tokens.css`)
if (!fs.existsSync(CATALOG_FILE)) fatal(`Missing system/catalog.json`)

const steps = getStepList()
if (steps.length === 0) fatal(`No steps found in reviews/. Run 'node check.mjs --todo' for instructions.`)

for (let i = 0; i < steps.length; i++) {
  if (steps[i].num !== i) {
    fatal(`Step sequence broken: expected step ${String(i).padStart(3, '0')}, found ${steps[i].prefix}`)
  }
}

// 2. Append-Only Integrity Check via Git
try {
  const statusOut = execSync('git status --porcelain', { encoding: 'utf8' }).trim()
  if (statusOut) {
    const lines = statusOut.split('\n')
    const latestPrefix = steps[steps.length - 1].prefix
    for (const l of lines) {
      const status = l.slice(0, 2).trim()
      const filePath = l.slice(3).trim()
      const isAllowed = 
        filePath.startsWith(`reviews/${latestPrefix}-`) ||
        filePath.startsWith(`proposals/${latestPrefix}-`) ||
        filePath === 'index.html' ||
        filePath.startsWith('dist/')
      if (!isAllowed && (status === 'M' || status === 'D')) {
        fatal(`Append-only violation: modified or deleted existing repository file '${filePath}'. Only additions for step ${latestPrefix} are allowed.`)
      }
    }
  }
} catch {
  // Ignored if not a git repository
}

// Helpers for CSS validation
function stripComments(str) {
  return str.replace(/\/\*[\s\S]*?\*\//g, '')
}

function parseCssRules(cssText) {
  const clean = stripComments(cssText)
  const rules = []
  let depth = 0
  let currentHeader = ''
  let currentBody = ''

  let i = 0
  while (i < clean.length) {
    const char = clean[i]
    if (char === '{') {
      depth++
      if (depth === 1) {
        currentHeader = currentHeader.trim()
        currentBody = ''
      } else {
        currentBody += char
      }
    } else if (char === '}') {
      depth--
      if (depth === 0) {
        rules.push({ selector: currentHeader.trim(), body: currentBody.trim() })
        currentHeader = ''
        currentBody = ''
      } else {
        currentBody += char
      }
    } else {
      if (depth === 0) currentHeader += char
      else currentBody += char
    }
    i++
  }
  return rules
}

function validateSelectorList(selectorStr, prefix, context) {
  const parts = []
  let cur = ''
  let pDepth = 0
  for (let i = 0; i < selectorStr.length; i++) {
    const c = selectorStr[i]
    if (c === '(') pDepth++
    else if (c === ')') pDepth = Math.max(0, pDepth - 1)
    if (c === ',' && pDepth === 0) {
      parts.push(cur.trim())
      cur = ''
    } else {
      cur += c
    }
  }
  if (cur.trim()) parts.push(cur.trim())

  for (const sel of parts) {
    if (!sel) continue
    if (/^(from|to|\d+%)$/.test(sel)) continue

    const validStart = sel.startsWith(prefix) && (
      sel.length === prefix.length ||
      sel[prefix.length] === '-' ||
      sel[prefix.length] === ' ' ||
      sel[prefix.length] === ':' ||
      sel[prefix.length] === '.' ||
      sel[prefix.length] === '['
    )

    if (!validStart) {
      fatal(`Unscoped CSS selector '${sel}' in ${context}. Every selector must be scoped under '${prefix}'.`)
    }
  }
}

// 3. Step Validation
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

  // Security check on review markdown (prevent stored XSS)
  if (/<(script|iframe|object|embed|svg|form|link|meta)/i.test(body)) {
    fatal(`Security violation: dangerous HTML tags detected in review ${step.file}`)
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

  // A. Validate HTML security & scoping
  const html = fs.readFileSync(templatePath, 'utf8')
  if (/<(script|iframe|object|embed|base|meta|link|form)\b/i.test(html)) {
    fatal(`Security violation: forbidden HTML element detected in ${proposalFolders[0]}/template.html`)
  }
  if (/\bon\w+\s*=/i.test(html)) {
    fatal(`Security violation: inline event handler (e.g. onclick) detected in ${proposalFolders[0]}/template.html`)
  }
  if (/javascript\s*:/i.test(html) || /data\s*:\s*text\/html/i.test(html)) {
    fatal(`Security violation: dangerous URI scheme detected in ${proposalFolders[0]}/template.html`)
  }
  if (/<svg\b[^>]*\bon\w+\s*=/i.test(html) || /<animate|<set|<handler/i.test(html)) {
    fatal(`Security violation: SVG executable animation/handler detected in ${proposalFolders[0]}/template.html`)
  }

  // Must include scoped class opt-NNN
  const prefix = `.opt-${step.prefix}`
  const classRegex = new RegExp(`class=['"][^'"]*opt-${step.prefix}[^'"]*['"]`, 'i')
  if (!classRegex.test(html)) {
    fatal(`HTML markup must include an element scoped with class "opt-${step.prefix}..." in ${proposalFolders[0]}/template.html`)
  }

  // B. Validate CSS scoping and token purity
  const rawCss = fs.readFileSync(stylePath, 'utf8')
  const cleanCss = stripComments(rawCss)

  if (/@import\b/i.test(cleanCss) || /url\s*\(\s*['"]?javascript:/i.test(cleanCss)) {
    fatal(`Security violation: dangerous @import or javascript: URI in ${proposalFolders[0]}/style.css`)
  }

  const topRules = parseCssRules(rawCss)
  for (const rule of topRules) {
    const sel = rule.selector
    if (sel.startsWith('@media') || sel.startsWith('@supports')) {
      const nestedRules = parseCssRules(rule.body)
      for (const nested of nestedRules) {
        validateSelectorList(nested.selector, prefix, `${proposalFolders[0]}/style.css within ${sel}`)
      }
    } else if (sel.startsWith('@keyframes')) {
      const name = sel.replace(/^@keyframes\s+/, '').trim()
      if (!name.startsWith(`opt-${step.prefix}`)) {
        fatal(`Keyframe animation '${name}' must start with 'opt-${step.prefix}' in ${proposalFolders[0]}/style.css`)
      }
    } else if (sel.startsWith('@')) {
      continue
    } else {
      validateSelectorList(sel, prefix, `${proposalFolders[0]}/style.css`)
    }
  }

  // Forbid hardcoded hex: #fff, #123456
  const hexMatch = cleanCss.match(/#[0-9a-fA-F]{3,8}\b/g)
  if (hexMatch) {
    fatal(`Hardcoded hex color (${hexMatch[0]}) found in ${proposalFolders[0]}/style.css. Use var(--color-...) design tokens instead!`)
  }
  // Forbid rgb(), rgba(), hsl(), hsla(), oklch()
  const funcColorMatch = cleanCss.match(/\b(rgb|rgba|hsl|hsla|oklch|hwb|lab|lch)\s*\(/i)
  if (funcColorMatch) {
    fatal(`Hardcoded color function (${funcColorMatch[0]}...) found in ${proposalFolders[0]}/style.css. Use var(--color-...) design tokens instead!`)
  }

  // C. Validate meta.json
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
