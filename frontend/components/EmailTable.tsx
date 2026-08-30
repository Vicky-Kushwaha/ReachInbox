"use client";

import { EmailStatus, ScheduledEmail, SentEmail } from "@/lib/types";
import EmptyState from "./EmptyState";
import Spinner from "./Spinner";

const statusStyles: Record<EmailStatus, string> = {
  scheduled: "bg-blue-50 text-blue-700",
  rescheduled: "bg-amber-50 text-amber-700",
  processing: "bg-purple-50 text-purple-700",
  sent: "bg-green-50 text-green-700",
  failed: "bg-red-50 text-red-700",
};

function StatusBadge({ status }: { status: EmailStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusStyles[status]}`}>
      {status}
    </span>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TableShell({
  loading,
  isEmpty,
  emptyTitle,
  emptySubtitle,
  children,
}: {
  loading: boolean;
  isEmpty: boolean;
  emptyTitle: string;
  emptySubtitle: string;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
        <Spinner /> Loading…
      </div>
    );
  }
  if (isEmpty) {
    return <EmptyState title={emptyTitle} subtitle={emptySubtitle} />;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function ScheduledEmailTable({ emails, loading }: { emails: ScheduledEmail[]; loading: boolean }) {
  return (
    <TableShell
      loading={loading}
      isEmpty={emails.length === 0}
      emptyTitle="No scheduled emails yet"
      emptySubtitle="Click “Compose New Email” to schedule your first send."
    >
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-4 py-3 font-medium">Email</th>
          <th className="px-4 py-3 font-medium">Subject</th>
          <th className="px-4 py-3 font-medium">Scheduled Time</th>
          <th className="px-4 py-3 font-medium">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {emails.map((e) => (
          <tr key={e.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 text-slate-900">{e.recipient}</td>
            <td className="max-w-xs truncate px-4 py-3 text-slate-600">{e.subject}</td>
            <td className="px-4 py-3 text-slate-600">{formatDateTime(e.scheduled_time)}</td>
            <td className="px-4 py-3">
              <StatusBadge status={e.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

export function SentEmailTable({ emails, loading }: { emails: SentEmail[]; loading: boolean }) {
  return (
    <TableShell
      loading={loading}
      isEmpty={emails.length === 0}
      emptyTitle="No sent emails yet"
      emptySubtitle="Once your scheduled emails go out, they’ll show up here with delivery status."
    >
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-4 py-3 font-medium">Email</th>
          <th className="px-4 py-3 font-medium">Subject</th>
          <th className="px-4 py-3 font-medium">Sent Time</th>
          <th className="px-4 py-3 font-medium">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {emails.map((e) => (
          <tr key={e.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 text-slate-900">{e.recipient}</td>
            <td className="max-w-xs truncate px-4 py-3 text-slate-600">{e.subject}</td>
            <td className="px-4 py-3 text-slate-600">{formatDateTime(e.sent_at)}</td>
            <td className="px-4 py-3">
              <StatusBadge status={e.status} />
              {e.status === "sent" && e.message_id && (
                <a
                  href={e.message_id}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 text-xs text-brand-600 underline"
                >
                  preview
                </a>
              )}
              {e.status === "failed" && e.error && (
                <span className="ml-2 text-xs text-red-500" title={e.error}>
                  {e.error.slice(0, 40)}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}
