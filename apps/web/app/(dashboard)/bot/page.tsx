"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import { useRealtimeBot } from "@/lib/use-realtime-bot";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface RoleOption {
  id: string;
  title: string;
  applicationLimit: number;
  preference: unknown;
  locations: unknown[];
  resumeLinks: unknown[];
}

interface PortalAccountOption {
  jobPortal: { code: string; name: string; isActive: boolean };
  status: string;
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

const ACTIVE_STATUSES = new Set(["starting", "logging_in", "searching", "analyzing", "applying", "waiting", "paused", "resuming"]);

export default function BotControlPage() {
  const queryClient = useQueryClient();
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [selectedPortals, setSelectedPortals] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => api.get<{ roles: RoleOption[] }>("/roles").then((r) => r.roles) });
  const { data: accounts } = useQuery({
    queryKey: ["portal-accounts"],
    queryFn: () => api.get<{ accounts: PortalAccountOption[] }>("/portals/accounts").then((r) => r.accounts),
  });
  const { data: bot } = useQuery({
    queryKey: ["bot-status"],
    queryFn: () => api.get<{ bot: BotState }>("/bot").then((r) => r.bot),
    refetchInterval: 8000,
  });
  const { status: liveStatus, logs } = useRealtimeBot();

  const runnableRoles = (roles ?? []).filter((r) => !!r.preference && r.locations.length > 0 && r.resumeLinks.length > 0);
  const connectedPortals = (accounts ?? []).filter((a) => a.status === "connected" && a.jobPortal.isActive);

  const startBot = useMutation({
    mutationFn: () =>
      api.post("/bot/start", { jobRoleIds: [...selectedRoles], portalCodes: [...selectedPortals] }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["bot-status"] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to start bot"),
  });

  const control = useMutation({
    mutationFn: (action: "pause" | "resume" | "stop") => api.post("/bot/control", { action }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["bot-status"] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to send control action"),
  });

  const effectiveStatus = liveStatus?.status ?? bot?.status ?? "idle";
  const isActive = ACTIVE_STATUSES.has(effectiveStatus);
  const applied = liveStatus?.progress.applied ?? bot?.progressApplied ?? 0;
  const skipped = liveStatus?.progress.skipped ?? bot?.progressSkipped ?? 0;
  const failed = liveStatus?.progress.failed ?? bot?.progressFailed ?? 0;
  const total = liveStatus?.progress.total ?? bot?.progressTotal ?? 0;

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Bot Control</h1>
        <p className="mt-1 text-sm text-gray-500">Select roles and portals, then start the automated application run.</p>
      </div>

      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Status</h2>
          <StatusBadge status={effectiveStatus} />
        </div>

        {total > 0 && (
          <p className="mb-3 text-sm text-gray-600">
            {applied} applied · {skipped} skipped · {failed} failed — target {total}
          </p>
        )}
        {(liveStatus?.currentJobTitle ?? bot?.currentJobTitle) && (
          <p className="mb-3 text-sm text-gray-600">
            Current job: <span className="font-medium text-gray-900">{liveStatus?.currentJobTitle ?? bot?.currentJobTitle}</span>
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!isActive && (
            <button
              className="btn-primary"
              disabled={startBot.isPending || selectedRoles.size === 0 || selectedPortals.size === 0}
              onClick={() => {
                setError(null);
                startBot.mutate();
              }}
            >
              {startBot.isPending ? "Starting…" : "Start Bot"}
            </button>
          )}
          {effectiveStatus !== "paused" && isActive && (
            <button className="btn-secondary" onClick={() => control.mutate("pause")}>
              Pause Bot
            </button>
          )}
          {effectiveStatus === "paused" && (
            <button className="btn-secondary" onClick={() => control.mutate("resume")}>
              Resume Bot
            </button>
          )}
          {isActive && (
            <button className="btn-danger" onClick={() => control.mutate("stop")}>
              Stop Bot
            </button>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {!isActive && (
        <div className="card p-6">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Job Roles</h2>
          {runnableRoles.length === 0 && (
            <p className="text-sm text-amber-600">
              No roles are ready yet — each role needs a resume, at least one location, and preferences configured on the Job Roles page.
            </p>
          )}
          <div className="space-y-2">
            {runnableRoles.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selectedRoles.has(r.id)} onChange={() => toggle(selectedRoles, r.id, setSelectedRoles)} />
                {r.title} (limit: {r.applicationLimit})
              </label>
            ))}
          </div>

          <h2 className="mb-3 mt-6 text-base font-semibold text-gray-900">Job Portals</h2>
          {connectedPortals.length === 0 && (
            <p className="text-sm text-amber-600">No connected, working portal accounts yet — connect one on the Job Portals page.</p>
          )}
          <div className="space-y-2">
            {connectedPortals.map((a) => (
              <label key={a.jobPortal.code} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedPortals.has(a.jobPortal.code)}
                  onChange={() => toggle(selectedPortals, a.jobPortal.code, setSelectedPortals)}
                />
                {a.jobPortal.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="card p-6">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Live Activity</h2>
        <div className="h-64 overflow-y-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-gray-100">
          {logs.length === 0 ? (
            <p className="text-gray-500">No activity yet.</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="mb-1">
                <span className="text-gray-500">{new Date(log.createdAt).toLocaleTimeString()}</span>{" "}
                <span className={log.level === "error" ? "text-red-400" : log.level === "warn" ? "text-amber-400" : "text-gray-100"}>
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
