import { useEffect, useMemo, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { zenLogo, collegeLogo } from '../assets/logoDataUrl'

import { API_URL } from '../config'

// Audio feedback using Web Audio API
class SoundPlayer {
    constructor() {
        this.ctx = null
    }

    init() {
        if (!this.ctx && typeof window !== 'undefined') {
            const AudioCtx = window.AudioContext || window.webkitAudioContext
            if (AudioCtx) this.ctx = new AudioCtx()
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume()
        }
    }

    playSuccess() {
        try {
            this.init()
            if (!this.ctx) return
            const now = this.ctx.currentTime
            const osc = this.ctx.createOscillator()
            const gain = this.ctx.createGain()
            osc.type = 'sine'
            osc.frequency.setValueAtTime(587.33, now) // D5
            osc.frequency.setValueAtTime(880, now + 0.1) // A5
            gain.gain.setValueAtTime(0.2, now)
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
            osc.connect(gain)
            gain.connect(this.ctx.destination)
            osc.start(now)
            osc.stop(now + 0.3)
        } catch {
            // Audio not supported or blocked
        }
    }

    playWarning() {
        try {
            this.init()
            if (!this.ctx) return
            const now = this.ctx.currentTime
            const osc = this.ctx.createOscillator()
            const gain = this.ctx.createGain()
            osc.type = 'sawtooth'
            osc.frequency.setValueAtTime(220, now) // A3 buzz
            osc.frequency.setValueAtTime(180, now + 0.15)
            gain.gain.setValueAtTime(0.25, now)
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4)
            osc.connect(gain)
            gain.connect(this.ctx.destination)
            osc.start(now)
            osc.stop(now + 0.4)
        } catch {
            // Audio not supported or blocked
        }
    }

    playError() {
        try {
            this.init()
            if (!this.ctx) return
            const now = this.ctx.currentTime
            const osc = this.ctx.createOscillator()
            const gain = this.ctx.createGain()
            osc.type = 'square'
            osc.frequency.setValueAtTime(140, now)
            gain.gain.setValueAtTime(0.2, now)
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25)
            osc.connect(gain)
            gain.connect(this.ctx.destination)
            osc.start(now)
            osc.stop(now + 0.25)
        } catch {
            // Audio not supported or blocked
        }
    }
}

const sound = new SoundPlayer()

const formatDateTime = (isoString) => {
    if (!isoString) return '—'
    const date = new Date(isoString)
    if (Number.isNaN(date.getTime())) return String(isoString)

    const dateFormatted = date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    })
    const timeFormatted = date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    })
    return `${dateFormatted} at ${timeFormatted}`
}

const getRelativeTime = (isoString) => {
    if (!isoString) return ''
    const date = new Date(isoString)
    if (Number.isNaN(date.getTime())) return ''
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diffSec < 10) return 'Just now'
    if (diffSec < 60) return `${diffSec}s ago`
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ${diffMin % 60}m ago`
    return `${Math.floor(diffHr / 24)}d ago`
}

async function parse(response) {
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || 'Request failed.')
    return data
}

export default function FoodAdminPage() {
    const [token, setToken] = useState(() => sessionStorage.getItem('zen-food-admin-token') || sessionStorage.getItem('zen-admin-token') || '')
    const [credentials, setCredentials] = useState({ username: '', password: '' })
    const [isLoading, setIsLoading] = useState(false)
    const [status, setStatus] = useState({ type: '', message: '' })

    // Food Scanner States
    const [passCodeInput, setPassCodeInput] = useState('')
    const [currentLookup, setCurrentLookup] = useState(null)
    const [isSearching, setIsSearching] = useState(false)
    const [isPurchasing, setIsPurchasing] = useState(false)
    const [foodType, setFoodType] = useState('Standard Lunch')
    const [notes, setNotes] = useState('')
    const [autoMarkOnScan, setAutoMarkOnScan] = useState(() => localStorage.getItem('zen-food-automark') === 'true')
    const [audioEnabled, setAudioEnabled] = useState(() => localStorage.getItem('zen-food-audio') !== 'false')
    const [cameraActive, setCameraActive] = useState(false)
    const [torchOn, setTorchOn] = useState(false)
    const [torchSupported, setTorchSupported] = useState(false)
    const [mobileTab, setMobileTab] = useState('scanner') // 'scanner' | 'search' | 'log'

    // Data lists
    const [foodRecords, setFoodRecords] = useState([])
    const [stats, setStats] = useState({
        totalEligible: 0,
        totalPurchases: 0,
        uniqueParticipantsServed: 0,
        pending: 0,
        servedInLastHour: 0,
    })
    const [historySearch, setHistorySearch] = useState('')
    const [historyFilter, setHistoryFilter] = useState('all') // 'all' | 'recent'

    // Manual student search
    const [manualSearchQuery, setManualSearchQuery] = useState('')
    const [manualSearchResults, setManualSearchResults] = useState([])
    const [isManualSearching, setIsManualSearching] = useState(false)

    const scannerRef = useRef(null)
    const inputRef = useRef(null)
    const handleBarcodeScannedRef = useRef(null)
    const lastScannedRef = useRef({ code: '', time: 0 })

    // Persist settings
    useEffect(() => {
        localStorage.setItem('zen-food-automark', String(autoMarkOnScan))
    }, [autoMarkOnScan])

    useEffect(() => {
        localStorage.setItem('zen-food-audio', String(audioEnabled))
    }, [audioEnabled])

    const request = async (path, options = {}) => {
        return parse(await fetch(`${API_URL}${path}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${token}`,
                ...options.headers,
            },
        }))
    }

    const loadRecordsAndStats = async () => {
        if (!token) return
        try {
            const [recordsData, statsData] = await Promise.all([
                request('/food/records'),
                request('/food/stats'),
            ])
            setFoodRecords(recordsData)
            setStats(statsData)
        } catch (error) {
            console.error('Failed to load food data:', error)
        }
    }

    useEffect(() => {
        if (token) {
            loadRecordsAndStats()
            const interval = setInterval(loadRecordsAndStats, 30000)
            return () => clearInterval(interval)
        }
    }, [token])

    // Focus input on mount (Desktop only to prevent virtual keyboard from pushing scanner off screen on mobile)
    useEffect(() => {
        if (token && inputRef.current && window.innerWidth > 768) {
            inputRef.current.focus()
        }
    }, [token])

    // Toggle flashlight / torch on mobile
    const toggleTorch = async () => {
        if (!scannerRef.current) return
        try {
            const next = !torchOn
            await scannerRef.current.applyVideoConstraints({
                advanced: [{ torch: next }],
            })
            setTorchOn(next)
        } catch (err) {
            console.warn('Torch toggle error:', err)
        }
    }

    // Camera Scanner Lifecycle using statically imported html5-qrcode
    useEffect(() => {
        let isCancelled = false

        const initAndStartCamera = async () => {
            if (!cameraActive) return

            const qrCodeRegionId = 'reader-food-camera'
            const el = document.getElementById(qrCodeRegionId)
            if (!el) return

            const formatsToSupport = [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.UPC_A,
            ]

            let html5QrCode = null
            try {
                // Native hardware BarcodeDetector (backed by Play Services on Android / Vision on iOS)
                html5QrCode = new Html5Qrcode(qrCodeRegionId, {
                    formatsToSupport,
                    verbose: false,
                    experimentalFeatures: {
                        useBarCodeDetectorIfSupported: true,
                    },
                })
                scannerRef.current = html5QrCode
            } catch (initErr) {
                console.error('Html5Qrcode initialization error:', initErr)
                setStatus({ type: 'error', message: `Camera scanner init error: ${initErr.message || initErr}` })
                setCameraActive(false)
                return
            }

            // Barcode passes are wide horizontal strips: narrow height scan box cuts CPU decoding pixels by 60%!
            const config = {
                fps: 25,
                qrbox: (viewfinderWidth, viewfinderHeight) => ({
                    width: Math.min(Math.floor(viewfinderWidth * 0.90), 380),
                    height: Math.min(Math.floor(viewfinderHeight * 0.42), 170),
                }),
                aspectRatio: 1.333333,
                videoConstraints: {
                    facingMode: { ideal: 'environment' },
                    width: { min: 640, ideal: 1280, max: 1920 },
                    height: { min: 480, ideal: 720, max: 1080 },
                    focusMode: 'continuous',
                },
            }

            const onScanSuccess = (decodedText) => {
                if (!decodedText || isCancelled) return
                const now = Date.now()
                // Debounce repeat scans of the same pass within 2.5s
                if (lastScannedRef.current.code === decodedText && now - lastScannedRef.current.time < 2500) {
                    return
                }
                lastScannedRef.current = { code: decodedText, time: now }

                // Instant haptic feedback for physical scanner feel
                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                    try { navigator.vibrate(80) } catch {}
                }

                handleBarcodeScannedRef.current?.(decodedText)
            }

            try {
                let cameraTarget = { facingMode: 'environment' }
                const devices = await Html5Qrcode.getCameras().catch(() => [])
                if (devices && devices.length > 0) {
                    const backCam = devices.find((d) => /back|rear|environment/i.test(d.label))
                    if (backCam) {
                        cameraTarget = backCam.id
                    }
                }

                if (isCancelled) return

                await html5QrCode.start(cameraTarget, config, onScanSuccess, () => {}).catch(async () => {
                    if (isCancelled) return
                    return html5QrCode.start({ facingMode: 'user' }, config, onScanSuccess, () => {}).catch(() => {
                        if (isCancelled) return
                        return html5QrCode.start(true, config, onScanSuccess, () => {})
                    })
                })

                if (isCancelled) {
                    html5QrCode.stop().catch(() => {})
                    return
                }

                // Check if torch / flashlight is supported
                try {
                    const caps = html5QrCode.getRunningTrackCameraCapabilities?.()
                    if (caps?.torchFeature?.()?.isSupported?.()) {
                        setTorchSupported(true)
                    } else {
                        const videoEl = el.querySelector('video')
                        const track = videoEl?.srcObject?.getVideoTracks?.()?.[0]
                        if (track?.getCapabilities?.()?.torch) {
                            setTorchSupported(true)
                        }
                    }
                } catch {
                    // Capability check fallback
                }
            } catch (err) {
                if (isCancelled) return
                console.error('Camera start error:', err)
                let userMsg = err.message || 'Could not access camera.'
                if (err.name === 'NotAllowedError' || /permission/i.test(err.message || '')) {
                    userMsg = 'Camera permission was denied. Please allow camera permissions in your browser address bar and try again.'
                } else if (err.name === 'NotFoundError' || /device not found/i.test(err.message || '')) {
                    userMsg = 'No camera found on this device.'
                }
                setStatus({ type: 'error', message: `Camera error: ${userMsg}` })
                setCameraActive(false)
            }
        }

        if (cameraActive) {
            initAndStartCamera()
        }

        return () => {
            isCancelled = true
            setTorchOn(false)
            setTorchSupported(false)
            if (scannerRef.current) {
                scannerRef.current
                    .stop()
                    .catch(() => {})
                    .finally(() => {
                        scannerRef.current = null
                    })
            }
        }
    }, [cameraActive])

    const login = async (e) => {
        e.preventDefault()
        setIsLoading(true)
        setStatus({ type: '', message: '' })
        try {
            const result = await parse(await fetch(`${API_URL}/food/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials),
            }))
            sessionStorage.setItem('zen-food-admin-token', result.token)
            setToken(result.token)
        } catch (error) {
            setStatus({ type: 'error', message: error.message })
        } finally {
            setIsLoading(false)
        }
    }

    const logout = () => {
        sessionStorage.removeItem('zen-food-admin-token')
        sessionStorage.removeItem('zen-admin-token')
        setToken('')
        setCurrentLookup(null)
    }

    // Record food purchase
    const recordFoodPurchase = async (passCode, force = false) => {
        setIsPurchasing(true)
        try {
            const result = await request('/food/purchase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    passCode,
                    foodType,
                    notes,
                    force,
                }),
            })

            if (audioEnabled) sound.playSuccess()
            setStatus({
                type: 'success',
                message: `🎉 Food recorded for ${result.participant.participantName}! (${formatDateTime(result.purchase.boughtAt)})`,
            })

            // Refresh lookup with new purchase info
            const updated = await request(`/food/lookup/${encodeURIComponent(passCode)}`)
            setCurrentLookup(updated)
            loadRecordsAndStats()
            setNotes('')
        } catch (error) {
            if (audioEnabled) sound.playError()
            setStatus({ type: 'error', message: error.message || 'Could not record food purchase.' })
        } finally {
            setIsPurchasing(false)
            if (inputRef.current && window.innerWidth > 768) inputRef.current.focus()
        }
    }

    // Lookup pass code
    const handleBarcodeScanned = async (codeToSearch) => {
        let clean = String(codeToSearch || '').trim()
        if (!clean) return

        // Extract code if a full URL or hash was scanned (e.g. https://...#ZEN-I-001)
        const urlMatch = clean.match(/(?:pass|barcode|code=|[#\/])([A-Za-z0-9\-_]+)$/i)
        if (urlMatch && (urlMatch[1].toUpperCase().includes('ZEN') || /^\d+$/.test(urlMatch[1]))) {
            clean = urlMatch[1]
        }

        setIsSearching(true)
        setStatus({ type: '', message: '' })
        setMobileTab('scanner') // switch to scanner tab on mobile so volunteer sees results immediately

        try {
            const data = await request(`/food/lookup/${encodeURIComponent(clean)}`)
            setCurrentLookup(data)

            if (data.alreadyBought) {
                if (audioEnabled) sound.playWarning()
                setStatus({
                    type: 'warning',
                    message: `⚠️ Food ALREADY bought by ${data.participant.participantName} at ${formatDateTime(data.lastBoughtAt)}!`,
                })
            } else {
                if (audioEnabled) sound.playSuccess()
                setStatus({
                    type: 'success',
                    message: `✅ Found eligible participant: ${data.participant.participantName} (${data.participant.passCode})`,
                })

                // Auto-mark if toggle is active
                if (autoMarkOnScan) {
                    await recordFoodPurchase(data.participant.passCode, false)
                }
            }
        } catch (error) {
            if (audioEnabled) sound.playError()
            setCurrentLookup(null)
            setStatus({ type: 'error', message: error.message || `Pass code "${clean}" not recognized.` })
        } finally {
            setIsSearching(false)
            setPassCodeInput('')
            if (inputRef.current && window.innerWidth > 768) inputRef.current.focus()
        }
    }

    useEffect(() => {
        handleBarcodeScannedRef.current = handleBarcodeScanned
    })

    const handleFormSubmit = (e) => {
        e.preventDefault()
        handleBarcodeScanned(passCodeInput)
    }

    // Delete/Undo food purchase
    const deleteRecord = async (id, name) => {
        if (!window.confirm(`Are you sure you want to remove the food record for ${name || 'this participant'}?`)) return
        try {
            await request(`/food/records/${id}`, { method: 'DELETE' })
            setStatus({ type: 'success', message: 'Food record removed.' })
            if (currentLookup?.participant?.passCode) {
                const refreshed = await request(`/food/lookup/${encodeURIComponent(currentLookup.participant.passCode)}`)
                setCurrentLookup(refreshed)
            }
            loadRecordsAndStats()
        } catch (error) {
            setStatus({ type: 'error', message: error.message })
        }
    }

    // Export CSV
    const exportFoodCsv = async () => {
        try {
            const response = await fetch(`${API_URL}/food/export`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (!response.ok) throw new Error('Export failed')
            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `zen-it-trix-food-log-${new Date().toISOString().slice(0, 10)}.csv`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(url)
        } catch (error) {
            setStatus({ type: 'error', message: error.message })
        }
    }

    // Participant manual search
    const searchParticipantsManual = async (query) => {
        setManualSearchQuery(query)
        if (!query || query.length < 2) {
            setManualSearchResults([])
            return
        }
        setIsManualSearching(true)
        try {
            const results = await request(`/food/search-participants?q=${encodeURIComponent(query)}`)
            setManualSearchResults(results)
        } catch (error) {
            console.error(error)
        } finally {
            setIsManualSearching(false)
        }
    }

    const [filterCutoff, setFilterCutoff] = useState(() => Date.now() - 60 * 60 * 1000)

    // Filtered records
    const filteredRecords = useMemo(() => {
        let list = foodRecords
        if (historyFilter === 'recent') {
            list = list.filter((r) => new Date(r.boughtAt).getTime() >= filterCutoff)
        }
        if (historySearch.trim()) {
            const q = historySearch.toLowerCase()
            list = list.filter((r) =>
                r.participantName?.toLowerCase().includes(q) ||
                r.passCode?.toLowerCase().includes(q) ||
                r.college?.toLowerCase().includes(q) ||
                r.foodType?.toLowerCase().includes(q) ||
                r.phone?.includes(q)
            )
        }
        return list
    }, [foodRecords, historyFilter, historySearch, filterCutoff])

    // If not logged in, render Food Admin Login Form
    if (!token) {
        return (
            <main className="admin-page food-admin-page">
                <div className="admin-login-card food-login-card">
                    <span className="login-badge-tag">FOOD COUNTER PORTAL // ZEN-IT-TRIX 2.0</span>
                    <header className="admin-login-header">
                        <h1>Food Counter <em>Desk.</em></h1>
                        <p className="login-college-sub">Annapoorana Engineering College · Catering Control</p>
                        <p className="login-instructions">
                            Scan participant barcodes to verify who already bought food, view timestamps, and manage meal tokens.
                        </p>
                    </header>

                    <form className="admin-login-form" onSubmit={login}>
                        <label>
                            Username
                            <input
                                autoFocus
                                required
                                value={credentials.username}
                                onChange={(e) => setCredentials((curr) => ({ ...curr, username: e.target.value }))}
                                placeholder="foodadmin or admin"
                            />
                        </label>
                        <label>
                            Password
                            <input
                                type="password"
                                required
                                value={credentials.password}
                                onChange={(e) => setCredentials((curr) => ({ ...curr, password: e.target.value }))}
                                placeholder="Enter access password"
                            />
                        </label>

                        {status.message && <p className={`admin-alert ${status.type}`}>{status.message}</p>}

                        <button className="admin-submit-btn" disabled={isLoading}>
                            {isLoading ? 'Verifying access...' : 'Open Food Counter'}
                        </button>

                        <div className="food-login-footer-links">
                            <a href="#admin">Switch to Registration Admin</a>
                            <a href="#">Return to Event Website</a>
                        </div>
                    </form>
                </div>
            </main>
        )
    }

    return (
        <main className="admin-page food-admin-page">
            {/* Top Navigation & Status Bar */}
            <header className="food-admin-header">
                <div className="food-header-brand">
                    <div className="food-header-logos">
                        <img src={zenLogo} alt="Zen Logo" className="food-brand-logo" />
                        <img src={collegeLogo} alt="College Logo" className="food-college-logo" />
                    </div>
                    <div>
                        <div className="food-eyebrow">
                            <span className="pulse-dot"></span>
                            FOOD ADMIN DESK // LIVE SCANNER
                        </div>
                        <h1 className="food-title">Food & Catering <em>Control.</em></h1>
                    </div>
                </div>

                <div className="food-header-actions">
                    <button
                        type="button"
                        className="food-btn food-btn-outline"
                        onClick={exportFoodCsv}
                        title="Export Food Log CSV"
                    >
                        <span>📥</span> Export Food Log
                    </button>
                    <a href="#admin" className="food-btn food-btn-outline">
                        <span>📋</span> Reg Admin
                    </a>
                    <button type="button" className="food-btn food-btn-danger" onClick={logout}>
                        Sign Out
                    </button>
                </div>
            </header>

            {/* Mobile Quick Stats Summary Bar */}
            <div className="food-mobile-stat-bar">
                <div className="mobile-stat-pill">
                    <span className="stat-pill-label">🍱 Served</span>
                    <strong className="stat-pill-val text-lime">{stats.uniqueParticipantsServed}</strong>
                    <span className="stat-pill-denom">/{stats.totalEligible}</span>
                </div>
                <div className="mobile-stat-pill">
                    <span className="stat-pill-label">⏳ Pending</span>
                    <strong className="stat-pill-val text-amber">{stats.pending}</strong>
                </div>
                <div className="mobile-stat-pill">
                    <span className="stat-pill-label">⚡ Last Hr</span>
                    <strong className="stat-pill-val text-cyan">{stats.servedInLastHour}</strong>
                </div>
            </div>

            {/* Mobile Segmented Navigation Tabs */}
            <nav className="food-mobile-tabs" aria-label="Food Admin Navigation">
                <button
                    type="button"
                    className={`food-mobile-tab-btn ${mobileTab === 'scanner' ? 'active' : ''}`}
                    onClick={() => setMobileTab('scanner')}
                >
                    <span className="tab-btn-icon">📷</span>
                    <span>Scanner</span>
                </button>
                <button
                    type="button"
                    className={`food-mobile-tab-btn ${mobileTab === 'search' ? 'active' : ''}`}
                    onClick={() => setMobileTab('search')}
                >
                    <span className="tab-btn-icon">🔍</span>
                    <span>Search Student</span>
                </button>
                <button
                    type="button"
                    className={`food-mobile-tab-btn ${mobileTab === 'log' ? 'active' : ''}`}
                    onClick={() => setMobileTab('log')}
                >
                    <span className="tab-btn-icon">📋</span>
                    <span>Food Log {foodRecords.length > 0 ? `(${foodRecords.length})` : ''}</span>
                </button>
            </nav>

            {/* KPI Stats Grid (Visible on desktop; on mobile only inside the 'log' tab) */}
            <section className={`food-stats-grid ${mobileTab !== 'log' ? 'hide-mobile' : ''}`}>
                <div className="food-stat-card card-served">
                    <span className="food-stat-label">🍱 FOOD BOUGHT / SERVED</span>
                    <div className="food-stat-val text-lime">
                        {stats.uniqueParticipantsServed}
                        <small className="stat-denom">/ {stats.totalEligible}</small>
                    </div>
                    <span className="food-stat-sub">
                        {stats.totalPurchases} total tokens issued ({stats.totalEligible ? Math.round((stats.uniqueParticipantsServed / stats.totalEligible) * 100) : 0}% distributed)
                    </span>
                </div>

                <div className="food-stat-card card-pending">
                    <span className="food-stat-label">⏳ PENDING MEALS</span>
                    <div className="food-stat-val text-amber">{stats.pending}</div>
                    <span className="food-stat-sub">Students yet to claim food</span>
                </div>

                <div className="food-stat-card card-recent">
                    <span className="food-stat-label">⚡ LAST 60 MINUTES</span>
                    <div className="food-stat-val text-cyan">{stats.servedInLastHour}</div>
                    <span className="food-stat-sub">Recent peak counter activity</span>
                </div>

                <div className="food-stat-card card-total">
                    <span className="food-stat-label">👥 TOTAL REGISTERED</span>
                    <div className="food-stat-val text-ink">{stats.totalEligible}</div>
                    <span className="food-stat-sub">Individuals + Team Members</span>
                </div>
            </section>

            {/* Scanner Controls Toolbar */}
            <section className={`food-scanner-toolbar ${mobileTab !== 'scanner' ? 'hide-mobile' : ''}`}>
                <div className="toolbar-left">
                    <button
                        type="button"
                        className={`scanner-toggle-btn ${cameraActive ? 'active' : ''}`}
                        onClick={() => setCameraActive(!cameraActive)}
                    >
                        <span>📷</span>
                        {cameraActive ? 'Close Camera Scanner' : 'Open Camera Scanner'}
                    </button>

                    <label className="toolbar-toggle-label">
                        <input
                            type="checkbox"
                            checked={autoMarkOnScan}
                            onChange={(e) => setAutoMarkOnScan(e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                        <span className="toggle-text">⚡ Auto-mark as bought on scan</span>
                    </label>

                    <label className="toolbar-toggle-label">
                        <input
                            type="checkbox"
                            checked={audioEnabled}
                            onChange={(e) => setAudioEnabled(e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                        <span className="toggle-text">🔊 Sound feedback</span>
                    </label>
                </div>

                <div className="toolbar-right">
                    <button
                        type="button"
                        className="food-btn food-btn-sm"
                        onClick={loadRecordsAndStats}
                    >
                        🔄 Refresh Data
                    </button>
                </div>
            </section>

            {/* Status Alert Banner */}
            {status.message && (
                <div className={`food-alert-banner ${status.type}`}>
                    <span>{status.message}</span>
                    <button type="button" onClick={() => setStatus({ type: '', message: '' })}>✕</button>
                </div>
            )}

            {/* Main Interactive Scanner Grid */}
            <section className="food-main-layout">
                {/* Left Column: Barcode Scanner & Result */}
                <div className={`food-scanner-column ${mobileTab !== 'scanner' ? 'hide-mobile' : ''}`}>
                    {/* Big Launch Button on Mobile when camera is off */}
                    {!cameraActive && (
                        <button
                            type="button"
                            className="food-open-camera-hero-btn"
                            onClick={() => setCameraActive(true)}
                        >
                            <span className="hero-btn-icon">📷</span>
                            <div className="hero-btn-text">
                                <strong>Open Camera Scanner</strong>
                                <span>Tap to scan Code 128 / QR badge instantly</span>
                            </div>
                            <span className="hero-btn-badge">FAST SCAN</span>
                        </button>
                    )}

                    {/* Camera Video Stream (conditionally visible) */}
                    {cameraActive && (
                        <div className="food-camera-card">
                            <div className="camera-header">
                                <div className="camera-header-title">
                                    <span className="camera-pulse-dot"></span>
                                    <span>LIVE CAMERA SCANNER</span>
                                </div>
                                <div className="camera-header-tools">
                                    {torchSupported && (
                                        <button
                                            type="button"
                                            className={`camera-tool-btn ${torchOn ? 'active' : ''}`}
                                            onClick={toggleTorch}
                                            title="Toggle Flashlight"
                                        >
                                            {torchOn ? '🔦 Flashlight ON' : '💡 Flashlight'}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="camera-tool-btn close-btn"
                                        onClick={() => setCameraActive(false)}
                                    >
                                        ✕ Close
                                    </button>
                                </div>
                            </div>

                            <div className="camera-viewport-container">
                                <div id="reader-food-camera" className="camera-viewport"></div>
                                <div className="camera-targeting-overlay">
                                    <div className="target-corners">
                                        <div className="c-corner c-tl"></div>
                                        <div className="c-corner c-tr"></div>
                                        <div className="c-corner c-bl"></div>
                                        <div className="c-corner c-br"></div>
                                    </div>
                                    <div className="camera-laser-scan-line"></div>
                                    <span className="camera-target-hint">Hold barcode horizontally inside the box</span>
                                </div>
                            </div>
                            <p className="camera-hint">⚡ Hardware-accelerated scanning enabled</p>
                        </div>
                    )}

                    {/* Barcode Input Card */}
                    <div className="food-input-card">
                        <form onSubmit={handleFormSubmit} className="barcode-form">
                            <label className="barcode-input-label" htmlFor="barcode-scanner-field">
                                SCAN BARCODE OR ENTER PASS CODE
                            </label>
                            <div className="barcode-input-group">
                                <span className="barcode-icon">▌│█║▌</span>
                                <input
                                    id="barcode-scanner-field"
                                    ref={inputRef}
                                    type="text"
                                    value={passCodeInput}
                                    onChange={(e) => setPassCodeInput(e.target.value)}
                                    placeholder="Scan barcode or type ZEN-I-001..."
                                    autoComplete="off"
                                    spellCheck="false"
                                />
                                <button type="submit" className="food-scan-submit-btn" disabled={isSearching || !passCodeInput.trim()}>
                                    {isSearching ? 'Looking up...' : 'Scan / Check'}
                                </button>
                                {passCodeInput && (
                                    <button
                                        type="button"
                                        className="food-input-clear-btn"
                                        onClick={() => { setPassCodeInput(''); inputRef.current?.focus() }}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        </form>

                        {/* Quick Sample Test Chips */}
                        <div className="sample-chips-bar">
                            <span className="chips-label">Quick test passes:</span>
                            {['ZEN-I-001', 'ZEN-I-002', 'ZEN-T-001', 'ZEN-T-002'].map((code) => (
                                <button
                                    key={code}
                                    type="button"
                                    className="test-chip"
                                    onClick={() => handleBarcodeScanned(code)}
                                >
                                    {code}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Scan Result Card */}
                    {currentLookup ? (
                        <div className={`food-result-card ${currentLookup.alreadyBought ? 'status-already-bought' : 'status-fresh'}`}>
                            {/* Prominent Header Banner */}
                            <div className="result-header-banner">
                                {currentLookup.alreadyBought ? (
                                    <div className="banner-content warning-banner">
                                        <span className="banner-icon">⚠️</span>
                                        <div>
                                            <div className="banner-title">FOOD ALREADY BOUGHT!</div>
                                            <div className="banner-subtitle">
                                                This participant has already claimed their food.
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="banner-content success-banner">
                                        <span className="banner-icon">✅</span>
                                        <div>
                                            <div className="banner-title">ELIGIBLE FOR FOOD</div>
                                            <div className="banner-subtitle">
                                                Has not purchased or claimed food yet.
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Participant Identification Details */}
                            <div className="participant-details-grid">
                                <div className="detail-item detail-name">
                                    <span className="detail-label">Participant Name</span>
                                    <strong className="detail-value-highlight">
                                        {currentLookup.participant.participantName}
                                    </strong>
                                </div>

                                <div className="detail-item detail-pass">
                                    <span className="detail-label">Pass Code</span>
                                    <span className="pass-code-badge">{currentLookup.participant.passCode}</span>
                                </div>

                                <div className="detail-item">
                                    <span className="detail-label">College</span>
                                    <span className="detail-value">{currentLookup.participant.college || '—'}</span>
                                </div>

                                <div className="detail-item">
                                    <span className="detail-label">Year of Study</span>
                                    <span className="detail-value">{currentLookup.participant.yearOfStudy || '—'}</span>
                                </div>

                                <div className="detail-item">
                                    <span className="detail-label">Registration Type</span>
                                    <span className="detail-value">
                                        {currentLookup.participant.registrationType === 'team' ? (
                                            <span className="badge-team">Team: {currentLookup.participant.teamName || 'Pass'}</span>
                                        ) : (
                                            <span className="badge-solo">Individual</span>
                                        )}
                                    </span>
                                </div>

                                <div className="detail-item">
                                    <span className="detail-label">Registered Event</span>
                                    <span className="detail-value">{currentLookup.participant.eventName || '—'}</span>
                                </div>

                                <div className="detail-item">
                                    <span className="detail-label">Contact</span>
                                    <span className="detail-value">{currentLookup.participant.phone || currentLookup.participant.email || '—'}</span>
                                </div>
                            </div>

                            {/* EXACT PURCHASE TIMESTAMPS SECTION */}
                            {currentLookup.alreadyBought && currentLookup.purchases?.length > 0 && (
                                <div className="purchase-timestamps-box">
                                    <div className="timestamps-box-header">
                                        <span>🕒 WHEN THEY BOUGHT THE FOOD</span>
                                        <span className="tokens-count-badge">
                                            {currentLookup.purchaseCount} {currentLookup.purchaseCount === 1 ? 'Token' : 'Tokens'} Issued
                                        </span>
                                    </div>

                                    <div className="timestamps-list">
                                        {currentLookup.purchases.map((p, idx) => (
                                            <div key={p.id || idx} className="timestamp-item">
                                                <div className="ts-main">
                                                    <span className="ts-dot"></span>
                                                    <div className="ts-text">
                                                        <strong className="ts-time">{formatDateTime(p.boughtAt)}</strong>
                                                        <span className="ts-relative">({getRelativeTime(p.boughtAt)})</span>
                                                    </div>
                                                </div>
                                                <div className="ts-meta">
                                                    <span className="ts-type">{p.foodType}</span>
                                                    <span className="ts-server">Served by: {p.servedBy}</span>
                                                    {p.notes && <span className="ts-notes">Note: {p.notes}</span>}
                                                </div>
                                                <button
                                                    type="button"
                                                    className="ts-undo-btn"
                                                    title="Undo / Remove this purchase"
                                                    onClick={() => deleteRecord(p.id, currentLookup.participant.participantName)}
                                                >
                                                    Undo
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Actions Area */}
                            <div className="result-actions-panel">
                                <div className="meal-type-selector">
                                    <label>
                                        Meal Type:
                                        <select value={foodType} onChange={(e) => setFoodType(e.target.value)}>
                                            <option value="Standard Lunch">Standard Lunch</option>
                                            <option value="Veg Lunch Meal">Veg Lunch Meal</option>
                                            <option value="Non-Veg Lunch Meal">Non-Veg Lunch Meal</option>
                                            <option value="Snack & Refreshment">Snack & Refreshment</option>
                                            <option value="Dinner Meal">Dinner Meal</option>
                                        </select>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Optional note / counter ID..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="meal-note-input"
                                    />
                                </div>

                                <div className="result-buttons-row">
                                    {!currentLookup.alreadyBought ? (
                                        <button
                                            type="button"
                                            className="action-confirm-buy-btn"
                                            disabled={isPurchasing}
                                            onClick={() => recordFoodPurchase(currentLookup.participant.passCode, false)}
                                        >
                                            {isPurchasing ? 'Recording...' : '🍱 Confirm & Mark as Bought'}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            className="action-override-buy-btn"
                                            disabled={isPurchasing}
                                            onClick={() => {
                                                if (window.confirm(`Participant already bought food at ${formatDateTime(currentLookup.lastBoughtAt)}. Are you sure you want to issue an extra food token?`)) {
                                                    recordFoodPurchase(currentLookup.participant.passCode, true)
                                                }
                                            }}
                                        >
                                            {isPurchasing ? 'Recording...' : '⚠️ Issue Additional Meal (Override)'}
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        className="action-clear-btn"
                                        onClick={() => {
                                            setCurrentLookup(null)
                                            if (inputRef.current && window.innerWidth > 768) inputRef.current.focus()
                                        }}
                                    >
                                        Clear / Next Scan
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="food-scanner-placeholder">
                            <div className="placeholder-icon">⚡</div>
                            <h3>Scanner Ready</h3>
                            <p>
                                Scan any participant's barcode pass or type their pass code above.
                                The system will instantly check if they have already bought food and display the exact timestamp.
                            </p>
                        </div>
                    )}
                </div>

                {/* Right Column: Participant Search & Live Food Log */}
                <div className="food-side-column">
                    {/* Manual Search Card (For students without barcode) */}
                    <div className={`food-manual-search-card ${mobileTab !== 'search' ? 'hide-mobile' : ''}`}>
                        <div className="manual-search-header">
                            <span>🔍 LOST BARCODE? SEARCH PARTICIPANT</span>
                        </div>
                        <input
                            type="search"
                            value={manualSearchQuery}
                            onChange={(e) => searchParticipantsManual(e.target.value)}
                            placeholder="Search student by name, phone, or college..."
                            className="manual-search-input"
                        />
                        {isManualSearching && <p className="manual-searching-note">Searching participants...</p>}
                        {manualSearchResults.length > 0 && (
                            <div className="manual-results-list">
                                {manualSearchResults.map((p) => (
                                    <div
                                        key={p.passCode}
                                        className="manual-result-row"
                                        onClick={() => {
                                            handleBarcodeScanned(p.passCode)
                                            setManualSearchQuery('')
                                            setManualSearchResults([])
                                            setMobileTab('scanner')
                                        }}
                                    >
                                        <div className="manual-row-info">
                                            <strong>{p.participantName}</strong>
                                            <span className="manual-row-meta">{p.college} · {p.phone}</span>
                                        </div>
                                        <span className="manual-row-pass">{p.passCode} →</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Live Purchases History Log */}
                    <div className={`food-history-card ${mobileTab !== 'log' ? 'hide-mobile' : ''}`}>
                        <div className="history-header">
                            <div>
                                <span className="history-eyebrow">LIVE LOG</span>
                                <h2>Who Already Bought Food ({filteredRecords.length})</h2>
                            </div>
                            <div className="history-filter-pills">
                                <button
                                    type="button"
                                    className={`pill-btn ${historyFilter === 'all' ? 'active' : ''}`}
                                    onClick={() => setHistoryFilter('all')}
                                >
                                    All ({foodRecords.length})
                                </button>
                                <button
                                    type="button"
                                    className={`pill-btn ${historyFilter === 'recent' ? 'active' : ''}`}
                                    onClick={() => {
                                        setHistoryFilter('recent')
                                        setFilterCutoff(Date.now() - 60 * 60 * 1000)
                                    }}
                                >
                                    Last Hour ({stats.servedInLastHour})
                                </button>
                            </div>
                        </div>

                        <div className="history-search-bar">
                            <input
                                type="search"
                                value={historySearch}
                                onChange={(e) => setHistorySearch(e.target.value)}
                                placeholder="Filter records by name, pass code, college..."
                            />
                        </div>

                        <div className="history-table-container">
                            {filteredRecords.length === 0 ? (
                                <p className="history-empty-message">No food purchase records found.</p>
                            ) : (
                                <table className="food-history-table">
                                    <thead>
                                        <tr>
                                            <th>Pass Code</th>
                                            <th>Student Name</th>
                                            <th>When Bought</th>
                                            <th>Meal</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRecords.map((record) => (
                                            <tr key={record.id}>
                                                <td>
                                                    <button
                                                        type="button"
                                                        className="history-pass-btn"
                                                        onClick={() => {
                                                            handleBarcodeScanned(record.passCode)
                                                            setMobileTab('scanner')
                                                        }}
                                                        title="Lookup this participant"
                                                    >
                                                        {record.passCode}
                                                    </button>
                                                </td>
                                                <td>
                                                    <div className="table-student-cell">
                                                        <strong className="student-name">{record.participantName}</strong>
                                                        <span className="student-college">{record.college || '—'}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="table-time-cell">
                                                        <strong className="time-primary">{formatDateTime(record.boughtAt)}</strong>
                                                        <span className="time-relative">{getRelativeTime(record.boughtAt)}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="meal-tag">{record.foodType}</span>
                                                </td>
                                                <td>
                                                    <button
                                                        type="button"
                                                        className="table-undo-btn"
                                                        onClick={() => deleteRecord(record.id, record.participantName)}
                                                        title="Delete record"
                                                    >
                                                        ✕
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            </section>
        </main>
    )
}
