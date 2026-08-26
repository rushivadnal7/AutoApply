"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, formatApiError } from "@/lib/api-client";
import { US_STATES } from "@job-app/shared";

interface ResumeOption {
  id: string;
  fileName: string;
}

interface ResumeLink {
  resumeId: string;
  isPrimary: boolean;
  resume: ResumeOption;
}

interface Location {
  id: string;
  locationType: "city" | "state" | "remote";
  city: string | null;
  state: string | null;
}

interface Preference {
  datePosted: string;
  employmentType: string;
  workArrangement: string;
  matchThresholdPercent: number;
  skipCoverLetter: boolean;
  skipOptionalMessage: boolean;
  skipPortfolio: boolean;
  fillLinkedIn: boolean;
}

export interface JobRole {
  id: string;
  title: string;
  applicationLimit: number;
  isActive: boolean;
  resumeLinks: ResumeLink[];
  preference: Preference | null;
  locations: Location[];
}

export function RoleCard({ role, availableResumes }: { role: JobRole; availableResumes: ResumeOption[] }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pref, setPref] = useState<Preference>(
    role.preference ?? {
      datePosted: "last_3_days",
      employmentType: "both",
      workArrangement: "any",
      matchThresholdPercent: 70,
      skipCoverLetter: true,
      skipOptionalMessage: true,
      skipPortfolio: true,
      fillLinkedIn: false,
    },
  );
  const [newLocationType, setNewLocationType] = useState<"city" | "state" | "remote">("remote");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [selectedResumeId, setSelectedResumeId] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["roles"] });

  const assignResume = useMutation({
    mutationFn: () => api.post(`/roles/${role.id}/resumes`, { resumeId: selectedResumeId, isPrimary: role.resumeLinks.length === 0 }),
    onSuccess: () => {
      setSelectedResumeId("");
      setError(null);
      invalidate();
    },
    onError: (err) => setError(formatApiError(err, "Failed to assign resume")),
  });

  const unassignResume = useMutation({
    mutationFn: (resumeId: string) => api.delete(`/roles/${role.id}/resumes/${resumeId}`),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(formatApiError(err, "Failed to remove resume")),
  });

  const setPrimaryResume = useMutation({
    mutationFn: (resumeId: string) => api.post(`/roles/${role.id}/resumes`, { resumeId, isPrimary: true }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(formatApiError(err, "Failed to set primary resume")),
  });

  const deleteRole = useMutation({
    mutationFn: () => api.delete(`/roles/${role.id}`),
    onSuccess: invalidate,
    onError: (err) => setError(formatApiError(err, "Failed to delete role")),
  });

  const savePreferences = useMutation({
    mutationFn: () => {
      const locations = role.locations.map((l) => ({ locationType: l.locationType, city: l.city ?? undefined, state: l.state ?? undefined }));
      return api.put(`/roles/${role.id}/preferences`, { ...pref, locations });
    },
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(formatApiError(err, "Failed to save preferences")),
  });

  const addLocation = useMutation({
    mutationFn: () => {
      const locations = [
        ...role.locations.map((l) => ({ locationType: l.locationType, city: l.city ?? undefined, state: l.state ?? undefined })),
        newLocationType === "city"
          ? { locationType: "city" as const, city: newCity, state: newState }
          : newLocationType === "state"
            ? { locationType: "state" as const, state: newState }
            : { locationType: "remote" as const },
      ];
      return api.put(`/roles/${role.id}/preferences`, { ...pref, locations });
    },
    onSuccess: () => {
      setNewCity("");
      setNewState("");
      setError(null);
      invalidate();
    },
    onError: (err) => setError(formatApiError(err, "Failed to add location")),
  });

  const removeLocation = useMutation({
    mutationFn: (locationId: string) => {
      const locations = role.locations
        .filter((l) => l.id !== locationId)
        .map((l) => ({ locationType: l.locationType, city: l.city ?? undefined, state: l.state ?? undefined }));
      return api.put(`/roles/${role.id}/preferences`, { ...pref, locations });
    },
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) =>
      setError(
        formatApiError(err, "Failed to remove location") +
          (role.locations.length === 1 ? " — a role needs at least one location, add another before removing this one." : ""),
      ),
  });

  const unassignedResumes = availableResumes.filter((r) => !role.resumeLinks.some((l) => l.resumeId === r.id));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">{role.title}</p>
          <p className="text-xs text-gray-500">Application limit: {role.applicationLimit}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "Collapse" : "Configure"}
          </button>
          <button
            className="btn-danger"
            onClick={() => {
              if (confirm(`Delete role "${role.title}"?`)) deleteRole.mutate();
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {role.resumeLinks.length ? (
          role.resumeLinks.map((l) => (
            <span key={l.resumeId} className="badge bg-gray-100 text-gray-700">
              {l.resume.fileName}
              {l.isPrimary && " (primary)"}
            </span>
          ))
        ) : (
          <span className="text-xs text-amber-600">No resume assigned yet</span>
        )}
        {role.locations.length === 0 && <span className="text-xs text-amber-600">No locations configured yet</span>}
      </div>

      {expanded && (
        <div className="mt-5 space-y-6 border-t border-gray-100 pt-5">
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div>
            <p className="label">Assigned Resumes</p>
            <p className="mb-2 text-xs text-gray-500">The same resume can be assigned to multiple roles — no need to re-upload.</p>
            <div className="flex flex-wrap gap-2">
              {role.resumeLinks.map((l) => (
                <div key={l.resumeId} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs">
                  <span>
                    {l.resume.fileName} {l.isPrimary && <strong>(primary)</strong>}
                  </span>
                  {!l.isPrimary && (
                    <button className="text-brand-600 hover:underline" onClick={() => setPrimaryResume.mutate(l.resumeId)}>
                      Set primary
                    </button>
                  )}
                  <button className="text-red-600 hover:underline" onClick={() => unassignResume.mutate(l.resumeId)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
            {unassignedResumes.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <select className="input" value={selectedResumeId} onChange={(e) => setSelectedResumeId(e.target.value)}>
                  <option value="">Select a resume to assign…</option>
                  {unassignedResumes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.fileName}
                    </option>
                  ))}
                </select>
                <button className="btn-secondary shrink-0" disabled={!selectedResumeId} onClick={() => assignResume.mutate()}>
                  Assign
                </button>
              </div>
            )}
          </div>

          <div>
            <p className="label">Locations (US only)</p>
            <div className="flex flex-wrap gap-2">
              {role.locations.map((l) => (
                <span key={l.id} className="badge flex items-center gap-1 bg-gray-100 text-gray-700">
                  {l.locationType === "remote" ? "Remote — US" : l.locationType === "state" ? l.state : `${l.city}, ${l.state}`}
                  <button className="ml-1 text-red-600" onClick={() => removeLocation.mutate(l.id)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select className="input w-32" value={newLocationType} onChange={(e) => setNewLocationType(e.target.value as typeof newLocationType)}>
                <option value="remote">Remote</option>
                <option value="state">State</option>
                <option value="city">City</option>
              </select>
              {newLocationType !== "remote" && (
                <select className="input w-40" value={newState} onChange={(e) => setNewState(e.target.value)}>
                  <option value="">State…</option>
                  {US_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              {newLocationType === "city" && (
                <input className="input w-40" placeholder="City" value={newCity} onChange={(e) => setNewCity(e.target.value)} />
              )}
              <button
                className="btn-secondary"
                disabled={newLocationType !== "remote" && !newState}
                onClick={() => addLocation.mutate()}
              >
                Add Location
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Date Posted</label>
              <select className="input" value={pref.datePosted} onChange={(e) => setPref({ ...pref, datePosted: e.target.value })}>
                <option value="today">Today</option>
                <option value="last_3_days">Last 3 days</option>
                <option value="all">All</option>
              </select>
            </div>
            <div>
              <label className="label">Employment Type</label>
              <select className="input" value={pref.employmentType} onChange={(e) => setPref({ ...pref, employmentType: e.target.value })}>
                <option value="contract_c2c">Contract / C2C</option>
                <option value="fulltime">Full-time</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div>
              <label className="label">Work Arrangement</label>
              <select className="input" value={pref.workArrangement} onChange={(e) => setPref({ ...pref, workArrangement: e.target.value })}>
                <option value="remote">Remote only</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
                <option value="any">Any</option>
              </select>
            </div>
            <div>
              <label className="label">Minimum Match Score (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                className="input"
                value={pref.matchThresholdPercent}
                onChange={(e) => setPref({ ...pref, matchThresholdPercent: Number(e.target.value) })}
              />
            </div>
          </div>

          <div>
            <p className="label">Optional Application Fields</p>
            <p className="mb-2 text-xs text-gray-500">
              These settings only apply to OPTIONAL fields — mandatory contact information is always filled and can never be skipped.
            </p>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pref.skipCoverLetter} onChange={(e) => setPref({ ...pref, skipCoverLetter: e.target.checked })} />
                Skip Cover Letter
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={pref.skipOptionalMessage}
                  onChange={(e) => setPref({ ...pref, skipOptionalMessage: e.target.checked })}
                />
                Skip Optional Message
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pref.skipPortfolio} onChange={(e) => setPref({ ...pref, skipPortfolio: e.target.checked })} />
                Skip Portfolio URL
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pref.fillLinkedIn} onChange={(e) => setPref({ ...pref, fillLinkedIn: e.target.checked })} />
                Fill LinkedIn Profile
              </label>
            </div>
          </div>

          <div>
            {role.locations.length === 0 && (
              <p className="mb-2 text-sm text-amber-600">
                Add at least one location above before saving — a role needs a location to search against.
              </p>
            )}
            <button
              className="btn-primary"
              disabled={savePreferences.isPending || role.locations.length === 0}
              onClick={() => savePreferences.mutate()}
              title={role.locations.length === 0 ? "Add a location first" : undefined}
            >
              {savePreferences.isPending ? "Saving…" : "Save Preferences"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
