import { useEffect, useMemo, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

import { API_URL } from '../config'
import './FoodAdmin.css'

// Sound player using Web Audio API
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
            osc.frequency.setValueAtTime(880, now + 0.08) // A5
            gain.gain.setValueAtTime(0.2, now)
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28)
            osc.connect(gain)
            gain.connect(this.ctx.destination)
            osc.start(now)
            osc.stop(now + 0.28)
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
            osc.frequency.setValueAtTime(180, now + 0.12)
            gain.gain.setValueAtTime(0.22, now)
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35)
            osc.connect(gain)
            gain.connect(this.ctx.destination)
            osc.start(now)
            osc.stop(now + 0.35)
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
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22)
            osc.connect(gain)
            gain.connect(this.ctx.destination)
            osc.start(now)
            osc.stop(now + 0.22)
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

const getInitials = (name) => {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const MEAL_PRESETS = [
    { id: 'Standard Lunch', label: 'Standard Lunch', short: 'Lunch' },
    { id: 'Veg Lunch Meal', label: 'Veg Lunch', short: 'Veg' },
    { id: 'Non-Veg Lunch Meal', label: 'Non-Veg Lunch', short: 'Non-Veg' },
    { id: 'Snack & Refreshment', label: 'Snacks & Tea', short: 'Snacks' },
    { id: 'Dinner Meal', label: 'Dinner Meal', short: 'Dinner' },
]

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
    const [showModal, setShowModal] = useState(false)
    const [justPurchased, setJustPurchased] = useState(false)
    const [modalLoading, setModalLoading] = useState(false)
    const [activeLookupCode, setActiveLookupCode] = useState('')
    const [isRefreshing, setIsRefreshing] = useState(false)

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
    const lookupCacheRef = useRef(new Map())

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
        setIsRefreshing(true)
        try {
            const [recordsData, statsData] = await Promise.all([
                request('/food/records'),
                request('/food/stats'),
            ])
            setFoodRecords(recordsData)
            setStats(statsData)

            // Pre-seed lookup cache with participants from food records
            if (Array.isArray(recordsData)) {
                recordsData.forEach((r) => {
                    if (r.passCode) {
                        const codeUpper = r.passCode.toUpperCase()
                        if (!lookupCacheRef.current.has(codeUpper)) {
                            lookupCacheRef.current.set(codeUpper, {
                                found: true,
                                participant: {
                                    participantName: r.participantName,
                                    passCode: r.passCode,
                                    college: r.college,
                                    phone: r.phone,
                                    registrationType: 'individual',
                                    eventName: 'Symposium',
                                },
                                alreadyBought: true,
                                purchaseCount: 1,
                                purchases: [r],
                                lastBoughtAt: r.boughtAt,
                            })
                        }
                    }
                })
            }
        } catch (error) {
            console.error('Failed to load food data:', error)
        } finally {
            setIsRefreshing(false)
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

            const config = {
                fps: 15,
                qrbox: (viewfinderWidth, viewfinderHeight) => ({
                    width: Math.min(Math.floor(viewfinderWidth * 0.90), 380),
                    height: Math.min(Math.floor(viewfinderHeight * 0.44), 175),
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

    const closeModal = () => {
        setShowModal(false)
        setCurrentLookup(null)
        setJustPurchased(false)
        setModalLoading(false)
        if (inputRef.current && window.innerWidth > 768) {
            inputRef.current.focus()
        }
    }

    // Close popup on Escape
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                closeModal()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    const logout = () => {
        sessionStorage.removeItem('zen-food-admin-token')
        sessionStorage.removeItem('zen-admin-token')
        setToken('')
        setCurrentLookup(null)
        setShowModal(false)
        setJustPurchased(false)
        setModalLoading(false)
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
                    notes: notes.trim() || undefined,
                    force,
                }),
            })

            if (audioEnabled) sound.playSuccess()
            setStatus({
                type: 'success',
                message: `Meal marked for ${result.participant.participantName}! (${formatDateTime(result.purchase.boughtAt)})`,
            })

            // Construct updated lookup instantly without redundant network roundtrip
            const upperCode = passCode.toUpperCase()
            const prevPurchases = currentLookup?.purchases || []
            const updated = {
                found: true,
                participant: result.participant,
                alreadyBought: true,
                purchaseCount: prevPurchases.length + 1,
                purchases: [result.purchase, ...prevPurchases],
                lastBoughtAt: result.purchase.boughtAt,
            }
            lookupCacheRef.current.set(upperCode, updated)
            setCurrentLookup(updated)
            setJustPurchased(true)
            setShowModal(true)
            setModalLoading(false)
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
        const urlMatch = clean.match(/(?:pass|barcode|code=|[#/])([A-Za-z0-9\-_]+)$/i)
        if (urlMatch && (urlMatch[1].toUpperCase().includes('ZEN') || /^\d+$/.test(urlMatch[1]))) {
            clean = urlMatch[1]
        }

        const upperCode = clean.toUpperCase()
        setActiveLookupCode(clean)
        setIsSearching(true)
        setStatus({ type: '', message: '' })
        setMobileTab('scanner')

        // 1. Instant cache hit check (0ms display!)
        const cached = lookupCacheRef.current.get(upperCode)
        if (cached) {
            setCurrentLookup(cached)
            setJustPurchased(false)
            setModalLoading(false)
            setShowModal(true)
            if (cached.alreadyBought) {
                if (audioEnabled) sound.playWarning()
            } else {
                if (audioEnabled) sound.playSuccess()
            }
        } else {
            // Open modal immediately in loading state
            setCurrentLookup(null)
            setJustPurchased(false)
            setModalLoading(true)
            setShowModal(true)
        }

        try {
            const data = await request(`/food/lookup/${encodeURIComponent(clean)}`)
            lookupCacheRef.current.set(upperCode, data)
            setCurrentLookup(data)
            setModalLoading(false)

            if (data.alreadyBought) {
                if (audioEnabled && !cached) sound.playWarning()
                setStatus({
                    type: 'warning',
                    message: `FOOD ALREADY CLAIMED by ${data.participant.participantName} at ${formatDateTime(data.lastBoughtAt)}!`,
                })
            } else {
                if (audioEnabled && !cached) sound.playSuccess()
                setStatus({
                    type: 'success',
                    message: `Eligible participant: ${data.participant.participantName} (${data.participant.passCode})`,
                })

                // Auto-mark if toggle is active
                if (autoMarkOnScan) {
                    await recordFoodPurchase(data.participant.passCode, false)
                }
            }
        } catch (error) {
            if (audioEnabled) sound.playError()
            if (!cached) {
                setShowModal(false)
                setCurrentLookup(null)
            }
            setStatus({ type: 'error', message: error.message || `Pass code "${clean}" not recognized.` })
        } finally {
            setIsSearching(false)
            setModalLoading(false)
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
        if (!window.confirm(`Are you sure you want to remove the meal record for ${name || 'this participant'}?`)) return
        try {
            await request(`/food/records/${id}`, { method: 'DELETE' })
            setStatus({ type: 'success', message: 'Meal record removed.' })
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

    const percentageServed = useMemo(() => {
        if (!stats.totalEligible || stats.totalEligible <= 0) return 0
        return Math.min(100, Math.round((stats.uniqueParticipantsServed / stats.totalEligible) * 100))
    }, [stats.uniqueParticipantsServed, stats.totalEligible])

    // ==========================================
    // RENDER: Login Screen
    // ==========================================
    if (!token) {
        return (
            <main className="admin-page food-admin-page">
                <div className="admin-login-card food-login-card">
                    <div className="login-badge-pill">
                        <span className="live-pulse-dot"></span>
                        CATERING DESK · ZEN-IT-TRIX 2.0
                    </div>

                    <header className="food-login-header">
                        <h1>Food Counter <em>Desk</em></h1>
                        <p className="login-sub">Annapoorana Engineering College · Catering Control Portal</p>
                        <p className="login-desc">
                            Authorized volunteer terminal to scan badges, verify meal eligibility, record tokens, and prevent double claims.
                        </p>
                    </header>

                    <form className="admin-login-form" onSubmit={login}>
                        <label className="login-input-label">
                            <span>Operator Username</span>
                            <div className="input-with-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                    <circle cx="12" cy="7" r="4"/>
                                </svg>
                                <input
                                    autoFocus
                                    required
                                    value={credentials.username}
                                    onChange={(e) => setCredentials((curr) => ({ ...curr, username: e.target.value }))}
                                    placeholder="foodadmin or admin"
                                />
                            </div>
                        </label>

                        <label className="login-input-label">
                            <span>Access Password</span>
                            <div className="input-with-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                </svg>
                                <input
                                    type="password"
                                    required
                                    value={credentials.password}
                                    onChange={(e) => setCredentials((curr) => ({ ...curr, password: e.target.value }))}
                                    placeholder="Enter operator password"
                                />
                            </div>
                        </label>

                        {status.message && <p className={`admin-alert ${status.type}`}>{status.message}</p>}

                        <button className="food-primary-btn food-btn-block" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <span className="btn-spinner"></span>
                                    <span>Verifying Credentials...</span>
                                </>
                            ) : (
                                <>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                                        <polyline points="10 17 15 12 10 7"/>
                                        <line x1="15" y1="12" x2="3" y2="12"/>
                                    </svg>
                                    <span>Open Counter Portal</span>
                                </>
                            )}
                        </button>

                        <div className="food-login-footer-links">
                            <a href="#admin">Registration Admin →</a>
                            <a href="#">Main Event Page →</a>
                        </div>
                    </form>
                </div>
            </main>
        )
    }

    // ==========================================
    // RENDER: Authenticated Food Counter Dashboard
    // ==========================================
    return (
        <main className="admin-page food-admin-page">
            {/* Top Navigation & Status Bar */}
            <header className="food-admin-header">
                <div className="food-header-brand">
                    <div className="food-badge-strip">
                        <span className="live-pulse-dot"></span>
                        <span className="badge-text">LIVE DISPATCH TERMINAL</span>
                        <span className="badge-separator">/</span>
                        <span className="badge-time">
                            {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </span>
                    </div>
                    <div className="food-header-title-row">
                        <h1 className="food-title">Food Counter <em>Desk</em></h1>
                        <span className="food-velocity-pill" title="Students served in the last 60 minutes">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                            </svg>
                            {stats.servedInLastHour}/hr velocity
                        </span>
                    </div>
                </div>

                <div className="food-header-actions">
                    <button
                        type="button"
                        className={`food-btn food-btn-outline ${isRefreshing ? 'refreshing' : ''}`}
                        onClick={loadRecordsAndStats}
                        title="Reload live participant and stats count"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                        </svg>
                        <span>Refresh</span>
                    </button>

                    <button
                        type="button"
                        className="food-btn food-btn-outline"
                        onClick={exportFoodCsv}
                        title="Download CSV report of all claimed meals"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        <span>Export CSV</span>
                    </button>

                    <a href="#admin" className="food-btn food-btn-outline" title="Switch to Registration Admin">
                        <span>Reg Admin</span>
                    </a>

                    <button type="button" className="food-btn food-btn-danger" onClick={logout} title="Sign out of food counter">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                            <polyline points="16 17 21 12 16 7"/>
                            <line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                        <span>Exit</span>
                    </button>
                </div>
            </header>

            {/* Mobile Top Stats Summary Pill Bar */}
            <div className="food-mobile-stat-bar">
                <div className="mobile-stat-pill">
                    <span className="stat-pill-label">Served:</span>
                    <strong className="stat-pill-val text-lime">{stats.uniqueParticipantsServed}</strong>
                    <span className="stat-pill-denom">/{stats.totalEligible}</span>
                </div>
                <div className="mobile-stat-pill">
                    <span className="stat-pill-label">Pending:</span>
                    <strong className="stat-pill-val text-amber">{stats.pending}</strong>
                </div>
                <div className="mobile-stat-pill">
                    <span className="stat-pill-label">Last Hr:</span>
                    <strong className="stat-pill-val text-cyan">{stats.servedInLastHour}</strong>
                </div>
                <div className="mobile-stat-pill">
                    <span className="stat-pill-pct">{percentageServed}%</span>
                </div>
            </div>

            {/* Sticky Mobile Navigation Tabs */}
            <nav className="food-mobile-tabs" aria-label="Food Counter Navigation">
                <button
                    type="button"
                    className={`food-mobile-tab-btn ${mobileTab === 'scanner' ? 'active' : ''}`}
                    onClick={() => setMobileTab('scanner')}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <line x1="7" y1="8" x2="7" y2="16"/>
                        <line x1="11" y1="8" x2="11" y2="16"/>
                        <line x1="14" y1="8" x2="14" y2="16"/>
                        <line x1="17" y1="8" x2="17" y2="16"/>
                    </svg>
                    <span>Scanner</span>
                </button>
                <button
                    type="button"
                    className={`food-mobile-tab-btn ${mobileTab === 'search' ? 'active' : ''}`}
                    onClick={() => setMobileTab('search')}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <span>Directory</span>
                </button>
                <button
                    type="button"
                    className={`food-mobile-tab-btn ${mobileTab === 'log' ? 'active' : ''}`}
                    onClick={() => setMobileTab('log')}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                    </svg>
                    <span>Log {foodRecords.length > 0 ? `(${foodRecords.length})` : ''}</span>
                </button>
            </nav>

            {/* Hero Progress & KPI Metrics Grid */}
            <section className={`food-kpi-container ${mobileTab !== 'log' ? 'hide-mobile' : ''}`}>
                <div className="food-progress-card">
                    <div className="progress-card-header">
                        <div className="progress-info">
                            <span className="kpi-label">OVERALL DISTRIBUTION PROGRESS</span>
                            <div className="progress-headline">
                                <span className="served-large">{stats.uniqueParticipantsServed}</span>
                                <span className="total-sub">/ {stats.totalEligible} participants served</span>
                            </div>
                        </div>
                        <div className="progress-badge">
                            <span className="badge-pct">{percentageServed}%</span>
                            <span className="badge-sub">COMPLETE</span>
                        </div>
                    </div>

                    <div className="progress-track" role="progressbar" aria-valuenow={percentageServed} aria-valuemin="0" aria-valuemax="100">
                        <div
                            className="progress-fill"
                            style={{ width: `${percentageServed}%` }}
                        ></div>
                    </div>
                </div>

                <div className="food-stats-grid">
                    <div className="food-stat-card card-served">
                        <div className="stat-card-top">
                            <span className="food-stat-label">SERVED PARTICIPANTS</span>
                            <span className="stat-icon-wrap icon-served">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            </span>
                        </div>
                        <div className="food-stat-val text-lime">
                            {stats.uniqueParticipantsServed}
                        </div>
                        <span className="food-stat-sub">
                            {stats.totalPurchases} meal tokens issued
                        </span>
                    </div>

                    <div className="food-stat-card card-pending">
                        <div className="stat-card-top">
                            <span className="food-stat-label">PENDING / REMAINING</span>
                            <span className="stat-icon-wrap icon-pending">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <circle cx="12" cy="12" r="10"/>
                                    <polyline points="12 6 12 12 16 14"/>
                                </svg>
                            </span>
                        </div>
                        <div className="food-stat-val text-amber">
                            {stats.pending}
                        </div>
                        <span className="food-stat-sub">
                            Students yet to claim meals
                        </span>
                    </div>

                    <div className="food-stat-card card-recent">
                        <div className="stat-card-top">
                            <span className="food-stat-label">LAST 60 MINUTES</span>
                            <span className="stat-icon-wrap icon-recent">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                                </svg>
                            </span>
                        </div>
                        <div className="food-stat-val text-cyan">
                            {stats.servedInLastHour}
                        </div>
                        <span className="food-stat-sub">
                            Current counter serving velocity
                        </span>
                    </div>

                    <div className="food-stat-card card-total">
                        <div className="stat-card-top">
                            <span className="food-stat-label">TOTAL REGISTERED</span>
                            <span className="stat-icon-wrap icon-total">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                    <circle cx="9" cy="7" r="4"/>
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                </svg>
                            </span>
                        </div>
                        <div className="food-stat-val text-ink">
                            {stats.totalEligible}
                        </div>
                        <span className="food-stat-sub">
                            Individuals + team members
                        </span>
                    </div>
                </div>
            </section>

            {/* Active Meal & Counter Mode Selector Strip */}
            <section className={`food-meal-control-strip ${mobileTab !== 'scanner' ? 'hide-mobile' : ''}`}>
                <div className="meal-strip-label">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
                        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                        <line x1="6" y1="1" x2="6" y2="4"/>
                        <line x1="10" y1="1" x2="10" y2="4"/>
                        <line x1="14" y1="1" x2="14" y2="4"/>
                    </svg>
                    <span>ACTIVE MEAL DISPATCH:</span>
                </div>

                <div className="meal-preset-chips" role="radiogroup" aria-label="Select active meal">
                    {MEAL_PRESETS.map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            className={`meal-chip-btn ${foodType === m.id ? 'active' : ''}`}
                            onClick={() => setFoodType(m.id)}
                            role="radio"
                            aria-checked={foodType === m.id}
                        >
                            <span className="chip-indicator"></span>
                            <span className="chip-label">{m.label}</span>
                        </button>
                    ))}
                </div>
            </section>

            {/* Quick Scanner Settings Bar */}
            <section className={`food-scanner-toolbar ${mobileTab !== 'scanner' ? 'hide-mobile' : ''}`}>
                <div className="toolbar-left">
                    <button
                        type="button"
                        className={`scanner-toggle-btn ${cameraActive ? 'active' : ''}`}
                        onClick={() => setCameraActive(!cameraActive)}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                            <circle cx="12" cy="13" r="4"/>
                        </svg>
                        <span>{cameraActive ? 'Close Camera View' : 'Open Camera Scanner'}</span>
                    </button>

                    <label className="toolbar-toggle-label" title="Automatically issue meal immediately upon scanning an eligible pass">
                        <input
                            type="checkbox"
                            checked={autoMarkOnScan}
                            onChange={(e) => setAutoMarkOnScan(e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                        <span className="toggle-text">Instant Auto-Mark</span>
                    </label>

                    <label className="toolbar-toggle-label" title="Play audible beep on verification">
                        <input
                            type="checkbox"
                            checked={audioEnabled}
                            onChange={(e) => setAudioEnabled(e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                        <span className="toggle-text">Sound Alerts</span>
                    </label>
                </div>

                <div className="toolbar-right">
                    <span className="counter-session-tag">Counter Terminal #1</span>
                </div>
            </section>

            {/* Status Alert Banner */}
            {status.message && (
                <div className={`food-alert-banner ${status.type}`}>
                    <div className="alert-content">
                        <span className="alert-icon">
                            {status.type === 'success' && (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            )}
                            {status.type === 'warning' && (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                                    <line x1="12" y1="9" x2="12" y2="13"/>
                                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                                </svg>
                            )}
                            {status.type === 'error' && (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="15" y1="9" x2="9" y2="15"/>
                                    <line x1="9" y1="9" x2="15" y2="15"/>
                                </svg>
                            )}
                        </span>
                        <span className="alert-text">{status.message}</span>
                    </div>
                    <button type="button" className="alert-close-btn" onClick={() => setStatus({ type: '', message: '' })} aria-label="Dismiss alert">✕</button>
                </div>
            )}

            {/* Main Interactive Scanner Grid */}
            <section className="food-main-layout">
                {/* Left Column: Barcode Scanner Hub & Result Card */}
                <div className={`food-scanner-column ${mobileTab !== 'scanner' ? 'hide-mobile' : ''}`}>
                    {/* Big Launch Camera Button on Mobile when camera is off */}
                    {!cameraActive && (
                        <button
                            type="button"
                            className="food-open-camera-hero-btn"
                            onClick={() => setCameraActive(true)}
                        >
                            <span className="hero-btn-icon">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                    <circle cx="12" cy="13" r="4"/>
                                </svg>
                            </span>
                            <div className="hero-btn-text">
                                <strong>Launch Camera Scanner</strong>
                                <span>Fast autofocus · Code 128 badges & QR codes</span>
                            </div>
                            <span className="hero-btn-badge">TAP TO SCAN</span>
                        </button>
                    )}

                    {/* Camera Video Stream Card (conditionally visible) */}
                    {cameraActive && (
                        <div className="food-camera-card">
                            <div className="camera-header">
                                <div className="camera-header-title">
                                    <span className="camera-pulse-dot"></span>
                                    <span>LIVE CAMERA VIEWPORT</span>
                                </div>
                                <div className="camera-header-tools">
                                    {torchSupported && (
                                        <button
                                            type="button"
                                            className={`camera-tool-btn ${torchOn ? 'active' : ''}`}
                                            onClick={toggleTorch}
                                            title="Toggle camera flash"
                                        >
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                                            </svg>
                                            <span>{torchOn ? 'Flash ON' : 'Flash'}</span>
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="camera-tool-btn close-btn"
                                        onClick={() => setCameraActive(false)}
                                    >
                                        ✕ Close View
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
                                    <span className="camera-target-hint">Align barcode inside the guide box</span>
                                </div>
                            </div>
                            <div className="camera-footer-note">
                                <span>Hardware-accelerated barcode decoding active</span>
                            </div>
                        </div>
                    )}

                    {/* Barcode & Passcode POS Input Hub */}
                    <div className="food-input-card">
                        <form onSubmit={handleFormSubmit} className="barcode-form">
                            <div className="input-card-top-row">
                                <label className="barcode-input-label" htmlFor="barcode-scanner-field">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                                        <line x1="7" y1="8" x2="7" y2="16"/>
                                        <line x1="11" y1="8" x2="11" y2="16"/>
                                        <line x1="14" y1="8" x2="14" y2="16"/>
                                        <line x1="17" y1="8" x2="17" y2="16"/>
                                    </svg>
                                    <span>SCAN BARCODE OR ENTER PASS CODE</span>
                                </label>
                                <span className="ready-indicator">
                                    <span className="ready-dot"></span> Ready for Scan
                                </span>
                            </div>

                            <div className="barcode-input-group">
                                <div className="input-prefix-icon" aria-hidden="true">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 5v14"/>
                                        <path d="M8 5v14"/>
                                        <path d="M12 5v14"/>
                                        <path d="M17 5v14"/>
                                        <path d="M21 5v14"/>
                                    </svg>
                                </div>

                                <input
                                    id="barcode-scanner-field"
                                    ref={inputRef}
                                    type="text"
                                    value={passCodeInput}
                                    onChange={(e) => setPassCodeInput(e.target.value)}
                                    placeholder="Scan badge or enter ZEN-I-001..."
                                    autoComplete="off"
                                    spellCheck="false"
                                />

                                {passCodeInput && (
                                    <button
                                        type="button"
                                        className="food-input-clear-btn"
                                        onClick={() => { setPassCodeInput(''); inputRef.current?.focus() }}
                                        title="Clear input"
                                    >
                                        ✕
                                    </button>
                                )}

                                <button
                                    type="submit"
                                    className="food-scan-submit-btn"
                                    disabled={isSearching || !passCodeInput.trim()}
                                >
                                    {isSearching ? (
                                        <span className="btn-spinner"></span>
                                    ) : (
                                        <>
                                            <span>Lookup</span>
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <polyline points="9 18 15 12 9 6"/>
                                            </svg>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>

                        {/* Quick Sample Test Chips */}
                        <div className="sample-chips-bar">
                            <span className="chips-label">Quick sample passes:</span>
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

                    {/* Scan Result Card (Inline) */}
                    {currentLookup ? (
                        <div className={`food-result-card ${currentLookup.alreadyBought ? 'status-already-bought' : 'status-fresh'}`}>
                            {/* Prominent Header Banner */}
                            <div className="result-header-banner">
                                {currentLookup.alreadyBought ? (
                                    <div className="banner-content warning-banner">
                                        <span className="banner-icon" aria-hidden="true">
                                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ffd166" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                                                <line x1="12" y1="9" x2="12" y2="13"/>
                                                <line x1="12" y1="17" x2="12.01" y2="17"/>
                                            </svg>
                                        </span>
                                        <div>
                                            <div className="banner-title">FOOD ALREADY BOUGHT!</div>
                                            <div className="banner-subtitle">
                                                Meal already issued · Verify timestamp below before issuing any additional token.
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="banner-content success-banner">
                                        <span className="banner-icon" aria-hidden="true">
                                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12"/>
                                            </svg>
                                        </span>
                                        <div>
                                            <div className="banner-title">ELIGIBLE FOR FOOD</div>
                                            <div className="banner-subtitle">
                                                Valid participant · No prior meal recorded for this pass.
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Participant Identification Profile */}
                            <div className="participant-card-profile">
                                <div className="participant-avatar-badge">
                                    {getInitials(currentLookup.participant.participantName)}
                                </div>
                                <div className="participant-main-info">
                                    <h3 className="profile-name">{currentLookup.participant.participantName}</h3>
                                    <div className="profile-badges-row">
                                        <span className="pass-code-badge">{currentLookup.participant.passCode}</span>
                                        <span className="type-badge">
                                            {currentLookup.participant.registrationType === 'team'
                                                ? `Team: ${currentLookup.participant.teamName || 'Pass'}`
                                                : 'Individual Pass'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Participant Metadata Details Grid */}
                            <div className="participant-details-grid">
                                <div className="detail-item">
                                    <span className="detail-label">College</span>
                                    <span className="detail-value">{currentLookup.participant.college || 'Annapoorana Engineering College'}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">Year of Study</span>
                                    <span className="detail-value">{currentLookup.participant.yearOfStudy || '—'}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">Registered Event</span>
                                    <span className="detail-value">{currentLookup.participant.eventName || 'Symposium'}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">Phone / Contact</span>
                                    <span className="detail-value">{currentLookup.participant.phone || currentLookup.participant.email || '—'}</span>
                                </div>
                            </div>

                            {/* EXACT PURCHASE TIMESTAMPS SECTION */}
                            {currentLookup.alreadyBought && currentLookup.purchases?.length > 0 && (
                                <div className="purchase-timestamps-box">
                                    <div className="timestamps-box-header">
                                        <div className="ts-head-left">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <circle cx="12" cy="12" r="10"/>
                                                <polyline points="12 6 12 12 16 14"/>
                                            </svg>
                                            <span>PREVIOUS MEAL CLAIM LOG</span>
                                        </div>
                                        <span className="tokens-count-badge">
                                            {currentLookup.purchaseCount} {currentLookup.purchaseCount === 1 ? 'Token Issued' : 'Tokens Issued'}
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
                                                    title="Undo / Remove this purchase record"
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
                                {!currentLookup.alreadyBought && (
                                    <div className="meal-type-selector">
                                        <div className="inline-meal-pills">
                                            <span className="inline-meal-label">Meal Type:</span>
                                            {MEAL_PRESETS.map((m) => (
                                                <button
                                                    key={m.id}
                                                    type="button"
                                                    className={`inline-meal-pill ${foodType === m.id ? 'active' : ''}`}
                                                    onClick={() => setFoodType(m.id)}
                                                >
                                                    {m.short}
                                                </button>
                                            ))}
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Optional note / counter ID..."
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            className="meal-note-input"
                                        />
                                    </div>
                                )}

                                <div className="result-buttons-row">
                                    {!currentLookup.alreadyBought ? (
                                        <button
                                            type="button"
                                            className="action-confirm-buy-btn"
                                            disabled={isPurchasing}
                                            onClick={() => recordFoodPurchase(currentLookup.participant.passCode, false)}
                                        >
                                            {isPurchasing ? 'Recording...' : 'Confirm & Mark as Bought'}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            className="action-override-buy-btn"
                                            disabled={isPurchasing}
                                            onClick={() => {
                                                if (window.confirm(`Participant already claimed meal at ${formatDateTime(currentLookup.lastBoughtAt)}. Are you sure you want to issue an extra food token?`)) {
                                                    recordFoodPurchase(currentLookup.participant.passCode, true)
                                                }
                                            }}
                                        >
                                            {isPurchasing ? 'Recording...' : 'Issue Additional Meal (Override)'}
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
                            <div className="placeholder-icon-wrap" aria-hidden="true">
                                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
                                    <line x1="7" y1="12" x2="17" y2="12"/>
                                </svg>
                            </div>
                            <h3>Scanner Terminal Ready</h3>
                            <p>
                                Scan any badge barcode or type a student pass code above.
                                Real-time verification detects duplicate claims in 0ms with instant audio feedback.
                            </p>
                        </div>
                    )}
                </div>

                {/* Right Column: Participant Search & Live Food Log */}
                <div className="food-side-column">
                    {/* Manual Search Card (For students without barcode) */}
                    <div className={`food-manual-search-card ${mobileTab !== 'search' ? 'hide-mobile' : ''}`}>
                        <div className="manual-search-header">
                            <div className="manual-title-row">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <circle cx="11" cy="11" r="8"/>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                                <span>LOST BADGE? SEARCH DIRECTORY</span>
                            </div>
                            <span className="manual-sub">Search by student name, phone, or college</span>
                        </div>

                        <div className="manual-search-input-wrap">
                            <input
                                type="search"
                                value={manualSearchQuery}
                                onChange={(e) => searchParticipantsManual(e.target.value)}
                                placeholder="Type participant name, phone, or college..."
                                className="manual-search-input"
                            />
                            {manualSearchQuery && (
                                <button
                                    type="button"
                                    className="manual-clear-btn"
                                    onClick={() => { setManualSearchQuery(''); setManualSearchResults([]) }}
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        {isManualSearching && <p className="manual-searching-note">Searching database...</p>}

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
                                        <div className="manual-row-avatar">
                                            {getInitials(p.participantName)}
                                        </div>
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
                                <span className="history-eyebrow">LIVE AUDIT FEED</span>
                                <h2>Claimed Meals Log ({filteredRecords.length})</h2>
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
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="11" cy="11" r="8"/>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            <input
                                type="search"
                                value={historySearch}
                                onChange={(e) => setHistorySearch(e.target.value)}
                                placeholder="Filter records by name, pass code, college, meal..."
                            />
                        </div>

                        <div className="history-table-container">
                            {filteredRecords.length === 0 ? (
                                <div className="history-empty-message">
                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <circle cx="12" cy="12" r="10"/>
                                        <line x1="12" y1="8" x2="12" y2="12"/>
                                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                                    </svg>
                                    <p>No food purchase records found.</p>
                                </div>
                            ) : (
                                <table className="food-history-table">
                                    <thead>
                                        <tr>
                                            <th>Pass Code</th>
                                            <th>Student Name</th>
                                            <th>When Claimed</th>
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
                                                        <div className="table-student-row">
                                                            <span className="table-avatar">{getInitials(record.participantName)}</span>
                                                            <strong className="student-name">{record.participantName}</strong>
                                                        </div>
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

            {/* Scan Success / Result Modal Popup */}
            {showModal && (
                <div
                    className="food-modal-backdrop"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) closeModal()
                    }}
                >
                    <div className={`food-modal-card ${modalLoading && !currentLookup ? 'status-loading' : currentLookup?.alreadyBought ? 'status-already-bought' : 'status-fresh'}`}>
                        {modalLoading && !currentLookup ? (
                            <>
                                <div className="modal-header-bar">
                                    <div className="modal-header-title">
                                        <span className="modal-header-icon" aria-hidden="true">
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="10"/>
                                                <polyline points="12 6 12 12 14 14"/>
                                            </svg>
                                        </span>
                                        <div>
                                            <h2 className="modal-title">LOOKING UP PASS...</h2>
                                            <span className="modal-subtitle">Querying student verification database</span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="modal-close-icon-btn"
                                        onClick={closeModal}
                                        title="Close Popup (Esc)"
                                    >
                                        ✕
                                    </button>
                                </div>
                                <div className="modal-loading-state">
                                    <div className="modal-loading-spinner"></div>
                                    <span className="modal-loading-code">{activeLookupCode || 'Checking...'}</span>
                                    <p className="modal-loading-hint">Fetching participant eligibility and meal history...</p>
                                </div>
                            </>
                        ) : currentLookup ? (
                            <>
                                {/* Modal Header */}
                                <div className="modal-header-bar">
                                    <div className="modal-header-title">
                                        <span className="modal-header-icon" aria-hidden="true">
                                            {justPurchased ? (
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="20 6 9 17 4 12"/>
                                                </svg>
                                            ) : currentLookup.alreadyBought ? (
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffd166" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                                                    <line x1="12" y1="9" x2="12" y2="13"/>
                                                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                                                </svg>
                                            ) : (
                                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="20 6 9 17 4 12"/>
                                                </svg>
                                            )}
                                        </span>
                                        <div>
                                            <h2 className="modal-title">
                                                {justPurchased
                                                    ? 'MEAL TOKEN RECORDED'
                                                    : currentLookup.alreadyBought
                                                    ? 'FOOD ALREADY CLAIMED'
                                                    : 'ELIGIBLE FOR FOOD'}
                                            </h2>
                                            <span className="modal-subtitle">
                                                {justPurchased
                                                    ? 'Successfully saved in catering dispatch log'
                                                    : currentLookup.alreadyBought
                                                    ? 'Participant already claimed their meal'
                                                    : 'Valid pass · Ready to issue meal token'}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="modal-close-icon-btn"
                                        onClick={closeModal}
                                        title="Close Popup (Esc)"
                                    >
                                        ✕
                                    </button>
                                </div>

                                {/* Modal Body */}
                                <div className="modal-body-content">
                                    {justPurchased ? (
                                        <div className="modal-success-state">
                                            <div className="success-pulse-circle">
                                                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <polyline points="20 6 9 17 4 12"/>
                                                </svg>
                                            </div>
                                            <h3 className="success-name">{currentLookup.participant.participantName}</h3>
                                            <p className="success-meta">
                                                {currentLookup.participant.passCode} · {currentLookup.participant.college || 'Annapoorana Engineering College'}
                                            </p>
                                            <div className="success-meal-pill">
                                                {foodType} Issued Successfully
                                            </div>
                                            <button
                                                type="button"
                                                className="modal-next-btn-large"
                                                onClick={closeModal}
                                                autoFocus
                                            >
                                                Scan Next Participant →
                                            </button>
                                        </div>
                                    ) : currentLookup.alreadyBought ? (
                                        <div className="modal-already-bought-minimal">
                                            <div className="minimal-bought-badge">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                                                    <line x1="12" y1="9" x2="12" y2="13"/>
                                                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                                                </svg>
                                                <span>ALREADY CLAIMED</span>
                                            </div>

                                            <div>
                                                <h3 className="minimal-bought-name">{currentLookup.participant.participantName}</h3>
                                                <span className="minimal-bought-pass">{currentLookup.participant.passCode}</span>
                                            </div>

                                            <div className="minimal-bought-status-box">
                                                <span className="minimal-status-title">Meal Already Issued</span>
                                                <span className="minimal-status-time">
                                                    {formatDateTime(currentLookup.lastBoughtAt)} ({getRelativeTime(currentLookup.lastBoughtAt)})
                                                </span>
                                                {currentLookup.purchases?.[0]?.foodType && (
                                                    <span className="minimal-status-meal">
                                                        Meal: {currentLookup.purchases[0].foodType}
                                                        {currentLookup.purchaseCount > 1 ? ` · ${currentLookup.purchaseCount} tokens issued` : ''}
                                                    </span>
                                                )}
                                            </div>

                                            <button
                                                type="button"
                                                className="modal-next-btn-large"
                                                onClick={closeModal}
                                                autoFocus
                                            >
                                                Scan Next Participant →
                                            </button>

                                            <button
                                                type="button"
                                                className="minimal-override-link"
                                                onClick={() => {
                                                    if (window.confirm(`Participant already bought food at ${formatDateTime(currentLookup.lastBoughtAt)}. Are you sure you want to issue an extra food token?`)) {
                                                        recordFoodPurchase(currentLookup.participant.passCode, true)
                                                    }
                                                }}
                                            >
                                                Issue Extra Portion (Admin Override)
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Student Info Card */}
                                            <div className="modal-student-info">
                                                <div className="modal-info-hero">
                                                    <div className="modal-avatar-badge">
                                                        {getInitials(currentLookup.participant.participantName)}
                                                    </div>
                                                    <div>
                                                        <h3 className="modal-participant-name">
                                                            {currentLookup.participant.participantName}
                                                        </h3>
                                                        <div className="modal-badges-row">
                                                            <span className="modal-pass-pill">{currentLookup.participant.passCode}</span>
                                                            <span className="modal-type-pill">
                                                                {currentLookup.participant.registrationType === 'team'
                                                                    ? `Team: ${currentLookup.participant.teamName || 'Pass'}`
                                                                    : 'Individual'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="modal-info-meta-grid">
                                                    <div className="modal-meta-cell">
                                                        <span className="meta-cell-label">College</span>
                                                        <strong className="meta-cell-val">{currentLookup.participant.college || 'Annapoorana Engineering College'}</strong>
                                                    </div>
                                                    <div className="modal-meta-cell">
                                                        <span className="meta-cell-label">Registered Event</span>
                                                        <strong className="meta-cell-val">{currentLookup.participant.eventName || 'Symposium'}</strong>
                                                    </div>
                                                    <div className="modal-meta-cell">
                                                        <span className="meta-cell-label">Contact</span>
                                                        <strong className="meta-cell-val">{currentLookup.participant.phone || currentLookup.participant.email || '—'}</strong>
                                                    </div>
                                                    <div className="modal-meta-cell">
                                                        <span className="meta-cell-label">Year of Study</span>
                                                        <strong className="meta-cell-val">{currentLookup.participant.yearOfStudy || '—'}</strong>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Meal Selection Selector */}
                                            <div className="modal-meal-controls">
                                                <div className="modal-meal-pills-row">
                                                    <span className="modal-pills-title">Meal:</span>
                                                    {MEAL_PRESETS.map((m) => (
                                                        <button
                                                            key={m.id}
                                                            type="button"
                                                            className={`modal-meal-pill ${foodType === m.id ? 'active' : ''}`}
                                                            onClick={() => setFoodType(m.id)}
                                                        >
                                                            {m.short}
                                                        </button>
                                                    ))}
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="Optional note / counter ID..."
                                                    value={notes}
                                                    onChange={(e) => setNotes(e.target.value)}
                                                    className="modal-notes-input"
                                                />
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="modal-actions-bar">
                                                <button
                                                    type="button"
                                                    className="modal-action-btn btn-confirm"
                                                    disabled={isPurchasing}
                                                    onClick={() => recordFoodPurchase(currentLookup.participant.passCode, false)}
                                                >
                                                    {isPurchasing ? 'Recording...' : 'Confirm & Mark as Bought'}
                                                </button>

                                                <button
                                                    type="button"
                                                    className="modal-action-btn btn-dismiss"
                                                    onClick={closeModal}
                                                >
                                                    ✕ Close / Next Scan
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            )}
        </main>
    )
}
