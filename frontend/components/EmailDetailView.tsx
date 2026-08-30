"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Star, Trash2, Paperclip, ExternalLink } from "lucide-react";
import { EmailDetail, User } from "@/lib/types";
import { fetchEmailDetail, setStarred, cancelEmail } from "@/lib/api";
import { formatBytes, formatFullDate } from "@/lib/format";
import Avatar from "./Avatar";
import StatusBadge from "./StatusBadge";
import Spinner from "./Spinner";

const CANCELLABLE = new Set(["scheduled", "rescheduled", "processing"]);

export default function EmailDetailView({
  id,
  currentUser,
  onBack,
  onCancelled,
}: {
  id: number;
  currentUser: User;
  onBack: () => void;
  onCancelled: () => void;
}) {
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchEmailDetail(id)
      .then((e) => !cancelled && setEmail(e))
      .catch((err) => !cancelled && setLoadError((err as Error).message || "Couldn't load this email"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function toggleStar() {
    if (!email) return;
    const next = !email.starred;
    setEmail({ ...email, starred: next });
    try {
      await setStarred(email.id, next);
    } catch {
      setEmail((e) => (e ? { ...e, starred: !next } : e));
    }
  }

  async function handleCancel() {
    if (!email) return;
    if (!confirm("Cancel this scheduled email? It will not be sent.")) return;
    setBusy(true);
    try {
      await cancelEmail(email.id);
      onCancelled();
    } finally {
      setBusy(false);
    }
  }

  const displayDate = email ? (email.sent_at ? formatFullDate(email.sent_at) : formatFullDate(email.scheduled_time)) : "";

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-4">
        <button onClick={onBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          <ArrowLeft size={18} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-slate-900">
          {email ? email.subject : "Loading…"}
          {email && <span className="ml-2 text-sm font-normal text-slate-400">#{email.id}</span>}
        </h1>

        {email && (
          <>
            <button
              onClick={toggleStar}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              title={email.starred ? "Unstar" : "Star"}
            >
              <Star size={18} fill={email.starred ? "#f59e0b" : "none"} className={email.starred ? "text-amber-500" : ""} />
            </button>
            {CANCELLABLE.has(email.status) && (
              <button
                onClick={handleCancel}
                disabled={busy}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                title="Cancel this scheduled email"
              >
                {busy ? <Spinner className="!text-red-400" /> : <Trash2 size={18} />}
              </button>
            )}
            <Avatar name={currentUser.name} src={currentUser.avatar_url} size={32} />
          </>
        )}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-slate-400">
          <Spinner />
        </div>
      ) : loadError || !email ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
          <p className="text-sm">{loadError || "This email couldn't be found."}</p>
          <button onClick={onBack} className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Back to list
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-3xl">
            {/* Meta card */}
            <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Avatar name={email.sender_name} size={44} />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{email.sender_name}</p>
                    <p className="text-xs text-slate-400">&lt;{email.from_email}&gt;</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusBadge status={email.status} />
                  <span className="text-xs text-slate-400">{displayDate}</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-500">
                  to <span className="font-medium text-slate-700">{email.recipient}</span>
                </p>
                {email.status === "sent" && email.message_id && (
                  <a
                    href={email.message_id}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    View on Ethereal <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>

            {email.error && (
              <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                Delivery failed: {email.error}
              </div>
            )}

            {/* Body card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              {email.body_html ? (
                <div
                  className="prose prose-sm max-w-none text-slate-700"
                  dangerouslySetInnerHTML={{ __html: email.body_html }}
                />
              ) : (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{email.body}</div>
              )}

              {email.attachments.length > 0 && (
                <div className="mt-6 border-t border-slate-100 pt-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Attachments ({email.attachments.length})
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {email.attachments.map((a, i) => (
                      <div
                        key={i}
                        className="w-36 overflow-hidden rounded-xl border border-slate-200 shadow-sm transition-shadow hover:shadow-md"
                      >
                        {a.contentType.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`data:${a.contentType};base64,${a.dataBase64}`}
                            alt={a.filename}
                            className="h-24 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-24 w-full items-center justify-center bg-slate-50 text-slate-300">
                            <Paperclip size={24} />
                          </div>
                        )}
                        <div className="bg-white p-2">
                          <p className="truncate text-xs font-medium text-slate-700">{a.filename}</p>
                          <p className="text-[11px] text-slate-400">{formatBytes(a.sizeBytes)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}