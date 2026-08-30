"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/api";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    getCurrentUser()
      .then((res) => router.replace(res ? "/dashboard" : "/login"))
      .catch(() => router.replace("/login"));
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-slate-500">Loading ReachInbox…</p>
    </div>
  );
}
