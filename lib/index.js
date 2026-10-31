/**
 * @dsh-external/dsh-usage-wave — host half.
 *
 * One exact route, `GET /api/usage-wave`, that answers two questions the sidebar
 * card asks every poll:
 *
 *   1. 现在这个渠道还剩多少钱 —— balance of the active provider. `deepseek-account`
 *      reads the grant DSH wrote when the account signed in (`x-dsh-auth-token`),
 *      api-key DeepSeek routes read `DEEPSEEK_API_KEY`. Providers without a
 *      readable balance endpoint answer `unsupported` instead of inventing a number.
 *
 *   2. 这段时间烧了多少 token —— one recorded read per assistant message
 *      (`inputTokens` / `cacheReadTokens` / `outputTokens` / `cacheWriteTokens`)
 *      out of the session logs DSH already writes under `$DSH_HOME/sessions`,
 *      folded into time buckets. Nothing is sampled or estimated: every point is a
 *      billed request that actually happened.
 *
 * Session files are read once and cached by (mtime, size); only a file that grew
 * is parsed again, so a poll on an idle session costs a few stat() calls.
 */
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { homedir } from 'node:os'
import { zstdDecompressSync } from 'node:zlib'

export const name = '@dsh-external/dsh-usage-wave'
export const inject = ['webServer', 'credentials', 'agentDefaultModel', 'llm']

const ROUTE = '/api/usage-wave'
const DAY_MS = 86_400_000
/** The longest window the card can draw; older points are dropped while parsing. */
const MAX_AGE_MS = 7 * DAY_MS + 3_600_000
const BALANCE_TTL_MS = 60_000
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const MAX_JSON_BYTES = 4 * 1024 * 1024

const RANGES = {
  '1h': { since: 3_600_000, bucketMs: 60_000 },
  '6h': { since: 6 * 3_600_000, bucketMs: 300_000 },
  '24h': { since: 86_400_000, bucketMs: 600_000 },
  '7d': { since: 7 * DAY_MS, bucketMs: 3_600_000 },
}
const DEFAULT_RANGE = '24h'
/** The live strip: one bucket per second for the last minute. */
const LIVE_WINDOW_MS = 60_000
const LIVE_BUCKET_MS = 1_000

const BALANCE_CODES = {
  noGrant: '还没有在这台机器上登录 DeepSeek 账号：登录后才能读到余额',
  noKey: '没有配置 DEEPSEEK_API_KEY：深度求索 API Key 路由需要它才能读余额',
  unsupported: '当前渠道没有可查询的余额接口',
  timeout: '余额接口超时',
  network: '余额接口连不上',
  http: '余额接口返回了 HTTP 错误',
  payload: '余额接口返回了无法解析的内容',
  empty: '余额接口没有返回余额',
}

/* ------------------------------------------------------------------ pricing */

/**
 * CNY per 1M tokens for the official DeepSeek routes (snapshot 2026-09-10).
 * Peak = Beijing-time weekdays 09:00–12:00 and 14:00–18:00; weekends and the
 * rest of the day bill the off-peak column. Values collected from the official
 * price page; a model the table does not cover reports no money at all.
 */
const DEEPSEEK_SCHEDULE = { offsetMinutes: 480, peakWindows: [[9, 12], [14, 18]], peakDays: 'weekdays' }
const DEEPSEEK_ALIASES = {
  'deepseek-v4-flash': 'deepseek-flash',
  'deepseek-v4-flash-vision-exp': 'deepseek-flash',
  'deepseek-v4-pro': 'deepseek-v4-pro',
}
const DEEPSEEK_MODELS = {
  'deepseek-flash': {
    standard: { input: 2, cacheRead: 0.04, cacheWrite: 0, output: 8 },
    offPeak: { input: 1, cacheRead: 0.02, cacheWrite: 0, output: 4 },
  },
  'deepseek-v4-pro': {
    standard: { input: 9, cacheRead: 0.3, cacheWrite: 0, output: 27 },
    offPeak: { input: 4.5, cacheRead: 0.15, cacheWrite: 0, output: 13.5 },
  },
  'deepseek-chat': {
    standard: { input: 2, cacheRead: 0.5, cacheWrite: 0, output: 8 },
    offPeak: { input: 2, cacheRead: 0.5, cacheWrite: 0, output: 8 },
  },
  'deepseek-reasoner': {
    standard: { input: 4, cacheRead: 1, cacheWrite: 0, output: 16 },
    offPeak: { input: 4, cacheRead: 1, cacheWrite: 0, output: 16 },
  },
}
const PRICE_TABLES = {
  'deepseek-official': { currency: 'CNY', models: DEEPSEEK_MODELS, aliases: DEEPSEEK_ALIASES },
  'deepseek-account': { currency: 'CNY', models: DEEPSEEK_MODELS, aliases: DEEPSEEK_ALIASES },
  deepseek: { currency: 'CNY', models: DEEPSEEK_MODELS, aliases: DEEPSEEK_ALIASES },
}

/** Beijing-time peak test for the billing windows above. */
function isPeakWindow(ms) {
  const beijing = new Date(ms + DEEPSEEK_SCHEDULE.offsetMinutes * 60_000)
  const day = beijing.getUTCDay()
  if (day === 0 || day === 6) return false
  const hour = beijing.getUTCHours() + beijing.getUTCMinutes() / 60
  return DEEPSEEK_SCHEDULE.peakWindows.some(([from, to]) => hour >= from && hour < to)
}

/** Prices for one request, or null when the table does not cover it. */
function priceAt(provider, model, ms) {
  const table = PRICE_TABLES[provider]
  if (!table) return null
  const id = table.aliases[model] || model
  const entry = table.models[id]
  if (!entry) return null
  const tier = isPeakWindow(ms) ? entry.standard : entry.offPeak
  return {
    input: tier.input / 1e6,
    cacheRead: tier.cacheRead / 1e6,
    cacheWrite: tier.cacheWrite / 1e6,
    output: tier.output / 1e6,
    currency: table.currency,
    model: id,
  }
}

/* ------------------------------------------------------------------ helpers */

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function sessionsRoot() {
  return join(dshHome(), 'sessions')
}

function num(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return 0
}

function isLoopbackHost(req, bindHost) {
  const raw = req.headers && req.headers.host
  if (typeof raw !== 'string' || raw === '') return false
  const host = raw.replace(/^\[/, '').replace(/\].*$/, '').split(':')[0].toLowerCase()
  if (host === 'localhost' || host === '::1' || host === '::ffff:127.0.0.1') return true
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true
  if (typeof bindHost === 'string' && bindHost !== '') {
    const bind = bindHost.replace(/^\[/, '').replace(/\].*$/, '').split(':')[0].toLowerCase()
    if (bind !== '' && bind === host) return true
  }
  return false
}

function sendJson(res, status, body) {
  if (res.headersSent) {
    res.end()
    return
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

/* ----------------------------------------------------------- session history */

/** path -> { mtimeMs, size, points } */
const fileCache = new Map()

function listSessionFiles() {
  const out = []
  const walk = (dir, depth) => {
    if (depth > 4) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(path, depth + 1)
      } else if (entry.isFile() && entry.name.endsWith('.zstd')) {
        try {
          const stat = statSync(path)
          out.push({ path, mtimeMs: stat.mtimeMs, size: stat.size })
        } catch {
          /* a file vanishing mid-scan is not an error */
        }
      }
    }
  }
  walk(sessionsRoot(), 0)
  return out
}

/** Split one file into zstd frames (DSH appends a frame per flush). */
function decodeFrames(buf) {
  const offsets = []
  let index = buf.indexOf(ZSTD_MAGIC, 0)
  while (index !== -1) {
    offsets.push(index)
    index = buf.indexOf(ZSTD_MAGIC, index + 4)
  }
  if (offsets.length === 0 || offsets[0] !== 0) offsets.unshift(0)
  offsets.push(buf.length)
  let text = ''
  for (let i = 0; i < offsets.length - 1; i += 1) {
    const segment = buf.subarray(offsets[i], offsets[i + 1])
    if (segment.length < 8) continue
    try {
      text += zstdDecompressSync(segment).toString('utf8')
    } catch {
      /* a corrupt/torn tail frame is skipped, the rest of the file still counts */
    }
  }
  return text
}

function userTextOf(data) {
  const content = data && Array.isArray(data.content) ? data.content : []
  const parts = []
  for (const block of content) {
    if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function turnRecord(map, turn, time, session) {
  const key = session + '\u0000' + turn
  let record = map.get(key)
  if (!record) {
    record = { session, turn, t: time, label: '', i: 0, w: 0, c: 0, o: 0, total: 0, cost: 0, unpriced: 0, requests: 0 }
    map.set(key, record)
  }
  if (Number.isFinite(time) && time > record.t) record.t = time
  return record
}

function parseSessionFile(file) {
  const buf = readFileSync(file.path)
  const text = decodeFrames(buf)
  const points = []
  const turns = new Map()
  const cutoff = Date.now() - MAX_AGE_MS
  const session = basename(dirname(file.path))
  let currentTurn = 0
  for (const line of text.split('\n')) {
    if (line.length < 20) continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (!event || typeof event !== 'object') continue
    const time = Number(event.time)
    if (Number.isFinite(time) && time < cutoff) continue
    const type = event.type
    if (type === 'turn/start') {
      const turnNumber = Number(event.data && event.data.turn)
      if (Number.isFinite(turnNumber)) currentTurn = turnNumber
      continue
    }
    if (type === 'user/message') {
      const source = event.data && event.data.source
      const kind = source && typeof source === 'object' && typeof source.kind === 'string' ? source.kind : ''
      if (kind !== '' && kind !== 'user') continue
      const label = userTextOf(event.data)
      if (label) {
        const record = turnRecord(turns, currentTurn, time, session)
        if (!record.label) record.label = label.slice(0, 120)
      }
      continue
    }
    if (type !== 'assistant/message') continue
    const usage = event.data && event.data.usage
    if (!usage || typeof usage !== 'object') continue
    const input = num(usage.inputTokens)
    const cache = num(usage.cacheReadTokens)
    const output = num(usage.outputTokens)
    const write = num(usage.cacheWriteTokens)
    const total = input + cache + output + write
    if (total <= 0) continue
    const source = (event.data.message && event.data.message.source) || {}
    const provider = typeof source.provider === 'string' ? source.provider : ''
    const model = typeof source.model === 'string' ? source.model : ''
    const turnNumber = Number(event.data.turn)
    const turn = Number.isFinite(turnNumber) ? turnNumber : currentTurn
    points.push({ t: time, i: input, w: write, c: cache, o: output, provider, model, turn, session })
    const record = turnRecord(turns, turn, time, session)
    record.i += input
    record.w += write
    record.c += cache
    record.o += output
    record.total += total
    record.requests += 1
    const price = priceAt(provider, model, Number.isFinite(time) ? time : Date.now())
    if (price) {
      record.cost += input * price.input + write * price.cacheWrite + cache * price.cacheRead + output * price.output
    } else {
      record.unpriced += total
    }
  }
  return { points, turns: [...turns.values()] }
}

/** Newest usage points and per-turn records across every session file, cached per file. */
function collectData() {
  const seen = new Set()
  const points = []
  const turns = []
  for (const file of listSessionFiles()) {
    seen.add(file.path)
    let entry = fileCache.get(file.path)
    if (!entry || entry.mtimeMs !== file.mtimeMs || entry.size !== file.size) {
      try {
        const parsed = parseSessionFile(file)
        entry = { mtimeMs: file.mtimeMs, size: file.size, points: parsed.points, turns: parsed.turns }
        fileCache.set(file.path, entry)
      } catch {
        continue
      }
    }
    for (const point of entry.points) points.push(point)
    for (const turn of entry.turns) turns.push(turn)
  }
  for (const path of fileCache.keys()) {
    if (!seen.has(path)) fileCache.delete(path)
  }
  points.sort((a, b) => a.t - b.t)
  turns.sort((a, b) => b.t - a.t)
  return { points, turns }
}

function bucketize(points, since, now, bucketMs, fallback) {
  const count = Math.max(1, Math.ceil((now - since) / bucketMs))
  const buckets = new Array(count)
  for (let index = 0; index < count; index += 1) {
    /* i/w/c/o are tokens; ci/cc/co are the money those buckets cost (CNY/USD as
     * the table says); u counts tokens whose model the price table cannot price. */
    buckets[index] = { t: since + index * bucketMs, i: 0, w: 0, c: 0, o: 0, ci: 0, cc: 0, co: 0, u: 0 }
  }
  for (const point of points) {
    if (point.t < since || point.t > now) continue
    const index = Math.floor((point.t - since) / bucketMs)
    const bucket = buckets[index]
    if (!bucket) continue
    bucket.i += point.i
    bucket.w += point.w
    bucket.c += point.c
    bucket.o += point.o
    const price = priceAt(point.provider || fallback.provider, point.model || fallback.model, point.t)
    if (price) {
      bucket.ci += point.i * price.input + point.w * price.cacheWrite
      bucket.cc += point.c * price.cacheRead
      bucket.co += point.o * price.output
    } else {
      bucket.u += point.i + point.w + point.c + point.o
    }
  }
  return buckets
}

function summarize(points, fallback) {
  const totals = { i: 0, w: 0, c: 0, o: 0, total: 0, requests: 0, ci: 0, cc: 0, co: 0, cost: 0, unpriced: 0 }
  for (const point of points) {
    totals.i += point.i
    totals.w += point.w
    totals.c += point.c
    totals.o += point.o
    totals.total += point.i + point.w + point.c + point.o
    totals.requests += 1
    const price = priceAt(point.provider || fallback.provider, point.model || fallback.model, point.t)
    if (price) {
      totals.ci += point.i * price.input + point.w * price.cacheWrite
      totals.cc += point.c * price.cacheRead
      totals.co += point.o * price.output
    } else {
      totals.unpriced += point.i + point.w + point.c + point.o
    }
  }
  totals.cost = totals.ci + totals.cc + totals.co
  const prompt = totals.i + totals.w + totals.c
  totals.cacheRate = prompt > 0 ? totals.c / prompt : null
  return totals
}

/* ------------------------------------------------------------------ balance */

let balanceCache = { at: 0, key: '', value: null }
/** Browser-side fetches seen so far: proves the card module actually mounted. */
let clientPings = 0
/** Last layout self-report from the card (diagnostics only, no UI dependency). */
let lastDiag = null

function currencySymbol(currency) {
  if (currency === 'CNY' || currency === 'RMB') return '¥'
  if (currency === 'USD') return '$'
  return currency ? currency + ' ' : ''
}

async function readDeepSeekGrant(ctx) {
  const credentials = ctx.get('credentials')
  if (!credentials || typeof credentials.readRecord !== 'function') return null
  try {
    const record = await credentials.readRecord('deepseek-account-platform/default')
    const token = record && record.payload && record.payload.token
    return typeof token === 'string' && token.trim() !== '' ? token.trim() : null
  } catch {
    return null
  }
}

async function resolveProviderKey(ctx, refs) {
  const credentials = ctx.get('credentials')
  if (!credentials || typeof credentials.resolve !== 'function') return null
  for (const ref of refs) {
    try {
      const hit = await credentials.resolve(ref)
      const value = hit && typeof hit.value === 'string' ? hit.value.trim() : ''
      if (value !== '') return value
    } catch {
      /* try the next reference */
    }
  }
  return null
}

async function fetchBalance(url, headers) {
  let response
  try {
    response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(12_000) })
  } catch (error) {
    const name = error && error.name
    return { ok: false, code: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network' }
  }
  if (!response.ok) return { ok: false, code: 'http', status: response.status }
  let body
  try {
    body = await response.json()
  } catch {
    return { ok: false, code: 'payload' }
  }
  const infos = body && Array.isArray(body.balance_infos) ? body.balance_infos : []
  const first = infos[0]
  if (!first) return { ok: false, code: 'empty' }
  const total = Number(first.total_balance)
  if (!Number.isFinite(total)) return { ok: false, code: 'payload' }
  return {
    ok: true,
    code: 'ok',
    total,
    currency: typeof first.currency === 'string' ? first.currency.trim() : '',
    available: body.is_available !== false,
  }
}

function providerName(ctx, id) {
  try {
    const llm = ctx.get('llm')
    if (llm && typeof llm.listProviders === 'function') {
      const hit = llm.listProviders().find((item) => item && item.id === id)
      if (hit) return hit.name || hit.label || id
    }
  } catch {
    /* fall through to the id */
  }
  return id
}

async function readBalance(ctx, providerId) {
  const key = providerId
  const now = Date.now()
  if (balanceCache.key === key && now - balanceCache.at < BALANCE_TTL_MS) return balanceCache.value

  let value
  if (providerId.startsWith('deepseek-account')) {
    const token = await readDeepSeekGrant(ctx)
    if (!token) {
      value = { ok: false, code: 'noGrant', message: BALANCE_CODES.noGrant }
    } else {
      const result = await fetchBalance('https://api.deepseek.com/user/balance', {
        'x-dsh-auth-token': token,
        accept: 'application/json',
      })
      value = result.ok
        ? { ok: true, code: 'ok', total: result.total, currency: result.currency, available: result.available, source: 'deepseek-account' }
        : { ok: false, code: result.code, message: BALANCE_CODES[result.code] || BALANCE_CODES.network, status: result.status }
    }
  } else if (providerId.startsWith('deepseek')) {
    const apiKey = await resolveProviderKey(ctx, ['DEEPSEEK_API_KEY'])
    if (!apiKey) {
      value = { ok: false, code: 'noKey', message: BALANCE_CODES.noKey }
    } else {
      const base = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')
      const result = await fetchBalance(base + '/user/balance', {
        authorization: 'Bearer ' + apiKey,
        accept: 'application/json',
      })
      value = result.ok
        ? { ok: true, code: 'ok', total: result.total, currency: result.currency, available: result.available, source: 'api-key' }
        : { ok: false, code: result.code, message: BALANCE_CODES[result.code] || BALANCE_CODES.network, status: result.status }
    }
  } else {
    value = { ok: false, code: 'unsupported', message: BALANCE_CODES.unsupported }
  }

  if (value && value.ok) {
    value.symbol = currencySymbol(value.currency)
    value.updatedAt = now
  }
  balanceCache = { at: now, key, value }
  return value
}

/* ------------------------------------------------------------------- service */

async function buildPayload(ctx, rangeId) {
  const range = RANGES[rangeId] || RANGES[DEFAULT_RANGE]
  const now = Date.now()
  const since = now - range.since

  let providerId = ''
  let model = ''
  try {
    const selection = ctx.get('agentDefaultModel')
    const current = selection && typeof selection.currentSelection === 'function' ? selection.currentSelection() : null
    if (current) {
      if (typeof current.provider === 'string') providerId = current.provider
      if (typeof current.model === 'string') model = current.model
    }
  } catch {
    /* selection unavailable: the card just omits the route name */
  }
  const fallback = { provider: providerId, model }
  const collected = collectData()
  const allPoints = collected.points

  const points = allPoints.filter((point) => point.t >= since)
  const buckets = bucketize(points, since, now, range.bucketMs, fallback)
  const totals = summarize(points, fallback)

  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const today = summarize(allPoints.filter((point) => point.t >= midnight.getTime()), fallback)

  /* Average price actually paid in the last day drives the "balance still buys
   * this many tokens" reading — cache-heavy traffic makes it far larger than the
   * list price of a cache miss would suggest. */
  const day = summarize(allPoints.filter((point) => point.t >= now - DAY_MS), fallback)

  const currentPrice = priceAt(providerId, model, now)
  const balance = providerId
    ? await readBalance(ctx, providerId)
    : { ok: false, code: 'unsupported', message: BALANCE_CODES.unsupported }

  let remaining = null
  if (balance && balance.ok && day.total > 0 && day.cost > 0) {
    const avg = day.cost / day.total
    remaining = {
      tokens: Math.max(0, Math.round(balance.total / avg)),
      avgCostPerToken: avg,
      basis: '24h',
    }
  }

  const turns = collected.turns.slice(0, 24).map((turn) => ({
    t: turn.t,
    label: turn.label,
    tokens: turn.total,
    cost: turn.unpriced > 0 && turn.cost === 0 ? null : turn.cost,
    unpriced: turn.unpriced,
    requests: turn.requests,
  }))

  return {
    ok: true,
    now,
    range: { id: rangeId in RANGES ? rangeId : DEFAULT_RANGE, since, bucketMs: range.bucketMs },
    provider: { id: providerId, name: providerId ? providerName(ctx, providerId) : '' },
    model,
    /* Money is only ever reported for a model the price table covers. */
    pricing: {
      known: currentPrice !== null,
      currency: currentPrice ? currentPrice.currency : 'CNY',
      symbol: currentPrice ? currencySymbol(currentPrice.currency) : '¥',
      model: currentPrice ? currentPrice.model : null,
      peak: isPeakWindow(now),
      asOf: '2026-09-10',
    },
    balance,
    remaining,
    buckets,
    totals,
    today,
    turns,
    clientPings,
    lastDiag,
  }
}

/**
 * Per-second token consumption for the last two minutes.
 *
 * Reads the same cached points as the main payload — one bucket per second, so
 * the panel can draw a strip that moves every second without polling anything
 * heavier.
 */
function buildLivePayload() {
  const now = Date.now()
  const since = now - LIVE_WINDOW_MS
  const count = Math.floor(LIVE_WINDOW_MS / LIVE_BUCKET_MS)
  const tokens = new Array(count).fill(0)
  let total = 0
  let requests = 0
  let last = 0
  for (const point of collectData().points) {
    if (point.t < since) continue
    const index = Math.floor((point.t - since) / LIVE_BUCKET_MS)
    const bucket = tokens[index]
    if (bucket === undefined) continue
    const value = point.i + point.w + point.c + point.o
    tokens[index] = bucket + value
    total += value
    requests += 1
    if (point.t > last) last = point.t
  }
  return {
    ok: true,
    now,
    since,
    bucketMs: LIVE_BUCKET_MS,
    tokens,
    total,
    requests,
    lastActivity: last || null,
  }
}

export function apply(ctx) {
  const bindHost = ctx.webServer && typeof ctx.webServer.host === 'string' ? ctx.webServer.host : ''

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: async (req, res) => {
      try {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          sendJson(res, 405, { ok: false, error: 'method' })
          return
        }
        if (!isLoopbackHost(req, bindHost)) {
          sendJson(res, 403, { ok: false, error: 'forbidden' })
          return
        }
        const url = new URL(req.url || ROUTE, 'http://localhost')
        if (url.searchParams.get('source') === 'card') clientPings += 1
        const diagParam = url.searchParams.get('diag')
        if (diagParam) {
          try {
            lastDiag = JSON.parse(diagParam)
          } catch {
            lastDiag = { error: 'unparsable diag' }
          }
        }
        const rangeId = url.searchParams.get('range') || DEFAULT_RANGE
        if (url.searchParams.get('live') === '1') {
          sendJson(res, 200, buildLivePayload())
          return
        }
        const payload = await buildPayload(ctx, rangeId)
        const body = JSON.stringify(payload)
        if (body.length > MAX_JSON_BYTES) {
          payload.buckets = payload.buckets.slice(-600)
          sendJson(res, 200, payload)
          return
        }
        sendJson(res, 200, payload)
      } catch (error) {
        sendJson(res, 500, { ok: false, error: 'internal', message: String(error && error.message ? error.message : error).slice(0, 200) })
      }
    },
  }), 'dsh-usage-wave: usage route')
}
