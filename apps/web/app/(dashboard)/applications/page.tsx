"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface ApplicationRow {
  id: string;
  status: string;
  platformMatchScore: number | null;
  skipReason: string | null;
  failureReason: string | null;
  createdAt: string;
  job: { title: string; company: string; location: string; url: string; jobPortal: { code: string; name: string } };
  jobRole: { id: string; title: string };
  resume: { id: string; fileName: string } | null;
}

interface ApplicationsResponse {
  items: ApplicationRow[];
  total: number;
  page: number;
  pageSize: number;
}

const STATUS_OPTIONS = ["", "applied", "skipped", "failed", "processing"];

export default function ApplicationsPage() {
  const [filters, setFilters] = useState({ jobTitle: "", company: "", status: "", page: 1 });

  const params = new URLSearchParams();
  if (filters.jobTitle) params.set("jobTitle", filters.jobTitle);
  if (filters.company) params.set("company", filters.company);
  if (filters.status) params.set("status", filters.status);
  params.set("page", String(filters.page));

  const { data } = useQuery({
    queryKey: ["applications", filters],
    queryFn: () => api.get<ApplicationsResponse>(`/applications?${params.toString()}`),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Application History</h1>
        <p className="mt-1 text-sm text-gray-500">Every job the bot has processed, with the reason for each outcome.</p>
      </div>

      <div className="card flex flex-wrap gap-3 p-4">
        <input
          className="input w-48"
          placeholder="Job title"
          value={filters.jobTitle}
          onChange={(e) => setFilters({ ...filters, jobTitle: e.target.value, page: 1 })}
        />
        <input
          className="input w-48"
          placeholder="Company"
          value={filters.company}
          onChange={(e) => setFilters({ ...filters, company: e.target.value, page: 1 })}
        />
        <select className="input w-40" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s || "All statuses"}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Platform</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Match</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data?.items.length ? (
              data.items.map((app) => (
                <tr key={app.id}>
                  <td className="px-4 py-3">
                    <a href={app.job.url} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">
                      {app.job.title}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{app.job.company}</td>
                  <td className="px-4 py-3 text-gray-600">{app.job.jobPortal.name}</td>
                  <td className="px-4 py-3 text-gray-600">{app.jobRole.title}</td>
                  <td className="px-4 py-3 text-gray-600">{app.platformMatchScore != null ? `${app.platformMatchScore}%` : "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={app.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">{(app.skipReason ?? app.failureReason ?? "—").replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(app.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  No applications match these filters yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Page {data.page} of {Math.ceil(data.total / data.pageSize)}
          </span>
          <div className="flex gap-2">
            <button
              className="btn-secondary"
              disabled={filters.page <= 1}
              onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
            >
              Previous
            </button>
            <button
              className="btn-secondary"
              disabled={filters.page >= Math.ceil(data.total / data.pageSize)}
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
