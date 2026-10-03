import { useState, useMemo } from 'react'
import CollegeSelector from './CollegeSelector'
import {
    technicalEvents,
    nonTechnicalEvents,
    getEventConfig,
    getFilteredEvents,
    getEffectiveTeamLimits,
    isTechnicalEvent,
    isNonTechnicalEvent,
    yearsOfStudy,
    whatsappGroupLink,
} from '../data'
import { zenLogo, collegeLogo } from '../assets/logoDataUrl'

import { API_URL } from '../config'

const PHONE_REGEX = /^[6-9]\d{9}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

export default function RegistrationForm({ initialEvent = '', onClose }) {
    const isInitialTech = isTechnicalEvent(initialEvent)
    const isInitialNonTech = isNonTechnicalEvent(initialEvent)
    const initialTechEvent = isInitialTech ? initialEvent : ''
    const initialNonTechEvent = isInitialNonTech ? initialEvent : ''

    const initialConfig = getEventConfig(initialEvent)
    const initialType = (initialConfig?.type === 'team' && !initialConfig?.team_and_individual)
        ? 'team'
        : 'individual'
    const initialLimits = getEffectiveTeamLimits(initialTechEvent, initialNonTechEvent)
    const initialTeamSize = initialConfig?.defaultTeamSize && initialConfig.defaultTeamSize >= 2
        ? String(Math.min(initialLimits.maxTeamSize, Math.max(initialLimits.minTeamSize, initialConfig.defaultTeamSize)))
        : String(initialLimits.minTeamSize)

    const [registrationType, setRegistrationType] = useState(initialType)
    const [form, setForm] = useState({
        fullName: '',
        email: '',
        phone: '',
        college: '',
        collegeId: '',
        yearOfStudy: '1st Year',
        technicalEvent: initialTechEvent,
        nonTechnicalEvent: initialNonTechEvent,
        teamName: '',
        teamSize: initialType === 'team' ? initialTeamSize : String(initialLimits.minTeamSize),
    })

    // Dynamic secondary member inputs (Member 2, Member 3, etc.)
    // Number of secondary members is strictly (teamSize - 1)
    const [secondaryMembers, setSecondaryMembers] = useState(() => {
        const size = initialType === 'team' ? Number(initialTeamSize) : Number(initialLimits.minTeamSize)
        return Array.from({ length: Math.max(1, size - 1) }, () => '')
    })

    const [status, setStatus] = useState({ type: '', message: '' })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formKey, setFormKey] = useState(0)
    const [confirmedRegistration, setConfirmedRegistration] = useState(null)
    const [copiedId, setCopiedId] = useState(false)

    const techConfig = getEventConfig(form.technicalEvent)
    const nonTechConfig = getEventConfig(form.nonTechnicalEvent)

    const isStrictTeam = Boolean(
        (techConfig && techConfig.type === 'team' && !techConfig.team_and_individual) ||
        (nonTechConfig && nonTechConfig.type === 'team' && !nonTechConfig.team_and_individual)
    )

    const isStrictIndividual = Boolean(
        (techConfig && techConfig.type === 'individual' && !techConfig.team_and_individual) ||
        (nonTechConfig && nonTechConfig.type === 'individual' && !nonTechConfig.team_and_individual)
    )

    const availableTechEvents = getFilteredEvents(technicalEvents, registrationType)
    const availableNonTechEvents = getFilteredEvents(nonTechnicalEvents, registrationType)

    // Calculate dynamic team limits (min to max members) based on selected events
    const teamLimits = useMemo(() => {
        return getEffectiveTeamLimits(form.technicalEvent, form.nonTechnicalEvent)
    }, [form.technicalEvent, form.nonTechnicalEvent])

    // Allowed team size options list
    const allowedTeamSizes = useMemo(() => {
        const sizes = []
        for (let i = teamLimits.minTeamSize; i <= teamLimits.maxTeamSize; i++) {
            sizes.push(i)
        }
        return sizes
    }, [teamLimits])

    // Sync secondary member inputs when teamSize changes
    const applyTeamSizeChange = (newSize) => {
        const clampedSize = Math.min(teamLimits.maxTeamSize, Math.max(teamLimits.minTeamSize, Number(newSize)))
        const targetSecondaryCount = Math.max(1, clampedSize - 1)

        setForm((prev) => ({ ...prev, teamSize: String(clampedSize) }))
        setSecondaryMembers((prev) => {
            if (prev.length === targetSecondaryCount) return prev
            if (prev.length < targetSecondaryCount) {
                // Dynamically mount new inputs
                return [...prev, ...Array(targetSecondaryCount - prev.length).fill('')]
            }
            // Dynamically unmount excess inputs so no unmounted values submit
            return prev.slice(0, targetSecondaryCount)
        })
    }

    const updateField = (event) => {
        const { name, value } = event.target
        setForm((current) => ({ ...current, [name]: value }))
    }

    // Email input handler: restricts all whitespace
    const handleEmailChange = (event) => {
        const clean = event.target.value.replace(/\s+/g, '').toLowerCase()
        setForm((current) => ({ ...current, email: clean }))
    }

    // Phone input handler: restricts to numeric digits only and max 10 characters
    const handlePhoneChange = (event) => {
        const digitsOnly = event.target.value.replace(/\D/g, '').slice(0, 10)
        setForm((current) => ({ ...current, phone: digitsOnly }))
    }

    // College ID input handler: restricts whitespace and normalizes to uppercase
    const handleCollegeIdChange = (event) => {
        const clean = event.target.value.replace(/\s+/g, '').toUpperCase()
        setForm((current) => ({ ...current, collegeId: clean }))
    }

    const handleTechnicalChange = (event) => {
        const selectedName = event.target.value
        const config = getEventConfig(selectedName)
        const nextLimits = getEffectiveTeamLimits(selectedName, form.nonTechnicalEvent)

        setForm((current) => {
            const next = { ...current, technicalEvent: selectedName }
            if (config?.type === 'team' && !config.team_and_individual) {
                setRegistrationType('team')
            }
            const currentNum = Number(current.teamSize)
            const clamped = Math.min(nextLimits.maxTeamSize, Math.max(nextLimits.minTeamSize, currentNum || 2))
            next.teamSize = String(clamped)
            return next
        })

        // Mount / unmount secondary member inputs to match new bounds
        setSecondaryMembers((prev) => {
            const currentNum = Number(form.teamSize)
            const clamped = Math.min(nextLimits.maxTeamSize, Math.max(nextLimits.minTeamSize, currentNum || 2))
            const targetCount = Math.max(1, clamped - 1)
            if (prev.length === targetCount) return prev
            if (prev.length < targetCount) return [...prev, ...Array(targetCount - prev.length).fill('')]
            return prev.slice(0, targetCount)
        })
    }

    const handleNonTechnicalChange = (event) => {
        const selectedName = event.target.value
        const config = getEventConfig(selectedName)
        const nextLimits = getEffectiveTeamLimits(form.technicalEvent, selectedName)

        setForm((current) => {
            const next = { ...current, nonTechnicalEvent: selectedName }
            if (config?.type === 'team' && !config.team_and_individual) {
                setRegistrationType('team')
            }
            const currentNum = Number(current.teamSize)
            const clamped = Math.min(nextLimits.maxTeamSize, Math.max(nextLimits.minTeamSize, currentNum || 2))
            next.teamSize = String(clamped)
            return next
        })

        // Mount / unmount secondary member inputs to match new bounds
        setSecondaryMembers((prev) => {
            const currentNum = Number(form.teamSize)
            const clamped = Math.min(nextLimits.maxTeamSize, Math.max(nextLimits.minTeamSize, currentNum || 2))
            const targetCount = Math.max(1, clamped - 1)
            if (prev.length === targetCount) return prev
            if (prev.length < targetCount) return [...prev, ...Array(targetCount - prev.length).fill('')]
            return prev.slice(0, targetCount)
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

            const isTechValid = !tConfig || tConfig.team_and_individual ||
                (type === 'team' && tConfig.type === 'team') ||
                (type === 'individual' && tConfig.type === 'individual')

            const isNonTechValid = !ntConfig || ntConfig.team_and_individual ||
                (type === 'team' && ntConfig.type === 'team') ||
                (type === 'individual' && ntConfig.type === 'individual')

            if (!isTechValid) next.technicalEvent = ''
            if (!isNonTechValid) next.nonTechnicalEvent = ''

            if (type === 'team') {
                const limits = getEffectiveTeamLimits(next.technicalEvent, next.nonTechnicalEvent)
                const currentNum = Number(curr.teamSize)
                const size = Math.min(limits.maxTeamSize, Math.max(limits.minTeamSize, currentNum || 2))
                next.teamSize = String(size)
            } else {
                next.teamSize = '1'
            }
            return next
        })

        if (type === 'team') {
            const limits = getEffectiveTeamLimits(form.technicalEvent, form.nonTechnicalEvent)
            const currentNum = Number(form.teamSize)
            const size = Math.min(limits.maxTeamSize, Math.max(limits.minTeamSize, currentNum || 2))
            const targetSecondary = Math.max(1, size - 1)
            setSecondaryMembers((prev) => {
                if (prev.length === targetSecondary) return prev
                if (prev.length < targetSecondary) return [...prev, ...Array(targetSecondary - prev.length).fill('')]
                return prev.slice(0, targetSecondary)
            })
        }
    }

    // Dynamic Team Member Handlers
    const handleSecondaryMemberChange = (index, value) => {
        setSecondaryMembers((current) => {
            const next = [...current]
            next[index] = value
            return next
        })
    }

    const addSecondaryMember = () => {
        const currentSize = Number(form.teamSize)
        if (currentSize >= teamLimits.maxTeamSize) return
        applyTeamSizeChange(currentSize + 1)
    }

    const removeSecondaryMember = (indexToRemove) => {
        const currentSize = Number(form.teamSize)
        if (currentSize <= teamLimits.minTeamSize) return
        setForm((prev) => ({ ...prev, teamSize: String(currentSize - 1) }))
        setSecondaryMembers((prev) => prev.filter((_, idx) => idx !== indexToRemove))
    }

    const fetchBarcode = async (code) => {
        const res = await fetch(`${API_URL}/barcode/${encodeURIComponent(code)}`)
        if (!res.ok) throw new Error(`Barcode generation failed for ${code}`)
        const blob = await res.blob()
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = reject
            reader.readAsDataURL(blob)
        })
    }

    const printPasses = async (reg = confirmedRegistration) => {
        if (!reg) return
        const printWindow = window.open('', '_blank')
        if (!printWindow) {
            alert('Please allow pop-ups to print your passes.')
            return
        }
        printWindow.document.write('<p style="font-family:sans-serif;padding:24px">Preparing passes for each member...</p>')

        try {
            const passItems = []
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

            const barcodes = await Promise.all(passItems.map((item) => fetchBarcode(item.code)))

            const cards = passItems.map((item, index) => `
                <article class="pass">
                    <div class="pass-header">
                        <img class="pass-logo" src="${zenLogo}" alt="Zen-it-trix Logo">
                        <div>
                            <div class="kicker">Zen-it-trix 2.0 // Pass</div>
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
            setTimeout(() => { printWindow.focus(); printWindow.print() }, 250)
        } catch (err) {
            printWindow.close()
            alert('Could not prepare passes: ' + err.message)
        }
    }

    const handleSubmit = async (event) => {
        event.preventDefault()
        setIsSubmitting(true)
        setStatus({ type: '', message: '' })

        const tech = form.technicalEvent.trim()
        const nonTech = form.nonTechnicalEvent.trim()

        if (!tech && !nonTech) {
            setStatus({ type: 'error', message: 'Please select at least one event (Technical or Non-Technical).' })
            setIsSubmitting(false)
            return
        }

        if (!form.fullName.trim()) {
            setStatus({ type: 'error', message: 'Please enter your full name.' })
            setIsSubmitting(false)
            return
        }

        // Email sanitation and whitespace check
        const cleanEmail = form.email.replace(/\s+/g, '').trim().toLowerCase()
        if (!EMAIL_REGEX.test(cleanEmail)) {
            setStatus({ type: 'error', message: 'Please enter a valid email address without spaces (e.g. name@domain.com).' })
            setIsSubmitting(false)
            return
        }

        // Phone sanitation and 10-digit regex check
        const cleanPhone = form.phone.replace(/\D/g, '').trim()
        if (!PHONE_REGEX.test(cleanPhone)) {
            setStatus({ type: 'error', message: 'Please enter a valid 10-digit phone number starting with 6, 7, 8, or 9 (e.g. 9876543210).' })
            setIsSubmitting(false)
            return
        }

        // College sanitation
        const cleanCollege = form.college.trim().replace(/\s+/g, ' ')
        if (!cleanCollege) {
            setStatus({ type: 'error', message: 'Please select or enter your college / institution.' })
            setIsSubmitting(false)
            return
        }

        // College ID sanitation (whitespace restricted and trimmed)
        const cleanCollegeId = form.collegeId ? form.collegeId.replace(/\s+/g, '').trim().toUpperCase() : null

        const isTeam = registrationType === 'team'
        const teamSizeNum = isTeam ? Number(form.teamSize) : 1

        if (isTeam && !form.teamName.trim()) {
            setStatus({ type: 'error', message: 'Please enter a team name.' })
            setIsSubmitting(false)
            return
        }

        // Dynamically validate all currently mounted secondary members
        if (isTeam) {
            for (let i = 0; i < secondaryMembers.length; i++) {
                const memberVal = (secondaryMembers[i] || '').trim()
                if (!memberVal) {
                    setStatus({
                        type: 'error',
                        message: `Please enter the full name for Member ${i + 2}.`,
                    })
                    setIsSubmitting(false)
                    return
                }
            }
        }

        // Construct clean payload with exactly the mounted members (no null or blank entries)
        const formatLeaderName = (name) => {
            const trimmed = String(name || '').trim()
            const base = trimmed.replace(/\s*(?:\(?\s*leader\s*\)?)$/i, '').trim()
            return base ? `${base} (leader)` : trimmed
        }
        const cleanLeaderName = isTeam ? formatLeaderName(form.fullName) : form.fullName.trim()
        const sanitizedSecondary = secondaryMembers.map((m) => m.trim().replace(/\s+leader$/i, ' (leader)'))
        const teamMembersPayload = isTeam
            ? [cleanLeaderName, ...sanitizedSecondary]
            : []

        const combinedEventName = [tech, nonTech].filter(Boolean).join(' + ')

        try {
            const response = await fetch(`${API_URL}/registrations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
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
                    teamMembers: teamMembersPayload,
                }),
            })
            const result = await response.json()
            if (!response.ok) throw new Error(result.message || 'Registration could not be completed.')

            const passIdStr = result.passCode || `${isTeam ? 'ZEN-T-' : 'ZEN-I-'}${String(result.registrationId).padStart(3, '0')}`
            const fullRegData = {
                ...result,
                passCode: passIdStr,
                passCodeRange: result.passCodeRange || passIdStr,
                memberPassCodes: result.memberPassCodes || [passIdStr],
                members: result.members || [{ name: form.fullName.trim(), passCode: passIdStr }],
                registrationId: result.registrationId,
                fullName: form.fullName.trim(),
                college: cleanCollege,
                collegeId: cleanCollegeId,
                yearOfStudy: form.yearOfStudy,
                eventName: combinedEventName,
                registrationType,
                teamName: isTeam ? form.teamName.trim() : null,
                teamMembers: isTeam ? teamMembersPayload : [form.fullName.trim()],
            }

            setConfirmedRegistration(fullRegData)
            setStatus({
                type: 'success',
                message: isTeam
                    ? `Registration confirmed for Team "${form.teamName.trim()}"! Passes issued for all ${teamMembersPayload.length} members.`
                    : `Registration confirmed for ${form.fullName.trim()}! Pass issued.`,
            })

            // Reset form
            setForm({
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
            })
            setSecondaryMembers([''])
            setRegistrationType('individual')
            setFormKey((k) => k + 1)
        } catch (error) {
            setStatus({ type: 'error', message: error.message })
        } finally {
            setIsSubmitting(false)
        }
    }

    const isTeam = registrationType === 'team'

    return (
        <div className="registration-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <section className="registration-modal" role="dialog" aria-modal="true" aria-labelledby="registration-title">
                <button className="registration-close" type="button" onClick={onClose} aria-label="Close registration form">×</button>
                <p className="eyebrow">Registration // Zen-it-trix 2.0</p>
                <h2 id="registration-title">Save your <em>spot.</em></h2>
                <p className="registration-intro">Bring your curiosity, choose your arena, and we will see you on campus.</p>

                {confirmedRegistration ? (
                    <div className="registration-success-card">
                        <div className="success-header">
                            <span className="success-badge">Registration Confirmed</span>
                            <h3>{confirmedRegistration.registrationType === 'team' ? `Team: ${confirmedRegistration.teamName}` : confirmedRegistration.fullName}</h3>
                            <p className="success-event-name">{confirmedRegistration.eventName}</p>
                        </div>

                        {/* Immediate Success Receipt ID Banner */}
                        <div className="receipt-id-banner">
                            <div className="receipt-id-info">
                                <span className="receipt-id-kicker">{confirmedRegistration.registrationType === 'team' ? 'Official Team Passes' : 'Official Registration ID'}</span>
                                <span className="receipt-id-code">{confirmedRegistration.passCodeRange || confirmedRegistration.passCode}</span>
                            </div>
                            <button
                                type="button"
                                className="copy-id-btn"
                                onClick={() => {
                                    navigator.clipboard.writeText(confirmedRegistration.passCodeRange || confirmedRegistration.passCode)
                                    setCopiedId(true)
                                    setTimeout(() => setCopiedId(false), 2500)
                                }}
                                title="Copy Registration ID"
                            >
                                {copiedId ? 'Copied' : 'Copy ID'}
                            </button>
                        </div>

                        {/* Success Receipt Details Overview */}
                        <div className="receipt-meta-grid">
                            <div className="receipt-meta-item">
                                <span className="meta-label">Participant / Lead</span>
                                <span className="meta-val">{confirmedRegistration.fullName}</span>
                            </div>
                            <div className="receipt-meta-item">
                                <span className="meta-label">College</span>
                                <span className="meta-val">{confirmedRegistration.college}</span>
                            </div>
                            {confirmedRegistration.collegeId && (
                                <div className="receipt-meta-item">
                                    <span className="meta-label">College ID / Roll</span>
                                    <span className="meta-val monospace-val">{confirmedRegistration.collegeId}</span>
                                </div>
                            )}
                            <div className="receipt-meta-item">
                                <span className="meta-label">Year of Study</span>
                                <span className="meta-val">{confirmedRegistration.yearOfStudy}</span>
                            </div>
                            <div className="receipt-meta-item">
                                <span className="meta-label">Registration Type</span>
                                <span className="meta-val">{confirmedRegistration.registrationType === 'team' ? `Team (${confirmedRegistration.teamMembers.length} members)` : 'Individual'}</span>
                            </div>
                        </div>

                        {/* Direct WhatsApp Announcements Community / Group Button */}
                        <div className="whatsapp-community-card">
                            <div className="whatsapp-card-content">
                                <div className="whatsapp-icon-circle">
                                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                                        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.11 7.44C8.94 7.44 8.66 7.5 8.43 7.76C8.2 8.01 7.55 8.62 7.55 9.87C7.55 11.12 8.46 12.32 8.58 12.49C8.71 12.66 10.37 15.22 12.89 16.31C15.07 17.25 15.51 17.06 15.98 17.02C16.46 16.97 17.52 16.39 17.74 15.77C17.96 15.14 17.96 14.61 17.9 14.49C17.83 14.38 17.66 14.32 17.41 14.19C17.16 14.07 15.93 13.46 15.7 13.38C15.47 13.3 15.31 13.25 15.14 13.51C14.98 13.76 14.51 14.32 14.36 14.49C14.22 14.66 14.07 14.68 13.82 14.56C13.57 14.43 12.77 14.17 11.82 13.32C11.08 12.66 10.58 11.84 10.43 11.59C10.29 11.34 10.42 11.2 10.54 11.08C10.65 10.97 10.79 10.78 10.92 10.63C11.04 10.48 11.09 10.37 11.17 10.21C11.25 10.04 11.21 9.9 11.15 9.77C11.09 9.65 10.62 8.5 10.43 8.03C10.24 7.58 10.05 7.64 9.9 7.63C9.77 7.63 9.6 7.62 9.43 7.62C9.27 7.62 9.11 7.44 9.11 7.44Z"/>
                                    </svg>
                                </div>
                                <div className="whatsapp-card-text">
                                    <h4>Official WhatsApp Community</h4>
                                    <p>Join to receive live stage callouts, round schedules, and announcements.</p>
                                </div>
                            </div>
                            <a
                                href={whatsappGroupLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="whatsapp-join-btn"
                            >
                                <span>Join WhatsApp Group</span>
                                <span>↗</span>
                            </a>
                        </div>

                        {/* Member Passes List */}
                        <div className="success-pass-list">
                            <span className="pass-list-heading">
                                {confirmedRegistration.registrationType === 'team'
                                    ? `Official passes for each team member (${confirmedRegistration.teamMembers.length} passes):`
                                    : 'Official student pass:'}
                            </span>
                            <div className="pass-badges-grid">
                                {confirmedRegistration.teamMembers.map((member, idx) => {
                                    const name = typeof member === 'object' ? member.name : member
                                    const code = (confirmedRegistration.memberPassCodes && confirmedRegistration.memberPassCodes[idx])
                                        || (typeof member === 'object' && member.passCode)
                                        || (confirmedRegistration.members && confirmedRegistration.members[idx]?.passCode)
                                        || confirmedRegistration.passCode
                                    return (
                                        <div className="pass-pill-item" key={code || idx}>
                                            <span className="pass-code-tag">{code}</span>
                                            <span className="pass-member-name">
                                                {name.toLowerCase().includes('(leader)') ? name : `${name}${idx === 0 && confirmedRegistration.registrationType === 'team' ? ' (leader)' : ''}`}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="success-actions">
                            <button
                                type="button"
                                className="registration-submit print-passes-button"
                                onClick={() => printPasses(confirmedRegistration)}
                            >
                                <span>Print passes for each member ({confirmedRegistration.teamMembers.length})</span>
                                <span>↗</span>
                            </button>
                            <button
                                type="button"
                                className="register-another-button"
                                onClick={() => {
                                    setConfirmedRegistration(null)
                                    setStatus({ type: '', message: '' })
                                }}
                            >
                                Register another student or team
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="registration-type-toggle" role="group" aria-label="Registration type">
                            <button
                                type="button"
                                className={!isTeam ? 'active' : ''}
                                onClick={() => handleTypeToggle('individual')}
                                disabled={isStrictTeam}
                                title={isStrictTeam ? 'This event requires a team registration' : 'Individual registration'}
                            >
                                Individual
                            </button>
                            <button
                                type="button"
                                className={isTeam ? 'active' : ''}
                                onClick={() => handleTypeToggle('team')}
                                disabled={isStrictIndividual}
                                title={isStrictIndividual ? 'This event is strictly for individuals' : 'Team registration'}
                            >
                                Team {isStrictTeam && '(Required)'}
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} noValidate>
                            <label>
                                {isTeam ? 'Team leader full name' : 'Full name'}
                                <input
                                    name="fullName"
                                    value={form.fullName}
                                    onChange={updateField}
                                    required
                                    autoComplete="name"
                                    placeholder={isTeam ? 'Leader full name' : 'Your full name'}
                                />
                            </label>

                            <div className="registration-fields">
                                <label>
                                    Email <span className="field-hint">(no whitespace)</span>
                                    <input
                                        name="email"
                                        type="email"
                                        value={form.email}
                                        onChange={handleEmailChange}
                                        required
                                        autoComplete="email"
                                        placeholder={isTeam ? 'Leader email' : 'Your email'}
                                    />
                                </label>
                                <label>
                                    Phone <span className="field-hint">(10 digits, starts 6-9)</span>
                                    <input
                                        name="phone"
                                        type="tel"
                                        inputMode="numeric"
                                        pattern="[6-9][0-9]{9}"
                                        maxLength={10}
                                        value={form.phone}
                                        onChange={handlePhoneChange}
                                        required
                                        autoComplete="tel"
                                        placeholder="10-digit number"
                                    />
                                </label>
                            </div>

                            <CollegeSelector
                                key={formKey}
                                value={form.college}
                                onChange={(college) => setForm((curr) => ({ ...curr, college }))}
                                disabled={isSubmitting}
                            />

                            <div className="registration-fields">
                                <label>
                                    College ID / Roll No <span className="field-hint">(no whitespace)</span>
                                    <input
                                        name="collegeId"
                                        type="text"
                                        value={form.collegeId}
                                        onChange={handleCollegeIdChange}
                                        placeholder="e.g. 21CS045"
                                        autoComplete="off"
                                    />
                                </label>
                                <label>
                                    Year of study
                                    <select
                                        name="yearOfStudy"
                                        value={form.yearOfStudy}
                                        onChange={updateField}
                                        required
                                    >
                                        {yearsOfStudy.map((year) => (
                                            <option key={year} value={year}>{year}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            <div className="event-selection-box">
                                <div className="event-selection-box-header">
                                    <span className="event-box-title">Events (Pick up to 2 events)</span>
                                    <span className="event-box-badge">1 Tech + 1 Non-Tech</span>
                                </div>
                                <p className="event-box-note">
                                    Each student can participate in 1 Technical event and/or 1 Non-Technical event (at least 1 required).
                                </p>

                                <div className="registration-fields">
                                    <label>
                                        Technical event {form.technicalEvent && <span className="selected-indicator">[Selected]</span>}
                                        <select
                                            name="technicalEvent"
                                            value={form.technicalEvent}
                                            onChange={handleTechnicalChange}
                                        >
                                            <option value="">-- No technical event --</option>
                                            {availableTechEvents.map((event) => (
                                                <option key={event.name} value={event.name}>
                                                    {event.name} {event.team_and_individual ? '(Solo & Team)' : (event.type === 'team' ? '(Team)' : '')}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    <label>
                                        Non-technical event {form.nonTechnicalEvent && <span className="selected-indicator">[Selected]</span>}
                                        <select
                                            name="nonTechnicalEvent"
                                            value={form.nonTechnicalEvent}
                                            onChange={handleNonTechnicalChange}
                                        >
                                            <option value="">-- No non-technical event --</option>
                                            {availableNonTechEvents.map((event) => (
                                                <option key={event.name} value={event.name}>
                                                    {event.name} {event.team_and_individual ? '(Solo & Team)' : (event.type === 'team' ? '(Team)' : '')}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                            </div>

                            {isTeam && (
                                <div className="team-details-section">
                                    <div className="team-section-header">
                                        <span className="team-badge">Team specifications</span>
                                        <span className="team-lead-note">Member 1 (Leader): {form.fullName || 'Not specified'}</span>
                                    </div>

                                    <div className="registration-fields">
                                        <label>
                                            Team name
                                            <input
                                                name="teamName"
                                                placeholder="e.g. CodeStorm"
                                                value={form.teamName}
                                                onChange={updateField}
                                                required
                                            />
                                        </label>

                                        <label>
                                            Team size ({teamLimits.minTeamSize} to {teamLimits.maxTeamSize} members allowed)
                                            <select
                                                name="teamSize"
                                                value={form.teamSize}
                                                onChange={(e) => applyTeamSizeChange(e.target.value)}
                                                required
                                            >
                                                {allowedTeamSizes.map((size) => (
                                                    <option key={size} value={size}>{size} Members</option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>

                                    <div className="dynamic-team-members-bar">
                                        <span className="dynamic-members-title">
                                            Secondary team members ({secondaryMembers.length} active)
                                        </span>
                                        {Number(form.teamSize) < teamLimits.maxTeamSize && (
                                            <button
                                                type="button"
                                                className="add-member-mini-btn"
                                                onClick={addSecondaryMember}
                                            >
                                                + Add Member {Number(form.teamSize) + 1}
                                            </button>
                                        )}
                                    </div>

                                    <div className="team-members-grid">
                                        {secondaryMembers.map((name, idx) => {
                                            const memberNum = idx + 2
                                            return (
                                                <div className="dynamic-member-card" key={idx}>
                                                    <div className="dynamic-member-card-header">
                                                        <span>Member {memberNum} full name</span>
                                                        {Number(form.teamSize) > teamLimits.minTeamSize && idx === secondaryMembers.length - 1 && (
                                                            <button
                                                                type="button"
                                                                className="remove-member-mini-btn"
                                                                onClick={() => removeSecondaryMember(idx)}
                                                                title="Unmount member"
                                                            >
                                                                Remove
                                                            </button>
                                                        )}
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder={`Member ${memberNum} name`}
                                                        value={name}
                                                        onChange={(e) => handleSecondaryMemberChange(idx, e.target.value)}
                                                        required
                                                    />
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {status.message && <p className={`registration-status ${status.type}`}>{status.message}</p>}
                            <button className="registration-submit" type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Sending...' : (isTeam ? 'Register team' : 'Complete registration')} <span>↗</span>
                            </button>
                        </form>
                    </>
                )}
            </section>
        </div>
    )
}
