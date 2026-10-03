import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import dotenv from 'dotenv'
import bwipjs from 'bwip-js'
import cors from 'cors'
import express from 'express'
import mariadb from 'mariadb'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })
dotenv.config()

const app = express()
const port = Number(process.env.PORT || 4000)
const allowedOriginEnv = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
const adminUsername = process.env.ADMIN_USERNAME || 'admin'
const adminPassword = process.env.ADMIN_PASSWORD || 'admin@zen-ti-trix-2'
const foodUsername = process.env.FOOD_ADMIN_USERNAME || 'foodadmin'
const foodPassword = process.env.FOOD_ADMIN_PASSWORD || 'food@zen-ti-trix-2'
const adminSessions = new Map()

const parseDbConfig = () => {
    let host = process.env.DB_HOST || 'localhost'
    let port = Number(process.env.DB_PORT || 3306)
    let user = process.env.DB_USER || 'zen_it_trix_db'
    let password = process.env.DB_PASSWORD || 'root'
    let database = process.env.DB_NAME || 'zen_it_trix'

    if (process.env.DATABASE_URL) {
        try {
            const dbUrl = new URL(process.env.DATABASE_URL)
            host = dbUrl.hostname || host
            port = dbUrl.port ? Number(dbUrl.port) : port
            user = dbUrl.username ? decodeURIComponent(dbUrl.username) : user
            password = dbUrl.password ? decodeURIComponent(dbUrl.password) : password
            database = dbUrl.pathname.replace(/^\//, '') || database
        } catch (err) {
            console.warn('Failed to parse DATABASE_URL, falling back to individual env variables.', err.message)
        }
    }

    const useSsl =
        process.env.DB_SSL === 'true' ||
        process.env.DB_SSL === '1' ||
        (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('ssl-mode='))

    const sslConfig = useSsl
        ? (process.env.DB_CA_CERT ? { ca: process.env.DB_CA_CERT, rejectUnauthorized: true } : { rejectUnauthorized: false })
        : undefined

    return {
        host,
        port,
        user,
        password,
        database,
        connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 5),
        ...(sslConfig ? { ssl: sslConfig } : {}),
    }
}

const pool = mariadb.createPool(parseDbConfig())

const configuredOrigins = (process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true)
        const defaultAllowed = [
            'http://localhost:5173',
            'http://127.0.0.1:5173',
            'http://localhost:8080',
            'http://127.0.0.1:8080',
        ]
        const isPagesDev = (() => {
            try {
                return /\.pages\.dev$/.test(new URL(origin).hostname)
            } catch {
                return false
            }
        })()
        if (
            defaultAllowed.includes(origin) ||
            configuredOrigins.includes(origin) ||
            origin.startsWith('http://localhost:') ||
            origin.startsWith('http://127.0.0.1:') ||
            isPagesDev
        ) {
            return callback(null, true)
        }
        return callback(null, true)
    },
    credentials: true,
}))
app.use(express.json({ limit: '20kb' }))

const requiredFields = ['fullName', 'email', 'phone', 'college', 'yearOfStudy']
const csvEscape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
const passCode = (typeOrId, maybeId) => {
    let type = 'individual'
    let num = typeOrId
    if (typeof maybeId !== 'undefined') {
        type = typeOrId === 'team' ? 'team' : 'individual'
        num = maybeId
    } else if (typeof typeOrId === 'string' && (typeOrId.toLowerCase() === 'team' || typeOrId.toLowerCase() === 'individual')) {
        type = typeOrId.toLowerCase()
        num = 1
    }
    const prefix = type === 'team' ? 'ZEN-T-' : 'ZEN-I-'
    return `${prefix}${String(num).padStart(3, '0')}`
}

const allocatePassCodes = async (type, count, connection) => {
    const counterType = type === 'team' ? 'team' : 'individual'
    const rows = await connection.query('SELECT last_val FROM pass_counters WHERE counter_type = ? FOR UPDATE', [counterType])
    let currentVal = Number(rows[0]?.last_val || 0)
    const startVal = currentVal + 1
    const endVal = currentVal + count
    await connection.query('UPDATE pass_counters SET last_val = ? WHERE counter_type = ?', [endVal, counterType])

    const codes = []
    for (let i = startVal; i <= endVal; i++) {
        codes.push(passCode(counterType, i))
    }
    return codes
}

const migratePassCodes = async () => {
    const nonStandardRegs = await pool.query(
        "SELECT COUNT(*) AS cnt FROM registrations WHERE pass_code IS NULL OR (registration_type = 'individual' AND pass_code NOT LIKE 'ZEN-I-%') OR (registration_type = 'team' AND pass_code NOT LIKE 'ZEN-T-%')"
    )
    const nonStandardMembers = await pool.query(
        "SELECT COUNT(*) AS cnt FROM team_members WHERE pass_code IS NULL OR pass_code NOT LIKE 'ZEN-T-%'"
    )
    if (Number(nonStandardRegs[0]?.cnt || 0) === 0 && Number(nonStandardMembers[0]?.cnt || 0) === 0) {
        return
    }

    const individualRegs = await pool.query(
        "SELECT id FROM registrations WHERE registration_type = 'individual' ORDER BY id ASC"
    )
    let indCount = 0
    for (const reg of individualRegs) {
        indCount++
        const code = passCode('individual', indCount)
        await pool.query('UPDATE registrations SET pass_code = ? WHERE id = ?', [code, reg.id])
    }

    const teamRegs = await pool.query(
        "SELECT id FROM registrations WHERE registration_type = 'team' ORDER BY id ASC"
    )
    let teamMemberCount = 0
    for (const reg of teamRegs) {
        const members = await pool.query(
            'SELECT id, member_order FROM team_members WHERE registration_id = ? ORDER BY member_order ASC, id ASC',
            [reg.id]
        )
        if (members.length > 0) {
            let leaderCode = null
            for (let i = 0; i < members.length; i++) {
                teamMemberCount++
                const code = passCode('team', teamMemberCount)
                if (i === 0) leaderCode = code
                await pool.query('UPDATE team_members SET pass_code = ? WHERE id = ?', [code, members[i].id])
            }
            await pool.query('UPDATE registrations SET pass_code = ? WHERE id = ?', [leaderCode, reg.id])
        } else {
            teamMemberCount++
            const code = passCode('team', teamMemberCount)
            await pool.query('UPDATE registrations SET pass_code = ? WHERE id = ?', [code, reg.id])
        }
    }

    await pool.query(
        "INSERT INTO pass_counters (counter_type, last_val) VALUES ('individual', ?) ON DUPLICATE KEY UPDATE last_val = GREATEST(last_val, ?)",
        [indCount, indCount]
    )
    await pool.query(
        "INSERT INTO pass_counters (counter_type, last_val) VALUES ('team', ?) ON DUPLICATE KEY UPDATE last_val = GREATEST(last_val, ?)",
        [teamMemberCount, teamMemberCount]
    )
}

const ensureColumn = async (tableName, columnName, columnDefinition) => {
    try {
        const rows = await pool.query(
            `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
            [tableName, columnName]
        )
        if (Number(rows[0]?.cnt || 0) === 0) {
            await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnDefinition}`)
        }
    } catch (err) {
        console.warn(`Could not check or add column ${columnName} to ${tableName}:`, err.message)
    }
}

const ensureSchema = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS registrations (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            full_name VARCHAR(120) NOT NULL,
            email VARCHAR(255) NOT NULL,
            phone VARCHAR(30) NOT NULL,
            college VARCHAR(180) NOT NULL,
            college_id VARCHAR(60) NULL DEFAULT NULL,
            year_of_study VARCHAR(30) NOT NULL DEFAULT '1st Year',
            event_name VARCHAR(255) NOT NULL,
            technical_event VARCHAR(120) NULL DEFAULT NULL,
            non_technical_event VARCHAR(120) NULL DEFAULT NULL,
            registration_type VARCHAR(20) NOT NULL DEFAULT 'individual',
            team_name VARCHAR(120) NULL DEFAULT NULL,
            team_size TINYINT UNSIGNED NOT NULL DEFAULT 1,
            pass_code VARCHAR(30) NULL DEFAULT NULL,
            present TINYINT(1) NOT NULL DEFAULT 0,
            present_at TIMESTAMP NULL DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY unique_event_registration (email, event_name),
            INDEX registrations_created_at_idx (created_at)
        )
    `)

    await ensureColumn('registrations', 'present', 'TINYINT(1) NOT NULL DEFAULT 0')
    await ensureColumn('registrations', 'present_at', 'TIMESTAMP NULL DEFAULT NULL')
    await ensureColumn('registrations', 'year_of_study', 'VARCHAR(30) NOT NULL DEFAULT "1st Year"')
    await ensureColumn('registrations', 'college_id', 'VARCHAR(60) NULL DEFAULT NULL')
    await ensureColumn('registrations', 'registration_type', 'VARCHAR(20) NOT NULL DEFAULT "individual"')
    await ensureColumn('registrations', 'team_name', 'VARCHAR(120) NULL DEFAULT NULL')
    await ensureColumn('registrations', 'technical_event', 'VARCHAR(120) NULL DEFAULT NULL')
    await ensureColumn('registrations', 'non_technical_event', 'VARCHAR(120) NULL DEFAULT NULL')
    await ensureColumn('registrations', 'pass_code', 'VARCHAR(30) NULL DEFAULT NULL')

    try {
        await pool.query('ALTER TABLE registrations MODIFY COLUMN event_name VARCHAR(255) NOT NULL')
    } catch {
        // Best effort column modify
    }

    await pool.query(`
        CREATE TABLE IF NOT EXISTS team_members (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            registration_id INT UNSIGNED NOT NULL,
            member_name VARCHAR(120) NOT NULL,
            member_order TINYINT UNSIGNED NOT NULL DEFAULT 1,
            pass_code VARCHAR(30) NULL DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_team_members_reg_id (registration_id),
            CONSTRAINT fk_team_members_registration FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE
        )
    `)
    await ensureColumn('team_members', 'pass_code', 'VARCHAR(30) NULL DEFAULT NULL')

    await pool.query(`
        CREATE TABLE IF NOT EXISTS pass_counters (
            counter_type VARCHAR(20) NOT NULL PRIMARY KEY,
            last_val INT UNSIGNED NOT NULL DEFAULT 0
        )
    `)
    await pool.query("INSERT IGNORE INTO pass_counters (counter_type, last_val) VALUES ('individual', 0), ('team', 0)")

    await pool.query(`
        CREATE TABLE IF NOT EXISTS food_records (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            pass_code VARCHAR(30) NOT NULL,
            participant_name VARCHAR(120) NOT NULL,
            registration_id INT UNSIGNED NOT NULL,
            member_id INT UNSIGNED NULL DEFAULT NULL,
            college VARCHAR(180) NULL DEFAULT NULL,
            phone VARCHAR(30) NULL DEFAULT NULL,
            food_type VARCHAR(60) NOT NULL DEFAULT 'Standard Meal',
            status VARCHAR(30) NOT NULL DEFAULT 'bought',
            bought_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            notes VARCHAR(255) NULL DEFAULT NULL,
            served_by VARCHAR(60) NOT NULL DEFAULT 'Food Admin',
            PRIMARY KEY (id),
            INDEX idx_food_pass_code (pass_code),
            INDEX idx_food_reg_id (registration_id),
            INDEX idx_food_bought_at (bought_at)
        )
    `)

    try {
        await pool.query(`
            UPDATE registrations 
            SET full_name = CONCAT(TRIM(REGEXP_REPLACE(full_name, '(?i)\\\\s*\\\\(?\\\\s*leader\\\\s*\\\\)?$', '')), ' (leader)')
            WHERE registration_type = 'team' AND full_name NOT LIKE '%(leader)'
        `)
        await pool.query(`
            UPDATE team_members
            SET member_name = CONCAT(TRIM(REGEXP_REPLACE(member_name, '(?i)\\\\s*\\\\(?\\\\s*leader\\\\s*\\\\)?$', '')), ' (leader)')
            WHERE member_order = 1 AND member_name NOT LIKE '%(leader)'
        `)
    } catch {
        // Schema normalization best effort
    }

    try {
        await migratePassCodes()
    } catch (error) {
        console.error('Pass code migration failed:', error)
    }
}

const requireAdmin = (request, response, next) => {
    const token = request.headers.authorization?.replace('Bearer ', '')
    const session = adminSessions.get(token)
    const expiresAt = typeof session === 'object' ? session.expiresAt : session
    if (!token || !expiresAt || expiresAt < Date.now()) {
        adminSessions.delete(token)
        return response.status(401).json({ message: 'Admin login required.' })
    }
    request.adminUser = typeof session === 'object' ? session.username : 'admin'
    request.adminRole = typeof session === 'object' ? session.role : 'admin'
    next()
}

app.get('/', (_request, response) => {
    response.json({
        name: 'Zen-it-trix registration API',
        endpoints: {
            health: 'GET /api/health',
            registrations: 'POST /api/registrations',
            report: 'GET /api/registrations/export',
            admin: 'POST /api/admin/login',
        },
    })
})

app.post('/api/admin/login', (request, response) => {
    const { username, password } = request.body
    if (username !== adminUsername || password !== adminPassword) return response.status(401).json({ message: 'Invalid admin credentials.' })
    const token = crypto.randomBytes(32).toString('hex')
    const sessionMinutes = Number(process.env.ADMIN_SESSION_MINUTES || 240)
    adminSessions.set(token, { expiresAt: Date.now() + sessionMinutes * 60 * 1000, role: 'admin', username })
    response.json({ token, expiresInMinutes: sessionMinutes, role: 'admin', username })
})

app.post('/api/food/login', (request, response) => {
    const { username, password } = request.body
    const isFoodAdmin = (username === foodUsername && password === foodPassword)
    const isMainAdmin = (username === adminUsername && password === adminPassword)
    if (!isFoodAdmin && !isMainAdmin) {
        return response.status(401).json({ message: 'Invalid food admin credentials.' })
    }
    const token = crypto.randomBytes(32).toString('hex')
    const sessionMinutes = Number(process.env.ADMIN_SESSION_MINUTES || 240)
    const role = isMainAdmin ? 'admin' : 'food_admin'
    adminSessions.set(token, { expiresAt: Date.now() + sessionMinutes * 60 * 1000, role, username })
    response.json({ token, expiresInMinutes: sessionMinutes, role, username })
})

app.get('/api/health', async (_request, response) => {
    try {
        await pool.query('SELECT 1')
        response.json({ status: 'ok', database: 'connected' })
    } catch {
        response.status(503).json({ status: 'error', database: 'unavailable' })
    }
})

const saveRegistration = async (request, response) => {
    const {
        fullName,
        email,
        phone,
        college,
        collegeId = null,
        yearOfStudy = '1st Year',
        eventName,
        technicalEvent = null,
        nonTechnicalEvent = null,
        registrationType = 'individual',
        teamName = null,
        teamSize = 1,
        teamMembers = [],
    } = request.body

    const missingField = requiredFields.find((field) => typeof request.body[field] !== 'string' || !request.body[field].trim())
    if (missingField) return response.status(400).json({ message: `${missingField} is required.` })

    const cleanEmail = String(email || '').replace(/\s+/g, '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return response.status(400).json({ message: 'Enter a valid email address without spaces.' })
    }

    const cleanPhone = String(phone || '').replace(/\D/g, '').trim()
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
        return response.status(400).json({ message: 'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.' })
    }

    const cleanCollege = String(college || '').replace(/\s+/g, ' ').trim()
    const cleanCollegeId = collegeId ? String(collegeId).replace(/\s+/g, '').trim().toUpperCase() : null

    const cleanTech = technicalEvent ? String(technicalEvent).trim() : null
    const cleanNonTech = nonTechnicalEvent ? String(nonTechnicalEvent).trim() : null
    let computedEventName = eventName ? String(eventName).trim() : ''

    if (!computedEventName && (cleanTech || cleanNonTech)) {
        computedEventName = [cleanTech, cleanNonTech].filter(Boolean).join(' + ')
    }

    if (!computedEventName) {
        return response.status(400).json({ message: 'Please select at least one event (Technical or Non-Technical).' })
    }

    const isTeam = registrationType === 'team'
    const normalizedType = isTeam ? 'team' : 'individual'
    const normalizedTeamName = isTeam ? (teamName ? String(teamName).trim() : '') : null

    if (isTeam && !normalizedTeamName) {
        return response.status(400).json({ message: 'Team name is required for team registrations.' })
    }

    const normalizedTeamSize = isTeam ? Math.min(5, Math.max(2, Number(teamSize) || 2)) : 1

    const formatLeaderName = (name) => {
        if (!name) return ''
        const trimmed = String(name).trim()
        const base = trimmed.replace(/\s*(?:\(?\s*leader\s*\)?)$/i, '').trim()
        return base ? `${base} (leader)` : trimmed
    }

    const cleanInputName = (name) => {
        if (!name) return ''
        const trimmed = String(name).trim()
        if (/\s+leader$/i.test(trimmed)) {
            return trimmed.replace(/\s+leader$/i, ' (leader)')
        }
        return trimmed
    }

    let finalFullName = cleanInputName(fullName)
    if (isTeam) {
        finalFullName = formatLeaderName(fullName)
    }

    let cleanedMembers = []
    if (isTeam) {
        if (Array.isArray(teamMembers)) {
            cleanedMembers = teamMembers.map((m) => cleanInputName(m)).filter(Boolean)
        }
        if (cleanedMembers.length === 0 || cleanedMembers[0] !== finalFullName) {
            cleanedMembers = [finalFullName, ...cleanedMembers.filter((m) => m !== finalFullName && m !== fullName.trim())]
        }
        if (cleanedMembers.length > 0) {
            cleanedMembers[0] = formatLeaderName(cleanedMembers[0])
        }
        if (cleanedMembers.length < normalizedTeamSize) {
            return response.status(400).json({
                message: `Please provide names for all ${normalizedTeamSize} team members.`,
            })
        }
        cleanedMembers = cleanedMembers.slice(0, normalizedTeamSize)
    }

    const connection = await pool.getConnection()
    try {
        await connection.beginTransaction()

        const memberCount = isTeam ? normalizedTeamSize : 1
        const allocatedCodes = await allocatePassCodes(normalizedType, memberCount, connection)
        const primaryCode = allocatedCodes[0]

        const result = await connection.query(
            `INSERT INTO registrations (full_name, email, phone, college, college_id, year_of_study, event_name, technical_event, non_technical_event, registration_type, team_name, team_size, pass_code)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                finalFullName,
                cleanEmail,
                cleanPhone,
                cleanCollege,
                cleanCollegeId,
                String(yearOfStudy || '1st Year').trim(),
                computedEventName,
                cleanTech,
                cleanNonTech,
                normalizedType,
                normalizedTeamName,
                normalizedTeamSize,
                primaryCode,
            ],
        )

        const registrationId = Number(result.insertId)

        const membersList = []
        if (isTeam && cleanedMembers.length > 0) {
            for (let i = 0; i < cleanedMembers.length; i++) {
                const memberCode = allocatedCodes[i]
                await connection.query(
                    `INSERT INTO team_members (registration_id, member_name, member_order, pass_code)
                     VALUES (?, ?, ?, ?)`,
                    [registrationId, cleanedMembers[i], i + 1, memberCode],
                )
                membersList.push({
                    name: cleanedMembers[i],
                    passCode: memberCode,
                    memberOrder: i + 1,
                })
            }
        } else {
            membersList.push({
                name: finalFullName,
                passCode: primaryCode,
                memberOrder: 1,
            })
        }

        await connection.commit()

        const passCodeRange = isTeam && allocatedCodes.length > 1
            ? `${allocatedCodes[0]} – ${allocatedCodes[allocatedCodes.length - 1]}`
            : primaryCode

        response.status(201).json({
            message: 'Registration completed.',
            registrationId,
            registrationType: normalizedType,
            teamName: normalizedTeamName,
            eventName: computedEventName,
            technicalEvent: cleanTech,
            nonTechnicalEvent: cleanNonTech,
            passCode: primaryCode,
            passCodeRange,
            leaderPassCode: primaryCode,
            memberPassCodes: allocatedCodes,
            members: membersList,
            fullName: finalFullName,
            college: cleanCollege,
            collegeId: cleanCollegeId,
            yearOfStudy: String(yearOfStudy || '1st Year').trim(),
            teamMembers: isTeam ? cleanedMembers : [finalFullName],
            teamSize: normalizedTeamSize,
        })
    } catch (error) {
        await connection.rollback()
        if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ message: 'This email is already registered for that event.' })
        console.error(error)
        response.status(500).json({ message: 'The registration could not be saved.' })
    } finally {
        connection.release()
    }
}

app.post('/api/registrations', saveRegistration)

app.get('/api/admin/registrations', requireAdmin, async (_request, response) => {
    try {
        const rows = await pool.query(
            `SELECT r.id, r.full_name AS fullName, r.email, r.phone, r.college, r.college_id AS collegeId,
                    r.year_of_study AS yearOfStudy, r.event_name AS eventName,
                    r.technical_event AS technicalEvent, r.non_technical_event AS nonTechnicalEvent,
                    r.registration_type AS registrationType, r.team_name AS teamName,
                    r.team_size AS teamSize, r.present, r.present_at AS presentAt,
                    r.created_at AS createdAt,
                    r.pass_code AS regPassCode,
                    GROUP_CONCAT(CONCAT(tm.member_name, '::', COALESCE(tm.pass_code, '')) ORDER BY tm.member_order SEPARATOR '||') AS rawMembers
             FROM registrations r
             LEFT JOIN team_members tm ON r.id = tm.registration_id
             GROUP BY r.id
             ORDER BY r.id DESC`,
        )
        response.json(rows.map((row) => {
            const fallbackCode = row.regPassCode || passCode(row.registrationType, row.id)
            let memberObjects = []
            if (row.rawMembers) {
                memberObjects = row.rawMembers.split('||').map((item, idx) => {
                    const [name, code] = item.split('::')
                    return {
                        name: name || '',
                        passCode: code || fallbackCode,
                        memberOrder: idx + 1,
                    }
                })
            }
            const memberPassCodes = memberObjects.length > 0
                ? memberObjects.map((m) => m.passCode)
                : [fallbackCode]

            const passCodeRange = memberPassCodes.length > 1
                ? `${memberPassCodes[0]} – ${memberPassCodes[memberPassCodes.length - 1]}`
                : fallbackCode

            return {
                ...row,
                passCode: fallbackCode,
                passCodeRange,
                memberPassCodes,
                members: memberObjects,
                teamMembers: memberObjects.length > 0 ? memberObjects.map((m) => m.name) : [],
                teamMembersList: memberObjects.length > 0 ? memberObjects.map((m) => `${m.name} (${m.passCode})`).join(', ') : '',
            }
        }))
    } catch (error) {
        console.error(error)
        response.status(500).json({ message: 'The registrations could not be loaded.' })
    }
})

app.post('/api/admin/registrations', requireAdmin, saveRegistration)

app.post('/api/admin/registrations/:id/present', requireAdmin, async (request, response) => {
    try {
        const result = await pool.query(
            `UPDATE registrations SET present = 1, present_at = COALESCE(present_at, CURRENT_TIMESTAMP) WHERE id = ?`,
            [Number(request.params.id)],
        )
        if (!result.affectedRows) return response.status(404).json({ message: 'Registration not found.' })
        response.json({ message: 'Student marked present.' })
    } catch (error) {
        console.error(error)
        response.status(500).json({ message: 'Attendance could not be recorded.' })
    }
})

app.post('/api/admin/registrations/:id/toggle-attendance', requireAdmin, async (request, response) => {
    try {
        const id = Number(request.params.id)
        const rows = await pool.query('SELECT present FROM registrations WHERE id = ?', [id])
        if (!rows.length) return response.status(404).json({ message: 'Registration not found.' })
        const nextState = rows[0].present ? 0 : 1
        await pool.query(
            'UPDATE registrations SET present = ?, present_at = ? WHERE id = ?',
            [nextState, nextState ? new Date() : null, id]
        )
        response.json({ message: nextState ? 'Marked present' : 'Marked not present', present: nextState })
    } catch (error) {
        console.error(error)
        response.status(500).json({ message: 'Attendance toggle failed.' })
    }
})

app.post('/api/admin/registrations/bulk-present', requireAdmin, async (request, response) => {
    const { ids } = request.body
    if (!Array.isArray(ids) || ids.length === 0) return response.status(400).json({ message: 'No IDs provided.' })
    try {
        await pool.query(
            'UPDATE registrations SET present = 1, present_at = COALESCE(present_at, CURRENT_TIMESTAMP) WHERE id IN (?)',
            [ids.map(Number)]
        )
        response.json({ message: `Marked ${ids.length} registrations as present.` })
    } catch (error) {
        console.error(error)
        response.status(500).json({ message: 'Bulk attendance update failed.' })
    }
})

app.get('/api/barcode/:code', async (request, response) => {
    const code = String(request.params.code || '').trim().toUpperCase()
    if (!/^ZEN(?:-[IT]-\d{3,}|\d{3,}(?:-[0-9A-Za-z]+)?)$/i.test(code)) {
        return response.status(400).json({ message: 'Invalid pass code format.' })
    }
    try {
        const png = await bwipjs.toBuffer({ bcid: 'code128', text: code, scale: 3, height: 12, includetext: true, textxalign: 'center' })
        response.type('image/png').send(png)
    } catch (error) {
        console.error(error)
        response.status(500).json({ message: 'The barcode could not be generated.' })
    }
})

app.get('/api/admin/registrations/:id/barcode', requireAdmin, async (request, response) => {
    const queryCode = request.query.code ? String(request.query.code).trim().toUpperCase() : null
    let code = queryCode
    if (!code) {
        const rows = await pool.query('SELECT pass_code, registration_type FROM registrations WHERE id = ?', [Number(request.params.id)])
        code = rows[0]?.pass_code || passCode(rows[0]?.registration_type, Number(request.params.id))
    }
    if (!/^ZEN(?:-[IT]-\d{3,}|\d{3,}(?:-[0-9A-Za-z]+)?)$/i.test(code)) return response.status(400).json({ message: 'Invalid registration ID or code.' })
    try {
        const png = await bwipjs.toBuffer({ bcid: 'code128', text: code, scale: 3, height: 12, includetext: true, textxalign: 'center' })
        response.type('image/png').send(png)
    } catch (error) {
        console.error(error)
        response.status(500).json({ message: 'The barcode could not be generated.' })
    }
})

app.get('/api/registrations/export', requireAdmin, async (_request, response) => {
    try {
        const rows = await pool.query(
            `SELECT r.id, r.full_name, r.email, r.phone, r.college, r.college_id, r.year_of_study,
                    r.event_name, r.technical_event, r.non_technical_event,
                    r.registration_type, r.team_name, r.team_size,
                    r.present, r.present_at, r.created_at,
                    r.pass_code AS reg_pass_code,
                    GROUP_CONCAT(CONCAT(tm.member_name, ' (', COALESCE(tm.pass_code, r.pass_code, ''), ')') ORDER BY tm.member_order SEPARATOR '; ') AS team_members_with_codes,
                    MIN(tm.pass_code) AS min_pass_code,
                    MAX(tm.pass_code) AS max_pass_code
             FROM registrations r
             LEFT JOIN team_members tm ON r.id = tm.registration_id
             GROUP BY r.id
             ORDER BY r.created_at DESC`,
        )
        const header = [
            'ID',
            'Pass',
            'Full name',
            'Email',
            'Phone',
            'College',
            'College ID',
            'Year of study',
            'Events',
            'Technical event',
            'Non-technical event',
            'Registration type',
            'Team name',
            'Team size',
            'Team members',
            'Present',
            'Present at',
            'Registered at',
        ]
        const csv = [
            header,
            ...rows.map((row) => {
                const isTeam = row.registration_type === 'team'
                const primaryCode = row.reg_pass_code || passCode(row.registration_type, row.id)
                let passDisplay = primaryCode
                if (isTeam && row.min_pass_code && row.max_pass_code && row.min_pass_code !== row.max_pass_code) {
                    passDisplay = `${row.min_pass_code} – ${row.max_pass_code}`
                }
                return [
                    row.id,
                    passDisplay,
                    row.full_name,
                    row.email,
                    row.phone,
                    row.college,
                    row.college_id ?? '',
                    row.year_of_study,
                    row.event_name,
                    row.technical_event ?? '',
                    row.non_technical_event ?? '',
                    row.registration_type,
                    row.team_name ?? '',
                    row.team_size,
                    row.team_members_with_codes ?? row.full_name,
                    row.present ? 'YES' : 'NO',
                    row.present_at instanceof Date ? row.present_at.toISOString() : row.present_at,
                    row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
                ]
            }),
        ].map((row) => row.map(csvEscape).join(',')).join('\r\n')

        response.attachment('zen-it-trix-registrations.csv')
        response.type('text/csv').send(`\ufeff${csv}`)
    } catch (error) {
        console.error(error)
        response.status(500).json({ message: 'The registrations could not be exported.' })
    }
})

const formatFoodRecord = (record) => {
    if (!record) return null
    return {
        id: record.id,
        passCode: record.pass_code || record.passCode,
        participantName: record.participant_name || record.participantName,
        registrationId: record.registration_id || record.registrationId,
        memberId: record.member_id || record.memberId || null,
        college: record.college || '',
        phone: record.phone || '',
        foodType: record.food_type || record.foodType || 'Standard Meal',
        status: record.status || 'bought',
        boughtAt: record.bought_at instanceof Date ? record.bought_at.toISOString() : (record.boughtAt || record.bought_at),
        notes: record.notes || '',
        servedBy: record.served_by || record.servedBy || 'Food Admin',
        registrationType: record.registration_type || record.registrationType || 'individual',
        teamName: record.team_name || record.teamName || '',
        eventName: record.event_name || record.eventName || '',
    }
}

const findParticipantByPassCode = async (rawCode) => {
    if (!rawCode) return null
    const cleanCode = String(rawCode).trim()
    const upperCode = cleanCode.toUpperCase()

    // 1. Check team_members
    const memberRows = await pool.query(
        `SELECT tm.id AS memberId, tm.member_name AS participantName, tm.pass_code AS passCode,
                tm.member_order AS memberOrder, r.id AS registrationId, r.full_name AS leaderName,
                r.email, r.phone, r.college, r.college_id AS collegeId, r.year_of_study AS yearOfStudy,
                r.event_name AS eventName, r.registration_type AS registrationType, r.team_name AS teamName,
                r.team_size AS teamSize, r.present, r.present_at AS presentAt
         FROM team_members tm
         JOIN registrations r ON tm.registration_id = r.id
         WHERE tm.pass_code = ? OR tm.pass_code = ?`,
        [upperCode, cleanCode]
    )
    if (memberRows.length > 0) {
        return memberRows[0]
    }

    // 2. Check registrations
    const regRows = await pool.query(
        `SELECT NULL AS memberId, r.full_name AS participantName, r.pass_code AS passCode,
                1 AS memberOrder, r.id AS registrationId, r.full_name AS leaderName,
                r.email, r.phone, r.college, r.college_id AS collegeId, r.year_of_study AS yearOfStudy,
                r.event_name AS eventName, r.registration_type AS registrationType, r.team_name AS teamName,
                r.team_size AS teamSize, r.present, r.present_at AS presentAt
         FROM registrations r
         WHERE r.pass_code = ? OR r.pass_code = ?`,
        [upperCode, cleanCode]
    )
    if (regRows.length > 0) {
        return regRows[0]
    }

    // 3. Fallback: Numeric ID match in registrations
    if (/^\d+$/.test(cleanCode)) {
        const idRows = await pool.query(
            `SELECT NULL AS memberId, r.full_name AS participantName, r.pass_code AS passCode,
                    1 AS memberOrder, r.id AS registrationId, r.full_name AS leaderName,
                    r.email, r.phone, r.college, r.college_id AS collegeId, r.year_of_study AS yearOfStudy,
                    r.event_name AS eventName, r.registration_type AS registrationType, r.team_name AS teamName,
                    r.team_size AS teamSize, r.present, r.present_at AS presentAt
             FROM registrations r
             WHERE r.id = ?`,
            [Number(cleanCode)]
        )
        if (idRows.length > 0) return idRows[0]
    }

    // 4. Fallback: Fuzzy normalization for variations like ZENI001, ZEN-I-1, ZEN_T_002
    const match = upperCode.match(/^(?:ZEN[-_]?)?([IT])[-_]?(\d+)$/i)
    if (match) {
        const type = match[1].toUpperCase() === 'T' ? 'ZEN-T-' : 'ZEN-I-'
        const padded = `${type}${String(match[2]).padStart(3, '0')}`
        if (padded !== upperCode) {
            return findParticipantByPassCode(padded)
        }
    }

    return null
}

// Food Admin APIs
app.get('/api/food/verify', requireAdmin, (request, response) => {
    response.json({ valid: true, user: request.adminUser, role: request.adminRole })
})

app.get('/api/food/lookup/:code', requireAdmin, async (request, response) => {
    const rawCode = String(request.params.code || '').trim()
    if (!rawCode) return response.status(400).json({ message: 'Pass code is required.' })

    try {
        const participant = await findParticipantByPassCode(rawCode)
        if (!participant) {
            const orphanPurchases = await pool.query(
                'SELECT * FROM food_records WHERE pass_code = ? ORDER BY bought_at DESC',
                [rawCode.toUpperCase()]
            )
            if (orphanPurchases.length > 0) {
                return response.json({
                    found: true,
                    participant: {
                        participantName: orphanPurchases[0].participant_name,
                        passCode: orphanPurchases[0].pass_code,
                        college: orphanPurchases[0].college,
                        phone: orphanPurchases[0].phone,
                        registrationType: 'individual',
                        eventName: 'Symposium',
                    },
                    alreadyBought: true,
                    purchaseCount: orphanPurchases.length,
                    purchases: orphanPurchases.map(formatFoodRecord),
                    firstBoughtAt: orphanPurchases[orphanPurchases.length - 1].bought_at,
                    lastBoughtAt: orphanPurchases[0].bought_at,
                })
            }
            return response.status(404).json({ found: false, message: `Pass code "${rawCode}" not found.` })
        }

        const purchases = await pool.query(
            `SELECT id, pass_code AS passCode, participant_name AS participantName,
                    registration_id AS registrationId, member_id AS memberId,
                    college, phone, food_type AS foodType, status,
                    bought_at AS boughtAt, notes, served_by AS servedBy
             FROM food_records
             WHERE pass_code = ? OR (registration_id = ? AND (member_id = ? OR (member_id IS NULL AND ? IS NULL)))
             ORDER BY bought_at DESC`,
            [participant.passCode, participant.registrationId, participant.memberId, participant.memberId]
        )

        response.json({
            found: true,
            participant,
            alreadyBought: purchases.length > 0,
            purchaseCount: purchases.length,
            purchases: purchases.map(formatFoodRecord),
            firstBoughtAt: purchases.length > 0 ? purchases[purchases.length - 1].boughtAt : null,
            lastBoughtAt: purchases.length > 0 ? purchases[0].boughtAt : null,
        })
    } catch (error) {
        console.error('Food lookup error:', error)
        response.status(500).json({ message: 'Failed to look up pass code.' })
    }
})

app.post('/api/food/purchase', requireAdmin, async (request, response) => {
    const { passCode, foodType = 'Standard Meal', notes = '', force = false } = request.body
    if (!passCode) return response.status(400).json({ message: 'Pass code is required.' })

    try {
        const participant = await findParticipantByPassCode(passCode)
        if (!participant) {
            return response.status(404).json({ message: `Pass code "${passCode}" not found in registrations.` })
        }

        const existing = await pool.query(
            `SELECT id, pass_code AS passCode, participant_name AS participantName,
                    food_type AS foodType, bought_at AS boughtAt, served_by AS servedBy
             FROM food_records
             WHERE pass_code = ? OR (registration_id = ? AND (member_id = ? OR (member_id IS NULL AND ? IS NULL)))
             ORDER BY bought_at DESC`,
            [participant.passCode, participant.registrationId, participant.memberId, participant.memberId]
        )

        if (existing.length > 0 && !force) {
            return response.status(409).json({
                message: `${participant.participantName} has ALREADY bought food.`,
                alreadyBought: true,
                purchases: existing.map(formatFoodRecord),
                participant,
                lastBoughtAt: existing[0].boughtAt,
            })
        }

        const servedBy = request.adminUser || 'Food Admin'
        const insertResult = await pool.query(
            `INSERT INTO food_records (pass_code, participant_name, registration_id, member_id, college, phone, food_type, status, notes, served_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'bought', ?, ?)`,
            [
                participant.passCode,
                participant.participantName,
                participant.registrationId,
                participant.memberId,
                participant.college,
                participant.phone,
                foodType,
                notes || null,
                servedBy,
            ]
        )

        if (!participant.present) {
            await pool.query(
                `UPDATE registrations SET present = 1, present_at = COALESCE(present_at, CURRENT_TIMESTAMP) WHERE id = ?`,
                [participant.registrationId]
            )
        }

        const newRecord = {
            id: Number(insertResult.insertId),
            passCode: participant.passCode,
            participantName: participant.participantName,
            registrationId: participant.registrationId,
            memberId: participant.memberId,
            college: participant.college,
            phone: participant.phone,
            foodType,
            status: 'bought',
            boughtAt: new Date().toISOString(),
            notes: notes || null,
            servedBy,
            registrationType: participant.registrationType,
            teamName: participant.teamName,
            eventName: participant.eventName,
        }

        response.status(201).json({
            message: `Food purchase recorded for ${participant.participantName}.`,
            purchase: formatFoodRecord(newRecord),
            participant,
        })
    } catch (error) {
        console.error('Food purchase error:', error)
        response.status(500).json({ message: 'Could not record food purchase.' })
    }
})

app.get('/api/food/records', requireAdmin, async (request, response) => {
    try {
        const search = request.query.search ? String(request.query.search).trim() : ''
        let query = `
            SELECT f.id, f.pass_code AS passCode, f.participant_name AS participantName,
                   f.registration_id AS registrationId, f.member_id AS memberId,
                   f.college, f.phone, f.food_type AS foodType, f.status,
                   f.bought_at AS boughtAt, f.notes, f.served_by AS servedBy,
                   r.registration_type AS registrationType, r.team_name AS teamName,
                   r.event_name AS eventName
            FROM food_records f
            LEFT JOIN registrations r ON f.registration_id = r.id
        `
        const params = []
        if (search) {
            query += ` WHERE f.pass_code LIKE ? OR f.participant_name LIKE ? OR f.college LIKE ? OR f.phone LIKE ?`
            const wild = `%${search}%`
            params.push(wild, wild, wild, wild)
        }
        query += ` ORDER BY f.bought_at DESC LIMIT 500`

        const rows = await pool.query(query, params)
        response.json(rows.map(formatFoodRecord))
    } catch (error) {
        console.error('Food records error:', error)
        response.status(500).json({ message: 'Could not load food records.' })
    }
})

app.get('/api/food/stats', requireAdmin, async (_request, response) => {
    try {
        const [totalBoughtRow] = await pool.query('SELECT COUNT(*) AS totalPurchases, COUNT(DISTINCT pass_code) AS uniqueParticipants FROM food_records')
        const [recentHourRow] = await pool.query('SELECT COUNT(*) AS countLastHour FROM food_records WHERE bought_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)')
        
        const [totalIndividual] = await pool.query("SELECT COUNT(*) AS cnt FROM registrations WHERE registration_type = 'individual'")
        const [totalTeamMembers] = await pool.query('SELECT COUNT(*) AS cnt FROM team_members')
        const [teamsWithoutMembers] = await pool.query("SELECT COUNT(*) AS cnt FROM registrations r LEFT JOIN team_members tm ON r.id = tm.registration_id WHERE r.registration_type = 'team' AND tm.id IS NULL")
        const totalEligible = Number(totalIndividual.cnt || 0) + Number(totalTeamMembers.cnt || 0) + Number(teamsWithoutMembers.cnt || 0)

        const totalServed = Number(totalBoughtRow?.uniqueParticipants || 0)
        const pending = Math.max(0, totalEligible - totalServed)

        response.json({
            totalEligible,
            totalPurchases: Number(totalBoughtRow?.totalPurchases || 0),
            uniqueParticipantsServed: totalServed,
            pending,
            servedInLastHour: Number(recentHourRow?.countLastHour || 0),
        })
    } catch (error) {
        console.error('Food stats error:', error)
        response.status(500).json({ message: 'Could not load food stats.' })
    }
})

app.delete('/api/food/records/:id', requireAdmin, async (request, response) => {
    const id = Number(request.params.id)
    try {
        const result = await pool.query('DELETE FROM food_records WHERE id = ?', [id])
        if (!result.affectedRows) return response.status(404).json({ message: 'Food record not found.' })
        response.json({ message: 'Food record removed.' })
    } catch (error) {
        console.error('Delete food record error:', error)
        response.status(500).json({ message: 'Could not delete food record.' })
    }
})

app.get('/api/food/export', requireAdmin, async (_request, response) => {
    try {
        const rows = await pool.query(`
            SELECT f.id, f.pass_code, f.participant_name, f.college, f.phone,
                   f.food_type, f.bought_at, f.served_by, f.notes,
                   r.registration_type, r.team_name, r.event_name
            FROM food_records f
            LEFT JOIN registrations r ON f.registration_id = r.id
            ORDER BY f.bought_at DESC
        `)
        const header = ['Record ID', 'Pass Code', 'Participant Name', 'College', 'Phone', 'Registration Type', 'Team Name', 'Event', 'Food Type', 'Bought At', 'Served By', 'Notes']
        const csv = [
            header,
            ...rows.map((row) => [
                row.id,
                row.pass_code,
                row.participant_name,
                row.college ?? '',
                row.phone ?? '',
                row.registration_type ?? '',
                row.team_name ?? '',
                row.event_name ?? '',
                row.food_type,
                row.bought_at instanceof Date ? row.bought_at.toISOString() : row.bought_at,
                row.served_by ?? '',
                row.notes ?? '',
            ]),
        ].map((row) => row.map(csvEscape).join(',')).join('\r\n')

        response.attachment('zen-it-trix-food-log.csv')
        response.type('text/csv').send(`\ufeff${csv}`)
    } catch (error) {
        console.error('Export food log error:', error)
        response.status(500).json({ message: 'Could not export food log.' })
    }
})

app.get('/api/food/search-participants', requireAdmin, async (request, response) => {
    const q = String(request.query.q || '').trim()
    if (!q || q.length < 2) return response.json([])
    try {
        const wild = `%${q}%`
        const memberRows = await pool.query(
            `SELECT tm.id AS memberId, tm.member_name AS participantName, tm.pass_code AS passCode,
                    tm.member_order AS memberOrder, r.id AS registrationId, r.full_name AS leaderName,
                    r.email, r.phone, r.college, r.event_name AS eventName, r.registration_type AS registrationType,
                    r.team_name AS teamName
             FROM team_members tm
             JOIN registrations r ON tm.registration_id = r.id
             WHERE tm.member_name LIKE ? OR tm.pass_code LIKE ? OR r.college LIKE ? OR r.phone LIKE ?
             LIMIT 15`,
            [wild, wild, wild, wild]
        )
        const regRows = await pool.query(
            `SELECT NULL AS memberId, r.full_name AS participantName, r.pass_code AS passCode,
                    1 AS memberOrder, r.id AS registrationId, r.full_name AS leaderName,
                    r.email, r.phone, r.college, r.event_name AS eventName, r.registration_type AS registrationType,
                    r.team_name AS teamName
             FROM registrations r
             WHERE r.full_name LIKE ? OR r.pass_code LIKE ? OR r.college LIKE ? OR r.phone LIKE ?
             LIMIT 15`,
            [wild, wild, wild, wild]
        )
        const map = new Map()
        for (const item of [...memberRows, ...regRows]) {
            if (item.passCode && !map.has(item.passCode)) {
                map.set(item.passCode, item)
            }
        }
        response.json(Array.from(map.values()))
    } catch (error) {
        console.error('Participant search error:', error)
        response.status(500).json({ message: 'Search failed.' })
    }
})

app.use((_request, response) => response.status(404).json({ message: 'Route not found.' }))

ensureSchema()
    .then(() => app.listen(port, '0.0.0.0', () => console.log(`Zen-it-trix API listening on port ${port}`)))
    .catch((error) => {
        console.error('Could not prepare database schema.', error)
        process.exitCode = 1
    })
