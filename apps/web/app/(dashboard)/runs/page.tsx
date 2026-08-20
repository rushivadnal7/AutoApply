"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface BotRunRow {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  totalApplied: number;
  totalSkipped: number;
  totalFailed: number;
  roles: Array<{ jobRole: { title: string } }>;
  portals: Array<{ jobPortal: { name: string } }>;
}

export default function RunsPage() {
  const { data: runs } = useQuery({ queryKey: ["runs"], queryFn: () => api.get<{ runs: BotRunRow[] }>("/runs").then((r) => r.runs) });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Bot Runs</h1>
        <p className="mt-1 text-sm text-gray-500">Every time the bot has been started, with a summary of what happened.</p>
      </div>

      <div className="card divide-y divide-gray-100">
        {runs?.length ? (
          runs.map((run) => (
            <div key={run.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(run.startedAt).toLocaleString()}
                    {run.completedAt && ` — ${new Date(run.completedAt).toLocaleTimeString()}`}
                  </p>
                  <StatusBadge status={run.status} />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {run.roles.map((r) => r.jobRole.title).join(", ") || "—"} on {run.portals.map((p) => p.jobPortal.name).join(", ") || "—"}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Applied: {run.totalApplied} · Skipped: {run.totalSkipped} · Failed: {run.totalFailed}
                </p>
              </div>
              <Link href={`/logs?runId=${run.id}`} className="btn-secondary shrink-0">
                View Logs
              </Link>
            </div>
          ))
        ) : (
          <p className="px-5 py-10 text-center text-sm text-gray-400">No bot runs yet.</p>
        )}
      </div>
    </div>
  );
}
