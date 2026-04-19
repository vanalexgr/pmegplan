export interface FormatClockOptions {
  separator?: ":" | "h";
  padHour?: boolean;
}

const CLOCK_RE = /^(\d{1,2})(?::|h)(\d{2})$/i;
const TOTAL_CLOCK_MINUTES = 12 * 60;

export function parseClockFraction(clockText: string): number {
  const trimmed = clockText.trim();
  const match = CLOCK_RE.exec(trimmed);

  if (!match) {
    throw new Error("Clock must use H:MM, HH:MM, HhMM, or HHhMM.");
  }

  const hourText = match[1];
  const minuteText = match[2];
  if (hourText === undefined || minuteText === undefined) {
    throw new Error("Clock must include hour and minute.");
  }

  const rawHour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);

  if (!Number.isInteger(rawHour) || rawHour < 0 || rawHour > 12) {
    throw new Error("Clock hour must be between 0 and 12.");
  }

  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error("Clock minutes must be between 0 and 59.");
  }

  const hour = rawHour === 12 ? 0 : rawHour;
  return (hour * 60 + minute) / TOTAL_CLOCK_MINUTES;
}

export function isValidClockText(clockText: string): boolean {
  try {
    parseClockFraction(clockText);
    return true;
  } catch {
    return false;
  }
}

export function formatClockFraction(
  clockFraction: number,
  options: FormatClockOptions = {},
): string {
  const separator = options.separator ?? ":";
  const padHour = options.padHour ?? false;
  const normalized = ((clockFraction % 1) + 1) % 1;
  const totalMinutes =
    Math.round(normalized * TOTAL_CLOCK_MINUTES) % TOTAL_CLOCK_MINUTES;
  const hourIndex = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const displayHour = hourIndex === 0 ? 12 : hourIndex;
  const hourText = padHour
    ? String(displayHour).padStart(2, "0")
    : String(displayHour);

  return `${hourText}${separator}${String(minute).padStart(2, "0")}`;
}

export function normalizeClockText(
  clockText: string,
  options: FormatClockOptions = {},
): string {
  return formatClockFraction(parseClockFraction(clockText), options);
}

/**
 * Clock text → signed degrees from 12:00.
 * CW (right side) = positive, CCW (left side) = negative.
 * Range: (-180, +180]. e.g. 9:30 → -75°, 2:30 → +75°, 6:00 → +180°.
 */
export function clockTextToDeg(clockText: string): number {
  const deg = parseClockFraction(clockText) * 360;
  return deg > 180 ? deg - 360 : deg;
}

/**
 * Signed degrees → clock text.
 * Accepts (-180, +180]. e.g. -75 → "9:30", +75 → "2:30".
 */
export function degToClockText(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  return formatClockFraction(normalized / 360);
}

export function clockTextToArcMm(clockText: string, circumferenceMm: number): number {
  return parseClockFraction(clockText) * circumferenceMm;
}

export function arcMmToClockText(
  arcMm: number,
  circumferenceMm: number,
  options: FormatClockOptions = {},
): string {
  if (!Number.isFinite(circumferenceMm) || circumferenceMm <= 0) {
    throw new Error("Circumference must be greater than 0.");
  }

  const wrapped = ((arcMm % circumferenceMm) + circumferenceMm) % circumferenceMm;
  return formatClockFraction(wrapped / circumferenceMm, options);
}
