"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Paperclip, Clock, Upload, X } from "lucide-react";
import { Sender, Attachment } from "@/lib/types";
import { fetchSenders, parseLeadsFile, scheduleEmails } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import RichTextEditor, { RichTextEditorHandle } from "./RichTextEditor";
import SendLaterPopover from "./SendLaterPopover";
import Spinner from "./Spinner";

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function readFileAsAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const dataBase64 = result.split(",")[1] || "";
      resolve({ filename: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size, dataBase64 });
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function ComposePage({
  onClose,
  onScheduled,
  onError,
}: {
  onClose: () => void;
  onScheduled: (count: number) => void;
  onError: (message: string) => void;
}) {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [senderId, setSenderId] = useState<number | undefined>(undefined);

  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [chipsExpanded, setChipsExpanded] = useState(false);

  const [subject, setSubject] = useState("");
  const [delaySec, setDelaySec] = useState(2);
  const [maxEmailsPerHour, setMaxEmailsPerHour] = useState(200);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingList, setUploadingList] = useState(false);

  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [sendLaterOpen, setSendLaterOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const editorRef = useRef<RichTextEditorHandle>(null);
  const fileListInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchSenders()
      .then((list) => {
        setSenders(list);
        if (list[0]) setSenderId(list[0].id);
      })
      .catch(() => {});
  }, []);

  const visibleChips = useMemo(() => (chipsExpanded ? recipients : recipients.slice(0, 3)), [recipients, chipsExpanded]);
  const hiddenCount = recipients.length - visibleChips.length;

  function addRecipients(raw: string) {
    const candidates = raw.split(/[,;\s\n]+/).map((s) => s.trim()).filter(Boolean);
    const valid = candidates.filter(isValidEmail).map((s) => s.toLowerCase());
    if (valid.length === 0) return;
    setRecipients((prev) => Array.from(new Set([...prev, ...valid])));
  }

  function handleRecipientKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addRecipients(recipientInput);
      setRecipientInput("");
    } else if (e.key === "Backspace" && recipientInput === "" && recipients.length > 0) {
      setRecipients((prev) => prev.slice(0, -1));
    }
  }

  function handleRecipientPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (/[,;\s\n]/.test(text)) {
      e.preventDefault();
      addRecipients(text);
    }
  }

  async function handleUploadList(file: File) {
    setUploadingList(true);
    try {
      const result = await parseLeadsFile(file);
      setRecipients((prev) => Array.from(new Set([...prev, ...result.emails])));
    } catch (err) {
      onError((err as Error).message || "Could not parse leads file");
    } finally {
      setUploadingList(false);
    }
  }

  async function handleAttachFiles(files: FileList) {
    const list = Array.from(files);
    if (attachments.length + list.length > MAX_ATTACHMENTS) {
      onError(`You can attach up to ${MAX_ATTACHMENTS} files`);
      return;
    }
    for (const file of list) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        onError(`${file.name} is larger than 2MB`);
        continue;
      }
      try {
        const attachment = await readFileAsAttachment(file);
        setAttachments((prev) => [...prev, attachment]);
      } catch {
        onError(`Could not read ${file.name}`);
      }
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!subject.trim()) return onError("Subject is required");
    if (recipients.length === 0) return onError("Add at least one recipient");
    if (editorRef.current?.isEmpty()) return onError("Write a message body");

    setSubmitting(true);
    try {
      const result = await scheduleEmails({
        subject,
        body: editorRef.current!.getText(),
        bodyHtml: editorRef.current!.getHtml(),
        attachments,
        recipients,
        startTime: (scheduledDate || new Date()).toISOString(),
        minDelayMs: Math.max(0, delaySec) * 1000,
        maxEmailsPerHour,
        senderId,
      });
      onScheduled(result.scheduled);
    } catch (err) {
      onError((err as Error).message || "Failed to schedule emails");
    } finally {
      setSubmitting(false);
    }
  }

  const activeSender = senders.find((s) => s.id === senderId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4">
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          <ArrowLeft size={18} />
        </button>
        <h1 className="flex-1 text-lg font-semibold text-slate-900">Compose New Email</h1>

        <button
          onClick={() => attachmentInputRef.current?.click()}
          title="Attach files"
          className={`rounded-lg p-1.5 hover:bg-slate-100 ${attachments.length > 0 ? "text-brand-600" : "text-slate-400"}`}
        >
          <Paperclip size={18} />
        </button>
        <input
          ref={attachmentInputRef}
          type="file"
          multiple
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => e.target.files && handleAttachFiles(e.target.files)}
        />

        <div className="relative">
          <button
            onClick={() => setSendLaterOpen((o) => !o)}
            title="Schedule for later"
            className={`rounded-lg p-1.5 hover:bg-slate-100 ${scheduledDate ? "text-brand-600" : "text-slate-400"}`}
          >
            <Clock size={18} />
          </button>
          {sendLaterOpen && (
            <SendLaterPopover
              initialDate={scheduledDate}
              onCancel={() => setSendLaterOpen(false)}
              onDone={(date) => {
                setScheduledDate(date);
                setSendLaterOpen(false);
              }}
            />
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-full border border-brand-500 px-5 py-1.5 text-sm font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-50"
        >
          {submitting && <Spinner className="!text-brand-500" />}
          {scheduledDate ? "Send Later" : "Send"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-3 flex items-center gap-3 border-b border-slate-100 pb-3">
          <span className="w-16 shrink-0 text-sm font-medium text-slate-500">From</span>
          {senders.length > 1 ? (
            <div className="relative">
              <select
                value={senderId}
                onChange={(e) => setSenderId(Number(e.target.value))}
                className="appearance-none rounded-md bg-slate-100 py-1.5 pl-3 pr-8 text-sm text-slate-700 outline-none"
              >
                {senders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.from_email}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-3 py-1.5 text-sm text-slate-600">
              {activeSender?.from_email || "…"} <ChevronDown size={14} className="text-slate-400" />
            </span>
          )}
        </div>

        <div className="mb-3 flex items-start gap-3 border-b border-slate-100 pb-3">
          <span className="w-16 shrink-0 pt-1.5 text-sm font-medium text-slate-500">To</span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {visibleChips.map((r) => (
              <span
                key={r}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"
              >
                {r}
                <button onClick={() => setRecipients((prev) => prev.filter((x) => x !== r))} className="text-brand-400 hover:text-brand-600">
                  <X size={11} />
                </button>
              </span>
            ))}
            {hiddenCount > 0 && (
              <button
                onClick={() => setChipsExpanded(true)}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
              >
                +{hiddenCount}
              </button>
            )}
            <input
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              onKeyDown={handleRecipientKeyDown}
              onPaste={handleRecipientPaste}
              onBlur={() => {
                if (recipientInput) {
                  addRecipients(recipientInput);
                  setRecipientInput("");
                }
              }}
              placeholder={recipients.length === 0 ? "recipient@example.com" : ""}
              className="min-w-[160px] flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
          <button
            onClick={() => fileListInputRef.current?.click()}
            disabled={uploadingList}
            className="flex shrink-0 items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
          >
            {uploadingList ? <Spinner className="!text-brand-500" /> : <Upload size={14} />}
            Upload List
          </button>
          <input
            ref={fileListInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUploadList(f);
            }}
          />
        </div>

        <div className="mb-3 flex items-center gap-3 border-b border-slate-100 pb-3">
          <span className="w-16 shrink-0 text-sm font-medium text-slate-500">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="mb-4 flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-500">
            Delay between 2 emails
            <input
              type="number"
              min={0}
              value={delaySec}
              onChange={(e) => setDelaySec(Number(e.target.value))}
              className="w-14 rounded-md bg-slate-100 px-2 py-1 text-center text-sm text-slate-700 outline-none"
            />
            <span className="text-xs text-slate-400">sec</span>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-500">
            Hourly Limit
            <input
              type="number"
              min={1}
              value={maxEmailsPerHour}
              onChange={(e) => setMaxEmailsPerHour(Number(e.target.value))}
              className="w-14 rounded-md bg-slate-100 px-2 py-1 text-center text-sm text-slate-700 outline-none"
            />
          </label>
        </div>

        <RichTextEditor ref={editorRef} />

        {attachments.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {attachments.map((a, i) => (
              <div key={i} className="relative w-32 overflow-hidden rounded-lg border border-slate-200">
                {a.contentType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`data:${a.contentType};base64,${a.dataBase64}`} alt={a.filename} className="h-20 w-full object-cover" />
                ) : (
                  <div className="flex h-20 w-full items-center justify-center bg-slate-50 text-slate-300">
                    <Paperclip size={20} />
                  </div>
                )}
                <button
                  onClick={() => removeAttachment(i)}
                  className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-slate-500 shadow hover:text-red-500"
                >
                  <X size={12} />
                </button>
                <div className="bg-white p-1.5">
                  <p className="truncate text-[11px] font-medium text-slate-600">{a.filename}</p>
                  <p className="text-[10px] text-slate-400">{formatBytes(a.sizeBytes)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
