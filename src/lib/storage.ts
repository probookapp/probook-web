import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

const BUCKET = "uploads";

function filePath(tenantId: string, folder: string, filename: string) {
  return `${tenantId}/${folder}/${filename}`;
}

export async function uploadFile(
  tenantId: string,
  folder: string,
  filename: string,
  file: Buffer,
  contentType: string,
): Promise<string> {
  const path = filePath(tenantId, folder, filename);

  const supabase = getSupabase();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteFile(
  tenantId: string,
  folder: string,
  filename: string,
): Promise<void> {
  const path = filePath(tenantId, folder, filename);
  const { error } = await getSupabase().storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}
