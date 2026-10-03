import { useEffect, useMemo, useState } from 'react'
import { getEventConfig, getFilteredEvents, nonTechnicalEvents, technicalEvents, yearsOfStudy } from '../data'
import { zenLogo, collegeLogo } from '../assets/logoDataUrl'
import CollegeSelector from './CollegeSelector'

import { API_URL } from '../config'

const PHONE_REGEX = /^[6-9]\d{9}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emptyForm = {
    fullName: '',
    email: '',
    phone: '',
    college: '',
    collegeId: '',
    yearOfStudy: '1st Year',
    technicalEvent: '',
    nonTechnicalEvent: '',
    teamName: '',
    teamSize: '2',
}

const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const passStyles = `@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;700&family=Space+Grotesk:wght@500;700&display=swap');
@page { size: A4 portrait; margin: 8mm; }
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
    width: 194mm; min-height: 281mm; padding: 0;
    display: grid; grid-template-columns: repeat(2, 1fr);
    grid-auto-rows: 136mm; gap: 5mm; align-content: start;
    background: #100c1d; color: #f6f2e9; font-family: 'Space Grotesk', sans-serif;
    background-image: linear-gradient(rgba(246, 242, 233, .08) 1px, transparent 1px), linear-gradient(90deg, rgba(246, 242, 233, .08) 1px, transparent 1px);
    background-size: 9mm 9mm; print-color-adjust: exact; -webkit-print-color-adjust: exact;
}
.pass {
    position: relative; width: auto; height: 136mm; overflow: hidden;
    padding: 7mm 7mm 5mm; border: 1px solid rgba(246, 242, 233, .35);
    background: linear-gradient(145deg, #171127, #0d0a17);
    box-shadow: 3mm 3mm 0 rgba(213, 255, 75, .2);
    border-radius: 4px; break-inside: avoid; print-color-adjust: exact; -webkit-print-color-adjust: exact;
    display: flex; flex-direction: column; justify-content: space-between;
}
.pass:before {
    content: ''; position: absolute; top: 0; right: 0;
    width: 32mm; height: 32mm; background: #ff4f9a;
    clip-path: polygon(100% 0, 100% 100%, 0 0); opacity: .85;
}
.pass-header { display: flex; align-items: center; gap: 3mm; position: relative; z-index: 2; }
.pass-logo { width: 13mm; height: 13mm; border-radius: 50%; object-fit: contain; flex-shrink: 0; }
.kicker, .small, .meta { font: 8pt 'DM Mono', monospace; text-transform: uppercase; letter-spacing: .08em; }
.kicker { color: #a7a0b7; }
.sub-kicker { font: 7.5pt 'DM Mono', monospace; color: #d5ff4b; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; }
.code { position: relative; margin: 3mm 0 1.5mm; color: #d5ff4b; font: 700 22pt 'DM Mono', monospace; letter-spacing: -.05em; }
.name { margin: 0; font-size: 15pt; font-weight: 700; letter-spacing: -.04em; overflow-wrap: anywhere; line-height: 1.15; color: #f6f2e9; }
.meta { margin: 1.5mm 0; color: #a7a0b7; line-height: 1.3; }
.event { display: inline-block; margin: 1.5mm 0 2mm; padding: 1.5mm 3.5mm; background: #d5ff4b; color: #100c1d; font: 700 8pt 'DM Mono', monospace; text-transform: uppercase; border-radius: 2px; }
.pass img.barcode { display: block; width: 100%; max-height: 25mm; object-fit: contain; margin: 2mm 0; padding: 1.5mm; background: #ffffff; position: relative; z-index: 2; border-radius: 2px; }
.pass-footer {
    display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
    gap: 0.8mm; margin-top: 1.5mm; padding-top: 2mm;
    border-top: 1px dashed rgba(246, 242, 233, .25);
    position: relative; z-index: 2; width: 100%;
}
.pass-college-banner { height: 9.5mm; width: auto; max-width: 62mm; object-fit: contain; display: block; margin: 0 auto; }
.pass-footer-dept { font: 700 7pt 'DM Mono', monospace; color: #d5ff4b; text-transform: uppercase; letter-spacing: .08em; line-height: 1.15; }
.pass-footer-meta { font: 500 6.2pt 'DM Mono', monospace; color: #a7a0b7; text-transform: uppercase; letter-spacing: .04em; line-height: 1.1; }
.pass:only-child { grid-column: 1 / -1; width: 86mm; justify-self: center; }
@media print { body { width: 194mm; min-height: 281mm; } }`

async function parse(response) {
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || 'Request failed.')
    return data
}

export default function AdminDashboard() {
    const [token, setToken] = useState(() => sessionStorage.getItem('zen-admin-token') || '')
    const [credentials, setCredentials] = useState({ username: '', password: '' })
    const [registrations, setRegistrations] = useState([])
    const [activeTab, setActiveTab] = useState('list') // 'list' | 'create'
    const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'present' | 'absent' | 'team' | 'individual'
    const [eventFilter, setEventFilter] = useState('')
    const [registrationType, setRegistrationType] = useState('individual')
    const [form, setForm] = useState(emptyForm)
    const [memberNames, setMemberNames] = useState(['', '', '', ''])
    const [formKey, setFormKey] = useState(0)
    const [search, setSearch] = useState('')
    const [selectedIds, setSelectedIds] = useState([])
    const [status, setStatus] = useState({ type: '', message: '' })
    const [isLoading, setIsLoading] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [copiedId, setCopiedId] = useState(null)

    const isTeam = registrationType === 'team'
    const techConfig = getEventConfig(form.technicalEvent)
    const nonTechConfig = getEventConfig(form.nonTechnicalEvent)
    const isStrictTeam = Boolean((techConfig?.type === 'team' && !techConfig.team_and_individual) || (nonTechConfig?.type === 'team' && !nonTechConfig.team_and_individual))
    const isStrictIndividual = Boolean((techConfig?.type === 'individual' && !techConfig.team_and_individual) || (nonTechConfig?.type === 'individual' && !nonTechConfig.team_and_individual))
    const availableTechEvents = getFilteredEvents(technicalEvents, registrationType)
    const availableNonTechEvents = getFilteredEvents(nonTechnicalEvents, registrationType)

    const allEventsList = useMemo(() => {
        const events = [...technicalEvents.map(e => e.name), ...nonTechnicalEvents.map(e => e.name)]
        return Array.from(new Set(events))
    }, [])

    const request = async (path, options = {}) => parse(await fetch(`${API_URL}${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, ...options.headers },
    }))

    const loadRegistrations = async () => {
        setIsRefreshing(true)
        try {
            const data = await request('/admin/registrations')
            setRegistrations(data)
        } catch (error) {
            setStatus({ type: 'error', message: error.message })
        } finally {
            setIsRefreshing(false)
        }
    }

    useEffect(() => {
        if (token) loadRegistrations()
    }, [token])

    const login = async (event) => {
        event.preventDefault()
        setIsLoading(true)
        setStatus({ type: '', message: '' })
        try {
            const result = await parse(await fetch(`${API_URL}/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials),
            }))
            sessionStorage.setItem('zen-admin-token', result.token)
            setToken(result.token)
        } catch (error) {
            setStatus({ type: 'error', message: error.message })
        } finally {
            setIsLoading(false)
        }
    }

    const logout = () => {
        sessionStorage.removeItem('zen-admin-token')
        setToken('')
        setRegistrations([])
    }

    const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))

    const handleTechnicalChange = (event) => {
        const selectedName = event.target.value
        const config = getEventConfig(selectedName)
        setForm((current) => {
            const next = { ...current, technicalEvent: selectedName }
            if (config?.type === 'team' && !config.team_and_individual) {
                setRegistrationType('team')
                next.teamSize = config.defaultTeamSize ? String(config.defaultTeamSize) : (Number(current.teamSize) >= 2 ? current.teamSize : '2')
            }
            return next
        })
    }

    const handleNonTechnicalChange = (event) => {
        const selectedName = event.target.value
        const config = getEventConfig(selectedName)
        setForm((current) => {
            const next = { ...current, nonTechnicalEvent: selectedName }
            if (config?.type === 'team' && !config.team_and_individual) {
                setRegistrationType('team')
                next.teamSize = config.defaultTeamSize ? String(config.defaultTeamSize) : (Number(current.teamSize) >= 2 ? current.teamSize : '2')
            }
            return next
        })
    }

    const handleTypeToggle = (type) => {
        if (type === 'individual' && isStrictTeam) return
        if (type === 'team' && isStrictIndividual) return
        setRegistrationType(type)
        setForm((curr) => {
            const next = { ...curr }
            const tConfig = getEventConfig(curr.technicalEvent)
            const ntConfig = getEventConfig(curr.nonTechnicalEvent)
            const isTechValid = !tConfig || tConfig.team_and_individual || (type === 'team' && tConfig.type === 'team') || (type === 'individual' && tConfig.type === 'individual')
            const isNonTechValid = !ntConfig || ntConfig.team_and_individual || (type === 'team' && ntConfig.type === 'team') || (type === 'individual' && ntConfig.type === 'individual')
            if (!isTechValid) next.technicalEvent = ''
            if (!isNonTechValid) next.nonTechnicalEvent = ''
            if (type === 'team') {
                const activeConfig = getEventConfig(next.technicalEvent) || getEventConfig(next.nonTechnicalEvent)
                const size = activeConfig?.defaultTeamSize && activeConfig.defaultTeamSize >= 2
                    ? String(activeConfig.defaultTeamSize)
                    : (Number(curr.teamSize) >= 2 ? curr.teamSize : '2')
                next.teamSize = size
            } else {
                next.teamSize = '1'
            }
            return next
        })
    }

    const handleMemberNameChange = (index, value) => {
        setMemberNames((current) => {
            const next = [...current]
            next[index] = value
            return next
        })
    }

    const addStudent = async (event) => {
        event.preventDefault()
        setIsLoading(true)
        setStatus({ type: '', message: '' })

        const tech = form.technicalEvent.trim()
        const nonTech = form.nonTechnicalEvent.trim()
        if (!tech && !nonTech) {
            setStatus({ type: 'error', message: 'Please select at least one event (Technical or Non-Technical).' })
            setIsLoading(false)
            return
        }

        const cleanEmail = form.email.replace(/\s+/g, '').trim().toLowerCase()
        if (!EMAIL_REGEX.test(cleanEmail)) {
            setStatus({ type: 'error', message: 'Please enter a valid email address without spaces.' })
            setIsLoading(false)
            return
        }

        const cleanPhone = form.phone.replace(/\D/g, '').trim()
        if (!PHONE_REGEX.test(cleanPhone)) {
            setStatus({ type: 'error', message: 'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.' })
            setIsLoading(false)
            return
        }

        const cleanCollege = form.college.trim().replace(/\s+/g, ' ')
        const cleanCollegeId = form.collegeId ? form.collegeId.replace(/\s+/g, '').trim().toUpperCase() : null

        const formatLeader = (name) => {
            const trimmed = String(name || '').trim()
            const base = trimmed.replace(/\s*(?:\(?\s*leader\s*\)?)$/i, '').trim()
            return base ? `${base} (leader)` : trimmed
        }

        const cleanLeaderName = isTeam ? formatLeader(form.fullName) : form.fullName.trim()
        const teamSizeNum = isTeam ? Number(form.teamSize) : 1
        const activeSecondary = memberNames.slice(0, teamSizeNum - 1).map((m) => m.trim().replace(/\s+leader$/i, ' (leader)')).filter(Boolean)

        if (isTeam && !form.teamName.trim()) {
            setStatus({ type: 'error', message: 'Team name is required for team registrations.' })
            setIsLoading(false)
            return
        }

        if (isTeam && activeSecondary.length < teamSizeNum - 1) {
            setStatus({ type: 'error', message: `Please provide names for all ${teamSizeNum} team members.` })
            setIsLoading(false)
            return
        }

        const teamMembers = isTeam ? [cleanLeaderName, ...activeSecondary] : []
        const combinedEventName = [tech, nonTech].filter(Boolean).join(' + ')

        try {
            const payload = {
                fullName: cleanLeaderName,
                email: cleanEmail,
                phone: cleanPhone,
                college: cleanCollege,
                collegeId: cleanCollegeId,
                yearOfStudy: form.yearOfStudy,
                eventName: combinedEventName,
                technicalEvent: tech || null,
                nonTechnicalEvent: nonTech || null,
                registrationType,
                teamName: isTeam ? form.teamName.trim() : null,
                teamSize: teamSizeNum,
                teamMembers,
            }

            const result = await request('/admin/registrations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            setForm(emptyForm)
            setMemberNames(['', '', '', ''])
            setRegistrationType('individual')
            setFormKey((k) => k + 1)
            setStatus({
                type: 'success',
                message: `Registered successfully with Pass ${result.passCodeRange || result.passCode} (${cleanLeaderName})!`,
            })
            await loadRegistrations()
            setActiveTab('list')
        } catch (error) {
            setStatus({ type: 'error', message: error.message })
        } finally {
            setIsLoading(false)
        }
    }

    const exportReport = async () => {
        try {
            const response = await fetch(`${API_URL}/registrations/export`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (!response.ok) throw new Error('Report export failed.')
            const link = document.createElement('a')
            link.href = URL.createObjectURL(await response.blob())
            link.download = `zen-it-trix-registrations-${new Date().toISOString().slice(0, 10)}.csv`
            link.click()
        } catch (error) {
            setStatus({ type: 'error', message: error.message })
        }
    }

    const fetchBarcode = async (code) => {
        const response = await fetch(`${API_URL}/barcode/${encodeURIComponent(code)}`)
        if (!response.ok) throw new Error(`Barcode request for ${code} failed.`)
        const blob = await response.blob()
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = reject
            reader.readAsDataURL(blob)
        })
    }

    const toggleAttendance = async (registration) => {
        try {
            const result = await request(`/admin/registrations/${registration.id}/toggle-attendance`, { method: 'POST' })
            setRegistrations((current) =>
                current.map((item) => item.id === registration.id
                    ? { ...item, present: result.present, presentAt: result.present ? new Date().toISOString() : null }
                    : item
                )
            )
        } catch (error) {
            setStatus({ type: 'error', message: 'Failed to update attendance: ' + error.message })
        }
    }

    const bulkMarkPresent = async () => {
        if (!selectedIds.length) return
        try {
            await request('/admin/registrations/bulk-present', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: selectedIds }),
            })
            setRegistrations((current) =>
                current.map((item) => selectedIds.includes(item.id)
                    ? { ...item, present: 1, presentAt: item.presentAt || new Date().toISOString() }
                    : item
                )
            )
            setStatus({ type: 'success', message: `Marked ${selectedIds.length} student(s) as present!` })
            setSelectedIds([])
        } catch (error) {
            setStatus({ type: 'error', message: error.message })
        }
    }

    const printSelected = async (ids = selectedIds) => {
        if (!ids.length) return
        const printWindow = window.open('', '_blank')
        if (!printWindow) {
            setStatus({ type: 'error', message: 'Please allow pop-ups to print passes.' })
            return
        }
        printWindow.document.write('<p style="font-family:sans-serif;padding:24px;background:#0f1117;color:#f0f6fc">Preparing passes for printing...</p>')

        try {
            const selected = registrations.filter((registration) => ids.includes(registration.id))
            await Promise.all(selected.map((r) => !r.present ? request(`/admin/registrations/${r.id}/present`, { method: 'POST' }) : Promise.resolve()))

            setRegistrations((current) =>
                current.map((item) => ids.includes(item.id)
                    ? { ...item, present: 1, presentAt: item.presentAt || new Date().toISOString() }
                    : item
                )
            )

            const passItems = []
            for (const reg of selected) {
                if (reg.registrationType === 'team' && reg.teamMembers && reg.teamMembers.length > 0) {
                    reg.teamMembers.forEach((member, idx) => {
                        const memberName = typeof member === 'object' ? member.name : member
                        const memberCode = (reg.memberPassCodes && reg.memberPassCodes[idx])
                            || (typeof member === 'object' && member.passCode)
                            || (reg.members && reg.members[idx]?.passCode)
                            || reg.passCode
                        passItems.push({
                            code: memberCode,
                            fullName: memberName,
                            college: reg.college,
                            yearOfStudy: reg.yearOfStudy,
                            eventName: reg.eventName,
                            isTeam: true,
                            teamName: reg.teamName,
                            memberIndex: idx + 1,
                            isLeader: idx === 0,
                            teamSize: reg.teamSize || reg.teamMembers.length,
                        })
                    })
                } else {
                    passItems.push({
                        code: reg.passCode,
                        fullName: reg.fullName,
                        college: reg.college,
                        yearOfStudy: reg.yearOfStudy,
                        eventName: reg.eventName,
                        isTeam: false,
                        teamName: null,
                        memberIndex: 1,
                        isLeader: false,
                    })
                }
            }

            const barcodes = await Promise.all(passItems.map((item) => fetchBarcode(item.code)))
            const cards = passItems.map((item, index) => `
                <article class="pass">
                    <div class="pass-header">
                        <img class="pass-logo" src="${zenLogo}" alt="Zen-it-trix Logo">
                        <div>
                            <div class="kicker">Zen-it-trix 2.0 · Pass</div>
                            <div class="sub-kicker">${item.isTeam ? `Team: ${escapeHtml(item.teamName || 'Pass')} · Member ${item.memberIndex}${item.isLeader ? ' (Leader)' : ''}` : 'Student pass'}</div>
                        </div>
                    </div>
                    <div class="code">${escapeHtml(item.code)}</div>
                    <div class="name">${escapeHtml(item.fullName)}</div>
                    <div class="meta">${escapeHtml(item.college)} · ${escapeHtml(item.yearOfStudy || '')}</div>
                    <div class="event">${escapeHtml(item.eventName)}</div>
                    <img class="barcode" src="${barcodes[index]}" alt="Barcode for ${escapeHtml(item.code)}">
                    <div class="pass-footer">
                        <img class="pass-college-banner" src="${collegeLogo}" alt="Annapoorana Engineering College (Autonomous)">
                        <div class="pass-footer-dept">Department of Information Technology</div>
                        <div class="pass-footer-meta">${item.isTeam ? `Official Check-in Pass · Team: ${escapeHtml(item.teamName || '')}` : 'Authorized Student Pass · Check-in Valid'}</div>
                    </div>
                </article>
            `).join('')

            printWindow.document.open()
            printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Zen-it-trix passes (${passItems.length} passes)</title><link rel="icon" type="image/png" href="${zenLogo}"><style>${passStyles}</style></head><body>${cards}</body></html>`)
            printWindow.document.close()
            setTimeout(() => {
                printWindow.focus()
                printWindow.print()
            }, 250)
        } catch (err) {
            printWindow.close()
            setStatus({ type: 'error', message: 'Passes could not be prepared for printing: ' + err.message })
        }
    }

    const toggleSelect = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])

    const copyPassCode = (code) => {
        navigator.clipboard.writeText(code)
        setCopiedId(code)
        setTimeout(() => setCopiedId(null), 1800)
    }

    const filtered = useMemo(() => {
        return registrations.filter((reg) => {
            if (statusFilter === 'present' && !reg.present) return false
            if (statusFilter === 'absent' && reg.present) return false
            if (statusFilter === 'team' && reg.registrationType !== 'team') return false
            if (statusFilter === 'individual' && reg.registrationType === 'team') return false

            if (eventFilter && !reg.eventName.toLowerCase().includes(eventFilter.toLowerCase())) {
                return false
            }

            if (!search) return true
            const query = search.toLowerCase()
            const memberCodes = reg.memberPassCodes || []
            const memberNamesList = reg.teamMembers
                ? reg.teamMembers.map((m) => (typeof m === 'object' ? `${m.name} ${m.passCode}` : m))
                : []

            return [
                reg.passCode,
                reg.passCodeRange || '',
                ...memberCodes,
                reg.fullName,
                reg.email,
                reg.phone,
                reg.college,
                reg.collegeId || '',
                reg.eventName,
                reg.teamName || '',
                reg.teamMembersList || '',
                ...memberNamesList,
                reg.yearOfStudy || '',
            ].some((val) => String(val).toLowerCase().includes(query))
        })
    }, [registrations, statusFilter, eventFilter, search])

    const toggleSelectAll = () => {
        if (selectedIds.length === filtered.length && filtered.length > 0) {
            setSelectedIds([])
        } else {
            setSelectedIds(filtered.map((r) => r.id))
        }
    }

    const totalCount = registrations.length
    const presentCount = registrations.filter((r) => r.present).length
    const attendancePct = totalCount ? Math.round((presentCount / totalCount) * 100) : 0
    const teamsCount = registrations.filter((r) => r.registrationType === 'team').length
    const individualsCount = totalCount - teamsCount

    if (!token) {
        return (
            <main className="admin-page">
                <section className="admin-login-card">
                    <div className="admin-login-header">
                        <div className="login-badge-tag">ADMINISTRATIVE PORTAL</div>
                        <h1>Zen-it-trix 2.0</h1>
                        <p className="login-college-sub">Annapoorana Engineering College · Department of Information Technology</p>
                        <p className="login-instructions">Sign in with authorized administrative credentials to manage registrations, verify participant credentials, and track symposium attendance.</p>
                    </div>

                    <form onSubmit={login} className="admin-login-form">
                        <label>
                            <span>Administrator Username</span>
                            <input
                                autoFocus
                                value={credentials.username}
                                onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                                placeholder="Enter admin username"
                                required
                            />
                        </label>
                        <label>
                            <span>Security Password</span>
                            <input
                                type="password"
                                value={credentials.password}
                                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                                placeholder="Enter password"
                                required
                            />
                        </label>

                        {status.message && (
                            <div className={`admin-alert ${status.type}`}>
                                <span className="alert-bullet">[Notice]</span> {status.message}
                            </div>
                        )}

                        <button className="admin-submit-btn" disabled={isLoading}>
                            {isLoading ? 'Authenticating...' : 'Sign In to Portal'}
                        </button>
                    </form>
                </section>
            </main>
        )
    }

    return (
        <main className="admin-page admin-redesign">
            {/* Top Operational Bar */}
            <header className="admin-hub-header">
                <div className="hub-identity">
                    <div className="hub-tagline">
                        <span className="live-indicator"></span>
                        <span className="hub-code">Session Active</span>
                        <span className="hub-div">|</span>
                        <span className="hub-inst">Annapoorana Engineering College · IT Dept</span>
                        <span className="hub-div">|</span>
                        <span className="hub-db-status">Database Online</span>
                    </div>
                    <h1>Administration & Attendance Console</h1>
                </div>

                <div className="hub-actions">
                    <button
                        type="button"
                        className={`hub-btn ${activeTab === 'create' ? 'hub-btn-primary' : 'hub-btn-ghost'}`}
                        onClick={() => setActiveTab(activeTab === 'create' ? 'list' : 'create')}
                    >
                        {activeTab === 'create' ? (
                            <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                                <span>View Registrations</span>
                            </>
                        ) : (
                            <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                <span>On-Spot Desk</span>
                            </>
                        )}
                    </button>
                    <a
                        href="#food-admin"
                        className="hub-btn hub-btn-primary"
                        style={{ textDecoration: 'none' }}
                        title="Open Food & Catering Barcode Scanner"
                    >
                        <span>🍱</span>
                        <span>Food Counter</span>
                    </a>
                    <button
                        type="button"
                        className="hub-btn hub-btn-ghost"
                        onClick={exportReport}
                        title="Download full registrations as CSV"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span>Export CSV</span>
                    </button>
                    <button
                        type="button"
                        className={`hub-btn hub-btn-ghost ${isRefreshing ? 'spinning' : ''}`}
                        onClick={loadRegistrations}
                        title="Reload registrations"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                        <span>Refresh</span>
                    </button>
                    <button
                        type="button"
                        className="hub-btn hub-btn-danger"
                        onClick={logout}
                        title="End session"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        <span>Sign Out</span>
                    </button>
                </div>
            </header>

            {/* KPI Stat Cards */}
            <section className="admin-kpi-grid">
                <div className="kpi-card" onClick={() => setStatusFilter('all')}>
                    <div className="kpi-label">Total Passes Issued</div>
                    <div className="kpi-val">{totalCount}</div>
                    <div className="kpi-sub">Total registered participants</div>
                </div>

                <div className="kpi-card highlight-attendance" onClick={() => setStatusFilter(statusFilter === 'present' ? 'all' : 'present')}>
                    <div className="kpi-header-row">
                        <div className="kpi-label">Checked-In (Present)</div>
                        <span className="kpi-pill">{attendancePct}%</span>
                    </div>
                    <div className="kpi-val text-lime">{presentCount} <small className="kpi-denom">/ {totalCount}</small></div>
                    <div className="kpi-progress">
                        <div className="kpi-progress-bar" style={{ width: `${attendancePct}%` }}></div>
                    </div>
                </div>

                <div className="kpi-card" onClick={() => setStatusFilter(statusFilter === 'team' ? 'all' : 'team')}>
                    <div className="kpi-label">Team Passes</div>
                    <div className="kpi-val text-cyan">{teamsCount}</div>
                    <div className="kpi-sub">Collaborative squad entries</div>
                </div>

                <div className="kpi-card" onClick={() => setStatusFilter(statusFilter === 'individual' ? 'all' : 'individual')}>
                    <div className="kpi-label">Individual Passes</div>
                    <div className="kpi-val text-amber">{individualsCount}</div>
                    <div className="kpi-sub">Solo participants</div>
                </div>
            </section>

            {/* Global Flash Alerts */}
            {status.message && (
                <div className={`admin-alert ${status.type} floating-alert`}>
                    <span className="alert-bullet">{status.type === 'error' ? '[Error]' : '[Success]'}</span>
                    <span className="alert-text">{status.message}</span>
                    <button type="button" className="alert-close" onClick={() => setStatus({ type: '', message: '' })}>Close</button>
                </div>
            )}

            {/* Main Content Workspace */}
            {activeTab === 'create' ? (
                /* ─── ON-SPOT REGISTRATION PANEL ─── */
                <section className="admin-desk-card">
                    <div className="desk-card-header">
                        <div>
                            <span className="desk-track-badge">Registration Desk</span>
                            <h2>On-Spot Pass Registration</h2>
                            <p className="desk-desc">Register arriving students, validate credentials, and issue official passes.</p>
                        </div>
                        <button type="button" className="hub-btn hub-btn-ghost" onClick={() => setActiveTab('list')}>
                            Back to Registrations Table
                        </button>
                    </div>

                    <div className="registration-type-toggle" role="group" aria-label="Registration type">
                        <button
                            type="button"
                            className={!isTeam ? 'active' : ''}
                            onClick={() => handleTypeToggle('individual')}
                            disabled={isStrictTeam}
                        >
                            Individual Pass
                        </button>
                        <button
                            type="button"
                            className={isTeam ? 'active' : ''}
                            onClick={() => handleTypeToggle('team')}
                            disabled={isStrictIndividual}
                        >
                            Team Pass {isStrictTeam && '(Required)'}
                        </button>
                    </div>

                    <form onSubmit={addStudent} className="desk-form">
                        <div className="desk-form-grid">
                            <label className="desk-field full-col">
                                <span className="desk-label-text">
                                    {isTeam ? 'Team leader full name' : 'Full name'}
                                    {isTeam && <span className="desk-helper-pill">Formatted as: Name (leader)</span>}
                                </span>
                                <input
                                    name="fullName"
                                    value={form.fullName}
                                    onChange={updateField}
                                    placeholder={isTeam ? 'Enter team leader name' : 'Enter participant name'}
                                    required
                                />
                            </label>

                            <label className="desk-field">
                                <span className="desk-label-text">Email Address (no whitespace)</span>
                                <input
                                    name="email"
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setForm(c => ({ ...c, email: e.target.value.replace(/\s+/g, '').toLowerCase() }))}
                                    placeholder="student@example.com"
                                    required
                                />
                            </label>

                            <label className="desk-field">
                                <span className="desk-label-text">Mobile Number (10 digits)</span>
                                <input
                                    name="phone"
                                    value={form.phone}
                                    onChange={(e) => setForm(c => ({ ...c, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                                    maxLength={10}
                                    placeholder="9876543210"
                                    required
                                />
                            </label>

                            <div className="desk-field full-col">
                                <span className="desk-label-text">College or Institution</span>
                                <CollegeSelector
                                    key={formKey}
                                    value={form.college}
                                    onChange={(college) => setForm((curr) => ({ ...curr, college }))}
                                    disabled={isLoading}
                                />
                            </div>

                            <label className="desk-field">
                                <span className="desk-label-text">College ID / Roll Number</span>
                                <input
                                    name="collegeId"
                                    value={form.collegeId}
                                    onChange={(e) => setForm(c => ({ ...c, collegeId: e.target.value.replace(/\s+/g, '').toUpperCase() }))}
                                    placeholder="e.g. 21CS045"
                                />
                            </label>

                            <label className="desk-field">
                                <span className="desk-label-text">Year of Study</span>
                                <select name="yearOfStudy" value={form.yearOfStudy} onChange={updateField} required>
                                    {yearsOfStudy.map((year) => <option key={year} value={year}>{year}</option>)}
                                </select>
                            </label>
                        </div>

                        {/* Events Selection Box */}
                        <div className="desk-event-box">
                            <div className="desk-event-box-header">
                                <span className="desk-event-title">Event Selection</span>
                                <span className="desk-event-tag">Maximum 1 Technical + 1 Non-Technical</span>
                            </div>
                            <p className="desk-event-note">Select at least one event category (Technical or Non-Technical).</p>

                            <div className="desk-form-grid">
                                <label className="desk-field">
                                    <span className="desk-label-text">Technical Event {form.technicalEvent && '[Selected]'}</span>
                                    <select name="technicalEvent" value={form.technicalEvent} onChange={handleTechnicalChange}>
                                        <option value="">-- No Technical Event --</option>
                                        {availableTechEvents.map((event) => (
                                            <option key={event.name} value={event.name}>
                                                {event.name} {event.team_and_individual ? '(Solo & Team)' : (event.type === 'team' ? '(Team)' : '')}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="desk-field">
                                    <span className="desk-label-text">Non-Technical Event {form.nonTechnicalEvent && '[Selected]'}</span>
                                    <select name="nonTechnicalEvent" value={form.nonTechnicalEvent} onChange={handleNonTechnicalChange}>
                                        <option value="">-- No Non-Technical Event --</option>
                                        {availableNonTechEvents.map((event) => (
                                            <option key={event.name} value={event.name}>
                                                {event.name} {event.team_and_individual ? '(Solo & Team)' : (event.type === 'team' ? '(Team)' : '')}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        </div>

                        {/* Team Details Section */}
                        {isTeam && (
                            <div className="desk-team-box">
                                <div className="desk-team-header">
                                    <span className="desk-team-badge">Team Roster</span>
                                    <span className="desk-team-leader-tag">
                                        Leader: <strong>{form.fullName ? `${form.fullName.replace(/\s*(?:\(?\s*leader\s*\)?)$/i, '')} (leader)` : 'Member 1 (leader)'}</strong>
                                    </span>
                                </div>

                                <div className="desk-form-grid">
                                    <label className="desk-field">
                                        <span className="desk-label-text">Team Name</span>
                                        <input
                                            name="teamName"
                                            placeholder="e.g. CyberKnights"
                                            value={form.teamName}
                                            onChange={updateField}
                                            required
                                        />
                                    </label>

                                    <label className="desk-field">
                                        <span className="desk-label-text">Team Size (Max 5 Members)</span>
                                        <select name="teamSize" value={form.teamSize} onChange={updateField} required>
                                            <option value="2">2 Members</option>
                                            <option value="3">3 Members</option>
                                            <option value="4">4 Members</option>
                                            <option value="5">5 Members</option>
                                        </select>
                                    </label>
                                </div>

                                <div className="desk-secondary-grid">
                                    {Array.from({ length: Number(form.teamSize) - 1 }).map((_, idx) => (
                                        <label key={idx + 2} className="desk-field">
                                            <span className="desk-label-text">Member {idx + 2} Full Name</span>
                                            <input
                                                type="text"
                                                placeholder={`Enter member ${idx + 2} name`}
                                                value={memberNames[idx] || ''}
                                                onChange={(e) => handleMemberNameChange(idx, e.target.value)}
                                                required
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="desk-submit-row">
                            <button type="submit" className="admin-submit-btn" disabled={isLoading}>
                                {isLoading ? 'Processing Registration...' : (isTeam ? 'Register Team & Issue Passes' : 'Register Participant & Issue Pass')}
                            </button>
                        </div>
                    </form>
                </section>
            ) : (
                /* ─── REGISTRATIONS TABLE VIEW ─── */
                <section className="admin-table-container">
                    {/* Filter & Search Bar */}
                    <div className="table-toolbar">
                        <div className="search-wrap">
                            <span className="search-icon" aria-hidden="true">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                </svg>
                            </span>
                            <input
                                type="search"
                                className="toolbar-search-input"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by pass, participant, team, college, roll ID, event..."
                            />
                            {search && (
                                <button type="button" className="search-clear" onClick={() => setSearch('')}>Clear</button>
                            )}
                        </div>

                        <div className="toolbar-filters">
                            <div className="filter-chips">
                                <button
                                    type="button"
                                    className={`filter-chip ${statusFilter === 'all' ? 'active' : ''}`}
                                    onClick={() => setStatusFilter('all')}
                                >
                                    All <span className="chip-count">{totalCount}</span>
                                </button>
                                <button
                                    type="button"
                                    className={`filter-chip ${statusFilter === 'present' ? 'active' : ''}`}
                                    onClick={() => setStatusFilter('present')}
                                >
                                    Present <span className="chip-count">{presentCount}</span>
                                </button>
                                <button
                                    type="button"
                                    className={`filter-chip ${statusFilter === 'absent' ? 'active' : ''}`}
                                    onClick={() => setStatusFilter('absent')}
                                >
                                    Pending <span className="chip-count">{totalCount - presentCount}</span>
                                </button>
                                <button
                                    type="button"
                                    className={`filter-chip ${statusFilter === 'team' ? 'active' : ''}`}
                                    onClick={() => setStatusFilter('team')}
                                >
                                    Teams <span className="chip-count">{teamsCount}</span>
                                </button>
                                <button
                                    type="button"
                                    className={`filter-chip ${statusFilter === 'individual' ? 'active' : ''}`}
                                    onClick={() => setStatusFilter('individual')}
                                >
                                    Solo <span className="chip-count">{individualsCount}</span>
                                </button>
                            </div>

                            <select
                                className="event-filter-dropdown"
                                value={eventFilter}
                                onChange={(e) => setEventFilter(e.target.value)}
                            >
                                <option value="">All Events ({allEventsList.length})</option>
                                {allEventsList.map((evt) => (
                                    <option key={evt} value={evt}>{evt}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Batch Actions Bar */}
                    {selectedIds.length > 0 && (
                        <div className="batch-action-bar">
                            <div className="batch-info">
                                <span className="batch-count-tag">{selectedIds.length}</span>
                                <span>registrations selected</span>
                            </div>
                            <div className="batch-btns">
                                <button
                                    type="button"
                                    className="batch-btn batch-btn-checkin"
                                    onClick={bulkMarkPresent}
                                >
                                    Check In Selected ({selectedIds.length})
                                </button>
                                <button
                                    type="button"
                                    className="batch-btn batch-btn-print"
                                    onClick={() => printSelected()}
                                >
                                    Print Passes ({selectedIds.length})
                                </button>
                                <button
                                    type="button"
                                    className="batch-btn batch-btn-ghost"
                                    onClick={() => setSelectedIds([])}
                                >
                                    Deselect All
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Registrations Listing */}
                    <div className="modern-table-card">
                        <div className="table-responsive">
                            <table className="zen-data-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '44px' }}>
                                            <input
                                                type="checkbox"
                                                className="zen-checkbox"
                                                checked={filtered.length > 0 && selectedIds.length === filtered.length}
                                                onChange={toggleSelectAll}
                                                aria-label="Select all registrations"
                                            />
                                        </th>
                                        <th style={{ width: '110px' }}>Pass Code</th>
                                        <th>Participant / Team Details</th>
                                        <th>Registered Events</th>
                                        <th>Institution & Roll ID</th>
                                        <th style={{ width: '140px' }}>Attendance</th>
                                        <th style={{ width: '110px', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="table-empty-cell">
                                                <div className="empty-state">
                                                    <p>No participant registrations matched your search criteria.</p>
                                                    {(search || statusFilter !== 'all' || eventFilter) && (
                                                        <button
                                                            type="button"
                                                            className="empty-reset-btn"
                                                            onClick={() => { setSearch(''); setStatusFilter('all'); setEventFilter('') }}
                                                        >
                                                            Reset all filters
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        filtered.map((reg) => {
                                            const isSelected = selectedIds.includes(reg.id)
                                            const isTeamReg = reg.registrationType === 'team'

                                            return (
                                                <tr key={reg.id} className={`${isSelected ? 'row-selected' : ''} ${reg.present ? 'row-present' : ''}`}>
                                                    <td>
                                                        <input
                                                            type="checkbox"
                                                            className="zen-checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleSelect(reg.id)}
                                                            aria-label={`Select ${reg.fullName}`}
                                                        />
                                                    </td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className="pass-code-pill"
                                                            onClick={() => copyPassCode(reg.passCodeRange || reg.passCode)}
                                                            title="Click to copy pass code"
                                                        >
                                                            <span>{reg.passCodeRange || reg.passCode}</span>
                                                            <small className="copy-badge">{copiedId === (reg.passCodeRange || reg.passCode) ? 'COPIED' : 'COPY'}</small>
                                                        </button>
                                                    </td>
                                                    <td className="participant-cell">
                                                        <div className="participant-name-row">
                                                            <span className="participant-primary-name">{reg.fullName}</span>
                                                            {isTeamReg && (
                                                                <span className="team-flag-pill">
                                                                    Team: {reg.teamName} · {reg.teamSize || 2} members
                                                                </span>
                                                            )}
                                                        </div>

                                                        {isTeamReg && reg.teamMembers && reg.teamMembers.length > 0 && (
                                                            <div className="team-roster-tags">
                                                                {reg.teamMembers.map((member, mIdx) => {
                                                                    const memberName = typeof member === 'object' ? member.name : member
                                                                    const memberCode = (reg.memberPassCodes && reg.memberPassCodes[mIdx])
                                                                        || (typeof member === 'object' && member.passCode)
                                                                        || (reg.members && reg.members[mIdx]?.passCode)
                                                                        || ''
                                                                    return (
                                                                        <span
                                                                            key={mIdx}
                                                                            className={`member-roster-tag ${mIdx === 0 || memberName.toLowerCase().includes('(leader)') ? 'leader-tag' : ''}`}
                                                                        >
                                                                            {mIdx === 0 || memberName.toLowerCase().includes('(leader)') ? '[Leader] ' : ''}
                                                                            {memberName}
                                                                            {memberCode && <span className="member-code-badge" style={{ marginLeft: '4px', opacity: 0.9, fontWeight: 700 }}>({memberCode})</span>}
                                                                        </span>
                                                                    )
                                                                })}
                                                            </div>
                                                        )}

                                                        <div className="participant-contacts">
                                                            <span>Tel: {reg.phone}</span>
                                                            <span className="contact-sep">·</span>
                                                            <span>Email: {reg.email}</span>
                                                        </div>
                                                    </td>
                                                    <td className="events-cell">
                                                        <div className="event-badges-stack">
                                                            {reg.technicalEvent && (
                                                                <span className="event-chip chip-tech" title="Technical Event">
                                                                    Technical: {reg.technicalEvent}
                                                                </span>
                                                            )}
                                                            {reg.nonTechnicalEvent && (
                                                                <span className="event-chip chip-nontech" title="Non-Technical Event">
                                                                    Non-Technical: {reg.nonTechnicalEvent}
                                                                </span>
                                                            )}
                                                            {!reg.technicalEvent && !reg.nonTechnicalEvent && (
                                                                <span className="event-chip chip-neutral">{reg.eventName}</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="college-cell">
                                                        <div className="college-name-text" title={reg.college}>
                                                            {reg.college}
                                                        </div>
                                                        <div className="college-meta-text">
                                                            <span>{reg.yearOfStudy}</span>
                                                            {reg.collegeId && (
                                                                <>
                                                                    <span className="contact-sep">·</span>
                                                                    <span className="roll-id-tag">ID: {reg.collegeId}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className={`attendance-toggle-btn ${reg.present ? 'is-present' : 'is-absent'}`}
                                                            onClick={() => toggleAttendance(reg)}
                                                            title={reg.present ? 'Click to mark as pending' : 'Click to confirm presence'}
                                                        >
                                                            <span className="attendance-indicator" aria-hidden="true"></span>
                                                            <span>{reg.present ? 'Present' : 'Check In'}</span>
                                                        </button>
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <button
                                                            type="button"
                                                            className="row-action-btn"
                                                            onClick={() => printSelected([reg.id])}
                                                            title="Print official barcode pass"
                                                        >
                                                            Print Pass
                                                        </button>
                                                    </td>
                                                </tr>
                                            )
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="table-footer-status">
                            <span>Showing {filtered.length} of {totalCount} total participant registrations</span>
                            {selectedIds.length > 0 && <span> · {selectedIds.length} records selected</span>}
                        </div>
                    </div>
                </section>
            )}
        </main>
    )
}
