-- 023_message_attachments_bucket.sql
--
-- Creates the Supabase Storage bucket used by the Instagram compose-bar image
-- attachment feature (POST /api/orgs/[orgId]/conversations/[convId]/upload-attachment).
--
-- Safe to run multiple times: every statement is guarded with ON CONFLICT / IF NOT EXISTS.
--
-- Bucket behaviour:
--   public = true   → files are readable by anyone with the URL (required so that
--                      the public URL passed to the Instagram Graph API is accessible
--                      by Meta's servers when sending the image attachment)
--
-- RLS policies:
--   INSERT  — authenticated org members only (enforced at API layer too)
--   SELECT  — public (matches public bucket; needed for Meta to fetch the image URL)
--   DELETE  — org members who own the org folder (orgId = path prefix)
--
-- Apply in: Supabase dashboard → SQL Editor, or via supabase db push.

-- ── 1. Create bucket ──────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  true,
  8388608,   -- 8 MB in bytes (matches API validation)
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET
    public             = true,          -- ensure bucket stays public even on re-run
    file_size_limit    = 8388608,
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/jpg', 'image/png',
      'image/gif',  'image/webp',
      'image/heic', 'image/heif'
    ];

-- ── 2. RLS — INSERT: authenticated users can upload ──────────────────────────
-- Authenticated users can insert objects into the message-attachments bucket.
-- The API route enforces org membership before calling storage; this policy is
-- a defence-in-depth layer so no unauthenticated upload can bypass the API.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'message-attachments: authenticated users can upload'
  ) THEN
    CREATE POLICY "message-attachments: authenticated users can upload"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'message-attachments');
  END IF;
END $$;

-- ── 3. RLS — SELECT: public read (required for Meta Graph API to fetch image) ─
-- The Instagram Graph API needs to GET the image URL when sending the attachment.
-- Because the bucket is public, Supabase will serve objects without auth headers,
-- but we still need the policy to exist to avoid PostgREST 403s on direct queries.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'message-attachments: public read'
  ) THEN
    CREATE POLICY "message-attachments: public read"
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'message-attachments');
  END IF;
END $$;

-- ── 4. RLS — DELETE: org members can delete their own uploads ─────────────────
-- Path format: {orgId}/{convId}/{timestamp}-{random}.{ext}
-- The first path segment is the orgId, which must match an org the user belongs to.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'message-attachments: org members can delete'
  ) THEN
    CREATE POLICY "message-attachments: org members can delete"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'message-attachments'
        AND (storage.foldername(name))[1]::uuid IN (
          SELECT org_id FROM org_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── 5. Verify ─────────────────────────────────────────────────────────────────
-- Run this SELECT after applying to confirm everything is correct:
--
--   SELECT id, name, public, file_size_limit, allowed_mime_types
--   FROM storage.buckets
--   WHERE id = 'message-attachments';
--
--   SELECT policyname, cmd, roles
--   FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND policyname LIKE 'message-attachments%'
--   ORDER BY policyname;
