export function nairobiTime(value: string | Date | null | undefined, includeTime = false) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", ...(includeTime ? { timeStyle: "short" as const } : {}) }).format(new Date(value));
}
