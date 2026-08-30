"use client";

import { useState } from "react";
import { Clock, Send, ChevronDown, LogOut, Slack } from "lucide-react";
import { User } from "@/lib/types";
import Avatar from "./Avatar";

export type NavKey = "scheduled" | "sent";

export default function Sidebar({
  user,
  slackConnected,
  activeNav,
  scheduledCount,
  sentCount,
  onNavChange,
  onCompose,
  onLogout,
  onConnectSlack,
  onDisconnectSlack,
}: {
  user: User;
  slackConnected: boolean;
  activeNav: NavKey;
  scheduledCount: number;
  sentCount: number;
  onNavChange: (key: NavKey) => void;
  onCompose: () => void;
  onLogout: () => void;
  onConnectSlack: () => void;
  onDisconnectSlack: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5">
      <div className="mb-5 px-1 text-2xl font-black tracking-tight text-slate-900">RI</div>

      <div className="relative mb-4">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-slate-50"
        >
          <Avatar name={user.name} src={user.avatar_url} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-4 text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <ChevronDown size={16} className="shrink-0 text-slate-400" />
        </button>

        {menuOpen && (
          <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white py-1 shadow-popover">
            <button
              onClick={() => {
                setMenuOpen(false);
                slackConnected ? onDisconnectSlack() : onConnectSlack();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <Slack size={15} />
              {slackConnected ? "Disconnect Slack" : "Connect Slack"}
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <LogOut size={15} />
              Logout
            </button>
          </div>
        )}
      </div>

      <button
        onClick={onCompose}
        className="mb-6 w-full rounded-full border border-brand-500 py-2 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50"
      >
        Compose
      </button>

      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Core</p>

      <nav className="flex flex-col gap-1">
        <NavItem
          icon={<Clock size={16} />}
          label="Scheduled"
          count={scheduledCount}
          active={activeNav === "scheduled"}
          onClick={() => onNavChange("scheduled")}
        />
        <NavItem
          icon={<Send size={16} />}
          label="Sent"
          count={sentCount}
          active={activeNav === "sent"}
          onClick={() => onNavChange("sent")}
        />
      </nav>
    </aside>
  );
}

function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      <span className={active ? "text-brand-600" : "text-slate-400"}>{count}</span>
    </button>
  );
}
