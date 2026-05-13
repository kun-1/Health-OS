export function localDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

export function dateRange(endDate: string, rangeDays: number) {
  const start = addDays(endDate, -(rangeDays - 1));
  const dates: string[] = [];
  for (let date = start; date <= endDate; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

export function clampRangeDays(value: unknown) {
  const parsed = Number(value ?? 28);
  if (!Number.isInteger(parsed)) {
    return 28;
  }
  if (![14, 28, 56, 84].includes(parsed)) {
    return 28;
  }
  return parsed;
}

export function previousDateRange(startDate: string, rangeDays: number) {
  const end = addDays(startDate, -1);
  const start = addDays(end, -(rangeDays - 1));
  return { start, end };
}
