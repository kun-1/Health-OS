// Formatting helpers for the expenses UI. The locale is fixed to zh-CN and
// the timezone is fixed to Asia/Shanghai so the server-rendered HTML and the
// client first render produce identical output (avoiding React hydration
// warnings). The app's users are CN-based, so dates/times should always read
// in the local CN calendar — never in the request-time server UTC.
const TIME_ZONE = "Asia/Shanghai";

const clockFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE
});

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TIME_ZONE
});

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE
});

const shortDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE
});

function parse(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatClock(value: string | null): string {
  const d = parse(value);
  return d ? clockFormatter.format(d) : "";
}

export function formatDate(value: string | null): string {
  const d = parse(value);
  return d ? dateFormatter.format(d) : "";
}

export function formatDateTime(value: string | null): string {
  const d = parse(value);
  return d ? dateTimeFormatter.format(d) : "";
}

export function formatShortDateTime(value: string | null): string {
  const d = parse(value);
  return d ? shortDateTimeFormatter.format(d) : "";
}
