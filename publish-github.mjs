/**
 * Publish dsh-usage-wave to GitHub without git: create repo, commit files through
 * the Contents API, cut a release and attach the packed tgz.
 *
 *   node publish-github.mjs            # uses $env:GH_TOKEN or ../.gh-token
 *   node publish-github.mjs --dry-run
 *
 * Everything is idempotent: an existing repo/file/release is updated, not duplicated.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const API = 'https://api.github.com'
const DRY = process.argv.includes('--dry-run')
const REPO = process.env.GH_REPO || 'dsh-usage-wave'
const DESCRIPTION = 'DeepSeek Harness 余额 + 用量波形面板：侧栏底部余额/剩余 token 卡片 + 贴左侧的用量面板（1h/6h/24h/7d 堆叠波形、实时 tok/s、逐指令消耗）。'

function token() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim()
  for (const candidate of [join(HERE, '.gh-token'), join(ROOT, '.gh-token')]) {
    try {
      const value = readFileSync(candidate, 'utf8').trim()
      if (value) return value
    } catch {
      /* keep looking */
    }
  }
  throw new Error('no token: set GH_TOKEN or write it to dsh-usage-wave/publish/.gh-token')
}

const TOKEN = token()
const HEADERS = {
  authorization: 'Bearer ' + TOKEN,
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'dsh-usage-wave-publisher',
}

async function api(method, path, body) {
  let lastError = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await apiOnce(method, path, body)
    } catch (error) {
      lastError = error
      /* only transport failures are worth retrying; an HTTP status is an answer */
      if (!/fetch failed|ECONN|socket|network|aborted/i.test(String(error && error.message))) throw error
      await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)))
    }
  }
  throw lastError
}

async function apiOnce(method, path, body) {
  const response = await fetch(API + path, {
    method,
    headers: Object.assign({}, HEADERS, body ? { 'content-type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!response.ok && response.status !== 404) {
    throw new Error(method + ' ' + path + ' -> ' + response.status + ' ' + JSON.stringify(data).slice(0, 300))
  }
  return { status: response.status, data }
}

/* files that make up the published package (lib/, manifest, docs, screenshots) */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry.endsWith('.tgz') || entry === '.gh-token') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

async function main() {
  const me = await api('GET', '/user')
  const owner = me.data.login
  console.log('actor:', owner, DRY ? '(dry run)' : '')
  if (DRY) return

  const existing = await api('GET', '/repos/' + owner + '/' + REPO)
  if (existing.status === 200) {
    console.log('repo exists:', owner + '/' + REPO)
  } else {
    const created = await api('POST', '/user/repos', {
      name: REPO,
      description: DESCRIPTION,
      private: false,
      has_issues: true,
      has_wiki: false,
      auto_init: false,
    })
    console.log('repo created:', created.data.html_url)
  }

  for (const file of walk(HERE)) {
    const path = relative(HERE, file).split('\\').join('/')
    const content = readFileSync(file).toString('base64')
    let sha = null
    const current = await api('GET', '/repos/' + owner + '/' + REPO + '/contents/' + posix.normalize(path))
    if (current.status === 200 && current.data && current.data.sha) sha = current.data.sha
    await api('PUT', '/repos/' + owner + '/' + REPO + '/contents/' + posix.normalize(path), {
      message: 'chore: ' + (sha ? 'update ' : 'add ') + path,
      content,
      sha: sha || undefined,
    })
    console.log('  put', path, sha ? '(update)' : '(new)')
  }

  const manifest = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8'))
  const tag = 'v' + manifest.version
  const tgzName = manifest.name + '-' + manifest.version + '.tgz'
  const tgz = readFileSync(join(HERE, tgzName))
  const releases = await api('GET', '/repos/' + owner + '/' + REPO + '/releases/tags/' + tag)
  let release = releases.status === 200 ? releases.data : null
  if (!release) {
    const made = await api('POST', '/repos/' + owner + '/' + REPO + '/releases', {
      tag_name: tag,
      name: tag,
      target_commitish: 'main',
      body: '第一个公开版本：余额 + 剩余 tok 卡片、用量面板（1h/6h/24h/7d 堆叠波形、实时 tok/s、逐指令消耗）。',
    })
    release = made.data
    console.log('release created:', release.html_url)
  } else {
    console.log('release exists:', release.html_url)
  }
  const assets = await api('GET', '/repos/' + owner + '/' + REPO + '/releases/' + release.id + '/assets')
  const hasAsset = Array.isArray(assets.data) && assets.data.some((asset) => asset.name === tgzName)
  if (!hasAsset) {
    const upload = await fetch('https://uploads.github.com/repos/' + owner + '/' + REPO + '/releases/' + release.id + '/assets?name=' + encodeURIComponent(tgzName), {
      method: 'POST',
      headers: Object.assign({}, HEADERS, { 'content-type': 'application/octet-stream' }),
      body: tgz,
    })
    if (!upload.ok) throw new Error('asset upload failed: ' + upload.status)
    console.log('  asset uploaded:', tgzName)
  } else {
    console.log('  asset exists:', tgzName)
  }

  console.log('done:', 'https://github.com/' + owner + '/' + REPO)
}

main().catch((error) => {
  console.error('FAILED:', error.message)
  process.exit(1)
})
