import { useEffect, useState } from 'react'
import type { Project, TimePeriod, TimesheetData, Worklog } from '../data/types'
import { formatMinutes } from '../lib/duration'
import { useStore } from '../store'

export const EMPTY_SHEET: TimesheetData = { worklogs: [], periods: [], tasks: [] }

/** Timesheet data for `user` over [from, to], refetched whenever time changes somewhere I can hear about. */
export function useSheet(from: string, to: string, user: string) {
  const { timesheet, timeTick } = useStore()
  const [sheet, setSheet] = useState<TimesheetData>(EMPTY_SHEET)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    setLoading(true)
    timesheet({ from, to, user })
      .then(s => { if (live) setSheet(s) })
      .catch(() => { if (live) setSheet(EMPTY_SHEET) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [from, to, user, timeTick, timesheet])
  return { sheet, loading }
}

export const sum = (ws: Worklog[]) => ws.reduce((s, w) => s + w.minutes, 0)
/** Blank for an empty day so grids read at a glance. */
export const hm = (m: number) => (m ? formatMinutes(m) : '')

/** Same rule as the server: once approval is off, old rows lock nothing. */
export const locked = (p: Project, periods: TimePeriod[], user: string, day: string) =>
  p.approvalEnabled && periods.some(x => x.project === p.id && x.user === user && x.status !== 'rejected' && x.start <= day && x.end >= day)
