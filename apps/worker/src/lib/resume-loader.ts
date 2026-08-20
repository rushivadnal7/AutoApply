import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { ResumeFilePayload } from "@job-app/shared";
import { env, usesSupabaseStorage } from "./env.js";

// Mirrors apps/api's local uploads root — both processes share the same
// convention (storagePath is relative: "{userId}/{resumeId}/{fileName}").
// In a real deployment this only matters for local dev; production uses
// Supabase for both apps, so there's nothing to keep in sync.
const LOCAL_UPLOADS_ROOT = resolve(process.cwd(), "..", "api", "uploads");

export async function loadResumeFile(resume: {
  storagePath: string;
  fileName: string;
  mimeType: string;
}): Promise<ResumeFilePayload> {
  if (usesSupabaseStorage) {
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await client.storage.from(env.SUPABASE_STORAGE_BUCKET).download(resume.storagePath);
    if (error || !data) throw new Error(`Failed to download resume from Supabase: ${error?.message}`);
    const buffer = Buffer.from(await data.arrayBuffer());
    return { fileName: resume.fileName, mimeType: resume.mimeType, buffer };
  }

  const localPath = join(LOCAL_UPLOADS_ROOT, resume.storagePath);
  await readFile(localPath); // fail fast with a clear error if missing
  return { fileName: resume.fileName, mimeType: resume.mimeType, path: localPath };
}
