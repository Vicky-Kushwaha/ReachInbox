"use client";

import { useRef, useState } from "react";
import Modal from "./Modal";
import { Input, Textarea } from "./Input";
import Button from "./Button";
import Spinner from "./Spinner";
import { parseLeadsFile, scheduleEmails } from "@/lib/api";

export default function ComposeModal({
  open,
  onClose,
  onScheduled,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onScheduled: (count: number) => void;
  onError: (message: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [startTime, setStartTime] = useState<string>(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000); // default: 5 minutes from now
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16); // yyyy-MM-ddTHH:mm for datetime-local
  });
  const [minDelayMs, setMinDelayMs] = useState(2000);
  const [maxEmailsPerHour, setMaxEmailsPerHour] = useState(200);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setSubject("");
    setBody("");
    setRecipients([]);
    setFileName(null);
    setSubmitting(false);
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setParsing(true);
    try {
      const result = await parseLeadsFile(file);
      setRecipients(result.emails);
    } catch (err) {
      onError((err as Error).message || "Could not parse leads file");
    } finally {
      setParsing(false);
    }
  }

  async function handleSubmit() {
    if (!subject.trim() || !body.trim()) {
      onError("Subject and body are required");
      return;
    }
    if (recipients.length === 0) {
      onError("Upload a CSV/text file with at least one lead email");
      return;
    }
    setSubmitting(true);
    try {
      const result = await scheduleEmails({
        subject,
        body,
        recipients,
        startTime: new Date(startTime).toISOString(),
        minDelayMs,
        maxEmailsPerHour,
      });
      onScheduled(result.scheduled);
      reset();
      onClose();
    } catch (err) {
      onError((err as Error).message || "Failed to schedule emails");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Compose New Email">
      <div className="flex flex-col gap-4">
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Quick question about {{company}}" />
        <Textarea
          label="Body"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Hi there, ..."
        />

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Leads (CSV or text file)</span>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500 hover:border-brand-400 hover:bg-brand-50/40"
          >
            {parsing ? (
              <span className="inline-flex items-center gap-2">
                <Spinner /> Parsing…
              </span>
            ) : fileName ? (
              <span>
                <strong className="text-slate-700">{fileName}</strong> — {recipients.length} email
                {recipients.length === 1 ? "" : "s"} detected
              </span>
            ) : (
              "Click to upload a .csv or .txt file of lead emails"
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Start time"
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
          <Input
            label="Delay between emails (ms)"
            type="number"
            min={0}
            value={minDelayMs}
            onChange={(e) => setMinDelayMs(Number(e.target.value))}
          />
        </div>
        <Input
          label="Hourly limit (emails/hour for this sender)"
          type="number"
          min={1}
          value={maxEmailsPerHour}
          onChange={(e) => setMaxEmailsPerHour(Number(e.target.value))}
        />

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Spinner /> : null}
            Schedule
          </Button>
        </div>
      </div>
    </Modal>
  );
}
