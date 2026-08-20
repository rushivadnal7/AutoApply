import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { env, usesSupabaseStorage } from "./env.js";

/**
 * Resume file storage. Prefers Supabase Storage (private bucket, matches
 * the deployed architecture in SYSTEM_DESIGN.md) and falls back to local
 * disk when Supabase env vars aren't configured — so the app is fully
 * runnable before any cloud account exists. Callers never see which one is
 * active; they only get a storagePath key and, on read, either a short-lived
 * signed URL or a raw buffer to stream.
 */

const LOCAL_UPLOADS_ROOT = resolve(process.cwd(), "uploads");
const SIGNED_URL_TTL_SECONDS = 300;

function buildStorageKey(userId: string, resumeId: string, fileName: string): string {
  // Never trust the client-supplied filename for path construction beyond the
  // final segment — the directory is keyed entirely off IDs.
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
  return `${userId}/${resumeId}/${safeName}`;
}

function supabaseClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function saveResumeFile(
  userId: string,
  resumeId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ storagePath: string }> {
  const storagePath = buildStorageKey(userId, resumeId, fileName);

  if (usesSupabaseStorage) {
    const { error } = await supabaseClient()
      .storage.from(env.SUPABASE_STORAGE_BUCKET)
      .upload(storagePath, buffer, { contentType: mimeType, upsert: true });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return { storagePath };
  }

  const localPath = join(LOCAL_UPLOADS_ROOT, storagePath);
  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, buffer);
  return { storagePath };
}

export async function getResumeSignedUrl(storagePath: string): Promise<string | null> {
  if (!usesSupabaseStorage) return null;
  const { data, error } = await supabaseClient()
    .storage.from(env.SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error) throw new Error(`Supabase signed URL failed: ${error.message}`);
  return data.signedUrl;
}

export async function readResumeFileLocally(storagePath: string): Promise<Buffer> {
  const localPath = join(LOCAL_UPLOADS_ROOT, storagePath);
  return readFile(localPath);
}

/** Absolute local filesystem path — used only by the worker's Playwright upload step. */
export function resolveLocalResumePath(storagePath: string): string {
  return join(LOCAL_UPLOADS_ROOT, storagePath);
}

export async function deleteResumeFile(storagePath: string): Promise<void> {
  if (usesSupabaseStorage) {
    const { error } = await supabaseClient().storage.from(env.SUPABASE_STORAGE_BUCKET).remove([storagePath]);
    if (error) throw new Error(`Supabase delete failed: ${error.message}`);
    return;
  }
  const localPath = join(LOCAL_UPLOADS_ROOT, storagePath);
  await unlink(localPath).catch(() => undefined);
}
