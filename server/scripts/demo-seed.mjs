// Fills a LOCAL workspace with a realistic amount of demo data: people, projects, tasks, events,
// comments, three months of worklogs and timesheet approvals, focus sessions and notifications.
//
//   cd server && set -a && . ./.env && set +a && node scripts/demo-seed.mjs [owner-email]
//
// Re-running replaces the previous demo data: demo people use @demo.pane.test, and demo projects,
// events and focus sessions are recognised by their names. It refuses to touch any database that isn't on localhost.
import pg from 'pg'

const OWNER = process.argv[2] ?? 'ana.p6@pane.test'
const url = new URL(process.env.DATABASE_URL ?? '')
if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || process.env.NODE_ENV === 'production') {
  console.error(`Refusing to seed ${url.hostname}: demo data is for local databases only.`)
  process.exit(1)
}

/* ---------- deterministic randomness ---------- */
let seed = 20261030
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const pick = a => a[Math.floor(rnd() * a.length)]
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
const chance = p => rnd() < p

/* ---------- dates (UTC calendar days) ---------- */
const DAY = 86_400_000
const today = new Date().toISOString().slice(0, 10)
const add = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const dow = d => new Date(`${d}T00:00:00Z`).getUTCDay()
const monday = d => add(d, -((dow(d) + 6) % 7))
const at = (d, hour = 10, min = 0) => new Date(Date.parse(`${d}T00:00:00Z`) + (hour * 60 + min) * 60_000)

/* ---------- content ---------- */
const PEOPLE = [
  ['Maya Okafor', 'Engineering', 'Staff engineer', 'Lagos', 'Africa/Lagos', 'online', 'admin'],
  ['Leo Martins', 'Engineering', 'Backend engineer', 'Lisbon', 'Europe/Lisbon', 'focus', 'member'],
  ['Priya Raman', 'Design', 'Product designer', 'Bengaluru', 'Asia/Kolkata', 'meeting', 'member'],
  ['Sam Whitaker', 'Product', 'Product manager', 'Austin', 'America/Chicago', 'online', 'admin'],
  ['Yuki Tanaka', 'Engineering', 'Frontend engineer', 'Tokyo', 'Asia/Tokyo', 'away', 'member'],
  ['Clara Nieto', 'Marketing', 'Growth lead', 'Madrid', 'Europe/Madrid', 'online', 'member'],
  ['Omar Haddad', 'Engineering', 'Mobile engineer', 'Amman', 'Asia/Amman', 'online', 'member'],
  ['Ines Duarte', 'Design', 'Brand designer', 'Porto', 'Europe/Lisbon', 'focus', 'member'],
  ['Noah Becker', 'Product', 'Data analyst', 'Berlin', 'Europe/Berlin', 'away', 'member'],
  ['Zoe Lambert', 'Marketing', 'Content strategist', 'Montréal', 'America/Toronto', 'online', 'member'],
]

const PROJECTS = [
  { name: 'Orbit mobile app', desc: 'The iOS and Android app: faster, offline-first, and ready for tablets.', hue: 'blue', icon: 'phone', status: 'progress', start: -75, due: 45, approval: 'week',
    tasks: ['Offline sync for drafts', 'Push notification settings', 'Biometric sign-in', 'Dark mode polish', 'Crash on rotate in editor', 'Deep links to tasks', 'App Store screenshots', 'Onboarding carousel', 'Widget for today view', 'Haptics on swipe actions', 'Background refresh budget', 'Accessibility audit fixes', 'Release notes for 2.4', 'Tablet split view'] },
  { name: 'Design system 2.0', desc: 'One set of tokens and components for web and mobile.', hue: 'purple', icon: 'grid', status: 'progress', start: -90, due: 30, approval: 'week',
    tasks: ['Token audit', 'Button variants', 'Form field states', 'Data table component', 'Icon set refresh', 'Motion guidelines', 'Docs site search', 'Color contrast pass', 'Figma library sync', 'Date picker', 'Toast and banner', 'Migration guide'] },
  { name: 'Q4 launch campaign', desc: 'Everything that goes out the door for the November launch.', hue: 'orange', icon: 'flame', status: 'review', start: -40, due: 20, approval: 'month',
    tasks: ['Launch landing page', 'Press kit', 'Customer stories x3', 'Webinar run of show', 'Email sequence', 'Paid social creative', 'Partner newsletter swap', 'Pricing page copy', 'Launch day checklist', 'Product Hunt prep'] },
  { name: 'Billing platform', desc: 'Usage-based pricing, invoices people understand, fewer failed payments.', hue: 'green', icon: 'chart', status: 'progress', start: -60, due: 60, approval: 'week',
    tasks: ['Usage-based metering', 'Invoice PDF redesign', 'Proration edge cases', 'Tax ID validation', 'Dunning emails', 'Webhook retries', 'Admin refunds tool', 'Plan change preview', 'Revenue dashboard', 'Audit log export', 'Currency rounding bug'] },
  { name: 'Help center revamp', desc: 'Answers customers can find before they write to support.', hue: 'teal', icon: 'leaf', status: 'planning', start: -10, due: 75, approval: null,
    tasks: ['Content inventory', 'Information architecture', 'Search analytics review', 'Article template', 'Video walkthroughs', 'Localization plan', 'Feedback widget'] },
  { name: 'Data warehouse', desc: 'Clean, trusted event data for every team’s dashboards.', hue: 'indigo', icon: 'rocket', status: 'shipped', start: -120, due: -12, approval: null,
    tasks: ['Event schema v2', 'dbt models for funnels', 'Backfill 2025 events', 'Cost alerts', 'Looker explores', 'PII masking', 'Freshness monitors', 'Runbook'] },
]

const MILESTONES = ['Kickoff', 'Design review', 'Beta', 'Launch']
const SUBTASKS = ['Write spec', 'Review with team', 'Build', 'QA pass', 'Ship it']
const COMMENTS = [
  'Picked this up, first pass by tomorrow.', 'Left notes on the edge cases in the doc.', 'Blocked on API changes, pinged backend.',
  'Looks good to me — one nit on copy.', 'Can we split this? It is bigger than estimated.', 'Pushed a fix, please re-test.',
  'Customer reported this again today.', 'Moved the deadline after the sync.', 'Pairing on this Thursday.', 'Shipped behind a flag 🚩',
]
const LOG_NOTES = ['', '', 'Implementation', 'Review and fixes', 'Pairing session', 'Research', 'QA', 'Sync with design', 'Docs', 'Bug bash']
const EVENTS = [
  ['Daily standup', 'team', 9 * 60 + 30, 15], ['Sprint planning', 'meeting', 10 * 60, 60], ['Design critique', 'review', 14 * 60, 45],
  ['1:1', 'call', 11 * 60, 30], ['Customer interview', 'call', 16 * 60, 45], ['Deep work', 'focus', 13 * 60, 120],
  ['Retro', 'team', 15 * 60, 45], ['Launch review', 'review', 12 * 60, 60], ['All hands', 'team', 17 * 60, 30],
]
const HUES = ['blue', 'purple', 'pink', 'orange', 'green', 'teal', 'indigo', 'yellow']

const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
const q = (sql, params) => db.query(sql, params).then(r => r.rows)

try {
  await db.query('BEGIN')
  const [owner] = await q(`SELECT id FROM users WHERE email = $1`, [OWNER])
  if (!owner) throw new Error(`No user ${OWNER}. Sign in once locally first.`)
  const [ws] = await q(`SELECT m.workspace_id AS id FROM memberships m WHERE m.user_id = $1 AND m.role = 'owner' ORDER BY m.joined_at LIMIT 1`, [owner.id])
  if (!ws) throw new Error(`${OWNER} owns no workspace.`)
  const W = ws.id
  const roles = Object.fromEntries((await q(`SELECT key, id FROM project_roles WHERE workspace_id = $1`, [W])).map(r => [r.key, r.id]))

  /* ---- wipe the previous run ---- */
  const oldProjects = (await q(`SELECT id FROM projects WHERE workspace_id = $1 AND name = ANY($2)`, [W, PROJECTS.map(p => p.name)])).map(r => r.id)
  if (oldProjects.length) {
    await q(`DELETE FROM worklogs WHERE project_id = ANY($1)`, [oldProjects])
    await q(`DELETE FROM timesheet_periods WHERE project_id = ANY($1)`, [oldProjects])
    await q(`DELETE FROM events WHERE project_id = ANY($1)`, [oldProjects])
    await q(`DELETE FROM task_activity WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ANY($1))`, [oldProjects])
    await q(`DELETE FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ANY($1))`, [oldProjects])
    await q(`DELETE FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ANY($1))`, [oldProjects])
    await q(`UPDATE focus_sessions SET task_id = NULL WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ANY($1))`, [oldProjects])
    await q(`DELETE FROM tasks WHERE project_id = ANY($1)`, [oldProjects])
    for (const t of ['milestones', 'project_members', 'project_user_prefs']) await q(`DELETE FROM ${t} WHERE project_id = ANY($1)`, [oldProjects])
    await q(`DELETE FROM projects WHERE id = ANY($1)`, [oldProjects])
  }
  await q(`DELETE FROM events WHERE workspace_id = $1 AND split_part(title, ' · ', 1) = ANY($2)`, [W, [...EVENTS.map(e => e[0]), 'Billing beta goes live']])
  await q(`DELETE FROM notifications WHERE workspace_id = $1 AND payload->>'demo' = 'true'`, [W])
  await q(`DELETE FROM focus_sessions WHERE workspace_id = $1 AND user_id = $2 AND label = 'Deep work'`, [W, owner.id])
  const oldUsers = (await q(`SELECT id FROM users WHERE email LIKE '%@demo.pane.test'`)).map(r => r.id)
  if (oldUsers.length) {
    await q(`DELETE FROM notifications WHERE actor_id = ANY($1) OR recipient_id = ANY($1)`, [oldUsers])
    await q(`DELETE FROM event_attendees WHERE user_id = ANY($1)`, [oldUsers])
    await q(`DELETE FROM focus_sessions WHERE user_id = ANY($1)`, [oldUsers])
    await q(`DELETE FROM memberships WHERE user_id = ANY($1)`, [oldUsers])
    await q(`DELETE FROM user_prefs WHERE user_id = ANY($1)`, [oldUsers])
    await q(`DELETE FROM users WHERE id = ANY($1)`, [oldUsers])
  }

  /* ---- people ---- */
  const people = [owner.id]
  for (const [i, [name, team, title, city, tz, presence, role]] of PEOPLE.entries()) {
    const email = `${name.split(' ')[0].toLowerCase()}@demo.pane.test`
    const [u] = await q(`INSERT INTO users (email, email_verified_at, name, avatar_skin) VALUES ($1, now(), $2, $3) RETURNING id`, [email, name, i % 6])
    await q(`INSERT INTO memberships (workspace_id, user_id, role, team, title, city, tz, capacity, presence, joined_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() - ($10 || ' days')::interval)`,
      [W, u.id, role, team, title, city, tz, pick([32, 36, 40, 40]), presence, int(30, 200)])
    people.push(u.id)
  }
  // People already in the workspace (other than the owner) join the demo too.
  const existing = (await q(`SELECT user_id FROM memberships WHERE workspace_id = $1 AND user_id <> $2 AND user_id <> ALL($3)`, [W, owner.id, people])).map(r => r.user_id)
  const others = [...people.slice(1), ...existing]
  people.push(...existing)

  /* ---- projects, members, milestones ---- */
  const projects = []
  for (const [i, p] of PROJECTS.entries()) {
    const lead = i % 2 === 0 ? owner.id : others[i]
    const team = [owner.id, ...others.filter((_, k) => (k + i) % 3 !== 0 || chance(0.3))].slice(0, 9)
    if (!team.includes(lead)) team.push(lead)
    const [row] = await q(
      `INSERT INTO projects (workspace_id, name, description, hue, icon, status, start_date, due_date, lead_id, default_role_id, approval_enabled, approval_period, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [W, p.name, p.desc, p.hue, p.icon, p.status, add(today, p.start), add(today, p.due),
        lead, roles.member, !!p.approval, p.approval ?? 'week', at(add(today, p.start))])
    for (const u of team) {
      await q(`INSERT INTO project_members (project_id, user_id, role_id) VALUES ($1, $2, $3)`,
        [row.id, u, u === lead || (u === others[3] && chance(0.5)) ? roles.administrator : u === others[8] ? roles.viewer : roles.member])
    }
    if (i < 3) await q(`INSERT INTO project_user_prefs (project_id, user_id, pinned, starred) VALUES ($1, $2, $3, $4)`, [row.id, owner.id, i < 2, i !== 1])
    const span = p.due - p.start
    for (const [k, title] of MILESTONES.entries()) {
      const due = add(today, p.start + Math.round((span * (k + 1)) / MILESTONES.length))
      await q(`INSERT INTO milestones (project_id, title, due_date, done, position) VALUES ($1, $2, $3, $4, $5)`, [row.id, title, due, due < today, k])
    }
    projects.push({ ...p, id: row.id, lead, team: team.filter(u => u !== others[8] || u === lead) })
  }

  /* ---- tasks, subtasks, comments, activity ---- */
  const tasks = []
  for (const p of projects) {
    for (const [k, title] of p.tasks.entries()) {
      const shipped = p.status === 'shipped'
      const status = shipped ? 'done' : pick(['todo', 'todo', 'progress', 'progress', 'progress', 'review', 'done', 'done'])
      // Round-robin so everyone carries some work; the owner takes about one task in six.
      const crew = p.team.filter(u => u !== owner.id && u !== others[8])
      const assignee = k % 6 === 0 || !crew.length ? owner.id : crew[(k + projects.indexOf(p)) % crew.length]
      const estimate = pick([1, 2, 3, 4, 6, 8, 12, 16])
      const created = add(today, p.start + int(0, Math.max(1, -p.start - 5)))
      const due = status === 'done' ? add(today, int(-40, 5)) : chance(0.15) ? add(today, int(-6, -1)) : add(today, int(0, 35))
      const doneAt = status === 'done' ? add(today, Math.min(0, int(-55, -1))) : null
      const [t] = await q(
        `INSERT INTO tasks (workspace_id, project_id, assignee_id, title, status, priority, due_date, estimate, "order", done_at, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [W, p.id, assignee, title, status, pick(['low', 'medium', 'medium', 'high', 'urgent']), due, estimate, k, doneAt, p.lead, at(created)])
      tasks.push({ id: t.id, project: p, assignee, status, estimate, created, doneAt })
      await q(`INSERT INTO task_activity (task_id, workspace_id, actor_id, kind, at) VALUES ($1, $2, $3, 'created', $4)`, [t.id, W, p.lead, at(created)])
      if (status !== 'todo') {
        const started = add(created, int(0, 5))
        await q(`INSERT INTO task_activity (task_id, workspace_id, actor_id, kind, from_status, to_status, at) VALUES ($1, $2, $3, 'status', 'todo', 'progress', $4)`,
          [t.id, W, assignee, at(started > today ? today : started, 9)])
      }
      if (status === 'done') {
        await q(`INSERT INTO task_activity (task_id, workspace_id, actor_id, kind, from_status, to_status, at) VALUES ($1, $2, $3, 'status', 'review', 'done', $4)`,
          [t.id, W, assignee, at(doneAt, int(10, 18))])
      }
      if (chance(0.6)) {
        const n = int(2, 5)
        for (let s = 0; s < n; s++) {
          await q(`INSERT INTO subtasks (task_id, title, done, position) VALUES ($1, $2, $3, $4)`,
            [t.id, SUBTASKS[s], status === 'done' || (status !== 'todo' && s < n / 2), s])
        }
      }
      for (let c = 0, n = chance(0.7) ? int(1, 4) : 0; c < n; c++) {
        await q(`INSERT INTO task_comments (task_id, author_id, body, created_at) VALUES ($1, $2, $3, $4)`,
          [t.id, pick(p.team), pick(COMMENTS), at(add(created, int(0, Math.max(0, Math.round((Date.parse(today) - Date.parse(created)) / DAY)))), int(9, 18), int(0, 59))])
      }
    }
  }

  /* ---- worklogs: ~13 weeks of weekdays ---- */
  const firstWeek = monday(add(today, -84))
  const daily = new Map()
  let logs = 0
  for (const u of people) {
    for (let d = firstWeek; d <= today; d = add(d, 1)) {
      if (dow(d) === 0 || dow(d) === 6) { if (!chance(0.05)) continue }
      if (chance(0.06)) continue // a day off
      const mine = tasks.filter(t => t.assignee === u && t.created <= d && (!t.doneAt || t.doneAt >= d) && t.status !== 'todo')
      if (!mine.length) continue
      let left = int(5, 9) * 60
      for (const t of [...mine].sort(() => rnd() - 0.5).slice(0, int(1, 3))) {
        const minutes = Math.min(left, pick([30, 45, 60, 90, 120, 150, 180, 240]))
        if (minutes <= 0) break
        left -= minutes
        await q(`INSERT INTO worklogs (workspace_id, project_id, task_id, user_id, work_date, minutes, comment, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`, [W, t.project.id, t.id, u, d, minutes, pick(LOG_NOTES), at(d, 17, int(0, 59))])
        logs++
        daily.set(`${u}:${t.project.id}`, true)
      }
    }
  }

  /* ---- timesheet approvals ---- */
  let periods = 0
  const thisWeek = monday(today)
  for (const p of projects.filter(x => x.approval)) {
    const approver = p.lead
    for (const u of p.team) {
      if (!daily.get(`${u}:${p.id}`)) continue
      const reviewer = u === approver ? (p.team.find(x => x !== u) ?? approver) : approver
      if (p.approval === 'week') {
        for (let s = firstWeek; s < thisWeek; s = add(s, 7)) {
          const last = add(s, 7) === thisWeek
          const status = last ? pick(['submitted', 'submitted', 'rejected', 'open']) : chance(0.92) ? 'approved' : 'open'
          if (status === 'open') continue
          await q(`INSERT INTO timesheet_periods (workspace_id, project_id, user_id, period_start, period_end, period, status, submitted_at, reviewer_id, reviewed_at, comment)
                   VALUES ($1, $2, $3, $4, $5, 'week', $6, $7, $8, $9, $10)`,
            [W, p.id, u, s, add(s, 6), status, at(add(s, 7), 9), status === 'submitted' ? null : reviewer,
              status === 'submitted' ? null : at(add(s, 8), 11), status === 'rejected' ? 'Please split the review hours from implementation.' : ''])
          periods++
        }
      } else {
        for (let m = new Date(`${firstWeek.slice(0, 7)}-01T00:00:00Z`); ; m.setUTCMonth(m.getUTCMonth() + 1)) {
          const s = m.toISOString().slice(0, 10)
          if (s >= `${today.slice(0, 7)}-01`) break
          const end = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
          await q(`INSERT INTO timesheet_periods (workspace_id, project_id, user_id, period_start, period_end, period, status, submitted_at, reviewer_id, reviewed_at)
                   VALUES ($1, $2, $3, $4, $5, 'month', 'approved', $6, $7, $8)`, [W, p.id, u, s, end, at(add(end, 1)), reviewer, at(add(end, 3))])
          periods++
        }
      }
    }
  }

  /* ---- calendar: three weeks back, four ahead ---- */
  let events = 0
  for (let d = add(monday(today), -21); d <= add(monday(today), 34); d = add(d, 1)) {
    if (dow(d) === 0 || dow(d) === 6) continue
    const todays = [EVENTS[0], ...[...EVENTS.slice(1)].sort(() => rnd() - 0.5).slice(0, int(1, 3))]
    for (const [title, kind, start, dur] of todays) {
      const p = chance(0.6) ? pick(projects) : null
      const [e] = await q(`INSERT INTO events (workspace_id, title, date, start_min, dur_min, location, kind, hue, project_id, created_by)
                           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [W, p && title !== 'Daily standup' ? `${title} · ${p.name.split(' ')[0]}` : title, d, start, dur,
          pick(['Video call', 'Room 3B', 'Lounge', 'Video call']), kind, p?.hue ?? pick(HUES), p?.id ?? null, owner.id])
      const who = new Set([owner.id, ...others.filter(() => chance(0.35))])
      for (const u of who) await q(`INSERT INTO event_attendees (event_id, user_id) VALUES ($1, $2)`, [e.id, u])
      events++
    }
    if (d === add(monday(today), 3)) {
      await q(`INSERT INTO events (workspace_id, title, date, start_min, dur_min, location, kind, hue, project_id, created_by)
               VALUES ($1, 'Billing beta goes live', $2, 600, 30, $3, 'milestone', 'green', $4, $5)`, [W, d, 'Everywhere', projects[3].id, owner.id])
    }
  }

  /* ---- focus sessions for the owner ---- */
  for (let d = add(today, -30); d < today; d = add(d, 1)) {
    if (dow(d) === 0 || dow(d) === 6) continue
    for (let s = 0, n = int(0, 3); s < n; s++) {
      const planned = pick([25, 25, 50]) * 60
      const start = at(d, 9 + s * 2, int(0, 30))
      const t = pick(tasks.filter(x => x.assignee === owner.id))
      await q(`INSERT INTO focus_sessions (workspace_id, user_id, task_id, label, planned_sec, actual_sec, started_at, ended_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [W, owner.id, t?.id ?? null, 'Deep work', planned, planned - int(0, 300), start, new Date(start.getTime() + planned * 1000)])
    }
  }

  /* ---- notifications for the owner ---- */
  const notes = [
    ['assigned', 'assigned you “Offline sync for drafts”'], ['mention', 'mentioned you on “Token audit”'],
    ['timesheet', 'submitted their hours for Orbit mobile app'], ['timesheet', 'submitted their hours for Billing platform'],
    ['due', 'Release notes for 2.4 is due tomorrow'], ['meeting', 'Sprint planning starts in 10 minutes'],
    ['mention', 'mentioned you on “Invoice PDF redesign”'], ['assigned', 'assigned you “Launch landing page”'],
    ['timesheet', 'approved your hours for Design system 2.0'], ['mention', 'mentioned you on “Webhook retries”'],
  ]
  for (const [i, [kind, text]] of notes.entries()) {
    await q(`INSERT INTO notifications (workspace_id, recipient_id, actor_id, kind, payload, read_at, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, now() - ($7 || ' minutes')::interval)`,
      [W, owner.id, kind === 'due' || kind === 'meeting' ? null : pick(others), kind, { text, demo: true }, i < 4 ? null : new Date(), i * 95 + 7])
  }

  await db.query('COMMIT')
  console.log(JSON.stringify({ workspace: W, people: people.length, projects: projects.length, tasks: tasks.length, worklogs: logs, periods, events }))
} catch (e) {
  await db.query('ROLLBACK')
  console.error(e.message)
  process.exitCode = 1
} finally {
  await db.end()
}
