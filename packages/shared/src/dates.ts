// Date/time display (T-204). Locale-aware Intl output differs between Node's and
// the browser's ICU data (notably for `uz`), which breaks hydration, so the
// UI uses one fixed numeric format in the store's time zone instead.

/** Store time zone (architecture §8.2, APP_TIMEZONE). */
export const STORE_TIME_ZONE = 'Asia/Tashkent';

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** "23.10.2026 14:05" — `DD.MM.YYYY HH:mm` in the given zone (default: the store's). */
export function formatDateTime(date: Date, timeZone: string = STORE_TIME_ZONE): string {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
}
