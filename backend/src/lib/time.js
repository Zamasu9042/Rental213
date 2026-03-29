import { HttpError } from "./errors.js";

export function parseDateInput(value, fieldName) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, `Invalid ${fieldName}.`);
  }
  return parsed;
}

export function ensureValidWindow(startInput, endInput) {
  const start = parseDateInput(startInput, "startTime");
  const end = parseDateInput(endInput, "endTime");
  if (end <= start) {
    throw new HttpError(400, "endTime must be after startTime.");
  }
  return { start, end };
}

export function overlaps(aStartInput, aEndInput, bStartInput, bEndInput) {
  const aStart = new Date(aStartInput).getTime();
  const aEnd = new Date(aEndInput).getTime();
  const bStart = new Date(bStartInput).getTime();
  const bEnd = new Date(bEndInput).getTime();

  if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) {
    return false;
  }

  return aStart < bEnd && aEnd > bStart;
}

export function formatIso(value) {
  return new Date(value).toISOString();
}

export function formatWindowLabel(startInput, endInput) {
  const start = new Date(startInput);
  const end = new Date(endInput);
  return `${start.toLocaleString()} - ${end.toLocaleString()}`;
}

export function addDays(baseDate, days, hour, minute = 0) {
  const result = new Date(baseDate);
  result.setDate(result.getDate() + days);
  result.setHours(hour, minute, 0, 0);
  return result.toISOString();
}
