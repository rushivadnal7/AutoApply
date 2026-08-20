"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import { US_STATES } from "@job-app/shared";

interface Profile {
  fullName: string;
  phone: string;
  city: string | null;
  state: string | null;
  workAuthorization: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
}

const WORK_AUTH_OPTIONS = [
  { value: "us_citizen", label: "US Citizen" },
  { value: "green_card", label: "Green Card" },
  { value: "h1b", label: "H1-B" },
  { value: "opt_ead", label: "OPT EAD" },
  { value: "gc_ead", label: "GC EAD" },
  { value: "other", label: "Other" },
];

const EMPTY: Profile = { fullName: "", phone: "", city: "", state: "", workAuthorization: "", linkedinUrl: "", portfolioUrl: "" };

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<{ profile: Profile | null }>("/profile").then((r) => r.profile),
  });

  const [form, setForm] = useState<Profile>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setForm({ ...EMPTY, ...data });
  }, [data]);

  const mutation = useMutation({
    mutationFn: (payload: Profile) => api.put<Profile>("/profile", payload),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Failed to save profile"),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate(form);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Candidate Profile</h1>
        <p className="mt-1 text-sm text-gray-500">
          This information is filled automatically into every mandatory application field — you only enter it once.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4 p-6">
        <div>
          <label className="label">Full Name</label>
          <input className="input" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        </div>
        <div>
          <label className="label">Phone Number</label>
          <input className="input" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">City</label>
            <input className="input" value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div>
            <label className="label">State</label>
            <select className="input" value={form.state ?? ""} onChange={(e) => setForm({ ...form, state: e.target.value })}>
              <option value="">Select a state</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Work Authorization</label>
          <select
            className="input"
            value={form.workAuthorization ?? ""}
            onChange={(e) => setForm({ ...form, workAuthorization: e.target.value })}
          >
            <option value="">Prefer not to say</option>
            {WORK_AUTH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">LinkedIn URL</label>
          <input className="input" value={form.linkedinUrl ?? ""} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} />
        </div>
        <div>
          <label className="label">Portfolio URL</label>
          <input className="input" value={form.portfolioUrl ?? ""} onChange={(e) => setForm({ ...form, portfolioUrl: e.target.value })} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? "Saving…" : "Save Profile"}
          </button>
          {saved && <span className="text-sm text-green-600">Saved</span>}
        </div>
      </form>
    </div>
  );
}
