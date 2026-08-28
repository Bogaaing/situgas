-- supabase_migration_admin.sql
-- Migration: Add Admin Role, Admin RLS Policies, Audit Logs, and Helper Functions

-- 1. Ensure 'admin' is included in user_role enum
alter type public.user_role add value if not exists 'admin';

-- 2. Helper function to check if a user is an admin
create or replace function public.is_admin(p_user_id uuid)
returns boolean security definer set search_path = public, pg_temp as $$
begin
  return coalesce(public.get_user_role(p_user_id) = 'admin', false);
end;
$$ language plpgsql stable;

-- 3. Audit Logs table for tracking system activities
create table if not exists public.audit_logs (
    id uuid default gen_random_uuid() primary key,
    actor_id uuid references public.profiles(id) on delete set null,
    actor_name text,
    actor_email text,
    action text not null, -- e.g. 'CREATE_LECTURER', 'CREATE_COURSE', 'CREATE_STUDENT', 'CREATE_ASSIGNMENT', 'SUBMIT_ASSIGNMENT', 'GRADE_SUBMISSION'
    entity_type text not null, -- e.g. 'lecturer', 'course', 'student', 'assignment', 'submission', 'system'
    entity_id text,
    metadata jsonb default '{}'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_action on public.audit_logs(action);
create index if not exists idx_audit_logs_actor on public.audit_logs(actor_id);

-- Enable RLS on audit_logs
alter table public.audit_logs enable row level security;

-- 4. Update profile update protection to allow SQL Editor and admin modifications
create or replace function public.protect_profile_updates()
returns trigger security definer set search_path = public, pg_temp as $$
declare
  v_caller_role text;
begin
  if OLD.id <> NEW.id then
    raise exception 'ID profil tidak dapat diubah.';
  end if;
  
  -- If executed via authenticated client API, ensure caller is admin before allowing role/nim/email changes
  -- If executed directly in SQL Editor / service role (auth.uid() is NULL), allow changes
  if auth.uid() is not null then
    select role::text into v_caller_role from public.profiles where id = auth.uid();
    
    if v_caller_role is null or v_caller_role <> 'admin' then
      if OLD.role <> NEW.role then
        raise exception 'Perubahan role pengguna dilarang demi keamanan.';
      end if;
      if OLD.nim is distinct from NEW.nim then
        raise exception 'NIM mahasiswa bersifat permanen dan tidak dapat diubah.';
      end if;
      if OLD.email is distinct from NEW.email then
        raise exception 'Email tidak dapat diubah melalui profil.';
      end if;
    end if;
  end if;

  if OLD.created_at <> NEW.created_at then
    raise exception 'Waktu pembuatan tidak dapat diubah.';
  end if;
  return NEW;
end;
$$ language plpgsql;

-- 5. Add Admin RLS Policies (Additive & Non-destructive)

-- A. PROFILES: Admin full access
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Admins have full access to profiles'
  ) then
    create policy "Admins have full access to profiles"
      on public.profiles for all
      to authenticated
      using (public.is_admin(auth.uid()))
      with check (public.is_admin(auth.uid()));
  end if;
end $$;

-- B. COURSES: Admin view and manage all courses
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'courses' and policyname = 'Admins can view and manage all courses'
  ) then
    create policy "Admins can view and manage all courses"
      on public.courses for all
      to authenticated
      using (public.is_admin(auth.uid()))
      with check (public.is_admin(auth.uid()));
  end if;
end $$;

-- C. ENROLLMENTS: Admin view and manage all enrollments
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'enrollments' and policyname = 'Admins can view and manage all enrollments'
  ) then
    create policy "Admins can view and manage all enrollments"
      on public.enrollments for all
      to authenticated
      using (public.is_admin(auth.uid()))
      with check (public.is_admin(auth.uid()));
  end if;
end $$;

-- D. ASSIGNMENTS: Admin view all assignments
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'assignments' and policyname = 'Admins can view all assignments'
  ) then
    create policy "Admins can view all assignments"
      on public.assignments for select
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;
end $$;

-- E. SUBMISSIONS: Admin view all submissions
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'submissions' and policyname = 'Admins can view all submissions'
  ) then
    create policy "Admins can view all submissions"
      on public.submissions for select
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;
end $$;

-- F. AUDIT LOGS: Admin view all, authenticated can insert
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'Admins can view all audit logs'
  ) then
    create policy "Admins can view all audit logs"
      on public.audit_logs for select
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'Authenticated users can insert audit logs'
  ) then
    create policy "Authenticated users can insert audit logs"
      on public.audit_logs for insert
      to authenticated
      with check (true);
  end if;
end $$;

-- 6. Update handle_new_user to respect metadata role (student or lecturer)
create or replace function public.handle_new_user()
returns trigger security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (
    id,
    email,
    name,
    role,
    nim,
    avatar_url
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'User Baru'),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'student'::public.user_role),
    new.raw_user_meta_data->>'nim',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    name = coalesce(excluded.name, profiles.name),
    role = coalesce(excluded.role, profiles.role);
  return new;
end;
$$ language plpgsql;
