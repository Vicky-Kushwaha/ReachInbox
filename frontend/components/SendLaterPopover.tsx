"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tomorrowAt(hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export default function SendLaterPopover({
  initialDate,
  onCancel,
  onDone,
}: {
  initialDate: Date | null;
  onCancel: () => void;
  onDone: (date: Date) => void;
}) {
  const [value, setValue] = useState<string>(toLocalInputValue(initialDate || tomorrowAt(9)));

  const quickOptions = [
    { label: "Tomorrow", date: tomorrowAt(new Date().getHours(), new Date().getMinutes()) },
    { label: "Tomorrow, 10:00 AM", date: tomorrowAt(10) },
    { label: "Tomorrow, 11:00 AM", date: tomorrowAt(11) },
    { label: "Tomorrow, 3:00 PM", date: tomorrowAt(15) },
  ];

  return (
    <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-popover">
      <p className="mb-3 text-sm font-semibold text-slate-900">Send Later</p>

      <label className="relative mb-3 block">
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 pr-9 text-sm text-slate-700 outline-none focus:border-brand-400"
        />
        <Calendar size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
      </label>

      <div className="mb-3 flex flex-col">
        {quickOptions.map((opt) => (
          <button
            key={opt.label}
            onClick={() => setValue(toLocalInputValue(opt.date))}
            className="rounded-md px-2 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-50"
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-full px-4 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50">
          Cancel
        </button>
        <button
          onClick={() => onDone(new Date(value))}
          className="rounded-full border border-brand-500 px-4 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50"
        >
          Done
        </button>
      </div>
    </div>
  );
}
