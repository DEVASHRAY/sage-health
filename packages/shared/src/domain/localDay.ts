/**
 * Calendar-day arithmetic for a device whose UTC offset is known but whose time zone is not.
 *
 * `tzOffsetMinutes` follows `Date.prototype.getTimezoneOffset()`: UTC minus local, so India is
 * -330. A single offset cannot represent a daylight-saving change in the middle of a history;
 * days on the far side of a switch may be attributed an hour off. That is an accepted limit of
 * an offset-based contract.
 */

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

function shiftToLocal(instant: Date, tzOffsetMinutes: number): Date {
  return new Date(instant.getTime() - tzOffsetMinutes * MS_PER_MINUTE);
}

/** The local calendar date (`YYYY-MM-DD`) on which `instant` falls. */
export function localDateOf(instant: Date, tzOffsetMinutes: number): string {
  return shiftToLocal(instant, tzOffsetMinutes).toISOString().slice(0, 10);
}

/** The local hour (0-23) of `instant`. */
export function localHourOf(instant: Date, tzOffsetMinutes: number): number {
  return shiftToLocal(instant, tzOffsetMinutes).getUTCHours();
}

export interface InstantRange {
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
}

/** The UTC instants that bound one local calendar day. */
export function localDayRange(date: string, tzOffsetMinutes: number): InstantRange {
  const startMs = Date.parse(`${date}T00:00:00.000Z`) + tzOffsetMinutes * MS_PER_MINUTE;
  if (Number.isNaN(startMs)) throw new RangeError(`not a calendar date: ${date}`);
  return { start: new Date(startMs), end: new Date(startMs + MS_PER_DAY) };
}

/** Adds (or subtracts) whole days to a `YYYY-MM-DD` date. */
export function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(ms)) throw new RangeError(`not a calendar date: ${date}`);
  return new Date(ms + days * MS_PER_DAY).toISOString().slice(0, 10);
}
