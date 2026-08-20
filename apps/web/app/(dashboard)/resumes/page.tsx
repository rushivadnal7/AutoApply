"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";

interface Resume {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  isDefault: boolean;
  uploadedAt: string;
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function ResumesPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => api.get<{ resumes: Resume[] }>("/resumes").then((r) => r.resumes),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.upload<Resume>("/resumes", form);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["resumes"] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Upload failed"),
  });

  const defaultMutation = useMutation({
    mutationFn: (id: string) => api.post(`/resumes/${id}/default`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["resumes"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/resumes/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["resumes"] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Delete failed"),
  });

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    uploadMutation.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Resumes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload once, assign to as many job roles as you like — no need to re-upload for each role.
          </p>
        </div>
        <div>
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileSelected} />
          <button className="btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
            {uploadMutation.isPending ? "Uploading…" : "Upload Resume"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="card divide-y divide-gray-100">
        {resumes?.length ? (
          resumes.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {r.fileName}
                  {r.isDefault && <span className="badge ml-2 bg-brand-50 text-brand-700">Default</span>}
                </p>
                <p className="text-xs text-gray-500">
                  {formatSize(r.fileSizeBytes)} · uploaded {new Date(r.uploadedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!r.isDefault && (
                  <button className="btn-secondary" onClick={() => defaultMutation.mutate(r.id)}>
                    Make Default
                  </button>
                )}
                <button className="btn-secondary" onClick={() => api.downloadFile(`/resumes/${r.id}/download`, r.fileName)}>
                  Download
                </button>
                <button
                  className="btn-danger"
                  onClick={() => {
                    if (confirm(`Delete ${r.fileName}?`)) deleteMutation.mutate(r.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="px-5 py-8 text-center text-sm text-gray-400">No resumes uploaded yet.</p>
        )}
      </div>
    </div>
  );
}
