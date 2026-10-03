import { useState, useEffect } from 'react'
import { nonTechnicalEvents, technicalEvents, yearsOfStudy, getEventConfig, getFilteredEvents } from '../data'
import { zenLogo, collegeLogo } from '../assets/logoDataUrl'
import CollegeSelector from './CollegeSelector'

import { API_URL } from '../config'

const emptyForm = { fullName: '', email: '', phone: '', college: '', yearOfStudy: '1st Year', technicalEvent: '', nonTechnicalEvent: '', teamName: '', teamSize: '2' }
const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const themedPassStyles = `@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;700&family=Space+Grotesk:wght@500;700&display=swap');
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
const applyPassStyles = (html) => html.replace(/<style>[\s\S]*?<\/style>/, `<style>${themedPassStyles}</style>`)

async function readResponse(response) {
    const contentType = response.headers.get('content-type') || ''
    const data = contentType.includes('application/json') ? await response.json() : await response.text()
    if (!response.ok) throw new Error(data.message || 'Request failed.')
    return data
}

export default function AdminPage() {
    const [token, setToken] = useState(() => sessionStorage.getItem('zen-admin-token') || '')
    const [credentials, setCredentials] = useState({ username: '', password: '' })
    const [registrations, setRegistrations] = useState([])
    const [registrationType, setRegistrationType] = useState('individual')
    const [form, setForm] = useState(emptyForm)
    const [memberNames, setMemberNames] = useState(['', '', '', ''])
    const [formKey, setFormKey] = useState(0)
    const [status, setStatus] = useState({ type: '', message: '' })
    const [isLoading, setIsLoading] = useState(false)
    const [pass, setPass] = useState(null)
    const [search, setSearch] = useState('')
    const [selectedIds, setSelectedIds] = useState([])

    const isTeam = registrationType === 'team'
    const techConfig = getEventConfig(form.technicalEvent)
    const nonTechConfig = getEventConfig(form.nonTechnicalEvent)
    const isStrictTeam = Boolean((techConfig && techConfig.type === 'team' && !techConfig.team_and_individual) || (nonTechConfig && nonTechConfig.type === 'team' && !nonTechConfig.team_and_individual))
    const isStrictIndividual = Boolean((techConfig && techConfig.type === 'individual' && !techConfig.team_and_individual) || (nonTechConfig && nonTechConfig.type === 'individual' && !nonTechConfig.team_and_individual))
    const availableTechEvents = getFilteredEvents(technicalEvents, registrationType)
    const availableNonTechEvents = getFilteredEvents(nonTechnicalEvents, registrationType)

    const request = async (path, options = {}) => readResponse(await fetch(`${API_URL}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } }))

    const loadRegistrations = async () => {
        try {
            setRegistrations(await request('/admin/registrations'))
        } catch (error) {
            setStatus({ type: 'error', message: error.message })
        }
    }

    useEffect(() => {
        if (token) loadRegistrations()
    }, [token])

    const handleLogin = async (event) => {
        event.preventDefault()
        setIsLoading(true)
        try {
            const result = await readResponse(await fetch(`${API_URL}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) }))
            sessionStorage.setItem('zen-admin-token', result.token)
            setToken(result.token)
            setStatus({ type: '', message: '' })
        } catch (error) {
            setStatus({ type: 'error', message: error.message })
        } finally {
            setIsLoading(false)
        }
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

    const handleOnSpotRegistration = async (event) => {
        event.preventDefault()
        setIsLoading(true)
        const tech = form.technicalEvent.trim()
        const nonTech = form.nonTechnicalEvent.trim()
        if (!tech && !nonTech) {
            setStatus({ type: 'error', message: 'Please select at least one event (Technical or Non-Technical).' })
            setIsLoading(false)
            return
        }

        const teamSizeNum = isTeam ? Number(form.teamSize) : 1
        const formatLeader = (name) => {
            const trimmed = String(name || '').trim()
            const base = trimmed.replace(/\s*(?:\(?\s*leader\s*\)?)$/i, '').trim()
            return base ? `${base} (leader)` : trimmed
        }
        const cleanLeader = isTeam ? formatLeader(form.fullName) : form.fullName.trim()
        const teamMembers = isTeam
            ? [cleanLeader, ...memberNames.slice(0, teamSizeNum - 1).map((m) => m.trim())]
            : []

        if (isTeam && !form.teamName.trim()) {
            setStatus({ type: 'error', message: 'Team name is required for team registrations.' })
            setIsLoading(false)
            return
        }

        const combinedEventName = [tech, nonTech].filter(Boolean).join(' + ')

        try {
            const payload = {
                fullName: cleanLeader,
                email: form.email.trim(),
                phone: form.phone.trim(),
                college: form.college.trim(),
                yearOfStudy: form.yearOfStudy,
                eventName: combinedEventName,
                technicalEvent: tech || null,
                nonTechnicalEvent: nonTech || null,
                registrationType,
                teamName: isTeam ? form.teamName.trim() : null,
                teamSize: teamSizeNum,
                teamMembers,
            }
            const result = await request('/admin/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            setForm(emptyForm)
            setMemberNames(['', '', '', ''])
            setRegistrationType('individual')
            setFormKey((k) => k + 1)
            setStatus({ type: 'success', message: `Registered successfully with pass ${result.passCodeRange || result.passCode}.` })
            await loadRegistrations()
        } catch (error) {
            setStatus({ type: 'error', message: error.message })
        } finally {
            setIsLoading(false)
        }
    }

    const exportRegistrations = async () => {
        try {
            const response = await fetch(`${API_URL}/registrations/export`, { headers: { Authorization: `Bearer ${token}` } })
            if (!response.ok) throw new Error('Export failed.')
            const blob = await response.blob()
            const link = document.createElement('a')
            link.href = URL.createObjectURL(blob)
            link.download = 'zen-it-trix-registrations.csv'
            link.click()
        } catch (error) {
            setStatus({ type: 'error', message: error.message })
        }
    }

    const toggleStudent = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])

    const fetchBarcodeUrl = async (code) => {
        const response = await fetch(`${API_URL}/barcode/${encodeURIComponent(code)}`)
        if (!response.ok) throw new Error(`Could not fetch pass barcode for ${code}.`)
        const blob = await response.blob()
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = reject
            reader.readAsDataURL(blob)
        })
    }

    const downloadPass = async (registration) => {
        try {
            const barcodeUrl = await fetchBarcodeUrl(registration.passCode)
            setPass({ ...registration, barcodeUrl })
            setStatus({ type: '', message: '' })
        } catch (error) {
            setStatus({ type: 'error', message: error.message })
        }
    }

    const printPass = async (registration) => {
        const printWindow = window.open('', '_blank')
        if (!printWindow) {
            setStatus({ type: 'error', message: 'Popup blocked. Please allow popups to print.' })
            return
        }
        printWindow.document.write('<p style="font-family:sans-serif;padding:24px">Preparing passes for each member...</p>')
        try {
            const passItems = []
            if (registration.registrationType === 'team' && registration.teamMembers && registration.teamMembers.length > 0) {
                registration.teamMembers.forEach((member, idx) => {
                    const memberName = typeof member === 'object' ? member.name : member
                    const memberCode = (registration.memberPassCodes && registration.memberPassCodes[idx])
                        || (typeof member === 'object' && member.passCode)
                        || (registration.members && registration.members[idx]?.passCode)
                        || registration.passCode
                    passItems.push({
                        code: memberCode,
                        fullName: memberName,
                        college: registration.college,
                        yearOfStudy: registration.yearOfStudy,
                        eventName: registration.eventName,
                        isTeam: true,
                        teamName: registration.teamName,
                        memberIndex: idx + 1,
                        isLeader: idx === 0,
                    })
                })
            } else {
                passItems.push({
                    code: registration.passCode,
                    fullName: registration.fullName,
                    college: registration.college,
                    yearOfStudy: registration.yearOfStudy,
                    eventName: registration.eventName,
                    isTeam: false,
                    teamName: null,
                    memberIndex: 1,
                    isLeader: false,
                })
            }

            const barcodeUrls = await Promise.all(passItems.map((item) => fetchBarcodeUrl(item.code)))
            const cards = passItems.map((item, index) => `<article class="pass"><div class="pass-header"><img class="pass-logo" src="${zenLogo}" alt="Zen-it-trix Logo"><div><div class="kicker">Zen-it-trix 2.0 // Pass</div><div class="sub-kicker">${item.isTeam ? `Team: ${escapeHtml(item.teamName || 'Pass')} · Member ${item.memberIndex}${item.isLeader ? ' (Leader)' : ''}` : 'Student pass'}</div></div></div><div class="code">${escapeHtml(item.code)}</div><div class="name">${escapeHtml(item.fullName)}</div><div class="meta">${escapeHtml(item.college)} · ${escapeHtml(item.yearOfStudy || '')}</div><div class="event">${escapeHtml(item.eventName)}</div><img class="barcode" src="${barcodeUrls[index]}" alt="Barcode for ${escapeHtml(item.code)}"><div class="pass-footer"><img class="pass-college-banner" src="${collegeLogo}" alt="Annapoorana Engineering College (Autonomous)"><div class="pass-footer-dept">Department of Information Technology</div><div class="pass-footer-meta">${item.isTeam ? `Official Check-in Pass · Team: ${escapeHtml(item.teamName || '')}` : 'Authorized Student Pass · Check-in Valid'}</div></div></article>`).join('')
            printWindow.document.open()
            printWindow.document.write(applyPassStyles(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(registration.passCode)} Passes</title><link rel="icon" type="image/png" href="${zenLogo}"><style>${themedPassStyles}</style></head><body>${cards}</body></html>`))
            printWindow.document.close()
            setTimeout(() => {
                printWindow.focus()
                printWindow.print()
            }, 250)
        } catch (err) {
            printWindow.close()
            setStatus({ type: 'error', message: 'The passes could not be printed: ' + err.message })
        }
    }

    const downloadGroupPass = async () => {
        if (selectedIds.length !== 4) return
        const printWindow = window.open('', '_blank')
        if (!printWindow) {
            setStatus({ type: 'error', message: 'Popup blocked. Please allow popups to print passes.' })
            return
        }
        printWindow.document.write('<p style="font-family:sans-serif;padding:24px">Preparing student passes...</p>')
        try {
            const selectedStudents = registrations.filter((registration) => selectedIds.includes(registration.id))
            const barcodeUrls = await Promise.all(selectedStudents.map((registration) => fetchBarcodeUrl(registration.id)))
            const passesMarkup = selectedStudents.map((registration, index) => `<article class="pass"><div class="pass-header"><img class="pass-logo" src="${zenLogo}" alt="Zen-it-trix Logo"><div><div class="kicker">Zen-it-trix 2.0</div><div class="sub-kicker">${registration.registrationType === 'team' ? `Team: ${escapeHtml(registration.teamName || 'Pass')}` : 'Student pass'}</div></div></div><div class="code">${escapeHtml(registration.passCode)}</div><div class="name">${escapeHtml(registration.fullName)}</div><div class="meta">${escapeHtml(registration.college)} · ${escapeHtml(registration.yearOfStudy || '')}</div><div class="event">${escapeHtml(registration.eventName)}</div><img class="barcode" src="${barcodeUrls[index]}" alt="Barcode for ${escapeHtml(registration.passCode)}"><div class="pass-footer"><div class="pass-footer-left"><img class="pass-college-logo" src="${collegeLogo}" alt="College Logo"><div class="pass-footer-text"><span class="college-inst-title">Annapoorana Engineering College</span><span class="college-inst-dept">Department of Information Technology</span></div></div><div class="small">${registration.registrationType === 'team' && registration.teamMembersList ? `Team members: ${escapeHtml(registration.teamMembersList)}` : 'Present this pass at check-in'}</div></div></article>`).join('')
            printWindow.document.open()
            printWindow.document.write(applyPassStyles(`<!doctype html><html><head><meta charset="utf-8"><title>Zen-it-trix passes</title><link rel="icon" type="image/png" href="${zenLogo}"><style>${themedPassStyles}</style></head><body>${passesMarkup}</body></html>`))
            printWindow.document.close()
            setTimeout(() => {
                printWindow.focus()
                printWindow.print()
            }, 250)
        } catch {
            printWindow.close()
            setStatus({ type: 'error', message: 'The selected student passes could not be prepared for printing.' })
        }
    }

    const logout = () => {
        sessionStorage.removeItem('zen-admin-token')
        setToken('')
        setRegistrations([])
    }

    const filteredRegistrations = registrations.filter((registration) => {
        const memberCodes = registration.memberPassCodes || []
        const memberNames = registration.teamMembers
            ? registration.teamMembers.map((m) => (typeof m === 'object' ? `${m.name} ${m.passCode}` : m))
            : []
        return [
            registration.passCode,
            registration.passCodeRange || '',
            ...memberCodes,
            registration.fullName,
            registration.email,
            registration.college,
            registration.eventName,
            registration.teamName || '',
            registration.teamMembersList || '',
            ...memberNames,
            registration.yearOfStudy || '',
        ].some((value) => String(value).toLowerCase().includes(search.trim().toLowerCase()))
    })
    const studentRows = filteredRegistrations.map((registration) => <div className="registration-table-row" key={registration.id}>
        <input className="student-checkbox" type="checkbox" checked={selectedIds.includes(registration.id)} onChange={() => toggleStudent(registration.id)} aria-label={`Select ${registration.fullName}`} />
        <strong>{registration.passCodeRange || registration.passCode}</strong>
        <span><b>{registration.fullName}</b><small>{registration.college} · {registration.yearOfStudy}</small>{registration.registrationType === 'team' && <small style={{ color: 'var(--lime)', marginTop: '2px' }}>Team: {registration.teamName} ({registration.teamSize} members: {registration.teamMembersList})</small>}</span>
        <span>{registration.eventName}</span>
        <div className="pass-actions"><button type="button" onClick={() => printPass(registration)}>Print</button><button type="button" onClick={() => downloadPass(registration)}>Download</button></div>
    </div>)

    if (!token) return <main className="admin-page"><section className="admin-login"><p className="eyebrow">Restricted // Admin desk</p><h1>Enter the <em>control room.</em></h1><p>Manage on-spot registrations and issue student passes for Zen-it-trix 2.0.</p><form onSubmit={handleLogin}><label>Username<input value={credentials.username} onChange={(event) => setCredentials({ ...credentials, username: event.target.value })} required autoComplete="username" /></label><label>Password<input type="password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })} required autoComplete="current-password" /></label>{status.message && <p className="admin-status error">{status.message}</p>}<button className="registration-submit" disabled={isLoading}>{isLoading ? 'Checking...' : 'Open admin desk'}</button></form></section></main>

    return <main className="admin-page"><header className="admin-header"><div><p className="eyebrow">Zen-it-trix 2.0 // Admin desk</p><h1>Registration <em>control.</em></h1></div><div className="admin-actions"><button type="button" onClick={exportRegistrations}>Export Excel CSV</button><button type="button" onClick={logout}>Sign out</button></div></header><section className="admin-layout"><section className="admin-panel"><p className="track-label">01 / On-spot registration</p><h2>Add a student or team.</h2><div className="registration-type-toggle" role="group" aria-label="Registration type"><button type="button" className={!isTeam ? 'active' : ''} onClick={() => handleTypeToggle('individual')} disabled={isStrictTeam}>Individual</button><button type="button" className={isTeam ? 'active' : ''} onClick={() => handleTypeToggle('team')} disabled={isStrictIndividual}>Team {isStrictTeam && '(Req)'}</button></div><form onSubmit={handleOnSpotRegistration}><label>{isTeam ? 'Team leader full name' : 'Full name'}<input name="fullName" value={form.fullName} onChange={updateField} required /></label><div className="registration-fields"><label>Email<input name="email" type="email" value={form.email} onChange={updateField} required /></label><label>Phone<input name="phone" value={form.phone} onChange={updateField} required /></label></div><CollegeSelector key={formKey} value={form.college} onChange={(college) => setForm((curr) => ({ ...curr, college }))} disabled={isLoading} /><div className="registration-fields"><label>Year of study<select name="yearOfStudy" value={form.yearOfStudy} onChange={updateField} required>{yearsOfStudy.map((year) => <option key={year} value={year}>{year}</option>)}</select></label></div><div className="event-selection-box"><div className="event-selection-box-header"><span className="event-box-title">Events (Pick up to 2 events)</span><span className="event-box-badge">1 Tech + 1 Non-Tech</span></div><p className="event-box-note">Each student can participate in 1 Technical event and/or 1 Non-Technical event (at least 1 required).</p><div className="registration-fields"><label>Technical event {form.technicalEvent && '[Selected]'}<select name="technicalEvent" value={form.technicalEvent} onChange={handleTechnicalChange}><option value="">-- No technical event --</option>{availableTechEvents.map((event) => <option key={event.name} value={event.name}>{event.name} {event.team_and_individual ? '(Solo & Team)' : (event.type === 'team' ? '(Team)' : '')}</option>)}</select></label><label>Non-technical event {form.nonTechnicalEvent && '[Selected]'}<select name="nonTechnicalEvent" value={form.nonTechnicalEvent} onChange={handleNonTechnicalChange}><option value="">-- No non-technical event --</option>{availableNonTechEvents.map((event) => <option key={event.name} value={event.name}>{event.name} {event.team_and_individual ? '(Solo & Team)' : (event.type === 'team' ? '(Team)' : '')}</option>)}</select></label></div></div>{isTeam && <div className="team-details-section"><div className="team-section-header"><span className="team-badge">Team specifications</span><span className="team-lead-note">Leader: {form.fullName || 'Member 1'}</span></div><div className="registration-fields"><label>Team name<input name="teamName" placeholder="e.g. CyberKnights" value={form.teamName} onChange={updateField} required /></label><label>Team size (Max 5)<select name="teamSize" value={form.teamSize} onChange={updateField} required><option value="2">2 Members</option><option value="3">3 Members</option><option value="4">4 Members</option><option value="5">5 Members</option></select></label></div><div className="team-members-grid">{Array.from({ length: Number(form.teamSize) - 1 }).map((_, idx) => <label key={idx + 2}>Member {idx + 2} name<input type="text" placeholder={`Member ${idx + 2} name`} value={memberNames[idx] || ''} onChange={(e) => handleMemberNameChange(idx, e.target.value)} required /></label>)}</div></div>}{status.message && <p className={`admin-status ${status.type}`}>{status.message}</p>}<button className="registration-submit" disabled={isLoading}>{isLoading ? 'Saving...' : (isTeam ? 'Register team pass' : 'Register and assign pass')}</button></form></section><section className="admin-panel admin-list"><div className="admin-list-heading"><div><p className="track-label">02 / Current students</p><h2>{filteredRegistrations.length} of {registrations.length} registered.</h2></div><div className="admin-list-actions"><button type="button" onClick={loadRegistrations}>Refresh</button>{selectedIds.length === 4 && <button className="bulk-pass-button" type="button" onClick={downloadGroupPass}>Print 4 passes</button>}</div></div><label className="admin-search">Search students<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pass, name, email, college, or event" /></label><div className="registration-table"><div className="registration-table-row registration-table-head"><span>Select</span><span>Pass</span><span>Student</span><span>Event</span><span>Action</span></div>{studentRows}</div></section></section>{pass && <section className="student-pass" aria-label="Printable student pass"><div className="pass-kicker">Zen-it-trix 2.0 // Student pass</div><h2>{pass.passCode}</h2><p className="pass-name">{pass.fullName}</p><p>{pass.college} · {pass.yearOfStudy}</p><p>{pass.eventName}</p><img src={pass.barcodeUrl} alt={`Barcode for ${pass.passCode}`} /><small>Present this pass at check-in</small></section>}</main>
}
