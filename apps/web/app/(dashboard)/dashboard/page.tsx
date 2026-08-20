"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useRealtimeBot } from "@/lib/use-realtime-bot";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useEffect } from "react";

interface DashboardSummary {
  totals: { total: number; applied: number; skipped: number; failed: number; activeRuns: number };
  averageMatchScore: number | null;
  platformStats: Array<{ code: string; name: string; count: number }>;
  roleProgress: Array<{ id: string; title: string; applicationLimit: number; applied: number; skipped: number; failed: number }>;
}

interface BotState {
  status: string;
  currentPlatform: string | null;
  currentJobTitle: string | null;
  progressApplied: number;
  progressSkipped: number;
  progressFailed: number;
  progressTotal: number;
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => api.get<DashboardSummary>("/dashboard/summary"),
    refetchInterval: 15_000,
  });
  const { data: bot } = useQuery({
    queryKey: ["bot-status"],
    queryFn: () => api.get<{ bot: BotState }>("/bot").then((r) => r.bot),
    refetchInterval: 10_000,
  });
  const { status: liveStatus } = useRealtimeBot();

  useEffect(() => {
    // A run-completed event means dashboard totals just changed — refetch.
    if (liveStatus?.status === "completed" || liveStatus?.status === "stopped" || liveStatus?.status === "failed") {
      void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    }
  }, [liveStatus?.status, queryClient]);

  const effectiveStatus = liveStatus?.status ?? bot?.status ?? "idle";
  const applied = liveStatus?.progress.applied ?? bot?.progressApplied ?? 0;
  const skipped = liveStatus?.progress.skipped ?? bot?.progressSkipped ?? 0;
  const failed = liveStatus?.progress.failed ?? bot?.progressFailed ?? 0;
  const total = liveStatus?.progress.total ?? bot?.progressTotal ?? 0;
  const currentJobTitle = liveStatus?.currentJobTitle ?? bot?.currentJobTitle ?? null;
  const currentPlatform = liveStatus?.currentPlatform ?? bot?.currentPlatform ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Overview of your automated job-application activity.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Total Applications" value={summary?.totals.total ?? "—"} />
        <SummaryCard label="Applied" value={summary?.totals.applied ?? "—"} />
        <SummaryCard label="Skipped" value={summary?.totals.skipped ?? "—"} />
        <SummaryCard label="Failed" value={summary?.totals.failed ?? "—"} />
        <SummaryCard label="Active Bot Runs" value={summary?.totals.activeRuns ?? "—"} />
        <SummaryCard label="Avg. Match Score" value={summary?.averageMatchScore != null ? `${Math.round(summary.averageMatchScore)}%` : "—"} />
      </div>

      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Bot Status</h2>
          <StatusBadge status={effectiveStatus} />
        </div>
        {total > 0 && (
          <div className="mb-3">
            <div className="mb-1 flex justify-between text-xs text-gray-500">
              <span>{applied + skipped + failed} / {total} processed</span>
              <span>{applied} applied · {skipped} skipped · {failed} failed</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-brand-500 transition-all"
                style={{ width: `${Math.min(100, ((applied + skipped + failed) / total) * 100)}%` }}
              />
            </div>
          </div>
        )}
        {currentJobTitle && (
          <p className="text-sm text-gray-600">
            Currently analyzing <span className="font-medium text-gray-900">{currentJobTitle}</span>
            {currentPlatform ? ` on ${currentPlatform}` : ""}
          </p>
        )}
        <div className="mt-4">
          <Link href="/bot" className="btn-primary">
            Go to Bot Control
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Applications by Platform</h2>
          <ul className="space-y-2">
            {summary?.platformStats.length ? (
              summary.platformStats.map((p) => (
                <li key={p.code} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{p.name}</span>
                  <span className="font-medium text-gray-900">{p.count}</span>
                </li>
              ))
            ) : (
              <li className="text-sm text-gray-400">No applications yet.</li>
            )}
          </ul>
        </div>

        <div className="card p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Role Progress</h2>
          <ul className="space-y-3">
            {summary?.roleProgress.length ? (
              summary.roleProgress.map((r) => (
                <li key={r.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-gray-700">{r.title}</span>
                    <span className="font-medium text-gray-900">
                      {r.applied} / {r.applicationLimit}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full bg-brand-500"
                      style={{ width: `${Math.min(100, (r.applied / Math.max(1, r.applicationLimit)) * 100)}%` }}
                    />
                  </div>
                </li>
              ))
            ) : (
              <li className="text-sm text-gray-400">No roles configured yet.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
