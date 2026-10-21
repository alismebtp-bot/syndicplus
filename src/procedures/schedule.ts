/** Disponibilité du gardien selon ses horaires (heure de Paris). */
import type { GuardianConfig } from './config';

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function parisClock(now: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: WEEKDAYS[get('weekday')] ?? 0, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function isOnDuty(g: GuardianConfig | null, now: Date): boolean {
  if (!g) return false;
  if (typeof g.onDutyOverride === 'boolean') return g.onDutyOverride;
  const { day, minutes } = parisClock(now);
  return g.schedule.some((s) => s.days.includes(day) && minutes >= toMinutes(s.start) && minutes < toMinutes(s.end));
}
