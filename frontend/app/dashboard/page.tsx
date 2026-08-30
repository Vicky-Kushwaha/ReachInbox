"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  disconnectSlack,
  fetchScheduledEmails,
  fetchSentEmails,
  getCurrentUser,
  getSlackStatus,
  logout,
  searchEmails,
  setStarred,
  slackConnectUrl,
  SearchResult,
} from "@/lib/api";
import { EmailListItem, User } from "@/lib/types";
import Sidebar, { NavKey } from "@/components/Sidebar";
import TopBar, { FilterOption } from "@/components/TopBar";
import { EmailList } from "@/components/EmailList";
import EmailDetailView from "@/components/EmailDetailView";
import ComposePage from "@/components/ComposePage";
import { ToastStack, useToasts } from "@/components/Toast";

type View = "list" | "detail" | "compose";

const SCHEDULED_FILTERS: FilterOption[] = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "processing", label: "Sending" },
];

const SENT_FILTERS: FilterOption[] = [
  { value: "all", label: "All" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
];

function isNavKey(v: string | null): v is NavKey {
  return v === "scheduled" || v === "sent";
}

function isView(v: string | null): v is View {
  return v === "list" || v === "detail" || v === "compose";
}

function DashboardInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { toasts, push } = useToasts();

  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [slackConnected, setSlackConnected] = useState(false);

  // Hydrate the initial screen from the URL so refresh/back/forward/deep-links
  // land back on the exact tab, email, or compose screen the user was on —
  // React state alone doesn't survive a full page reload, the URL does.
  const [activeNav, setActiveNav] = useState<NavKey>(() => (isNavKey(params.get("tab")) ? (params.get("tab") as NavKey) : "scheduled"));
  const [view, setView] = useState<View>(() => (isView(params.get("view")) ? (params.get("view") as View) : "list"));
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const raw = params.get("id");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  });

  const [scheduled, setScheduled] = useState<EmailListItem[]>([]);
  const [sent, setSent] = useState<EmailListItem[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(true);
  const [loadingSent, setLoadingSent] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  /** Pushes {tab, view, id} into the URL (without a navigation/remount) so the
   *  current screen survives a refresh. Always call this alongside the matching
   *  setState calls below, rather than relying on state alone. */
  const syncUrl = useCallback(
    (next: { tab: NavKey; view: View; id?: number | null }) => {
      const qs = new URLSearchParams();
      qs.set("tab", next.tab);
      qs.set("view", next.view);
      if (next.view === "detail" && next.id != null) qs.set("id", String(next.id));
      router.replace(`/dashboard?${qs.toString()}`, { scroll: false });
    },
    [router]
  );

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

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshScheduled(), refreshSent()]);
    setRefreshing(false);
  }, [refreshScheduled, refreshSent]);

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
    getSlackStatus().then((s) => setSlackConnected(s.connected)).catch(() => { });
    refreshScheduled();
    refreshSent();
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

  // Debounced search across both scheduled + sent via Elasticsearch.
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      searchEmails(query)
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  function changeNav(key: NavKey) {
    setActiveNav(key);
    setFilter("all");
    setView("list");
    syncUrl({ tab: key, view: "list" });
  }

  function openCompose() {
    setView("compose");
    syncUrl({ tab: activeNav, view: "compose" });
  }

  function openEmail(id: number) {
    setSelectedId(id);
    setView("detail");
    syncUrl({ tab: activeNav, view: "detail", id });
  }

  function backToList() {
    setView("list");
    syncUrl({ tab: activeNav, view: "list" });
  }

  async function toggleStar(id: number) {
    const list = activeNav === "scheduled" ? scheduled : sent;
    const setList = activeNav === "scheduled" ? setScheduled : setSent;
    const current = list.find((e) => e.id === id);
    if (!current) return;
    const next = !current.starred;
    setList(list.map((e) => (e.id === id ? { ...e, starred: next } : e)));
    try {
      await setStarred(id, next);
    } catch {
      setList(list.map((e) => (e.id === id ? { ...e, starred: !next } : e)));
    }
  }

  const displayedList = useMemo(() => {
    const base = activeNav === "scheduled" ? scheduled : sent;
    if (filter === "all") return base;
    return base.filter((e) => e.status === filter);
  }, [activeNav, scheduled, sent, filter]);

  const searchListItems: EmailListItem[] = useMemo(
    () =>
      (searchResults || []).map((r) => ({
        id: Number(r.id),
        recipient: r.recipient,
        subject: r.subject,
        preview: r.body?.slice(0, 140) || "",
        status: (r.status as EmailListItem["status"]) || "sent",
        starred: false,
      })),
    [searchResults]
  );

  if (checkingAuth || !user) return null;

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar
        user={user}
        slackConnected={slackConnected}
        activeNav={activeNav}
        scheduledCount={scheduled.length}
        sentCount={sent.length}
        onNavChange={changeNav}
        onCompose={openCompose}
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
      />

      <main className="flex min-w-0 flex-1 flex-col bg-white">
        {view === "compose" && (
          <ComposePage
            onClose={backToList}
            onScheduled={(count) => {
              push(`Scheduled ${count} email${count === 1 ? "" : "s"} 🎉`);
              setActiveNav("scheduled");
              setView("list");
              syncUrl({ tab: "scheduled", view: "list" });
              refreshScheduled();
            }}
            onError={(msg) => push(msg, "error")}
          />
        )}

        {view === "detail" && selectedId && (
          <EmailDetailView
            id={selectedId}
            currentUser={user}
            onBack={backToList}
            onCancelled={() => {
              push("Email cancelled");
              backToList();
              refreshScheduled();
            }}
          />
        )}

        {view === "list" && (
          <>
            <TopBar
              query={query}
              onQueryChange={setQuery}
              filterOptions={activeNav === "scheduled" ? SCHEDULED_FILTERS : SENT_FILTERS}
              activeFilter={filter}
              onFilterChange={setFilter}
              onRefresh={refreshAll}
              refreshing={refreshing}
            />
            <div className="flex-1 overflow-y-auto">
              {query.trim() ? (
                <EmailList
                  items={searchListItems}
                  loading={searching}
                  emptyTitle="No results"
                  emptySubtitle="Try a different search term."
                  onOpen={openEmail}
                  onToggleStar={() => { }}
                />
              ) : (
                <EmailList
                  items={displayedList}
                  loading={activeNav === "scheduled" ? loadingScheduled : loadingSent}
                  emptyTitle={activeNav === "scheduled" ? "No scheduled emails yet" : "No sent emails yet"}
                  emptySubtitle={
                    activeNav === "scheduled"
                      ? "Click Compose to schedule your first send."
                      : "Once your scheduled emails go out, they'll show up here."
                  }
                  onOpen={openEmail}
                  onToggleStar={toggleStar}
                />
              )}
            </div>
          </>
        )}
      </main>

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