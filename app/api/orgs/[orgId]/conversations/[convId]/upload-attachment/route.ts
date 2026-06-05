/**
 * POST /api/orgs/[orgId]/conversations/[convId]/upload-attachment
 *
 * Uploads an image to Supabase Storage and returns a public URL.
 * The URL is then passed to the reply endpoint as attachment_url,
 * which sends it to Instagram as an image attachment.
 *
 * Accepts: multipart/form-data with field "file" (image/* only)
 * Max size: 8 MB
 * Bucket:   message-attachments (must be public in Supabase Storage)
 */

export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

interface Params { params: { orgId: string; convId: string } }

const MAX_BYTES  = 8 * 1024 * 1024; // 8 MB
const BUCKET     = "message-attachments";
const ALLOWED_MIME = /^image\/(jpeg|jpg|png|gif|webp|heic)$/i;

async function assertMember(orgId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("org_members").select("role")
    .eq("org_id", orgId).eq("user_id", user.id).single();
  return data ? user : null;
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await assertMember(params.orgId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let file: File;
  try {
    const form = await req.formData();
    const raw = form.get("file");
    if (!raw || typeof raw === "string") {
      return NextResponse.json({ error: "No file in form data (field: 'file')" }, { status: 400 });
    }
    file = raw as File;
  } catch {
    return NextResponse.json({ error: "Could not parse form data" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 8 MB)" }, { status: 400 });
  }
  if (!ALLOWED_MIME.test(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, GIF, WebP, and HEIC images are supported" }, { status: 400 });
  }

  const ext  = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${params.orgId}/${params.convId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const svc = createServiceClient();
  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, file, {
    contentType:  file.type,
    cacheControl: "3600",
    upsert:       false,
  });

  if (upErr) {
    console.error("[upload-attachment] storage upload failed:", upErr.message);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: { publicUrl } } = svc.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({ url: publicUrl, path });
}
