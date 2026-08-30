"use client";

import { Star } from "lucide-react";
import { EmailListItem } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import EmptyState from "./EmptyState";
import Spinner from "./Spinner";

function badgeTimestamp(item: EmailListItem): string | null | undefined {
  if (item.status === "sent" || item.status === "failed") return item.sent_at;
  return item.scheduled_time;
}

export function EmailListRow({
  item,
  onOpen,
  onToggleStar,
}: {
  item: EmailListItem;
  onOpen: () => void;
  onToggleStar: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      className="group flex cursor-pointer items-center gap-4 border-b border-slate-100 px-6 py-3.5 hover:bg-slate-50"
    >
      <span className="w-56 shrink-0 truncate text-sm text-slate-900" title={item.recipient}>
        To: {item.recipient}
      </span>

      <StatusBadge status={item.status} when={badgeTimestamp(item)} />

      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
        <span className="font-medium text-slate-900">{item.subject}</span>
        {item.preview && <span className="text-slate-400"> · {item.preview}</span>}
      </span>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleStar();
        }}
        className="shrink-0 text-slate-300 opacity-0 transition-opacity hover:text-amber-400 group-hover:opacity-100"
        style={item.starred ? { opacity: 1 } : undefined}
        title={item.starred ? "Unstar" : "Star"}
      >
        <Star size={16} fill={item.starred ? "#f59e0b" : "none"} className={item.starred ? "text-amber-500" : ""} />
      </button>
    </div>
  );
}

export function EmailList({
  items,
  loading,
  emptyTitle,
  emptySubtitle,
  onOpen,
  onToggleStar,
}: {
  items: EmailListItem[];
  loading: boolean;
  emptyTitle: string;
  emptySubtitle: string;
  onOpen: (id: number) => void;
  onToggleStar: (id: number) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
        <Spinner /> Loading…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="p-6">
        <EmptyState title={emptyTitle} subtitle={emptySubtitle} />
      </div>
    );
  }
  return (
    <div>
      {items.map((item) => (
        <EmailListRow
          key={item.id}
          item={item}
          onOpen={() => onOpen(item.id)}
          onToggleStar={() => onToggleStar(item.id)}
        />
      ))}
    </div>
  );
}