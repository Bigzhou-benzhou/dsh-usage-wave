/**
 * @dsh-external/dsh-usage-wave — browser half.
 *
 * A left-docked usage panel (default open, collapsible) plus the sidebar footer
 * card that toggles it. Everything comes from the host route:
 *
 *   · 余额 — the active provider's balance;
 *   · 剩余 — how many tokens that balance still buys, at the average price the
 *     last day of traffic actually paid (cache-heavy traffic, not the list price);
 *   · 波形 — stacked token / money waveform over 1h / 6h / 24h / 7d;
 *   · 指令消耗 — per user command: total tokens and the money they cost.
 *
 * The panel sits in the empty gutter left of the conversation column (the same
 * place the sidebar leaves free), so it never covers the transcript.
 */
window.__ModuleLoader__.load({
  id: '@dsh-external/dsh-usage-wave',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const SLOT = 'sidebar.footer.action'
    const CELL = 'usage-wave'
    const ORDER = 120
    const PATH = '/api/usage-wave'
    const POLL_MS = 15_000
    const OPEN_KEY = 'dsh-usage-wave/panel/v1'
    const RANGES = [
      { id: '1h', label: '1 小时', short: '1h' },
      { id: '6h', label: '6 小时', short: '6h' },
      { id: '24h', label: '24 小时', short: '24h' },
      { id: '7d', label: '7 天', short: '7天' },
    ]

    const COLORS = {
      c: 'var(--duw-cache, #4c8dff)',
      i: 'var(--duw-input, #1fc2a0)',
      o: 'var(--duw-output, #ff9f43)',
    }
    const TOKEN_SERIES = [
      { key: 'c', label: '缓存读', color: COLORS.c },
      { key: 'i', label: '新输入', color: COLORS.i },
      { key: 'o', label: '输出', color: COLORS.o },
    ]
    const COST_SERIES = [
      { key: 'cc', label: '缓存读', color: COLORS.c },
      { key: 'ci', label: '新输入', color: COLORS.i },
      { key: 'co', label: '输出', color: COLORS.o },
    ]

    const CSS = `
.duw-card{display:flex;width:100%;min-width:0}
.duw-btn{position:relative;display:flex;align-items:center;gap:11px;width:100%;min-width:0;padding:9px 11px 9px 15px;border:1px solid rgba(76,141,255,.20);border-radius:12px;background:linear-gradient(135deg,rgba(76,141,255,.13),rgba(31,194,160,.10));box-shadow:0 1px 2px rgba(16,24,40,.04),0 6px 18px rgba(76,141,255,.10);color:var(--dsw-alias-label-primary,#111);font:inherit;cursor:pointer;text-align:left;transition:background .18s ease,border-color .18s ease,box-shadow .18s ease,transform .18s ease;overflow:hidden}
.duw-btn::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,#4c8dff,#1fc2a0)}
.duw-btn:hover{transform:translateY(-1px);border-color:rgba(76,141,255,.48);box-shadow:0 5px 18px rgba(76,141,255,.18);background:linear-gradient(135deg,rgba(76,141,255,.18),rgba(31,194,160,.13))}
.duw-btn[data-compact="1"]{justify-content:center;padding:6px 0}
.duw-grow{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1 1 auto}
.duw-end{display:flex;flex-direction:column;gap:1px;min-width:0;flex:0 0 auto;align-items:flex-end;margin-left:auto}
.duw-lbl{font-size:10px;letter-spacing:.6px;line-height:1.3;color:var(--dsw-alias-label-tertiary,#8a8f99);white-space:nowrap}
.duw-big{font-size:18px;font-weight:750;letter-spacing:.2px;line-height:1.08;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--dsw-alias-label-primary,#111)}
.duw-big[data-error="1"]{font-size:12px;font-weight:500;color:var(--dsw-alias-label-tertiary,#8a8f99)}
.duw-cur{font-size:12px;font-weight:600;opacity:.5;margin-right:1px;letter-spacing:0}
.duw-mid{font-size:15px;font-weight:700;letter-spacing:.1px;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap;color:#12a08a}
.duw-mid[data-warn="1"]{color:var(--dsw-alias-state-warn-primary,#c77700)}
.duw-mid[data-error="1"]{font-size:12px;font-weight:500;color:var(--dsw-alias-label-tertiary,#8a8f99)}
.duw-vline{flex:0 0 auto;width:1px;align-self:stretch;min-height:22px;background:linear-gradient(180deg,transparent,var(--dsw-alias-border-l1,rgba(0,0,0,.16)),transparent)}
.duw-chev{flex:0 0 auto;margin-left:1px;font-size:14px;line-height:1;color:var(--dsw-alias-label-tertiary,#8a8f99);opacity:.7}
.duw-side{position:fixed;box-sizing:border-box;z-index:40;pointer-events:auto;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.10));border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#111);box-shadow:0 10px 30px rgba(20,30,50,.10);padding:11px 12px 10px;font-size:12px}
.duw-side>*{flex:0 0 auto}
.duw-side>.duw-cmds{flex:1 1 auto;min-height:36px}
.duw-side[data-compact="1"]{padding:9px 9px 7px;font-size:11.5px}
.duw-side[data-compact="1"] .duw-cards{gap:6px}
.duw-side[data-compact="1"] .duw-cardstat{padding:6px 7px 5px 9px}
.duw-side[data-compact="1"] .duw-cs-val{font-size:15px}
.duw-side[data-compact="1"] .duw-cs-lbl,.duw-side[data-compact="1"] .duw-cs-hint{font-size:9px}
.duw-side[data-compact="1"] .duw-title{font-size:12px}
.duw-side[data-compact="1"] .duw-tab{padding:2px 6px;font-size:10px}
.duw-hd{display:flex;align-items:center;gap:7px}
.duw-title{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:750;letter-spacing:.3px}
.duw-title::before{content:"";width:7px;height:7px;border-radius:50%;background:linear-gradient(135deg,#4c8dff,#1fc2a0);box-shadow:0 0 0 3px rgba(76,141,255,.12)}
.duw-peak{font-size:9.5px;font-weight:600;letter-spacing:.2px;padding:2px 7px;border-radius:999px;background:rgba(31,194,160,.12);color:#0f9c85}
.duw-peak[data-peak="1"]{background:rgba(255,159,67,.14);color:var(--dsw-alias-state-warn-primary,#c77700)}
.duw-x{margin-left:auto;flex:0 0 auto;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8f99);cursor:pointer;font:inherit;font-size:15px;line-height:1}
.duw-x:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.10));color:var(--dsw-alias-label-primary,#111)}
.duw-route{margin:4px 0 9px;font-size:10px;letter-spacing:.2px;color:var(--dsw-alias-label-tertiary,#8a8f99);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.duw-cards{display:flex;gap:7px;margin-bottom:9px}
.duw-cardstat{position:relative;flex:1 1 0;min-width:0;padding:7px 8px 6px 10px;border-radius:10px;background:linear-gradient(135deg,rgba(76,141,255,.12),rgba(31,194,160,.09));border:1px solid rgba(76,141,255,.16);overflow:hidden}
.duw-cardstat::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:linear-gradient(180deg,#4c8dff,#1fc2a0)}
.duw-cs-lbl{display:block;font-size:9.5px;letter-spacing:.5px;color:var(--dsw-alias-label-tertiary,#8a8f99);white-space:nowrap}
.duw-cs-val{display:block;margin-top:1px;font-size:16px;font-weight:750;line-height:1.15;letter-spacing:.1px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-primary,#111)}
.duw-cs-val[data-small="1"]{font-size:13.5px}
.duw-cs-val[data-teal="1"]{color:#12a08a}
.duw-cs-val[data-warn="1"]{color:var(--dsw-alias-state-warn-primary,#c77700)}
.duw-cs-hint{display:block;margin-top:1px;font-size:9px;color:var(--dsw-alias-label-tertiary,#8a8f99);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.duw-bar{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.duw-seg{display:flex;gap:2px;padding:2px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.08))}
.duw-tab{padding:3px 7px;border:none;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary,#5b616b);font:inherit;font-size:10.5px;cursor:pointer;white-space:nowrap;transition:background .15s ease,color .15s ease}
.duw-tab:hover{background:rgba(127,127,127,.12)}
.duw-tab[data-on="1"]{background:var(--dsw-alias-label-primary,#1a1a1a);color:var(--dsw-alias-bg-layer-1,#fff);font-weight:600;box-shadow:0 1px 4px rgba(0,0,0,.18)}
.duw-tab:disabled{opacity:.35;cursor:default}
.duw-mode{margin-left:auto;flex:0 0 auto;padding:3px 8px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary,#5b616b);font:inherit;font-size:10.5px;cursor:pointer;white-space:nowrap}
.duw-mode[data-on="1"]{border-color:rgba(76,141,255,.45);background:rgba(76,141,255,.10);color:#2f6fe0;font-weight:600}
.duw-mode:disabled{opacity:.35;cursor:default}
.duw-chart{position:relative;width:100%}
.duw-chart svg{width:100%;height:auto;display:block;overflow:visible}
.duw-empty{height:110px;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--dsw-alias-label-tertiary,#8a8f99);font-size:11px;padding:0 16px}
.duw-legend{display:flex;flex-wrap:wrap;align-items:center;gap:3px 9px;margin-top:5px;font-size:9.5px;color:var(--dsw-alias-label-secondary,#5b616b)}
.duw-legend-item{display:flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums}
.duw-dot{width:6px;height:6px;border-radius:2px;flex:0 0 auto}
.duw-cache{margin-left:auto;font-size:9px;color:var(--dsw-alias-label-tertiary,#8a8f99);font-variant-numeric:tabular-nums;white-space:nowrap}
.duw-foot{display:flex;justify-content:space-between;gap:6px;margin-top:7px;padding:6px 0;border-top:1px dashed var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-bottom:1px dashed var(--dsw-alias-border-l1,rgba(0,0,0,.12));font-size:9.5px;letter-spacing:.2px;color:var(--dsw-alias-label-tertiary,#8a8f99)}
.duw-foot b{font-weight:600;color:var(--dsw-alias-label-secondary,#5b616b)}
.duw-tip{position:absolute;top:0;transform:translateX(-50%);pointer-events:none;background:var(--dsw-alias-bg-layer-2,#1f232b);color:var(--dsw-alias-label-primary,#fff);border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.14));border-radius:8px;padding:5px 7px;font-size:10px;line-height:1.5;white-space:nowrap;z-index:2;font-variant-numeric:tabular-nums;box-shadow:0 6px 18px rgba(0,0,0,.18)}
.duw-tip-row{display:flex;gap:8px;justify-content:space-between}
.duw-tip-time{font-weight:600;margin-bottom:2px}
.duw-cmds{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;margin-top:9px;padding-top:8px;border-top:1px dashed var(--dsw-alias-border-l1,rgba(0,0,0,.12))}
.duw-cmds-head{display:flex;justify-content:space-between;align-items:baseline;font-size:10px;font-weight:600;letter-spacing:.3px;color:var(--dsw-alias-label-secondary,#5b616b);margin-bottom:3px}
.duw-cmds-head span{font-weight:400;letter-spacing:0;color:var(--dsw-alias-label-tertiary,#8a8f99)}
.duw-cmds-scroll{flex:1 1 auto;min-height:0;overflow:auto;margin:0 -5px;padding:0 5px}
.duw-cmd{display:flex;align-items:flex-start;gap:7px;padding:5px 4px;border-radius:7px;transition:background .15s ease}
.duw-cmd:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.07))}
.duw-cmd-main{flex:1 1 auto;min-width:0}
.duw-cmd-label{font-size:10.5px;line-height:1.35;color:var(--dsw-alias-label-primary,#111);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.duw-cmd-time{font-size:9px;color:var(--dsw-alias-label-tertiary,#8a8f99);margin-top:1px;font-variant-numeric:tabular-nums}
.duw-cmd-val{flex:0 0 auto;text-align:right;font-size:9.5px;color:var(--dsw-alias-label-tertiary,#8a8f99);font-variant-numeric:tabular-nums;line-height:1.35}
.duw-cmd-val b{font-weight:700;color:var(--dsw-alias-label-primary,#111)}
.duw-handle{position:fixed;z-index:40;pointer-events:auto;writing-mode:vertical-rl;letter-spacing:2px;font-size:11px;padding:10px 4px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.12));border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#5b616b);box-shadow:0 6px 18px rgba(0,0,0,.12);cursor:pointer;font-family:inherit}
.duw-handle:hover{background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1))}
.duw-live{margin-top:8px}
.duw-live-head{display:flex;justify-content:space-between;gap:6px;font-size:9.5px;color:var(--dsw-alias-label-tertiary,#8a8f99);margin-bottom:3px;font-variant-numeric:tabular-nums}
.duw-live-head b{color:var(--dsw-alias-label-secondary,#5b616b);font-weight:600}
.duw-live svg{width:100%;height:auto;display:block}
`

    /* ------------------------------------------------------------- formatting */

    function fmtTokens(value) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '0'
      if (value >= 1e9) return (value / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B'
      if (value >= 1e6) return (value / 1e6).toFixed(value >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M'
      if (value >= 1e3) return (value / 1e3).toFixed(value >= 1e5 ? 0 : 1).replace(/\.?0+$/, '') + 'k'
      return String(Math.round(value))
    }

    /** Split the balance into symbol + number so the symbol can be de-emphasized. */
    function fmtMoneyParts(balance) {
      if (!balance || typeof balance !== 'object' || !balance.ok) return null
      if (typeof balance.total !== 'number' || !Number.isFinite(balance.total)) return null
      const symbol = typeof balance.symbol === 'string' && balance.symbol !== '' ? balance.symbol : '¥'
      return { sym: symbol, num: balance.total.toFixed(balance.total >= 100 ? 1 : 2) }
    }

    function fmtCost(value, symbol) {
      const mark = symbol || '¥'
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return mark + '0'
      if (value >= 100) return mark + value.toFixed(0)
      if (value >= 1) return mark + value.toFixed(2)
      if (value >= 0.01) return mark + value.toFixed(3)
      return mark + value.toFixed(4)
    }

    function pad2(value) {
      return value < 10 ? '0' + value : String(value)
    }

    function fmtClock(ms, withDate) {
      const date = new Date(ms)
      const time = pad2(date.getHours()) + ':' + pad2(date.getMinutes())
      return withDate ? date.getMonth() + 1 + '-' + pad2(date.getDate()) + ' ' + time : time
    }

    function fmtPercent(rate) {
      if (typeof rate !== 'number' || !Number.isFinite(rate)) return '—'
      return (rate * 100).toFixed(rate >= 0.995 ? 1 : 0) + '%'
    }

    /* ------------------------------------------------------------ data store */

    let snapshot = { data: null, error: null, rangeId: '24h' }
    const listeners = new Set()
    let pollTimer = null
    let inflight = false

    function notify() {
      for (const listener of [...listeners]) {
        try {
          listener(snapshot)
        } catch {
          /* one broken surface must not break the others */
        }
      }
    }

    async function fetchUsage(rangeId) {
      const response = await fetch(PATH + '?range=' + encodeURIComponent(rangeId) + '&source=card', { cache: 'no-store' })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      const data = await response.json()
      if (!data || data.ok !== true) throw new Error((data && data.message) || '接口不可用')
      return data
    }

    async function refresh() {
      if (inflight) return
      if (typeof document !== 'undefined' && document.hidden) return
      inflight = true
      try {
        const data = await fetchUsage(snapshot.rangeId)
        snapshot = { data, error: null, rangeId: snapshot.rangeId }
      } catch (cause) {
        snapshot = { data: snapshot.data, error: String(cause && cause.message ? cause.message : cause), rangeId: snapshot.rangeId }
      } finally {
        inflight = false
        notify()
      }
    }

    function setRange(rangeId) {
      if (snapshot.rangeId === rangeId) return
      snapshot = { data: snapshot.data, error: snapshot.error, rangeId }
      notify()
      void refresh()
    }

    function subscribe(listener) {
      listeners.add(listener)
      if (pollTimer === null) {
        pollTimer = setInterval(() => { void refresh() }, POLL_MS)
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) void refresh()
          })
        }
        void refresh()
      }
      listener(snapshot)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && pollTimer !== null) {
          clearInterval(pollTimer)
          pollTimer = null
        }
      }
    }

    function useUsage() {
      const [state, setState] = React.useState(snapshot)
      React.useEffect(() => subscribe((next) => setState(Object.assign({}, next))), [])
      return state
    }

    /* ---------------------------------------------------------------- chart */

    function WaveChart(props) {
      const buckets = Array.isArray(props.buckets) ? props.buckets : []
      const rangeId = props.rangeId || '24h'
      const mode = props.mode === 'cost' ? 'cost' : 'token'
      const compact = props.compact === true
      const symbol = props.symbol || '¥'
      const series = mode === 'cost' ? COST_SERIES : TOKEN_SERIES
      const [hover, setHover] = React.useState(-1)

      const n = buckets.length
      let peak = 0
      for (const bucket of buckets) {
        let total = 0
        for (const item of series) total += (bucket && bucket[item.key]) || 0
        if (total > peak) peak = total
      }

      if (n === 0 || peak <= 0) {
        return h('div', { className: 'duw-empty' }, mode === 'cost' ? '这段时间没有可计价的请求。' : '这段时间还没有 token 记录。')
      }

      /* The panel is only ~196px wide, so the viewBox is authored at 1:1 with
       * the rendered width — axis text stays ~7.5px instead of being scaled
       * down to a fraction of a pixel. */
      const W = 204
      const H = compact ? 92 : 104
      const padL = compact ? 32 : (mode === 'cost' ? 40 : 32)
      const padR = 5
      const padT = compact ? 6 : 7
      const padB = compact ? 13 : 14
      const plotW = W - padL - padR
      const plotH = H - padT - padB
      const max = peak * 1.1
      const x = (index) => padL + plotW * ((index + 0.5) / n)
      const y = (value) => padT + plotH * (1 - Math.min(1, value / max))
      const label = (value) => (mode === 'cost' ? fmtCost(value, symbol) : fmtTokens(value))

      const layers = []
      const cumulative = new Array(n).fill(0)
      for (const item of series) {
        const upper = []
        const lower = []
        for (let index = 0; index < n; index += 1) {
          const value = (buckets[index] && buckets[index][item.key]) || 0
          lower.push(cumulative[index])
          upper.push(cumulative[index] + value)
          cumulative[index] = upper[index]
        }
        let forward = ''
        for (let index = 0; index < n; index += 1) forward += (index === 0 ? 'M' : 'L') + x(index).toFixed(1) + ',' + y(upper[index]).toFixed(1)
        let back = ''
        for (let index = n - 1; index >= 0; index -= 1) back += 'L' + x(index).toFixed(1) + ',' + y(lower[index]).toFixed(1)
        layers.push({ key: item.key, color: item.color, path: forward + back + 'Z', top: forward })
      }

      const gridLines = []
      for (let tick = 0; tick <= 3; tick += 1) {
        const value = (peak * tick) / 3
        const yy = y(value)
        gridLines.push(h('line', {
          key: 'g' + tick,
          x1: padL, x2: W - padR, y1: yy, y2: yy,
          stroke: 'var(--dsw-alias-border-l1,rgba(127,127,127,.16))',
          strokeDasharray: tick === 0 ? '0' : '3 3',
          strokeWidth: 1,
        }))
        gridLines.push(h('text', {
          key: 'gl' + tick,
          x: padL - 4, y: yy + 2.6,
          textAnchor: 'end', fontSize: 7.5,
          fill: 'var(--dsw-alias-label-tertiary,#8a8f99)',
          style: { fontVariantNumeric: 'tabular-nums' },
        }, label(value)))
      }

      const withDate = rangeId === '7d'
      const labelCount = 4
      const xLabels = []
      for (let tick = 0; tick < labelCount; tick += 1) {
        const ratio = tick / (labelCount - 1)
        const index = Math.min(n - 1, Math.round(ratio * (n - 1)))
        const bucket = buckets[index]
        if (!bucket) continue
        xLabels.push(h('text', {
          key: 'xl' + tick,
          x: x(index),
          y: H - 3.5,
          textAnchor: tick === 0 ? 'start' : tick === labelCount - 1 ? 'end' : 'middle',
          fontSize: 7.5,
          fill: 'var(--dsw-alias-label-tertiary,#8a8f99)',
        }, fmtClock(bucket.t, withDate)))
      }

      const markers = []
      if (hover >= 0 && hover < n) {
        const px = x(hover)
        markers.push(h('line', {
          key: 'cross',
          x1: px, x2: px, y1: padT, y2: padT + plotH,
          stroke: 'var(--dsw-alias-label-tertiary,#8a8f99)',
          strokeDasharray: '2 2',
          strokeWidth: 1,
        }))
      }

      const onMove = (event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        if (!rect.width) return
        const relative = ((event.clientX - rect.left) / rect.width) * W
        const index = Math.round((((relative - padL) / plotW) * n) - 0.5)
        setHover(index >= 0 && index < n ? index : -1)
      }

      let tooltip = null
      if (hover >= 0 && hover < n && buckets[hover]) {
        const bucket = buckets[hover]
        const rows = series.map((item) => h('div', { className: 'duw-tip-row', key: item.key },
          h('span', null, item.label),
          h('span', null, label(bucket[item.key] || 0))))
        const total = series.reduce((sum, item) => sum + ((bucket && bucket[item.key]) || 0), 0)
        rows.push(h('div', { className: 'duw-tip-row', key: 'total', style: { borderTop: '1px solid rgba(127,127,127,.3)', marginTop: 2, paddingTop: 2 } },
          h('span', null, '合计'), h('span', null, label(total))))
        const pct = Math.min(96, Math.max(4, (x(hover) / W) * 100))
        tooltip = h('div', { className: 'duw-tip', style: { left: pct + '%', top: 0 } },
          h('div', { className: 'duw-tip-time' }, fmtClock(bucket.t, withDate)),
          rows)
      }

      return h('div', { className: 'duw-chart' },
        h('svg', { viewBox: '0 0 ' + W + ' ' + H, onMouseMove: onMove, onMouseLeave: () => setHover(-1), role: 'img', 'aria-label': mode === 'cost' ? '花费曲线' : 'token 消耗波形' },
          gridLines,
          h('g', null, layers.map((layer) => h('path', { key: layer.key, d: layer.path, fill: layer.color, fillOpacity: 0.55 }))),
          h('g', null, layers.map((layer) => h('path', { key: 'l' + layer.key, d: layer.top, fill: 'none', stroke: layer.color, strokeWidth: 1.3, vectorEffect: 'non-scaling-stroke' }))),
          markers,
          xLabels),
        tooltip)
    }

    /* ------------------------------------------------------------ turns list */

    function TurnsList(props) {
      const turns = Array.isArray(props.turns) ? props.turns : []
      const symbol = props.symbol || '¥'
      if (turns.length === 0) {
        return h('div', { className: 'duw-empty', style: { height: 70 } }, '还没有可拆分的指令记录')
      }
      return h('div', { className: 'duw-cmds' },
        h('div', { className: 'duw-cmds-head' }, '各指令消耗', h('span', null, '最近 ' + turns.length + ' 条')),
        h('div', { className: 'duw-cmds-scroll' }, turns.map((turn, index) => h('div', { className: 'duw-cmd', key: index },
          h('div', { className: 'duw-cmd-main' },
            h('div', { className: 'duw-cmd-label', title: turn.label }, turn.label || '（无文本）'),
            h('div', { className: 'duw-cmd-time' }, fmtClock(turn.t, false) + ' · ' + turn.requests + ' 步' + (turn.unpriced > 0 ? ' · 部分无价' : ''))),
          h('div', { className: 'duw-cmd-val' },
            h('b', null, fmtTokens(turn.tokens)),
            h('div', null, turn.cost === null || turn.cost === undefined ? '无价' : fmtCost(turn.cost, symbol)))))))
    }

    /* ----------------------------------------------------------------- panel */

    function PanelContent(props) {
      const snap = props.snap
      const data = snap.data
      const live = useLive(true)
      const [mode, setMode] = React.useState('token')
      const pricing = data && data.pricing ? data.pricing : null
      const costKnown = !!(pricing && pricing.known)
      const activeMode = costKnown ? mode : 'token'
      const symbol = pricing && pricing.symbol ? pricing.symbol : '¥'
      const balanceParts = fmtMoneyParts(data && data.balance)
      const balanceText = balanceParts ? balanceParts.sym + balanceParts.num : null
      const totals = data && data.totals ? data.totals : null
      const today = data && data.today ? data.today : null
      const todayTokens = today && typeof today.total === 'number' ? today.total : 0
      const remaining = data && data.remaining ? data.remaining : null
      /* Warn only when the balance no longer covers a quarter of today's traffic (~6h). */
      const lowRemaining = !!(remaining && todayTokens > 0 && remaining.tokens * 4 < todayTokens)
      const buckets = data && Array.isArray(data.buckets) ? data.buckets : []
      const turns = data && Array.isArray(data.turns) ? data.turns : []
      const providerName = data && data.provider ? data.provider.name : ''
      const model = data && data.model ? data.model : ''
      const routeText = [providerName, model].filter(Boolean).join(' · ')
      const series = activeMode === 'cost' ? COST_SERIES : TOKEN_SERIES
      const range = RANGES.find((item) => item.id === snap.rangeId) || RANGES[2]
      const compact = props.compact === true

      let legendValues
      if (activeMode === 'cost') legendValues = totals ? [totals.cc || 0, totals.ci || 0, totals.co || 0] : [0, 0, 0]
      else legendValues = totals ? [totals.c || 0, totals.i || 0, totals.o || 0] : [0, 0, 0]

      const requests = totals ? totals.requests : 0
      const unpriced = !!(totals && totals.unpriced > 0)
      const footLeft = activeMode === 'cost'
        ? [range.short + ' ', h('b', { key: 'v' }, fmtCost(totals ? totals.cost : 0, symbol)), ' · ' + requests + ' 次' + (unpriced ? ' · 部分无价' : '')]
        : [range.short + ' ', h('b', { key: 'v' }, fmtTokens(totals ? totals.total : 0)), ' tok · ' + requests + ' 次']
      const footRight = ['今日 ', h('b', { key: 'v' },
        activeMode === 'cost' ? fmtCost(today ? today.cost : 0, symbol) : fmtTokens(todayTokens) + ' tok')]

      return h(React.Fragment, null,
        h('div', { className: 'duw-hd' },
          h('div', { className: 'duw-title' },
            '用量',
            pricing && pricing.known
              ? h('span', { className: 'duw-peak', 'data-peak': pricing.peak ? '1' : undefined }, pricing.peak ? '高峰单价' : '空闲单价')
              : null),
          h('button', { type: 'button', className: 'duw-x', title: '收起面板', onClick: props.onClose }, '×')),
        h('div', { className: 'duw-route', title: routeText }, routeText || '当前渠道'),
        h('div', { className: 'duw-cards' },
          h('div', { className: 'duw-cardstat', title: data && data.balance && data.balance.message ? data.balance.message : undefined },
            h('span', { className: 'duw-cs-lbl' }, '余额'),
            h('span', { className: 'duw-cs-val', 'data-small': balanceText && balanceText.length > 6 ? '1' : undefined }, balanceText || '—'),
            h('span', { className: 'duw-cs-hint' }, '今日花费 ' + (pricing && pricing.known ? fmtCost(today ? today.cost : 0, symbol) : '不可用'))),
          h('div', { className: 'duw-cardstat' },
            h('span', { className: 'duw-cs-lbl' }, '剩余可用'),
            h('span', { className: 'duw-cs-val', 'data-small': '1', 'data-teal': remaining ? '1' : undefined, 'data-warn': lowRemaining ? '1' : undefined }, remaining ? '≈ ' + fmtTokens(remaining.tokens) : '—'),
            h('span', { className: 'duw-cs-hint' }, '按 24h 实付均价'))),
        h('div', { className: 'duw-bar' },
          h('div', { className: 'duw-seg' }, RANGES.map((item) => h('button', {
            key: item.id,
            type: 'button',
            className: 'duw-tab',
            'data-on': item.id === snap.rangeId ? '1' : undefined,
            onClick: () => setRange(item.id),
          }, item.short))),
          h('button', {
            type: 'button',
            className: 'duw-mode',
            'data-on': activeMode === 'cost' ? '1' : undefined,
            disabled: !costKnown,
            title: costKnown ? '切换 Token / 金额' : '当前渠道没有可用的单价表',
            onClick: () => setMode(activeMode === 'cost' ? 'token' : 'cost'),
          }, activeMode === 'cost' ? symbol + ' 金额' : 'Token')),
        h(WaveChart, { buckets, rangeId: snap.rangeId, mode: activeMode, symbol, compact }),
        h('div', { className: 'duw-legend' },
          series.map((item, index) => h('span', { className: 'duw-legend-item', key: item.key },
            h('i', { className: 'duw-dot', style: { background: item.color } }),
            item.label + ' ' + (activeMode === 'cost' ? fmtCost(legendValues[index], symbol) : fmtTokens(legendValues[index])))),
          h('span', { className: 'duw-cache' }, '缓存 ' + fmtPercent(totals ? totals.cacheRate : null))),
        h('div', { className: 'duw-foot' }, h('span', null, footLeft), h('span', null, footRight)),
        snap.error ? h('div', { className: 'duw-foot', style: { color: 'var(--dsw-alias-state-error-primary,#d33)' } }, '刷新失败：' + snap.error) : null,
        h(LiveStrip, { live }),
        h(TurnsList, { turns, symbol }))
    }

    /* --------------------------------------------------------- panel geometry */

    /**
     * The conversation column is centred inside the content pane, so the space
     * between the left sidebar and the first character of the transcript is a
     * free gutter. Measure it (plus the composer's top edge) on every layout
     * change and let the panel shrink into whatever is left, so it can never
     * cover the transcript or the input box.
     */
    function measurePanelLayout() {
      if (typeof window === 'undefined' || typeof document === 'undefined') return null
      const viewW = window.innerWidth
      const viewH = window.innerHeight
      const sidebar = document.querySelector('[class*="sidebarCol"]')
      const sidebarRight = sidebar ? sidebar.getBoundingClientRect().right : 280

      let textLeft = null
      const marks = document.querySelectorAll('[class*="markdown"]')
      for (let index = 0; index < marks.length; index += 1) {
        const rect = marks[index].getBoundingClientRect()
        if (rect.width > 60 && rect.height > 8 && (textLeft === null || rect.left < textLeft)) textLeft = rect.left
      }
      if (textLeft === null) textLeft = sidebarRight + Math.max(160, (viewW - sidebarRight) * 0.22)

      const editor = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea')
      const editorRect = editor ? editor.getBoundingClientRect() : null
      const editorLeft = editorRect && editorRect.left > sidebarRight ? editorRect.left : Infinity
      const editorBottom = editorRect ? editorRect.bottom : viewH - 60
      const scrollBody = document.querySelector('[class*="scrollBody"]')
      const contentTop = scrollBody ? scrollBody.getBoundingClientRect().top : 96

      /* Align the panel's top with the transcript: stay below the conversation
       * header strip (the 对话/上下文 tab row). */
      const TAB_LABELS = ['对话', '上下文', '画廊', '编队']
      let headerBottom = contentTop
      const tabNodes = document.querySelectorAll('[role="tab"], [class*="tab"]')
      for (let index = 0; index < tabNodes.length; index += 1) {
        const element = tabNodes[index]
        if (TAB_LABELS.indexOf(String(element.textContent || '').trim()) < 0) continue
        const rect = element.getBoundingClientRect()
        if (rect.height < 70 && rect.bottom > headerBottom) headerBottom = rect.bottom
      }

      const left = Math.round(sidebarRight + 6)
      const rightLimit = Math.round(Math.min(textLeft - 6, editorLeft - 6))
      const room = rightLimit - left
      /* Width is a share of the window (so shrinking the page shrinks the panel),
       * but never wider than the free gutter — it can therefore never cover text.
       * At very narrow windows the gutter wins and the panel becomes a thin strip
       * instead of disappearing. */
      const desired = Math.round(Math.min(220, viewW * 0.13))
      const width = Math.max(0, Math.min(desired, room))
      const top = Math.round(Math.max(48, headerBottom + 2))
      const bottom = Math.round(Math.max(top + 160, viewH - 2))

      /* Keep the panel mounted always — its z-index is low enough that the app's
       * own dialogs, menus and full-page views simply paint on top of it. */
      return {
        left,
        width,
        top,
        bottom,
        compact: width < 250,
      }
    }

    function usePanelLayout(enabled) {
      const [layout, setLayout] = React.useState(() => (enabled ? measurePanelLayout() : null))
      React.useEffect(() => {
        if (!enabled) return undefined
        let frame = 0
        const apply = (next) => {
          setLayout((previous) => {
            if (!previous) return next
            if (previous.left === next.left && previous.width === next.width && previous.top === next.top && previous.bottom === next.bottom) return previous
            return next
          })
        }
        const update = () => {
          frame = 0
          apply(measurePanelLayout())
        }
        const schedule = () => {
          if (frame === 0) frame = window.requestAnimationFrame(update)
        }
        window.addEventListener('resize', schedule)
        const timer = setInterval(schedule, 1000)
        schedule()
        return () => {
          window.removeEventListener('resize', schedule)
          clearInterval(timer)
          if (frame !== 0) window.cancelAnimationFrame(frame)
        }
      }, [enabled])
      return layout
    }

    /* ------------------------------------------------------------- live strip */

    function useLive(enabled) {
      const [live, setLive] = React.useState(null)
      React.useEffect(() => {
        if (!enabled) return undefined
        let alive = true
        const tick = async () => {
          if (typeof document !== 'undefined' && document.hidden) return
          try {
            const response = await fetch(PATH + '?live=1', { cache: 'no-store' })
            if (!response.ok) return
            const data = await response.json()
            if (alive && data && data.ok) setLive(data)
          } catch {
            /* the strip is optional; keep the last frame on failure */
          }
        }
        void tick()
        const timer = setInterval(tick, 1000)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [enabled])
      return live
    }

    function niceStep(value) {
      if (!(value > 0) || !Number.isFinite(value)) return 1
      const exponent = Math.floor(Math.log10(value))
      const base = Math.pow(10, exponent)
      const ratio = value / base
      const mult = ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 5 ? 5 : 10
      return mult * base
    }

    function LiveStrip(props) {
      const live = props.live
      const rawTokens = live && Array.isArray(live.tokens) ? live.tokens : []
      /* Usage is booked when a step settles, so a raw per-second series is a
       * spike followed by zeros. A short rolling average turns it into a
       * continuous rate instead of a curve that keeps dropping to the floor. */
      const RATE_WINDOW = 5
      const tokens = rawTokens.map((value, index) => {
        let sum = 0
        let used = 0
        for (let offset = Math.max(0, index - RATE_WINDOW + 1); offset <= index; offset += 1) {
          sum += rawTokens[offset] || 0
          used += 1
        }
        return used > 0 ? sum / used : 0
      })
      const W = 200
      const H = 112
      const padL = 34
      const padR = 4
      const padT = 16
      const padB = 18
      const plotW = W - padL - padR
      const plotH = H - padT - padB
      const count = tokens.length
      let peak = 0
      for (const value of tokens) if (value > peak) peak = value
      /* Round ceiling so the left axis reads 10 / 20 / 30-style values. */
      const stepValue = niceStep(peak > 0 ? peak / 3 : 1)
      const yMax = stepValue * 3
      const x = (index) => (count > 1 ? padL + (plotW * index) / (count - 1) : padL)
      const clampY = (value) => Math.min(padT + plotH, Math.max(padT, value))
      const yOf = (value) => padT + plotH * (1 - Math.min(1, Math.max(0, value / (yMax || 1))))
      const coords = tokens.map((value, index) => ({ x: x(index), y: clampY(yOf(value)) }))

      /* Catmull-Rom → cubic bezier: a smooth function-graph curve, not a polyline. */
      const curvePath = (() => {
        if (coords.length === 0) return ''
        if (coords.length === 1) return 'M' + coords[0].x.toFixed(1) + ',' + coords[0].y.toFixed(1)
        let path = 'M' + coords[0].x.toFixed(1) + ',' + coords[0].y.toFixed(1)
        for (let index = 0; index < coords.length - 1; index += 1) {
          const p0 = coords[index - 1] || coords[index]
          const p1 = coords[index]
          const p2 = coords[index + 1]
          const p3 = coords[index + 2] || p2
          const tension = 0.18
          const c1x = p1.x + (p2.x - p0.x) * tension
          const c1y = clampY(p1.y + (p2.y - p0.y) * tension)
          const c2x = p2.x - (p3.x - p1.x) * tension
          const c2y = clampY(p2.y - (p3.y - p1.y) * tension)
          path += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1)
        }
        return path
      })()
      const areaPath = coords.length > 0
        ? curvePath + ' L' + x(count - 1).toFixed(1) + ',' + (padT + plotH).toFixed(1) + ' L' + padL.toFixed(1) + ',' + (padT + plotH).toFixed(1) + ' Z'
        : ''
      const current = count > 0 ? tokens[count - 1] : 0
      const active = live && live.lastActivity && Date.now() - live.lastActivity < 15_000

      const grid = []
      const ticks = []
      for (let tick = 0; tick <= 3; tick += 1) {
        const value = stepValue * tick
        const yy = yOf(value)
        if (tick > 0) {
          grid.push(h('line', {
            key: 'g' + tick,
            x1: padL, x2: W - padR, y1: yy, y2: yy,
            stroke: 'var(--dsw-alias-border-l1,rgba(127,127,127,.12))',
            strokeDasharray: '2 4',
            strokeWidth: 1,
          }))
        }
        ticks.push(h('line', {
          key: 't' + tick,
          x1: padL - 3, x2: padL, y1: yy, y2: yy,
          stroke: 'var(--dsw-alias-label-tertiary,#9aa0aa)',
          strokeWidth: 1,
        }))
        ticks.push(h('text', {
          key: 'tl' + tick,
          x: padL - 6, y: yy + 3,
          textAnchor: 'end', fontSize: 8.5,
          fill: 'var(--dsw-alias-label-tertiary,#8a8f99)',
          style: { fontVariantNumeric: 'tabular-nums' },
        }, fmtTokens(value)))
      }

      const xLabels = count > 1 ? [
        h('line', { key: 'xt0', x1: padL, x2: padL, y1: padT + plotH, y2: padT + plotH + 3, stroke: 'var(--dsw-alias-label-tertiary,#9aa0aa)', strokeWidth: 1 }),
        h('line', { key: 'xt1', x1: padL + plotW / 2, x2: padL + plotW / 2, y1: padT + plotH, y2: padT + plotH + 3, stroke: 'var(--dsw-alias-label-tertiary,#9aa0aa)', strokeWidth: 1 }),
        h('line', { key: 'xt2', x1: W - padR, x2: W - padR, y1: padT + plotH, y2: padT + plotH + 3, stroke: 'var(--dsw-alias-label-tertiary,#9aa0aa)', strokeWidth: 1 }),
        h('text', { key: 'x0', x: padL, y: H - 2, fontSize: 8.5, fill: 'var(--dsw-alias-label-tertiary,#8a8f99)' }, '-1m'),
        h('text', { key: 'x1', x: padL + plotW / 2, y: H - 2, textAnchor: 'middle', fontSize: 8.5, fill: 'var(--dsw-alias-label-tertiary,#8a8f99)' }, '-30s'),
        h('text', { key: 'x2', x: W - padR, y: H - 2, textAnchor: 'end', fontSize: 8.5, fill: 'var(--dsw-alias-label-tertiary,#8a8f99)' }, '现在'),
      ] : []

      return h('div', { className: 'duw-live' },
        h('div', { className: 'duw-live-head' },
          h('span', null, '实时 tok/s · 5s 均', active ? h('b', null, ' ●') : null),
          h('span', null, '当前 ' + fmtTokens(current) + ' · 峰值 ' + fmtTokens(peak))),
        h('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', role: 'img', 'aria-label': '每秒 token 消耗函数曲线' },
          grid,
          h('line', { key: 'yaxis', x1: padL, x2: padL, y1: padT, y2: padT + plotH, stroke: 'var(--dsw-alias-label-tertiary,#9aa0aa)', strokeWidth: 1 }),
          h('line', { key: 'xaxis', x1: padL, x2: W - padR, y1: padT + plotH, y2: padT + plotH, stroke: 'var(--dsw-alias-label-tertiary,#9aa0aa)', strokeWidth: 1 }),
          ticks,
          h('text', { key: 'unit', x: padL + 2, y: padT - 3, fontSize: 8, fill: 'var(--dsw-alias-label-tertiary,#8a8f99)' }, 'tok/s'),
          areaPath ? h('path', { d: areaPath, fill: 'var(--duw-live-area,rgba(240,98,146,.14))' }) : null,
          curvePath ? h('path', { d: curvePath, fill: 'none', stroke: 'var(--duw-live,#f06292)', strokeWidth: 1.6, vectorEffect: 'non-scaling-stroke', strokeLinecap: 'round', strokeLinejoin: 'round' }) : null,
          xLabels))
    }

    function SidePanel(props) {
      const snap = useUsage()
      const open = props.open !== false
      const layout = usePanelLayout(open)
      const today = snap.data && snap.data.today ? snap.data.today : null
      const handleLeft = layout ? layout.left : 292


      if (!open || !layout) {
        return h(React.Fragment, null,
          h('style', { 'data-usage-wave-css': '' }, CSS),
          h('button', {
            type: 'button',
            className: 'duw-handle',
            style: { left: handleLeft + 'px', top: '120px' },
            title: '打开用量面板',
            onClick: props.onToggle,
          }, '用量 ' + fmtTokens(today ? today.total : 0)))
      }

      return h(React.Fragment, null,
        h('style', { 'data-usage-wave-css': '' }, CSS),
        h('div', {
          className: 'duw-side',
          'data-compact': layout.compact ? '1' : undefined,
          style: {
            left: layout.left + 'px',
            top: layout.top + 'px',
            width: layout.width + 'px',
            height: Math.max(120, layout.bottom - layout.top) + 'px',
          },
        }, h(PanelContent, { snap, compact: layout.compact, onClose: props.onToggle })))
    }

    function FootCard(props) {
      const wide = props.wide !== false
      const snap = useUsage()
      const [open, setOpen] = React.useState(() => {
        try {
          const saved = window.localStorage.getItem(OPEN_KEY)
          return saved === null ? true : saved === '1'
        } catch {
          return true
        }
      })
      const toggle = () => {
        setOpen((value) => {
          const next = !value
          try {
            window.localStorage.setItem(OPEN_KEY, next ? '1' : '0')
          } catch {
            /* private mode: the in-memory state still applies */
          }
          return next
        })
      }
      const data = snap.data
      const balanceParts = fmtMoneyParts(data && data.balance)
      const balanceText = balanceParts ? balanceParts.sym + balanceParts.num : null
      const today = data && data.today ? data.today : null
      const todayTokens = today && typeof today.total === 'number' ? today.total : 0
      const remaining = data && data.remaining ? data.remaining : null
      const remainText = remaining && typeof remaining.tokens === 'number' ? '≈ ' + fmtTokens(remaining.tokens) : '—'
      /* Warn when the balance no longer covers a day of the current traffic. */
      /* Warn only when the balance no longer covers a quarter of today's traffic (~6h). */
      const lowRemaining = !!(remaining && todayTokens > 0 && remaining.tokens * 4 < todayTokens)
      const anchorRef = React.useRef(null)

      /* Layout self-report: proves the card and the panel really mounted. */
      React.useEffect(() => {
        const node = anchorRef.current
        if (!node) return undefined
        const timer = setTimeout(() => {
          try {
            const panel = document.querySelector('.duw-side')
            let panelInfo = null
            if (panel) {
              const rect = panel.getBoundingClientRect()
              const hit = document.elementFromPoint(Math.round(rect.left + 20), Math.round(rect.top + 20))
              panelInfo = {
                w: Math.round(rect.width),
                h: Math.round(rect.height),
                left: Math.round(rect.left),
                top: Math.round(rect.top),
                right: Math.round(rect.right),
                bottom: Math.round(rect.bottom),
                inside: !!(hit && panel.contains(hit)),
                text: String(panel.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
              }
            }
            const tabs = []
            const tabNodes = document.querySelectorAll('[role="tab"], [class*="tab"]')
            for (let index = 0; index < tabNodes.length && tabs.length < 6; index += 1) {
              const text = String(tabNodes[index].textContent || '').trim()
              if (['对话', '上下文', '画廊', '编队'].indexOf(text) < 0) continue
              const rect = tabNodes[index].getBoundingClientRect()
              tabs.push(text + '@' + Math.round(rect.top) + '-' + Math.round(rect.bottom))
            }
            const editor = document.querySelector('[contenteditable="true"]')
            const editorRect = editor ? editor.getBoundingClientRect() : null
            const diag = {
              text: String(node.innerText || '').replace(/\s+/g, ' ').slice(0, 80),
              panel: panelInfo,
              cardRect: (function () {
                const rect = node.getBoundingClientRect()
                return { w: Math.round(rect.width), h: Math.round(rect.height), left: Math.round(rect.left), top: Math.round(rect.top), bottom: Math.round(rect.bottom) }
              })(),
              wide: wide,
              innerW: window.innerWidth,
              innerH: window.innerHeight,
              tabs,
              editor: editorRect ? Math.round(editorRect.left) + ',' + Math.round(editorRect.top) + ' ' + Math.round(editorRect.width) + 'x' + Math.round(editorRect.height) : null,
            }
            fetch(PATH + '?diag=' + encodeURIComponent(JSON.stringify(diag)), { cache: 'no-store' }).catch(() => {})
          } catch {
            /* diagnostics must never break the card */
          }
        }, 1500)
        return () => clearTimeout(timer)
      }, [])

      return h('div', { className: 'duw-card', ref: anchorRef },
        h('style', { 'data-usage-wave-css': '' }, CSS),
        h('button', {
          type: 'button',
          className: 'duw-btn',
          'data-compact': wide ? undefined : '1',
          'aria-expanded': open ? 'true' : 'false',
          title: (snap.error ? snap.error : [balanceText || '余额不可用', (lowRemaining ? '⚠ ' : '') + '剩余 ' + remainText + ' tok', '今日 ' + fmtTokens(todayTokens) + ' tok'].join(' · ')) + ' · 点击开合左侧用量面板',
          onClick: toggle,
        },
          wide
            ? h(React.Fragment, null,
                h('span', { className: 'duw-grow' },
                  h('span', { className: 'duw-lbl' }, '余额'),
                  h('span', { className: 'duw-big', 'data-error': balanceParts ? undefined : '1' },
                    balanceParts ? [h('span', { className: 'duw-cur', key: 'cur' }, balanceParts.sym), balanceParts.num] : '—')),
                h('span', { className: 'duw-vline' }),
                h('span', { className: 'duw-end', title: '按最近 24h 实付均价折算' },
                  h('span', { className: 'duw-lbl' }, '剩余 tok'),
                  h('span', {
                    className: 'duw-mid',
                    'data-warn': lowRemaining ? '1' : undefined,
                    'data-error': remaining ? undefined : '1',
                  }, remainText)),
                h('span', { className: 'duw-chev' }, '›'))
            : h('span', { className: 'duw-mid', 'data-warn': lowRemaining ? '1' : undefined, 'data-error': remaining ? undefined : '1' }, remainText)),
        h(SidePanel, { open, onToggle: toggle }))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        if (!ctx.slots) return
        try {
          ctx.slots.inject(SLOT, () => ctx.slots.register({ name: 'sidebar.footer.action', id: CELL, order: ORDER, label: () => '用量波形' },
            (props) => h(FootCard, { wide: props ? props.wide : true })))
        } catch (error) {
          console.warn('[dsh-usage-wave] registration failed', error)
        }
      },
    }
  },
})

