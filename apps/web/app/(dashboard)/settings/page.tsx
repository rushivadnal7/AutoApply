"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

interface BotState {
  pacingDelaySeconds: number;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: bot } = useQuery({ queryKey: ["bot-status"], queryFn: () => api.get<{ bot: BotState }>("/bot").then((r) => r.bot) });
  const [pacing, setPacing] = useState(20);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (bot) setPacing(bot.pacingDelaySeconds);
  }, [bot]);

  const savePacing = useMutation({
    mutationFn: () => api.put("/bot/pacing", { pacingDelaySeconds: pacing }),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["bot-status"] });
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to save"),
  });

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Account and automation-pacing preferences.</p>
      </div>

      <div className="card p-6">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Account</h2>
        <p className="text-sm text-gray-600">Signed in as {user?.email}</p>
      </div>

      <div className="card p-6">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Automation Pacing</h2>
        <p className="mb-3 text-sm text-gray-500">Delay between applications, to avoid excessive requests to a job portal.</p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={0}
            max={600}
            className="input w-32"
            value={pacing}
            onChange={(e) => setPacing(Number(e.target.value))}
          />
          <span className="text-sm text-gray-500">seconds</span>
          <button className="btn-primary" disabled={savePacing.isPending} onClick={() => savePacing.mutate()}>
            Save
          </button>
          {saved && <span className="text-sm text-green-600">Saved</span>}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
