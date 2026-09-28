import { BadRequestException } from '@nestjs/common';

const KYIV = 'Europe/Kyiv';

// How far Kyiv's wall clock is ahead of UTC at this instant, in ms: +2h in
// winter, +3h in summer.
function kyivOffset(at: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: KYIV,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return wall - Math.floor(at / 1000) * 1000;
}

// Midnight in Kyiv on that date. The offset has to be the one in force at
// that midnight: on the day clocks change (03:00/04:00) the one at noon is
// already different. First guess with the offset at UTC midnight, then take
// the offset at the guess itself.
function kyivMidnight(y: number, m: number, d: number): number {
  const utc = Date.UTC(y, m - 1, d);
  const guess = utc - kyivOffset(utc);
  return utc - kyivOffset(guess);
}

/**
 * The day a manager means by "28.09", in unix seconds (payment.createdAt is
 * unix seconds): from 00:00:00 to 23:59:59 in Kyiv, whatever the server's own
 * time zone. Using the server's clock put orders after midnight Kyiv time
 * into the previous day whenever the server ran in UTC.
 */
export function kyivDayRange(date: string): { start: number; end: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const [y, m, d] = match ? match.slice(1).map(Number) : [];
  const probe = match ? new Date(Date.UTC(y, m - 1, d)) : null;
  if (!probe || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new BadRequestException('Дата у форматі РРРР-ММ-ДД');
  }
  const start = kyivMidnight(y, m, d) / 1000;
  const next = kyivMidnight(y, m, d + 1) / 1000;
  return { start, end: next - 1 };
}

/** Today's date in Kyiv, yyyy-mm-dd — the report's default. */
export function kyivToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: KYIV }).format(now);
}
