import { PERMISSION_LABELS } from '../lib/access'
import { offset } from '../lib/date'
import type { CalEvent, Data, Hue, Notice, Permission, Person, Priority, Project, Status, Task } from './types'

export const DATA_VERSION = 4

/** The sample team, also drawn on the sign-in showcase. */
export const people: Person[] = [
  { id: 'lin', name: 'Lin Zhao', role: 'Product Lead', team: 'Product', city: 'London', tz: 'Europe/London', presence: 'online', capacity: 32, email: 'lin@pane.app', skin: 1 },
  { id: 'nia', name: 'Nia Okoro', role: 'Design Lead', team: 'Design', city: 'Lagos', tz: 'Africa/Lagos', presence: 'focus', note: 'until 11:30 AM', capacity: 32, email: 'nia@pane.app', skin: 4 },
  { id: 'elise', name: 'Elise Marchand', role: 'Product Designer', team: 'Design', city: 'Lyon', tz: 'Europe/Paris', presence: 'online', capacity: 36, email: 'elise@pane.app', skin: 0 },
  { id: 'kwame', name: 'Kwame Asante', role: 'iOS Engineer', team: 'Engineering', city: 'Accra', tz: 'Africa/Accra', presence: 'meeting', note: 'Tide sync review', capacity: 36, email: 'kwame@pane.app', skin: 5 },
  { id: 'peter', name: 'Peter Lund', role: 'Engineering Manager', team: 'Engineering', city: 'Copenhagen', tz: 'Europe/Copenhagen', presence: 'online', capacity: 28, email: 'peter@pane.app', skin: 0 },
  { id: 'freya', name: 'Freya Nilsen', role: 'Brand Designer', team: 'Design', city: 'Bergen', tz: 'Europe/Oslo', presence: 'away', capacity: 32, email: 'freya@pane.app', skin: 0 },
  { id: 'omar', name: 'Omar Saleh', role: 'Backend Engineer', team: 'Engineering', city: 'Amman', tz: 'Asia/Amman', presence: 'focus', note: 'until 11:30 AM', capacity: 36, email: 'omar@pane.app', skin: 2 },
  { id: 'haruto', name: 'Haruto Sato', role: 'Frontend Engineer', team: 'Engineering', city: 'Tokyo', tz: 'Asia/Tokyo', presence: 'online', capacity: 36, email: 'haruto@pane.app', skin: 1 },
  { id: 'ines', name: 'Inés Duarte', role: 'Marketing Lead', team: 'Marketing', city: 'Lisbon', tz: 'Europe/Lisbon', presence: 'meeting', note: 'Marketing sync', capacity: 32, email: 'ines@pane.app', skin: 2 },
  { id: 'vikram', name: 'Vikram Nair', role: 'Data Analyst', team: 'Product', city: 'Bengaluru', tz: 'Asia/Kolkata', presence: 'online', capacity: 32, email: 'vikram@pane.app', skin: 3 },
  { id: 'camila', name: 'Camila Ortiz', role: 'Content Strategist', team: 'Marketing', city: 'Mexico City', tz: 'America/Mexico_City', presence: 'away', capacity: 28, email: 'camila@pane.app', skin: 2 },
  { id: 'malik', name: 'Malik Johnson', role: 'QA Engineer', team: 'Engineering', city: 'Atlanta', tz: 'America/New_York', presence: 'away', capacity: 36, email: 'malik@pane.app', skin: 4 },
]

const projects: Omit<Project, 'roles' | 'defaultRole'>[] = [
  {
    id: 'tide', name: 'Tide mobile app', hue: 'blue', icon: 'phone', status: 'progress',
    desc: 'The 3.0 rebuild of the Tide app: new home, offline sync and a calmer onboarding.',
    start: offset(-48), due: offset(40), lead: 'kwame', members: ['kwame', 'haruto', 'elise', 'malik', 'lin', 'omar'], pinned: true, starred: true,
    milestones: [
      { id: 'm1', title: 'New home shipped to beta', due: offset(-14), done: true },
      { id: 'm2', title: 'Offline sync in beta', due: offset(6), done: false },
      { id: 'm3', title: '3.0 in the App Store', due: offset(40), done: false },
    ],
  },
  {
    id: 'facet', name: 'Facet design system', hue: 'pink', icon: 'grid', status: 'progress',
    desc: 'One set of tokens, components and docs for every Pane surface, light and dark.',
    start: offset(-60), due: offset(60), lead: 'nia', members: ['nia', 'elise', 'haruto', 'freya'], pinned: false, starred: false,
    milestones: [
      { id: 'm1', title: 'Tokens v1 locked', due: offset(-20), done: true },
      { id: 'm2', title: 'Docs site live', due: offset(18), done: false },
      { id: 'm3', title: 'All surfaces migrated', due: offset(60), done: false },
    ],
  },
  {
    id: 'orbit', name: 'Orbit 2.0 launch', hue: 'purple', icon: 'rocket', status: 'progress',
    desc: 'Everything the public sees on launch day: site, film, press kit and the waitlist email.',
    start: offset(-30), due: offset(12), lead: 'ines', members: ['ines', 'camila', 'freya', 'vikram', 'lin'], pinned: true, starred: true,
    milestones: [
      { id: 'm1', title: 'Messaging locked', due: offset(-14), done: true },
      { id: 'm2', title: 'Launch film final cut', due: offset(4), done: false },
      { id: 'm3', title: 'Launch day', due: offset(12), done: false },
    ],
  },
  {
    id: 'sprout', name: 'Sprout onboarding', hue: 'green', icon: 'leaf', status: 'review',
    desc: 'A first-week path that gets new teams to their first finished project.',
    start: offset(-40), due: offset(5), lead: 'lin', members: ['lin', 'elise', 'omar', 'vikram'], pinned: false, starred: false,
    milestones: [
      { id: 'm1', title: 'Flow prototype', due: offset(-25), done: true },
      { id: 'm2', title: 'Experiment live', due: offset(-8), done: true },
      { id: 'm3', title: 'Read-out to leadership', due: offset(5), done: false },
    ],
  },
  {
    id: 'q4', name: 'Q4 brand campaign', hue: 'orange', icon: 'flame', status: 'planning',
    desc: 'Out-of-home and social for the winter season, built around “work you can see through”.',
    start: offset(-6), due: offset(68), lead: 'freya', members: ['freya', 'camila', 'ines', 'nia'], pinned: false, starred: false,
    milestones: [
      { id: 'm1', title: 'Creative brief', due: offset(10), done: false },
      { id: 'm2', title: 'Shoot wrapped', due: offset(40), done: false },
      { id: 'm3', title: 'Campaign live', due: offset(68), done: false },
    ],
  },
  {
    id: 'north', name: 'Northstar analytics', hue: 'teal', icon: 'chart', status: 'shipped',
    desc: 'One trusted metric per team and a weekly digest everyone actually opens.',
    start: offset(-90), due: offset(-12), lead: 'vikram', members: ['vikram', 'omar', 'peter'], pinned: false, starred: false,
    milestones: [
      { id: 'm1', title: 'Metric definitions agreed', due: offset(-60), done: true },
      { id: 'm2', title: 'Digest in every inbox', due: offset(-30), done: true },
      { id: 'm3', title: 'Dashboards retired', due: offset(-12), done: true },
    ],
  },
]

// [title, project, assignee, status, priority, due offset, estimate h, subtasks done/total, comment]
type Row = [string, string, string, Status, Priority, number, number, [number, number]?, string?]

const rows: Row[] = [
  // To do
  ['Moodboard round one', 'q4', 'camila', 'todo', 'medium', 52, 8, undefined, 'ines|Can we pair on this tomorrow?'],
  ['Media plan budget', 'q4', 'ines', 'todo', 'medium', 28, 6],
  ['Agency shortlist', 'q4', 'freya', 'todo', 'medium', 47, 4, [1, 3]],
  ['Campaign line options', 'q4', 'camila', 'todo', 'high', 33, 5],
  ['Photography call sheet', 'q4', 'freya', 'todo', 'urgent', 3, 3, undefined, 'camila|Location is confirmed for Saturday.'],
  ['Launch-day run of show', 'orbit', 'ines', 'todo', 'high', 5, 4],
  ['Founder blog post', 'orbit', 'camila', 'todo', 'high', 3, 6, [1, 3], 'lin|Keep it under 800 words.'],
  ['Menu + context menu', 'facet', 'haruto', 'todo', 'medium', 23, 8],
  ['Avatar stack', 'facet', 'haruto', 'todo', 'medium', 24, 3],
  ['Image cache eviction', 'tide', 'kwame', 'todo', 'high', 0, 5, [1, 3]],
  ['Pull-to-refresh spring', 'tide', 'elise', 'todo', 'high', 0, 3, undefined, 'kwame|Try the 0.8 damping we used on 2.4.'],
  ['Approve Orbit press kit', 'orbit', 'lin', 'todo', 'urgent', 0, 1],
  ['Reply to Facet token questions', 'facet', 'lin', 'todo', 'medium', 0, 1],
  ['Plan next sprint goals', 'tide', 'lin', 'todo', 'medium', 0, 2],
  // In progress
  ['Creative brief draft', 'q4', 'freya', 'progress', 'medium', 22, 6, [2, 3]],
  ['Day-3 nudge email', 'sprout', 'elise', 'progress', 'urgent', 2, 3, undefined, 'lin|Subject line options in the doc.'],
  ['Partner quotes sign-off', 'orbit', 'ines', 'progress', 'high', 1, 2],
  ['Motion guidelines page', 'facet', 'nia', 'progress', 'medium', 6, 5],
  ['Crash on cold launch in iOS 18', 'tide', 'omar', 'progress', 'medium', 14, 4, [2, 3], 'malik|Repro steps attached.'],
  ['Component usage analytics', 'facet', 'vikram', 'progress', 'medium', 17, 6, [2, 3], 'nia|Count per surface please.'],
  ['Settings search', 'tide', 'haruto', 'progress', 'medium', 4, 5],
  ['Onboarding copy review', 'sprout', 'camila', 'progress', 'high', 24, 2],
  ['Review Tide release checklist', 'tide', 'lin', 'progress', 'high', 0, 2],
  ['Write Sprout read-out summary', 'sprout', 'lin', 'progress', 'high', 0, 3],
  // In review
  ['Invite flow friction log', 'sprout', 'lin', 'review', 'urgent', 0, 2],
  ['Pricing page FAQ', 'orbit', 'camila', 'review', 'medium', 7, 3, undefined, 'ines|Add the annual plan question.'],
  ['Product Hunt assets', 'orbit', 'freya', 'review', 'high', 2, 4, [2, 3]],
  ['Read-out deck', 'sprout', 'vikram', 'review', 'high', 0, 4, [2, 3]],
  ['Date picker', 'facet', 'elise', 'review', 'medium', 10, 6, [2, 3]],
  ['Push notification permissions flow', 'tide', 'kwame', 'review', 'urgent', 24, 3],
  ['Token export to iOS', 'facet', 'nia', 'review', 'urgent', 22, 4],
  ['Accessibility audit: Dynamic Type', 'tide', 'malik', 'review', 'medium', 24, 5],
  // Done
  ['Share sprint notes', 'facet', 'lin', 'done', 'low', 0, 1],
  ['Answer Kwame on the sync edge case', 'tide', 'lin', 'done', 'medium', 0, 1],
  ['Build offline queue for edits', 'tide', 'omar', 'done', 'high', -9, 8, [3, 3]],
  ['Profile screen empty states', 'tide', 'elise', 'done', 'medium', -10, 3, [1, 3]],
  ['Haptics pass on the tab bar', 'tide', 'kwame', 'done', 'low', -10, 2],
  ['Write release notes for 3.0', 'tide', 'malik', 'done', 'medium', -14, 2, undefined, 'lin|Looks great.'],
  ['Activation funnel dashboard', 'sprout', 'vikram', 'done', 'high', -14, 6, undefined, 'lin|Shipping this to the digest.'],
  ['Template gallery picks', 'sprout', 'elise', 'done', 'medium', -14, 3, [3, 3]],
  ['Color tokens audit', 'facet', 'nia', 'done', 'high', -1, 4],
  ['Button states spec', 'facet', 'elise', 'done', 'medium', -2, 3],
  ['Waitlist email draft', 'orbit', 'camila', 'done', 'high', -1, 3],
  ['Launch site hero copy', 'orbit', 'ines', 'done', 'high', -2, 2],
  ['Storyboard for launch film', 'orbit', 'freya', 'done', 'high', -3, 6],
  ['Sync conflict banner', 'tide', 'haruto', 'done', 'medium', -1, 3],
  ['Background fetch budget', 'tide', 'omar', 'done', 'medium', -2, 4],
  ['Welcome checklist copy', 'sprout', 'camila', 'done', 'low', -4, 2],
  ['Segment new teams by size', 'sprout', 'vikram', 'done', 'medium', -5, 3],
  ['Icon grid and keylines', 'facet', 'freya', 'done', 'medium', -6, 4],
  ['Spacing scale', 'facet', 'nia', 'done', 'medium', -7, 2],
  ['TestFlight group cleanup', 'tide', 'malik', 'done', 'low', -7, 1],
  ['Weekly digest template', 'north', 'vikram', 'done', 'high', -16, 4],
  ['Metric definitions doc', 'north', 'vikram', 'done', 'high', -40, 5],
  ['Event pipeline backfill', 'north', 'omar', 'done', 'high', -30, 8],
  ['Retire old dashboards', 'north', 'peter', 'done', 'medium', -13, 2],
  ['Digest open-rate alert', 'north', 'omar', 'done', 'medium', -20, 3],
  ['Owner per metric', 'north', 'peter', 'done', 'low', -25, 1],
  ['Press list', 'orbit', 'ines', 'done', 'medium', -8, 2],
  ['Interview five new teams', 'sprout', 'lin', 'done', 'high', -11, 6],
]

const SUB_NAMES = ['Draft', 'Review with the team', 'Ship it']

function buildTasks(): Task[] {
  return rows.map((r, i) => {
    const [title, project, assignee, status, priority, due, estimate, subs, comment] = r
    const subtasks = subs
      ? Array.from({ length: subs[1] }, (_, k) => ({ id: `s${k}`, title: SUB_NAMES[k] ?? `Step ${k + 1}`, done: k < subs[0] }))
      : []
    const comments = comment
      ? [{ id: 'c0', who: comment.split('|')[0], text: comment.split('|')[1], at: Date.now() - (i % 5 + 1) * 3_600_000 * 20 }]
      : []
    return {
      id: `t${i + 1}`,
      title, project, assignee, status, priority,
      due: offset(due),
      estimate,
      subtasks,
      comments,
      doneAt: status === 'done' ? offset(Math.min(0, due)) : undefined,
      order: i,
    }
  })
}

// [title, day offset, start "H:MM" 24h, minutes, where, kind, hue, project, people]
type ERow = [string, number, string, number, string, CalEvent['kind'], Hue, string | undefined, string[]]

const evRows: ERow[] = [
  ['Stand-up', 0, '9:30', 15, 'Huddle room', 'meeting', 'indigo', undefined, ['lin', 'kwame', 'haruto', 'elise', 'omar']],
  ['Tide sync review', 0, '11:00', 45, 'Video call', 'review', 'blue', 'tide', ['lin', 'kwame', 'omar', 'haruto']],
  ['Lunch & learn: glass materials', 0, '12:30', 60, 'Kitchen', 'team', 'pink', 'facet', ['nia', 'elise', 'freya', 'lin', 'haruto']],
  ['Deep work', 0, '14:00', 90, 'Focus block', 'focus', 'purple', undefined, ['lin']],
  ['Orbit launch film cut', 0, '16:00', 30, 'Studio B', 'review', 'purple', 'orbit', ['ines', 'freya', 'camila', 'lin']],
  ['Stand-up', 1, '9:30', 15, 'Huddle room', 'meeting', 'indigo', undefined, ['lin', 'kwame', 'haruto', 'elise', 'omar']],
  ['Design critique', 1, '10:00', 50, 'Studio A', 'review', 'pink', 'facet', ['nia', 'elise', 'lin']],
  ['1:1 Peter', 1, '13:00', 30, 'Video call', 'meeting', 'indigo', undefined, ['lin', 'peter']],
  ['Sprout read-out prep', 1, '15:00', 45, 'Room 3', 'meeting', 'green', 'sprout', ['lin', 'vikram', 'elise']],
  ['Stand-up', 2, '9:30', 15, 'Huddle room', 'meeting', 'indigo', undefined, ['lin', 'kwame', 'haruto', 'elise', 'omar']],
  ['Offline sync demo', 2, '11:00', 45, 'Video call', 'call', 'blue', 'tide', ['omar', 'kwame', 'lin']],
  ['Deep work', 2, '14:00', 120, 'Focus block', 'focus', 'purple', undefined, ['lin']],
  ['Customer call: Harbor Co', -2, '14:00', 45, 'Video call', 'call', 'green', 'sprout', ['lin', 'vikram']],
  ['Retro', -1, '16:00', 45, 'Room 3', 'team', 'indigo', undefined, ['lin', 'kwame', 'haruto', 'elise', 'omar', 'malik']],
  ['Kickoff: Q4 campaign', -16, '10:00', 60, 'Studio A', 'meeting', 'orange', 'q4', ['freya', 'camila', 'ines', 'lin']],
  ['Metrics review', -12, '11:00', 45, 'Video call', 'review', 'teal', 'north', ['vikram', 'peter', 'lin']],
  ['Design council', -5, '15:00', 60, 'Studio A', 'review', 'pink', 'facet', ['nia', 'elise', 'lin']],
  ['Brand review', 5, '10:00', 60, 'Studio B', 'review', 'orange', 'q4', ['freya', 'ines', 'lin']],
  ['Team lunch', 5, '12:30', 60, 'Kitchen', 'team', 'orange', undefined, ['lin', 'nia', 'kwame', 'ines']],
  ['Stand-up', 6, '9:30', 15, 'Huddle room', 'meeting', 'indigo', undefined, ['lin', 'kwame', 'haruto']],
  ['Launch film review', 6, '14:00', 45, 'Studio B', 'review', 'purple', 'orbit', ['ines', 'freya', 'lin']],
  ['Sprout readout', 7, '11:00', 60, 'Board room', 'meeting', 'green', 'sprout', ['lin', 'vikram', 'peter']],
  ['Offline sync retro', 8, '15:00', 45, 'Video call', 'team', 'blue', 'tide', ['kwame', 'omar', 'lin']],
  ['Quarterly planning', 9, '10:00', 120, 'Board room', 'meeting', 'indigo', undefined, ['lin', 'peter', 'nia', 'ines']],
]

function buildEvents(): CalEvent[] {
  return evRows.map((r, i) => {
    const [title, day, start, dur, where, kind, hue, project, ppl] = r
    const [h, m] = start.split(':').map(Number)
    return { id: `e${i + 1}`, title, date: offset(day), start: h * 60 + m, dur, where, kind, hue, project, people: ppl }
  })
}

function buildNotices(): Notice[] {
  const now = Date.now()
  return [
    { id: 'n1', who: 'nia', text: 'mentioned you on “Glass material tokens”', at: now - 19 * 60_000, read: false },
    { id: 'n2', who: 'kwame', text: 'asked for your review on “Accessibility audit: Dynamic Type”', at: now - 60 * 60_000, read: false },
    { id: 'n3', who: 'ines', text: 'Orbit launch film cut is ready to watch', at: now - 3 * 60 * 60_000, read: false },
    { id: 'n4', who: 'peter', text: 'moved your 1:1 to tomorrow, 1:00 PM', at: now - 26 * 60 * 60_000, read: true },
  ]
}

export function buildSeed(): Data {
  return {
    version: DATA_VERSION,
    me: 'lin',
    people,
    // The demo runs as owner: everyone on Member, every permission on every project.
    projects: projects.map(p => ({ ...p, roles: Object.fromEntries(p.members.map(m => [m, 'member'])), defaultRole: 'member' })),
    tasks: buildTasks(),
    events: buildEvents(),
    notices: buildNotices(),
    focus: [
      { date: offset(0), minutes: 66 },
      { date: offset(-1), minutes: 95 },
      { date: offset(-2), minutes: 50 },
    ],
    prefs: { notify: { mentions: true, due: true, meetings: true, digest: false, focus: true }, session: 25, pause: 5 },
    roles: [
      { id: 'administrator', key: 'administrator', name: 'Administrator', description: '', permissions: ALL },
      { id: 'member', key: 'member', name: 'Member', description: '', permissions: ALL.filter(p => MEMBER.includes(p)) },
      { id: 'viewer', key: 'viewer', name: 'Viewer', description: '', permissions: ['project.browse', 'comments.add'] },
    ],
    access: Object.fromEntries(projects.map(p => [p.id, ALL])),
  }
}

const ALL = Object.keys(PERMISSION_LABELS) as Permission[]
const MEMBER: Permission[] = ['project.browse', 'comments.add', 'tasks.create', 'tasks.edit_any', 'tasks.delete_any', 'tasks.assign', 'tasks.transition', 'time.log', 'time.edit_own', 'time.delete_own']

/** Deterministic pseudo-random numbers, so charts look the same on every load. */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
