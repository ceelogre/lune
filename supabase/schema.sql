create extension if not exists "pgcrypto";

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  uid text not null,
  email text,
  storage_path text not null,
  transcript_path text,
  transcript text,
  mime_type text,
  status text not null default 'uploading',
  duration_ms bigint,
  size_bytes bigint,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists videos_created_at_idx on public.videos (created_at desc);
create index if not exists videos_uid_idx on public.videos (uid);
