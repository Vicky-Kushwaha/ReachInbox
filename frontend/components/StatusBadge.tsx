import { Clock } from "lucide-react";
import { EmailStatus } from "@/lib/types";
import { formatBadgeDate } from "@/lib/format";

export default function StatusBadge({ status, when }: { status: EmailStatus; when?: string | null }) {
  if (status === "sent") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        Sent{when ? ` · ${formatBadgeDate(when)}` : ""}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
        Failed{when ? ` · ${formatBadgeDate(when)}` : ""}
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-400">
        Cancelled
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-600">
        <Clock size={12} /> Sending…
      </span>
    );
  }
  // scheduled | rescheduled
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
      <Clock size={12} />
      {when ? formatBadgeDate(when) : "Scheduled"}
    </span>
  );
}