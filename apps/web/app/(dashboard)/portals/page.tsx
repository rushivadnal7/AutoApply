"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PasswordInput } from "@/components/ui/PasswordInput";

interface Portal {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

interface PortalAccount {
  id: string;
  jobPortalId: string;
  jobPortal: { code: string; name: string; isActive: boolean };
  status: string;
  accountEmail: string;
  lastVerifiedAt: string | null;
}

export default function PortalsPage() {
  const queryClient = useQueryClient();
  const [connectingCode, setConnectingCode] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: portals } = useQuery({ queryKey: ["portals"], queryFn: () => api.get<{ portals: Portal[] }>("/portals").then((r) => r.portals) });
  const { data: accounts } = useQuery({
    queryKey: ["portal-accounts"],
    queryFn: () => api.get<{ accounts: PortalAccount[] }>("/portals/accounts").then((r) => r.accounts),
  });

  const connect = useMutation({
    mutationFn: () => api.post("/portals/accounts", { portalCode: connectingCode, accountEmail: email, accountPassword: password }),
    onSuccess: () => {
      setConnectingCode(null);
      setEmail("");
      setPassword("");
      void queryClient.invalidateQueries({ queryKey: ["portal-accounts"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to connect account"),
  });

  const disconnect = useMutation({
    mutationFn: (code: string) => api.delete(`/portals/accounts/${code}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["portal-accounts"] }),
  });

  function accountFor(code: string) {
    return accounts?.find((a) => a.jobPortal.code === code);
  }

  function handleConnectSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    connect.mutate();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Job Portals</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect the portal accounts the bot should use. Credentials are encrypted at rest and never shown again.
        </p>
      </div>

      <div className="space-y-3">
        {portals?.map((portal) => {
          const account = accountFor(portal.code);
          const isConnecting = connectingCode === portal.code;
          return (
            <div key={portal.id} className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {portal.name}
                    {!portal.isActive && <span className="badge ml-2 bg-gray-100 text-gray-500">Coming soon</span>}
                  </p>
                  {account && account.status === "connected" ? (
                    <p className="text-xs text-gray-500">Connected as {account.accountEmail}</p>
                  ) : (
                    <p className="text-xs text-gray-400">Not connected</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {account && <StatusBadge status={account.status} />}
                  {portal.isActive && (
                    <>
                      {account && account.status === "connected" ? (
                        <>
                          <button className="btn-secondary" onClick={() => setConnectingCode(portal.code)}>
                            Reconnect
                          </button>
                          <button className="btn-danger" onClick={() => disconnect.mutate(portal.code)}>
                            Disconnect
                          </button>
                        </>
                      ) : (
                        <button className="btn-primary" onClick={() => setConnectingCode(portal.code)}>
                          Connect
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {isConnecting && (
                <form onSubmit={handleConnectSubmit} className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                  <div>
                    <label className="label">{portal.name} Email</label>
                    <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">{portal.name} Password</label>
                    <PasswordInput required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary" disabled={connect.isPending}>
                      {connect.isPending ? "Connecting…" : "Save Connection"}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setConnectingCode(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
