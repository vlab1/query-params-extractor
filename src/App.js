import { useMemo, useState, useCallback, useEffect } from 'react'
import FingerprintJS from '@fingerprintjs/fingerprintjs'

const STORAGE_KEY = 'qp_history'
const TRUNCATE_LENGTH = 80
// ─── helpers ────────────────────────────────────────────────────────────────

function getHistory() {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
	} catch {
		return []
	}
}

function saveToHistory(params) {
	if (Object.keys(params).length === 0) return
	const history = getHistory()
	const last = history[history.length - 1]
	if (last && JSON.stringify(last) === JSON.stringify(params)) return
	history.push(params)
	if (history.length > 50) history.shift()
	localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
}

async function sha256(str) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
	return Array.from(new Uint8Array(buf))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}

async function collectFingerprint() {
	// ── Variant 1: navigator basics ─────────────────────────────────────────
	const basic = {
		userAgent: navigator.userAgent,
		language: navigator.language,
		languages: [...(navigator.languages || [])],
		platform: navigator.platform,
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		screen: `${window.screen.width}×${window.screen.height}`,
		colorDepth: window.screen.colorDepth,
		hardwareConcurrency: navigator.hardwareConcurrency,
		deviceMemory: navigator.deviceMemory ?? 'n/a',
		maxTouchPoints: navigator.maxTouchPoints,
		cookieEnabled: navigator.cookieEnabled,
		doNotTrack: navigator.doNotTrack ?? 'n/a',
	}
	const basicHash = await sha256(JSON.stringify(basic))

	// ── Variant 2: canvas + WebGL ────────────────────────────────────────────
	const canvas = document.createElement('canvas')
	canvas.width = 200
	canvas.height = 40
	const ctx = canvas.getContext('2d')
	ctx.textBaseline = 'top'
	ctx.font = '14px Arial'
	ctx.fillStyle = '#f60'
	ctx.fillRect(0, 0, 200, 40)
	ctx.fillStyle = '#069'
	ctx.fillText('Browser Fingerprint 🔍', 2, 2)
	ctx.fillStyle = 'rgba(102,204,0,0.7)'
	ctx.fillText('Browser Fingerprint 🔍', 4, 4)
	const canvasFp = canvas.toDataURL()

	const glCanvas = document.createElement('canvas')
	const gl = glCanvas.getContext('webgl')
	let webglVendor = 'n/a'
	let webglRenderer = 'n/a'
	if (gl) {
		const dbg = gl.getExtension('WEBGL_debug_renderer_info')
		if (dbg) {
			webglVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)
			webglRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
		}
	}
	const canvasData = { canvasFp, webglVendor, webglRenderer }
	const canvasHash = await sha256(JSON.stringify(canvasData))

	// ── Variant 3: audio + fonts ─────────────────────────────────────────────
	let audioHash = 'n/a'
	try {
		const AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext
		if (AudioCtx) {
			const ctx3 = new AudioCtx(1, 44100, 44100)
			const osc = ctx3.createOscillator()
			const comp = ctx3.createDynamicsCompressor()
			osc.type = 'triangle'
			osc.frequency.value = 10000
			;[
				['threshold', -50],
				['knee', 40],
				['ratio', 12],
				['attack', 0],
				['release', 0.25],
			].forEach(([k, v]) => comp[k].setValueAtTime(v, ctx3.currentTime))
			osc.connect(comp)
			comp.connect(ctx3.destination)
			osc.start(0)
			const buf = await ctx3.startRendering()
			const ch = buf.getChannelData(0)
			let sum = 0
			for (let i = 4500; i < 5000; i++) sum += Math.abs(ch[i])
			audioHash = await sha256(sum.toString())
		}
	} catch {}

	const testFonts = [
		'Arial', 'Verdana', 'Georgia', 'Courier New', 'Times New Roman',
		'Trebuchet MS', 'Impact', 'Comic Sans MS', 'Palatino', 'Garamond',
		'Bookman', 'Tahoma', 'Helvetica Neue',
	]
	const availableFonts = []
	const testEl = document.createElement('span')
	testEl.style.cssText = 'position:absolute;left:-9999px;font-size:72px;'
	testEl.textContent = 'mmmmmmmmmmlli'
	document.body.appendChild(testEl)
	testEl.style.fontFamily = 'monospace'
	const baseW = testEl.offsetWidth
	testEl.style.fontFamily = 'serif'
	const baseH = testEl.offsetWidth
	for (const font of testFonts) {
		testEl.style.fontFamily = `'${font}', monospace`
		if (testEl.offsetWidth !== baseW) { availableFonts.push(font); continue }
		testEl.style.fontFamily = `'${font}', serif`
		if (testEl.offsetWidth !== baseH) availableFonts.push(font)
	}
	document.body.removeChild(testEl)

	const advancedData = { audioFingerprint: audioHash, availableFonts }
	const advancedHash = await sha256(JSON.stringify(advancedData))

	return {
		basic: { data: basic, hash: basicHash },
		canvas: { data: canvasData, hash: canvasHash },
		advanced: { data: advancedData, hash: advancedHash },
	}
}

// ─── ValueCell ───────────────────────────────────────────────────────────────

function ValueCell({ value, dimmed = false, highlight = false }) {
	const [expanded, setExpanded] = useState(false)
	const [copied, setCopied] = useState(false)
	const isLong = value.length > TRUNCATE_LENGTH

	const handleCopy = useCallback(
		(e) => {
			e.stopPropagation()
			navigator.clipboard.writeText(value).then(() => {
				setCopied(true)
				setTimeout(() => setCopied(false), 1500)
			})
		},
		[value]
	)

	const displayValue = isLong && !expanded ? value.slice(0, TRUNCATE_LENGTH) + '…' : value
	const color = highlight ? '#4da3ff' : dimmed ? '#888' : undefined

	return (
		<span style={styles.valueWrapper}>
			<span
				style={{ ...styles.value, cursor: 'pointer', wordBreak: isLong ? 'break-all' : 'normal', color }}
				onClick={handleCopy}
				title="Click to copy"
			>
				{displayValue}
			</span>
			{isLong && (
				<button style={styles.expandBtn} onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}>
					{expanded ? 'collapse' : 'expand'}
				</button>
			)}
			<span style={{ ...styles.copyHint, opacity: copied ? 1 : 0 }}>copied!</span>
		</span>
	)
}

// ─── HistoryView ─────────────────────────────────────────────────────────────

function HistoryView({ current, onClose }) {
	const history = useMemo(() => getHistory(), [])
	const prevEntries = history.slice(0, -1)

	if (prevEntries.length === 0) {
		return (
			<div style={styles.overlay} onClick={onClose}>
				<div style={styles.historyCard} onClick={(e) => e.stopPropagation()}>
					<div style={styles.historyHeader}>
						<h2 style={styles.historyTitle}>Previous values</h2>
						<button style={styles.closeBtn} onClick={onClose}>✕</button>
					</div>
					<p style={styles.empty}>No previous values found</p>
				</div>
			</div>
		)
	}

	const prev = prevEntries[prevEntries.length - 1]
	const allKeys = new Set([...Object.keys(prev), ...Object.keys(current)])

	return (
		<div style={styles.overlay}>
			<div style={styles.historyCard}>
				<div style={styles.historyHeader}>
					<h2 style={styles.historyTitle}>Previous values</h2>
					<button style={styles.closeBtn} onClick={onClose}>✕</button>
				</div>
				<div style={styles.legendRow}>
					<span style={{ ...styles.legendBadge, background: '#1a3a5c' }}>changed</span>
					<span style={{ ...styles.legendBadge, background: '#1a3d1a' }}>new</span>
					<span style={{ ...styles.legendBadge, background: '#3d1a1a' }}>removed</span>
				</div>
				<ul style={styles.list}>
					{[...allKeys].map((key) => {
						const prevVal = prev[key]
						const curVal = current[key]
						const isNew = prevVal === undefined
						const isRemoved = curVal === undefined
						const isChanged = !isNew && !isRemoved && prevVal !== curVal
						let rowStyle = {}
						if (isChanged) rowStyle = styles.rowChanged
						else if (isNew) rowStyle = styles.rowNew
						else if (isRemoved) rowStyle = styles.rowRemoved
						return (
							<li key={key} style={{ ...styles.historyItem, ...rowStyle }}>
								<span style={styles.key}>{key}</span>
								<span style={styles.separator}>→</span>
								<span style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
									{isRemoved
										? <ValueCell value={prevVal} dimmed />
										: isNew
											? <ValueCell value={curVal} highlight />
											: <>
												<ValueCell value={prevVal} dimmed />
												{isChanged && (
													<>
														<span style={styles.arrow}>↓ now</span>
														<ValueCell value={curVal} highlight />
													</>
												)}
											</>
									}
								</span>
							</li>
						)
					})}
				</ul>
			</div>
		</div>
	)
}

// ─── FpjsRow ─────────────────────────────────────────────────────────────────

function toDisplay(raw) {
	if (raw === undefined || raw === null) return { text: null, isJson: false }
	if (Array.isArray(raw)) return { text: JSON.stringify(raw, null, 2), isJson: true }
	if (typeof raw === 'object') return { text: JSON.stringify(raw, null, 2), isJson: true }
	return { text: String(raw), isJson: false }
}

function FpjsRow({ name, v }) {
	const [expanded, setExpanded] = useState(false)
	const [copied, setCopied] = useState(false)

	const hasError = v?.error !== undefined
	const raw = hasError ? undefined : v?.value
	const { text, isJson } = toDisplay(raw)
	const isUnavailable = text === null
	const unavailableLabel = hasError ? (v.error?.message || 'not supported') : 'n/a'
	const isLong = !isUnavailable && (text.length > 80 || isJson)

	const preview = isLong && !expanded
		? text.replace(/\n/g, ' ').slice(0, 80) + '…'
		: text ?? ''

	const handleCopy = (e) => {
		e.stopPropagation()
		navigator.clipboard.writeText(text).then(() => {
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		})
	}

	return (
		<li style={styles.fpRow}>
			<span style={styles.fpKey}>{name}</span>
			<span style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
				{isUnavailable ? (
					<em style={{ opacity: 0.3, fontSize: '12px' }}>{unavailableLabel}</em>
				) : expanded ? (
					<pre style={{ ...styles.fpPre, color: isJson ? '#34d399' : '#ddd' }} onClick={handleCopy} title="Click to copy">{text}</pre>
				) : (
					<span
						style={{ ...styles.fpVal, wordBreak: 'break-all', cursor: 'pointer' }}
						onClick={handleCopy}
						title="Click to copy"
					>
						{preview}
					</span>
				)}
				{!isUnavailable && (
					<span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
						{isLong && (
							<button style={styles.expandBtn} onClick={() => setExpanded((v) => !v)}>
								{expanded ? 'collapse' : 'expand'}
							</button>
						)}
						<span style={{ ...styles.copyHint, opacity: copied ? 1 : 0 }}>copied!</span>
					</span>
				)}
			</span>
		</li>
	)
}

// ─── FingerprintModal ─────────────────────────────────────────────────────────

const TABS = [
	{ id: 'basic', label: '① Navigator', color: '#4da3ff' },
	{ id: 'canvas', label: '② Canvas + WebGL', color: '#a78bfa' },
	{ id: 'advanced', label: '③ Audio + Fonts', color: '#34d399' },
	{ id: 'fpjs', label: '④ FingerprintJS v5', color: '#fb923c' },
]

function FingerprintModal({ onClose }) {
	const [data, setData] = useState(null)
	const [fpjsResult, setFpjsResult] = useState(null)
	const [tab, setTab] = useState('basic')
	const [copied, setCopied] = useState(false)

	useEffect(() => {
		collectFingerprint().then(setData)
		FingerprintJS.load().then((fp) => fp.get()).then((result) => {
			setFpjsResult(result)
		})
	}, [])

	useEffect(() => {
		const handler = (e) => { if (e.key === 'Escape') onClose() }
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	}, [onClose])

	const activeColor = TABS.find((t) => t.id === tab)?.color ?? '#fff'
	const activeData = tab === 'fpjs' ? null : data?.[tab]
	const isFpjs = tab === 'fpjs'

	const handleCopyHash = () => {
		if (!activeData) return
		navigator.clipboard.writeText(activeData.hash).then(() => {
			setCopied(true)
			setTimeout(() => setCopied(false), 1500)
		})
	}

	return (
		<div style={styles.overlay}>
			<div style={styles.fpCard}>
				{/* Header */}
				<div style={styles.fpHeader}>
					<div style={styles.fpEyebrow}>🔍 Browser Fingerprint</div>
					<button style={styles.closeBtn} onClick={onClose}>✕</button>
				</div>

				{/* Tabs */}
				<div style={styles.tabs}>
					{TABS.map((t) => (
						<button
							key={t.id}
							style={{
								...styles.tab,
								...(tab === t.id ? { ...styles.tabActive, borderColor: t.color, color: t.color } : {}),
							}}
							onClick={() => setTab(t.id)}
						>
							{t.label}
						</button>
					))}
				</div>

				{/* Hash banner */}
				{isFpjs ? (
					fpjsResult ? (
						<div style={{ ...styles.hashBanner, borderColor: activeColor }}>
							<span style={styles.hashLabel}>visitorId</span>
							<span style={{ ...styles.hashValue, color: activeColor }}>{fpjsResult.visitorId}</span>
							<button style={{ ...styles.copyHashBtn, borderColor: activeColor, color: activeColor }}
								onClick={() => navigator.clipboard.writeText(fpjsResult.visitorId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}>
								{copied ? 'copied!' : 'copy'}
							</button>
						</div>
					) : (
						<div style={styles.loading}>Loading FingerprintJS…</div>
					)
				) : activeData ? (
					<div style={{ ...styles.hashBanner, borderColor: activeColor }}>
						<span style={styles.hashLabel}>SHA-256</span>
						<span style={{ ...styles.hashValue, color: activeColor }}>{activeData.hash}</span>
						<button style={{ ...styles.copyHashBtn, borderColor: activeColor, color: activeColor }} onClick={handleCopyHash}>
							{copied ? 'copied!' : 'copy'}
						</button>
					</div>
				) : (
					<div style={styles.loading}>Computing fingerprint…</div>
				)}

				{/* FingerprintJS data */}
				{isFpjs && fpjsResult && (
					<ul style={{ ...styles.list, marginTop: 4 }}>
						{Object.entries(fpjsResult.components).map(([k, v]) => (
							<FpjsRow key={k} name={k} v={v} />
						))}
					</ul>
				)}

				{/* Data rows */}
				{!isFpjs && activeData && (
					<ul style={{ ...styles.list, marginTop: 4 }}>
						{Object.entries(activeData.data).map(([k, v]) => (
							<FpjsRow key={k} name={k} v={{ value: v }} />
						))}
					</ul>
				)}

				<div style={styles.fpFooter}>
					Press <code style={styles.code}>Esc</code> to close
				</div>
			</div>
		</div>
	)
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
	const [showHistory, setShowHistory] = useState(false)
	const [showFingerprint, setShowFingerprint] = useState(false)

	const queryParams = useMemo(() => {
		const params = new URLSearchParams(window.location.search)
		const entries = Object.fromEntries(
			[...params.entries()].map(([k, v]) => [k, v === '' ? 'true' : v])
		)
		saveToHistory(entries)
		return entries
	}, [])

	const hasHistory = useMemo(() => getHistory().length > 1, [])

	return (
		<div style={styles.container}>
			<button style={styles.fpTriggerBtn} onClick={() => setShowFingerprint(true)} title="Browser Fingerprint">
				🔍
			</button>
			<div style={styles.card}>
				<div style={styles.titleRow}>
					<h1 style={styles.title}>Query Parameters</h1>
					{hasHistory && (
						<button style={styles.historyBtn} onClick={() => setShowHistory(true)}>
							View history
						</button>
					)}
				</div>

				{Object.keys(queryParams).length === 0 ? (
					<p style={styles.empty}>No parameters found</p>
				) : (
					<ul style={styles.list}>
						{Object.entries(queryParams).map(([key, value]) => (
							<li key={key} style={styles.item}>
								<span style={styles.key}>{key}</span>
								<span style={styles.separator}>→</span>
								<ValueCell value={value} />
							</li>
						))}
					</ul>
				)}
			</div>

			{showHistory && <HistoryView current={queryParams} onClose={() => setShowHistory(false)} />}
			{showFingerprint && <FingerprintModal onClose={() => setShowFingerprint(false)} />}
		</div>
	)
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
	container: {
		minHeight: '100vh',
		background: '#0f0f0f',
		color: '#fff',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		fontFamily: 'system-ui, sans-serif',
	},
	card: {
		background: '#1a1a1a',
		padding: '32px',
		borderRadius: '16px',
		width: '90%',
		maxWidth: '600px',
		boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
		border: '1px solid #2b2b2b',
	},
	titleRow: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: '20px',
	},
	title: { margin: 0, fontSize: '24px', fontWeight: 600 },
	historyBtn: {
		background: '#2b2b2b',
		border: '1px solid #444',
		color: '#ccc',
		padding: '6px 14px',
		borderRadius: '8px',
		cursor: 'pointer',
		fontSize: '13px',
	},
	empty: { opacity: 0.6 },
	list: { listStyle: 'none', padding: 0, margin: 0 },
	item: {
		display: 'grid',
		gridTemplateColumns: 'minmax(80px, max-content) 20px 1fr',
		gap: '0 4px',
		alignItems: 'baseline',
		padding: '10px 0',
		borderBottom: '1px solid #2b2b2b',
		fontSize: '18px',
	},
	key: { fontWeight: 600, color: '#4da3ff', whiteSpace: 'nowrap' },
	separator: { opacity: 0.5, textAlign: 'center' },
	value: { opacity: 0.9 },
	valueWrapper: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', minWidth: 0 },
	expandBtn: {
		background: 'none',
		border: '1px solid #444',
		color: '#888',
		borderRadius: '4px',
		padding: '1px 6px',
		fontSize: '11px',
		cursor: 'pointer',
		flexShrink: 0,
	},
	copyHint: { fontSize: '11px', color: '#4da3ff', transition: 'opacity 0.3s' },

	// shared overlay
	overlay: {
		position: 'fixed',
		inset: 0,
		background: 'rgba(0,0,0,0.75)',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		zIndex: 100,
		backdropFilter: 'blur(4px)',
		cursor: 'default',
	},

	// history card
	historyCard: {
		background: '#1a1a1a',
		padding: '28px',
		borderRadius: '16px',
		width: '90%',
		maxWidth: '620px',
		maxHeight: '80vh',
		overflowY: 'auto',
		border: '1px solid #2b2b2b',
		boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
	},
	historyHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' },
	historyTitle: { margin: 0, fontSize: '20px', fontWeight: 600 },
	closeBtn: { background: 'none', border: 'none', color: '#888', fontSize: '18px', cursor: 'pointer' },
	legendRow: { display: 'flex', gap: '8px', marginBottom: '16px' },
	legendBadge: { fontSize: '12px', padding: '2px 8px', borderRadius: '4px', color: '#ccc' },
	rowChanged: { background: '#1a3a5c', borderRadius: '6px', padding: '8px 6px', marginBottom: '2px' },
	rowNew: { background: '#1a3d1a', borderRadius: '6px', padding: '8px 6px', marginBottom: '2px' },
	rowRemoved: { background: '#3d1a1a', borderRadius: '6px', padding: '8px 6px', marginBottom: '2px' },
	historyItem: {
		display: 'grid',
		gridTemplateColumns: '140px 20px 1fr',
		gap: '0 4px',
		alignItems: 'baseline',
		padding: '8px 6px',
		borderBottom: '1px solid #222',
		fontSize: '16px',
	},
	arrow: { opacity: 0.4, fontSize: '11px', margin: '2px 0' },

	// fingerprint card
	fpCard: {
		background: '#141414',
		padding: '28px',
		borderRadius: '20px',
		width: '90%',
		maxWidth: '680px',
		maxHeight: '85vh',
		overflowY: 'auto',
		border: '1px solid #2b2b2b',
		boxShadow: '0 16px 48px rgba(0,0,0,0.8)',
	},
	fpHeader: {
		display: 'flex',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		marginBottom: '20px',
	},
	fpEyebrow: { fontSize: '18px', fontWeight: 700, marginBottom: '4px' },
	fpSubtitle: { fontSize: '12px', color: '#666' },
	code: { background: '#2b2b2b', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' },
	tabs: { display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' },
	tab: {
		background: 'none',
		border: '1px solid #333',
		color: '#666',
		padding: '6px 14px',
		borderRadius: '8px',
		cursor: 'pointer',
		fontSize: '13px',
		transition: 'all 0.15s',
	},
	tabActive: { background: 'rgba(255,255,255,0.04)', fontWeight: 600 },
	hashBanner: {
		display: 'flex',
		alignItems: 'center',
		gap: '10px',
		background: '#1a1a1a',
		border: '1px solid',
		borderRadius: '10px',
		padding: '10px 14px',
		marginBottom: '16px',
		flexWrap: 'wrap',
	},
	hashLabel: { fontSize: '11px', color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 },
	hashValue: { fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all', flex: 1 },
	copyHashBtn: {
		background: 'none',
		border: '1px solid',
		borderRadius: '6px',
		padding: '3px 10px',
		fontSize: '12px',
		cursor: 'pointer',
		flexShrink: 0,
	},
	loading: { color: '#555', fontSize: '14px', padding: '20px 0' },
	fpRow: {
		display: 'flex',
		gap: '12px',
		alignItems: 'flex-start',
		padding: '7px 0',
		borderBottom: '1px solid #1e1e1e',
	},
	fpKey: {
		fontFamily: 'monospace',
		fontSize: '12px',
		color: '#888',
		minWidth: '160px',
		flexShrink: 0,
	},
	fpVal: {
		color: '#ddd',
		fontSize: '13px',
		lineHeight: 1.4,
	},
	fpPre: {
		margin: 0,
		padding: '10px 12px',
		background: '#0f0f0f',
		border: '1px solid #2b2b2b',
		borderRadius: '8px',
		fontFamily: 'monospace',
		fontSize: '12px',
		color: '#34d399',
		whiteSpace: 'pre-wrap',
		wordBreak: 'break-all',
		cursor: 'pointer',
		lineHeight: 1.6,
	},
	fpFooter: {
		marginTop: '20px',
		fontSize: '12px',
		color: '#444',
		textAlign: 'center',
	},
	fpTriggerBtn: {
		position: 'fixed',
		top: '16px',
		right: '16px',
		background: '#1a1a1a',
		border: '1px solid #2b2b2b',
		borderRadius: '10px',
		width: '40px',
		height: '40px',
		fontSize: '18px',
		cursor: 'pointer',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		zIndex: 50,
		boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
	},
}

export default App
