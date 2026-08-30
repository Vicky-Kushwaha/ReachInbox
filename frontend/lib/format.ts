/** Turns "john.smith@x.com" into "John Smith" for a friendlier list display. */
export function prettifyRecipientName(email: string): string {
  const local = email.split("@")[0] || email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0 || parts.some((p) => /^\d+$/.test(p))) return email;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

export function initialsFor(nameOrEmail: string): string {
  const source = prettifyRecipientName(nameOrEmail);
  const parts = source.split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-fuchsia-500",
];

export function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** Short badge-style date, e.g. "Tue 9:15 AM" */
export function formatBadgeDate(iso: string): string {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${weekday} ${time}`;
}

/** Longer date for detail views, e.g. "Nov 3, 10:23 AM" */
export function formatFullDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
