"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import { RoleCard, type JobRole } from "@/components/dashboard/RoleCard";

interface ResumeOption {
  id: string;
  fileName: string;
}

export default function RolesPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [limit, setLimit] = useState(25);
  const [error, setError] = useState<string | null>(null);

  const { data: roles } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<{ roles: JobRole[] }>("/roles").then((r) => r.roles),
  });
  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => api.get<{ resumes: ResumeOption[] }>("/resumes").then((r) => r.resumes),
  });

  const createRole = useMutation({
    mutationFn: () => api.post("/roles", { title, applicationLimit: limit }),
    onSuccess: () => {
      setTitle("");
      setLimit(25);
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to create role"),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    createRole.mutate();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Job Roles</h1>
        <p className="mt-1 text-sm text-gray-500">
          Each role is an independent search — its own keyword, resume, application limit, and preferences.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card flex items-end gap-3 p-5">
        <div className="flex-1">
          <label className="label">Job Title / Keyword</label>
          <input className="input" required placeholder="e.g. Business Analyst" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="w-40">
          <label className="label">Application Limit</label>
          <input type="number" min={1} className="input" value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
        </div>
        <button type="submit" className="btn-primary" disabled={createRole.isPending}>
          Add Role
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-4">
        {roles?.length ? (
          roles.map((role) => <RoleCard key={role.id} role={role} availableResumes={resumes ?? []} />)
        ) : (
          <p className="card p-8 text-center text-sm text-gray-400">No job roles yet. Add one above to get started.</p>
        )}
      </div>
    </div>
  );
}
