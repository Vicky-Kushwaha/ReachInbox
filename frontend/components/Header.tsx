"use client";

import { User } from "@/lib/types";
import Button from "./Button";

export default function Header({
  user,
  slackConnected,
  onLogout,
  onConnectSlack,
  onDisconnectSlack,
  onCompose,
}: {
  user: User;
  slackConnected: boolean;
  onLogout: () => void;
  onConnectSlack: () => void;
  onDisconnectSlack: () => void;
  onCompose: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-3 backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
          RI
        </div>
        <span className="font-semibold text-slate-900">ReachInbox Scheduler</span>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={onCompose}>
          + Compose New Email
        </Button>

        {slackConnected ? (
          <Button variant="secondary" onClick={onDisconnectSlack}>
            Slack Connected ✓
          </Button>
        ) : (
          <Button variant="secondary" onClick={onConnectSlack}>
            Connect Slack
          </Button>
        )}

        <div className="mx-1 h-6 w-px bg-slate-200" />

        <div className="flex items-center gap-2">
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar_url} alt={user.name} className="h-8 w-8 rounded-full" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="hidden text-sm sm:block">
            <p className="font-medium leading-4 text-slate-900">{user.name}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
        </div>

        <Button variant="ghost" onClick={onLogout}>
          Logout
        </Button>
      </div>
    </header>
  );
}
