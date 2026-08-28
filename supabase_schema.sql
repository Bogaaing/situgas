-- supabase_schema.sql
-- SITugas - Sistem Manajemen Tugas Kuliah
-- Supabase Database Schema

-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- ==========================================
-- 1. ENUMS & CUSTOM TYPES
-- ==========================================
create type public.user_role as enum ('admin', 'lecturer', 'student');
create type public.assignment_status as enum ('draft', 'published', 'closed');

-- ==========================================
-- 2. CORE TABLES
-- ==========================================

-- A. PROFILES TABLE (linked 1:1 to auth.users)
create table if not exists public.profiles (
    id uuid references auth.users on delete cascade primary key,
    email text not null,
    name text not null,
    role public.user_role not null default 'student',
    nim text unique check (role = 'student' or nim is null), -- NIM is unique and only allowed for student role
    avatar_url text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- B. COURSES TABLE
create table if not exists public.courses (
    id uuid default gen_random_uuid() primary key,
    code text not null unique,
    name text not null,
    lecturer_id uuid references public.profiles(id) on delete cascade not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- C. ENROLLMENTS TABLE (N:M relation student <-> course)
create table if not exists public.enrollments (
    id uuid default gen_random_uuid() primary key,
    course_id uuid references public.courses(id) on delete cascade not null,
    student_id uuid references public.profiles(id) on delete cascade not null,
    class_name text not null,
    room_name text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint unique_student_course unique(course_id, student_id)
);

-- D. ASSIGNMENTS TABLE
create table if not exists public.assignments (
    id uuid default gen_random_uuid() primary key,
    course_id uuid references public.courses(id) on delete cascade not null,
    title text not null,
    description text not null,
    deadline timestamp with time zone not null,
    max_points integer default 100 not null check (max_points > 0),
    status public.assignment_status default 'draft' not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- E. SUBMISSIONS / GRADES TABLE
create table if not exists public.submissions (
    id uuid default gen_random_uuid() primary key,
    assignment_id uuid references public.assignments(id) on delete cascade not null,
    student_id uuid references public.profiles(id) on delete cascade not null,
    submitted_at timestamp with time zone default timezone('utc'::text, now()) not null,
    file_path text,
    submitted_link text,
    submitted_note text,
    grade integer check (grade >= 0),
    feedback text,
    graded_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint unique_student_submission unique(assignment_id, student_id)
);

-- ==========================================
-- 3. INDEXES FOR PERFORMANCE
-- ==========================================
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_nim on public.profiles(nim);
create index if not exists idx_courses_lecturer on public.courses(lecturer_id);
create index if not exists idx_enrollments_student on public.enrollments(student_id);
create index if not exists idx_enrollments_course on public.enrollments(course_id);
create index if not exists idx_assignments_course on public.assignments(course_id);
create index if not exists idx_submissions_assignment on public.submissions(assignment_id);
create index if not exists idx_submissions_student on public.submissions(student_id);

-- ==========================================
-- 4. REUSABLE TRIGGERS (UPDATED_AT)
-- ==========================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
    NEW.updated_at = timezone('utc'::text, now());
    return NEW;
end;
$$ language plpgsql;

create trigger tr_profiles_updated_at before update on public.profiles for each row execute procedure public.handle_updated_at();
create trigger tr_courses_updated_at before update on public.courses for each row execute procedure public.handle_updated_at();
create trigger tr_enrollments_updated_at before update on public.enrollments for each row execute procedure public.handle_updated_at();
create trigger tr_assignments_updated_at before update on public.assignments for each row execute procedure public.handle_updated_at();
create trigger tr_submissions_updated_at before update on public.submissions for each row execute procedure public.handle_updated_at();

-- ==========================================
-- 5. SECURITY HELPER FUNCTIONS
-- ==========================================

-- Get a user's role
create or replace function public.get_user_role(p_user_id uuid)
returns text security definer set search_path = public, pg_temp as $$
declare
  user_role text;
begin
  select role::text into user_role from public.profiles where id = p_user_id;
  return user_role;
end;
$$ language plpgsql stable;

-- Check if user is a lecturer
create or replace function public.is_lecturer(p_user_id uuid)
returns boolean security definer set search_path = public, pg_temp as $$
begin
  return coalesce(public.get_user_role(p_user_id) = 'lecturer', false);
end;
$$ language plpgsql stable;

-- Check if lecturer owns a course
create or replace function public.is_course_lecturer(p_course_id uuid, p_user_id uuid)
returns boolean security definer set search_path = public, pg_temp as $$
begin
  return exists (
    select 1 from public.courses
    where id = p_course_id and lecturer_id = p_user_id
  );
end;
$$ language plpgsql stable;

-- Check if student is enrolled in a course
create or replace function public.is_enrolled_student(p_course_id uuid, p_user_id uuid)
returns boolean security definer set search_path = public, pg_temp as $$
begin
  return exists (
    select 1 from public.enrollments
    where course_id = p_course_id and student_id = p_user_id
  );
end;
$$ language plpgsql stable;

-- Check if lecturer owns the assignment's course
create or replace function public.is_assignment_lecturer(p_assignment_id uuid, p_user_id uuid)
returns boolean security definer set search_path = public, pg_temp as $$
begin
  return exists (
    select 1 from public.assignments a
    join public.courses c on a.course_id = c.id
    where a.id = p_assignment_id and c.lecturer_id = p_user_id
  );
end;
$$ language plpgsql stable;

-- Check if student profile belongs to a course owned by the lecturer
create or replace function public.is_student_enrolled_in_lecturer_courses(p_student_id uuid, p_lecturer_id uuid)
returns boolean security definer set search_path = public, pg_temp as $$
begin
  return exists (
    select 1 from public.enrollments e
    join public.courses c on e.course_id = c.id
    where e.student_id = p_student_id and c.lecturer_id = p_lecturer_id
  );
end;
$$ language plpgsql stable;

-- ==========================================
-- 6. DATA VALIDATION TRIGGERS
-- ==========================================

-- Guard: Protect profile fields (only allow updating name, avatar_url, and updated_at)
create or replace function public.protect_profile_updates()
returns trigger security definer set search_path = public, pg_temp as $$
declare
  v_caller_role text;
begin
  if OLD.id <> NEW.id then
    raise exception 'ID profil tidak dapat diubah.';
  end if;
  
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

drop trigger if exists tr_protect_profile_role on public.profiles;
create trigger tr_protect_profile_updates
  before update on public.profiles
  for each row execute procedure public.protect_profile_updates();

-- Guard: Grade verification (cannot exceed assignment max_points)
create or replace function public.validate_submission_grade()
returns trigger security definer set search_path = public, pg_temp as $$
declare
  v_max_points integer;
begin
  if NEW.grade is not null then
    select max_points into v_max_points from public.assignments where id = NEW.assignment_id;
    if NEW.grade > v_max_points then
      raise exception 'Nilai grade (%) tidak boleh melebihi batas maksimal poin tugas (%)', NEW.grade, v_max_points;
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger tr_validate_submission_grade
  before insert or update of grade on public.submissions
  for each row execute procedure public.validate_submission_grade();

-- Guard: Ensure student cannot tamper with grades, feedback or evaluation timestamp
create or replace function public.protect_submission_grading()
returns trigger security definer set search_path = public, pg_temp as $$
begin
  if not public.is_lecturer(auth.uid()) then
    if OLD.grade is distinct from NEW.grade then
      raise exception 'Mahasiswa tidak memiliki hak akses untuk memberikan atau mengubah nilai.';
    end if;
    if OLD.feedback is distinct from NEW.feedback then
      raise exception 'Mahasiswa tidak memiliki hak akses untuk mengisi atau merubah feedback.';
    end if;
    if OLD.graded_at is distinct from NEW.graded_at then
      raise exception 'Mahasiswa tidak memiliki hak akses untuk memanipulasi waktu penilaian.';
    end if;
  else
    -- Lecturer guard
    if not public.is_assignment_lecturer(NEW.assignment_id, auth.uid()) then
      raise exception 'Dosen hanya diperbolehkan menilai tugas pada mata kuliah yang diampunya sendiri.';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger tr_protect_submission_grading
  before update on public.submissions
  for each row execute procedure public.protect_submission_grading();

-- ==========================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.enrollments enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;

-- PROFILES POLICIES
create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Lecturers can view profiles of students in their courses"
  on public.profiles for select
  to authenticated
  using (public.is_student_enrolled_in_lecturer_courses(id, auth.uid()));

create policy "Lecturers can view other lecturers profiles"
  on public.profiles for select
  to authenticated
  using (public.is_lecturer(auth.uid()) and role = 'lecturer');

create policy "Users can update their own profile details"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- COURSES POLICIES
create policy "Lecturers can manage their own courses"
  on public.courses for all
  to authenticated
  using (lecturer_id = auth.uid())
  with check (lecturer_id = auth.uid());

create policy "Students can view enrolled courses"
  on public.courses for select
  to authenticated
  using (public.is_enrolled_student(id, auth.uid()));

-- ENROLLMENTS POLICIES
create policy "Lecturers can manage enrollments for their courses"
  on public.enrollments for all
  to authenticated
  using (public.is_course_lecturer(course_id, auth.uid()))
  with check (public.is_course_lecturer(course_id, auth.uid()));

create policy "Students can view their own enrollments"
  on public.enrollments for select
  to authenticated
  using (student_id = auth.uid());

-- ASSIGNMENTS POLICIES
create policy "Lecturers can manage assignments for their courses"
  on public.assignments for all
  to authenticated
  using (public.is_course_lecturer(course_id, auth.uid()))
  with check (public.is_course_lecturer(course_id, auth.uid()));

create policy "Students can view published/closed assignments for enrolled courses"
  on public.assignments for select
  to authenticated
  using (public.is_enrolled_student(course_id, auth.uid()) and status in ('published', 'closed'));

-- SUBMISSIONS POLICIES
create policy "Lecturers can view submissions for their assignments"
  on public.submissions for select
  to authenticated
  using (public.is_assignment_lecturer(assignment_id, auth.uid()));

create policy "Lecturers can grade and write feedback on submissions"
  on public.submissions for update
  to authenticated
  using (public.is_assignment_lecturer(assignment_id, auth.uid()))
  with check (public.is_assignment_lecturer(assignment_id, auth.uid()));

create policy "Students can view their own submissions"
  on public.submissions for select
  to authenticated
  using (student_id = auth.uid());

create policy "Students can submit their assignments"
  on public.submissions for insert
  to authenticated
  with check (
    student_id = auth.uid() and 
    public.is_enrolled_student((select course_id from public.assignments where id = assignment_id), auth.uid())
  );

create policy "Students can update their own submissions text/link"
  on public.submissions for update
  to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- ==========================================
-- 8. AUTOMATIC PROFILE TRIGGER ON SIGNUP
-- ==========================================
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
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Mahasiswa Baru'),
    'student', -- Enforce student role default for security
    new.raw_user_meta_data->>'nim',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ==========================================
-- 9. SUPABASE STORAGE INTEGRATION
-- ==========================================

-- Create private bucket 'assignment-submissions'
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assignment-submissions', 'assignment-submissions', false, null, null)
on conflict (id) do nothing;

-- Note: storage.objects has RLS enabled by default in Supabase. 
-- Do not run alter table storage.objects manually as it may fail with "must be owner of table objects" under restricted roles.
-- alter table storage.objects enable row level security;

create policy "Students can upload submission documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'assignment-submissions' and
    split_part(name, '/', 2) = auth.uid()::text
  );

create policy "Students can update/delete their own files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'assignment-submissions' and
    split_part(name, '/', 2) = auth.uid()::text
  )
  with check (
    bucket_id = 'assignment-submissions' and
    split_part(name, '/', 2) = auth.uid()::text
  );

create policy "Students can delete their own files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'assignment-submissions' and
    split_part(name, '/', 2) = auth.uid()::text
  );

create policy "Students can download their own files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'assignment-submissions' and
    split_part(name, '/', 2) = auth.uid()::text
  );

create policy "Lecturers can download student files for their assignments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'assignment-submissions' and
    public.is_assignment_lecturer(split_part(name, '/', 1)::uuid, auth.uid())
  );

-- Create private bucket 'course-materials'
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-materials', 'course-materials', false, null, null)
on conflict (id) do nothing;

create policy "Lecturers can upload course materials"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'course-materials' and
    public.is_lecturer(auth.uid())
  );

create policy "Lecturers can update course materials"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'course-materials' and
    public.is_lecturer(auth.uid())
  )
  with check (
    bucket_id = 'course-materials' and
    public.is_lecturer(auth.uid())
  );

create policy "Lecturers can delete course materials"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'course-materials' and
    public.is_lecturer(auth.uid())
  );

create policy "Students and Lecturers can download course materials"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'course-materials'
  );
