"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

interface BotRunOption {
  id: string;
  startedAt: string;
  status: string;
}

interface LogRow {
  id: string;
  level: string;
  message: string;
  createdAt: string;
}

function LogsContent() {
  const searchParams = useSearchParams();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(searchParams.get("runId"));

  const { data: runs } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.get<{ runs: BotRunOption[] }>("/runs").then((r) => r.runs),
  });

  useEffect(() => {
    if (!selectedRunId && runs && runs.length > 0) setSelectedRunId(runs[0]?.id ?? null);
  }, [runs, selectedRunId]);

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ["run-logs", selectedRunId],
    queryFn: () => api.get<{ logs: LogRow[] }>(`/runs/${selectedRunId}/logs`).then((r) => r.logs),
    enabled: !!selectedRunId,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Activity Logs</h1>
        <p className="mt-1 text-sm text-gray-500">Structured, timestamped events for a bot run.</p>
      </div>

      <div className="card p-4">
        <label className="label">Bot Run</label>
        <select className="input" value={selectedRunId ?? ""} onChange={(e) => setSelectedRunId(e.target.value)}>
          {runs?.map((run) => (
            <option key={run.id} value={run.id}>
              {new Date(run.startedAt).toLocaleString()} — {run.status}
            </option>
          ))}
        </select>
      </div>

      <div className="card p-4">
        <div className="max-h-[32rem] space-y-1 overflow-y-auto font-mono text-xs">
          {logsLoading ? (
            <p className="py-6 text-center text-gray-400">Loading…</p>
          ) : logs?.length ? (
            logs.map((log) => (
              <div key={log.id} className="flex gap-3 border-b border-gray-50 py-1.5">
                <span className="shrink-0 text-gray-400">{new Date(log.createdAt).toLocaleTimeString()}</span>
                <span
                  className={
                    log.level === "error" ? "text-red-600" : log.level === "warn" ? "text-amber-600" : "text-gray-700"
                  }
                >
                  {log.message}
                </span>
              </div>
            ))
          ) : (
            <p className="py-6 text-center text-gray-400">No log entries for this run.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LogsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-500">Loading…</div>}>
      <LogsContent />
    </Suspense>
  );
}
