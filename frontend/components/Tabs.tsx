"use client";

export type TabKey = "scheduled" | "sent";

export default function Tabs({
  active,
  onChange,
  scheduledCount,
  sentCount,
}: {
  active: TabKey;
  onChange: (key: TabKey) => void;
  scheduledCount: number;
  sentCount: number;
}) {
  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "scheduled", label: "Scheduled Emails", count: scheduledCount },
    { key: "sent", label: "Sent Emails", count: sentCount },
  ];

  return (
    <div className="flex gap-1 border-b border-slate-200">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`relative px-4 py-2 text-sm font-medium transition-colors ${
            active === tab.key ? "text-brand-600" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {tab.label}
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
              active === tab.key ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {tab.count}
          </span>
          {active === tab.key && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-600" />}
        </button>
      ))}
    </div>
  );
}
