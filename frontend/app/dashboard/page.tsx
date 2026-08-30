"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  disconnectSlack,
  fetchScheduledEmails,
  fetchSentEmails,
  getCurrentUser,
  getSlackStatus,
  logout,
  slackConnectUrl,
} from "@/lib/api";
import { ScheduledEmail, SentEmail, User } from "@/lib/types";
import Header from "@/components/Header";
import Tabs, { TabKey } from "@/components/Tabs";
import { ScheduledEmailTable, SentEmailTable } from "@/components/EmailTable";
import ComposeModal from "@/components/ComposeModal";
import { ToastStack, useToasts } from "@/components/Toast";

function DashboardInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { toasts, push } = useToasts();

  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [slackConnected, setSlackConnected] = useState(false);

  const [tab, setTab] = useState<TabKey>("scheduled");
  const [scheduled, setScheduled] = useState<ScheduledEmail[]>([]);
  const [sent, setSent] = useState<SentEmail[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(true);
  const [loadingSent, setLoadingSent] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);

  const refreshScheduled = useCallback(async () => {
    try {
      setScheduled(await fetchScheduledEmails());
    } catch (err) {
      push((err as Error).message, "error");
    } finally {
      setLoadingScheduled(false);
    }
  }, [push]);

  const refreshSent = useCallback(async () => {
    try {
      setSent(await fetchSentEmails());
    } catch (err) {
      push((err as Error).message, "error");
    } finally {
      setLoadingSent(false);
    }
  }, [push]);

  useEffect(() => {
    getCurrentUser()
      .then((u) => {
        if (!u) {
          router.replace("/login");
          return;
        }
        setUser(u);
      })
      .finally(() => setCheckingAuth(false));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    getSlackStatus().then((s) => setSlackConnected(s.connected)).catch(() => {});
    refreshScheduled();
    refreshSent();

    // Light polling so the tables reflect worker activity without a manual refresh.
    const interval = setInterval(() => {
      refreshScheduled();
      refreshSent();
    }, 8000);
    return () => clearInterval(interval);
  }, [user, refreshScheduled, refreshSent]);

  useEffect(() => {
    const slackParam = params.get("slack");
    if (slackParam === "connected") push("Slack connected — you'll get alerts on rate-limit hits.");
    if (slackParam === "error") push("Could not connect Slack. Please try again.", "error");
  }, [params, push]);

  if (checkingAuth || !user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <Header
        user={user}
        slackConnected={slackConnected}
        onLogout={async () => {
          await logout();
          router.replace("/login");
        }}
        onConnectSlack={() => {
          window.location.href = slackConnectUrl();
        }}
        onDisconnectSlack={async () => {
          await disconnectSlack();
          setSlackConnected(false);
          push("Slack disconnected");
        }}
        onCompose={() => setComposeOpen(true)}
      />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <Tabs
          active={tab}
          onChange={setTab}
          scheduledCount={scheduled.length}
          sentCount={sent.length}
        />

        <div className="mt-4">
          {tab === "scheduled" ? (
            <ScheduledEmailTable emails={scheduled} loading={loadingScheduled} />
          ) : (
            <SentEmailTable emails={sent} loading={loadingSent} />
          )}
        </div>
      </main>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onScheduled={(count) => {
          push(`Scheduled ${count} email${count === 1 ? "" : "s"} 🎉`);
          setTab("scheduled");
          refreshScheduled();
        }}
        onError={(msg) => push(msg, "error")}
      />

      <ToastStack toasts={toasts} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardInner />
    </Suspense>
  );
}
