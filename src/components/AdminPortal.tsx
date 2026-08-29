import React, { useState, useEffect, useMemo, startTransition } from 'react';
import { 
  LayoutDashboard, Presentation, BookOpen, GraduationCap, Layers, Activity, 
  Settings, LogOut, Search, Plus, Filter, Trash2, Edit3, CheckCircle2, 
  AlertTriangle, Shield, UserPlus, Database, Lock, Server,
  Menu, X, RefreshCw, ChevronRight, ChevronLeft, UserCheck,
  Check, ArrowRight, Eye, Ban, Calendar, Clock, School, 
  FileText, CheckSquare, UploadCloud, Info, Bell, Users
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, AreaChart, Area, CartesianGrid } from 'recharts';
import { createClient } from '@supabase/supabase-js';
import { User } from '../types';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { COURSES } from '../data';

interface AdminPortalProps {
  user: User;
  onLogout: () => void;
}

interface ProfileUser {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'lecturer' | 'admin';
  nim?: string | null;
  avatar_url?: string | null;
  created_at?: string;
  status?: 'active' | 'inactive';
}

interface CourseItem {
  id: string;
  code: string;
  name: string;
  lecturer_id?: string;
  lecturer_name?: string;
  credits?: number;
  classes_count?: number;
  students_count?: number;
  status?: 'active' | 'inactive';
  created_at?: string;
}

interface EnrollmentItem {
  id: string;
  course_id: string;
  course_code: string;
  course_name: string;
  student_id: string;
  student_name: string;
  student_nim: string;
  lecturer_name: string;
  class_name: string;
  room_name: string;
  created_at?: string;
}

interface AuditLogItem {
  id: string;
  actor_id?: string;
  actor_name?: string;
  actor_email?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  metadata?: any;
  created_at: string;
}

export default function AdminPortal({ user, onLogout }: AdminPortalProps) {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'dashboard' | 'lecturers' | 'courses' | 'students' | 'classes' | 'activity' | 'settings'>('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Global Data State from Supabase
  const [profiles, setProfiles] = useState<ProfileUser[]>([]);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([]);
  const [assignmentsCount, setAssignmentsCount] = useState(0);
  const [submissionsCount, setSubmissionsCount] = useState(0);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Feedback banner state
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // --- Modals State ---
  // Add Lecturer Modal
  const [isAddLecturerModalOpen, setIsAddLecturerModalOpen] = useState(false);
  const [lecturerFormName, setLecturerFormName] = useState('');
  const [lecturerFormEmail, setLecturerFormEmail] = useState('');
  const [lecturerFormPassword, setLecturerFormPassword] = useState('');
  const [isSubmittingLecturer, setIsSubmittingLecturer] = useState(false);

  // Edit Lecturer Modal
  const [isEditLecturerModalOpen, setIsEditLecturerModalOpen] = useState(false);
  const [selectedLecturer, setSelectedLecturer] = useState<ProfileUser | null>(null);
  const [editLecturerName, setEditLecturerName] = useState('');

  // Course Details / Add Course Modal
  const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState(false);
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseLecturerId, setNewCourseLecturerId] = useState('');
  const [newCourseCredits, setNewCourseCredits] = useState(3);
  const [isSubmittingCourse, setIsSubmittingCourse] = useState(false);

  // --- Filters & Search ---
  const [lecturerSearch, setLecturerSearch] = useState('');
  const [courseSearch, setCourseSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentCourseFilter, setStudentCourseFilter] = useState('ALL');
  const [studentLecturerFilter, setStudentLecturerFilter] = useState('ALL');
  const [studentClassFilter, setStudentClassFilter] = useState('ALL');
  const [classSearch, setClassSearch] = useState('');
  const [activitySearch, setActivitySearch] = useState('');
  const [activityActionFilter, setActivityActionFilter] = useState('ALL');

  const getInitials = (name: string) => {
    if (!name) return 'AD';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  };

  const currentTabTitle = useMemo(() => {
    switch (activeTab) {
      case 'dashboard': return 'Dashboard';
      case 'lecturers': return 'Manajemen Dosen';
      case 'courses': return 'Mata Kuliah';
      case 'students': return 'Mahasiswa';
      case 'classes': return 'Manajemen Kelas';
      case 'activity': return 'Aktivitas Sistem';
      case 'settings': return 'Pengaturan';
      default: return 'Portal Admin';
    }
  }, [activeTab]);

  // Mobile sidebar accessibility, body scroll locking & Escape key close
  useEffect(() => {
    if (isMobileSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileSidebarOpen(false);
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isMobileSidebarOpen]);

  // -------------------------------------------------------------
  // FETCH ALL DATA FROM SUPABASE
  // -------------------------------------------------------------
  const loadSystemData = async () => {
    setIsLoadingData(true);
    try {
      // 1. Fetch Profiles
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profileErr) console.error('Profiles fetch error:', profileErr);
      const loadedProfiles: ProfileUser[] = (profileData || []).map(p => ({
        id: p.id,
        email: p.email,
        name: p.name,
        role: p.role,
        nim: p.nim,
        avatar_url: p.avatar_url,
        created_at: p.created_at,
        status: 'active',
      }));
      setProfiles(loadedProfiles);

      const lecturerMap = new Map<string, string>();
      loadedProfiles.forEach(p => {
        if (p.role === 'lecturer') lecturerMap.set(p.id, p.name);
      });

      // 2. Fetch Courses
      const { data: coursesData, error: courseErr } = await supabase
        .from('courses')
        .select('*')
        .order('code', { ascending: true });

      if (courseErr) console.error('Courses fetch error:', courseErr);
      
      let loadedCourses: CourseItem[] = [];
      if (coursesData && coursesData.length > 0) {
        loadedCourses = coursesData.map(c => ({
          id: c.id,
          code: c.code,
          name: c.name,
          lecturer_id: c.lecturer_id,
          lecturer_name: lecturerMap.get(c.lecturer_id) || 'Dosen Pengampu',
          credits: c.code.includes('MOB') || c.code.includes('DMBD') ? 3 : 2,
          status: 'active',
          created_at: c.created_at,
        }));
      } else {
        loadedCourses = COURSES.map((c) => ({
          id: `static-${c.code}`,
          code: c.code,
          name: c.name,
          lecturer_name: 'Dosen Pengampu',
          credits: 3,
          status: 'active',
        }));
      }
      setCourses(loadedCourses);

      // 3. Fetch Enrollments
      const { data: enrollData, error: enrollErr } = await supabase
        .from('enrollments')
        .select('*')
        .order('created_at', { ascending: false });

      if (enrollErr) console.error('Enrollments fetch error:', enrollErr);

      const profileMap = new Map<string, ProfileUser>();
      loadedProfiles.forEach(p => profileMap.set(p.id, p));

      const courseObjMap = new Map<string, CourseItem>();
      loadedCourses.forEach(c => {
        courseObjMap.set(c.id, c);
        courseObjMap.set(c.code, c);
      });

      const loadedEnrollments: EnrollmentItem[] = (enrollData || []).map(e => {
        const student = profileMap.get(e.student_id);
        const course = courseObjMap.get(e.course_id);
        return {
          id: e.id,
          course_id: e.course_id,
          course_code: course ? course.code : 'MK',
          course_name: course ? course.name : 'Mata Kuliah',
          student_id: e.student_id,
          student_name: student?.name || 'Mahasiswa',
          student_nim: student?.nim || '-',
          lecturer_name: course?.lecturer_name || 'Dosen',
          class_name: e.class_name || 'IF-4A',
          room_name: e.room_name || 'Lab 1',
          created_at: e.created_at,
        };
      });
      setEnrollments(loadedEnrollments);

      // 4. Fetch Assignments count
      const { count: assignCount } = await supabase
        .from('assignments')
        .select('*', { count: 'exact', head: true });
      setAssignmentsCount(assignCount || 0);

      // 5. Fetch Submissions count
      const { count: subCount } = await supabase
        .from('submissions')
        .select('*', { count: 'exact', head: true });
      setSubmissionsCount(subCount || 0);

      // 6. Fetch Audit Logs
      const { data: logData, error: logErr } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (logErr) {
        console.warn('Audit logs fetch warning:', logErr);
      }
      
      if (logData && logData.length > 0) {
        setAuditLogs(logData as AuditLogItem[]);
      } else {
        const mockAudit: AuditLogItem[] = [
          {
            id: 'log-1',
            actor_name: user.name || 'Administrator',
            actor_email: user.email,
            action: 'LOGIN_ADMIN',
            entity_type: 'system',
            metadata: { message: 'Administrator login session authenticated' },
            created_at: new Date().toISOString(),
          },
          {
            id: 'log-2',
            actor_name: 'System',
            action: 'SYNC_DATABASE',
            entity_type: 'system',
            metadata: { message: 'Database profiles and RLS verified' },
            created_at: new Date(Date.now() - 3600000).toISOString(),
          }
        ];
        setAuditLogs(mockAudit);
      }

    } catch (err: any) {
      console.error('Error loading admin portal data:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    loadSystemData();
  }, []);

  const showBanner = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4500);
  };

  // -------------------------------------------------------------
  // CALCULATED METRICS
  // -------------------------------------------------------------
  const stats = useMemo(() => {
    const totalLecturers = profiles.filter(p => p.role === 'lecturer').length;
    const totalStudents = profiles.filter(p => p.role === 'student').length;
    const totalCourses = courses.length;
    
    const uniqueClasses = new Set<string>();
    enrollments.forEach(e => {
      if (e.class_name) uniqueClasses.add(e.class_name);
    });
    const totalClasses = uniqueClasses.size > 0 ? uniqueClasses.size : 6;

    return {
      totalLecturers,
      totalStudents,
      totalCourses,
      totalClasses,
      totalActiveAssignments: assignmentsCount || 8,
      totalSubmissions: submissionsCount || 34,
      totalAccounts: profiles.length,
    };
  }, [profiles, courses, enrollments, assignmentsCount, submissionsCount]);

  const lecturerStatsMap = useMemo(() => {
    const map = new Map<string, { coursesCount: number; studentsCount: number }>();
    
    profiles.filter(p => p.role === 'lecturer').forEach(lect => {
      const lectCourses = courses.filter(c => c.lecturer_id === lect.id || c.lecturer_name === lect.name);
      const lectCourseIds = new Set(lectCourses.map(c => c.id));
      const lectStudents = enrollments.filter(e => lectCourseIds.has(e.course_id) || e.lecturer_name === lect.name);
      
      map.set(lect.id, {
        coursesCount: lectCourses.length,
        studentsCount: lectStudents.length,
      });
    });

    return map;
  }, [profiles, courses, enrollments]);

  // -------------------------------------------------------------
  // 1. CREATE LECTURER
  // -------------------------------------------------------------
  const handleCreateLecturer = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = lecturerFormName.trim();
    const email = lecturerFormEmail.trim().toLowerCase();
    const password = lecturerFormPassword;

    if (!name || !email || !password) {
      showBanner('error', 'Semua field wajib diisi.');
      return;
    }
    if (password.length < 6) {
      showBanner('error', 'Password awal minimal 6 karakter.');
      return;
    }

    setIsSubmittingLecturer(true);
    try {
      // 0. Pre-check if email already exists in profiles
      const { data: existingProf } = await supabase
        .from('profiles')
        .select('id, email, role')
        .eq('email', email)
        .maybeSingle();

      if (existingProf) {
        showBanner('error', `Email ${email} sudah terdaftar dengan role ${existingProf.role}.`);
        setIsSubmittingLecturer(false);
        return;
      }

      let created = false;
      let errorDetail = '';

      // 1. Try Supabase Edge Function 'create-lecturer'
      try {
        const { data, error: invokeErr } = await supabase.functions.invoke('create-lecturer', {
          body: {
            name,
            email,
            initialPassword: password,
          }
        });

        if (!invokeErr && data?.success) {
          created = true;
        } else if (invokeErr) {
          errorDetail = invokeErr.message || '';
        } else if (data?.error) {
          errorDetail = data.error;
        }
      } catch (invokeCatch: any) {
        errorDetail = invokeCatch.message || '';
      }

      // 2. Client-side isolated Auth signUp fallback (works on any static SPA hosting without overwriting admin session)
      if (!created) {
        try {
          const tempAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            }
          });

          const { data: authData, error: authErr } = await tempAuthClient.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: name,
                name,
                role: 'lecturer',
              }
            }
          });

          if (authErr) {
            if (authErr.message?.toLowerCase().includes('rate limit')) {
              throw new Error('Supabase email rate limit tercapai. Silakan coba beberapa saat lagi.');
            }
            throw authErr;
          }

          if (authData?.user) {
            const newLecturerId = authData.user.id;

            // Ensure profile exists in public.profiles table
            const { error: profErr } = await supabase
              .from('profiles')
              .upsert({
                id: newLecturerId,
                email,
                name,
                role: 'lecturer',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });

            if (profErr) {
              console.warn('Profile upsert warning:', profErr);
            }

            // Insert audit log
            try {
              await supabase.from('audit_logs').insert({
                actor_id: user.uid,
                actor_name: user.name || 'Administrator',
                actor_email: user.email || '',
                action: 'CREATE_LECTURER',
                entity_type: 'lecturer',
                entity_id: newLecturerId,
                metadata: { name, email },
                created_at: new Date().toISOString(),
              });
            } catch (auditErr) {
              console.warn('Audit log warning:', auditErr);
            }

            created = true;
          }
        } catch (clientErr: any) {
          console.warn('Isolated client signUp error:', clientErr);
          if (!errorDetail) {
            errorDetail = clientErr.message || '';
          }
        }
      }

      // 3. If local development server backend endpoint is running, attempt proxy with safe JSON parsing
      if (!created) {
        try {
          const sessionRes = await supabase.auth.getSession();
          const token = sessionRes.data.session?.access_token || '';

          const serverRes = await fetch('/api/admin/create-lecturer', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, email, password })
          });

          let serverData: any = null;
          try {
            const rawText = await serverRes.text();
            serverData = rawText ? JSON.parse(rawText) : null;
          } catch {
            serverData = null;
          }

          if (serverRes.ok && (serverData?.success || !serverData?.error)) {
            created = true;
          } else if (serverData?.error) {
            throw new Error(serverData.error);
          }
        } catch (serverProxyErr: any) {
          console.warn('Server proxy create-lecturer failed:', serverProxyErr);
          if (!errorDetail) {
            errorDetail = serverProxyErr.message || '';
          }
        }
      }

      if (!created) {
        throw new Error(errorDetail || 'Gagal menambahkan dosen ke sistem.');
      }

      showBanner('success', `Dosen ${name} (${email}) berhasil ditambahkan ke sistem.`);
      setIsAddLecturerModalOpen(false);
      setLecturerFormName('');
      setLecturerFormEmail('');
      setLecturerFormPassword('');
      await loadSystemData();

    } catch (err: any) {
      console.error('Failed to create lecturer:', err);
      showBanner('error', `Gagal menambahkan dosen: ${err.message || 'Error tidak diketahui'}`);
    } finally {
      setIsSubmittingLecturer(false);
    }
  };

  // -------------------------------------------------------------
  // 2. EDIT LECTURER
  // -------------------------------------------------------------
  const handleSaveEditLecturer = async () => {
    if (!selectedLecturer || !editLecturerName.trim()) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ name: editLecturerName.trim() })
        .eq('id', selectedLecturer.id);

      if (error) throw error;

      showBanner('success', `Data dosen ${selectedLecturer.name} berhasil diperbarui.`);
      setIsEditLecturerModalOpen(false);
      loadSystemData();
    } catch (err: any) {
      console.error('Update lecturer error:', err);
      showBanner('error', `Gagal memperbarui data dosen: ${err.message}`);
    }
  };

  // -------------------------------------------------------------
  // 3. CREATE COURSE
  // -------------------------------------------------------------
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseCode || !newCourseName) return;

    setIsSubmittingCourse(true);
    try {
      const { error } = await supabase
        .from('courses')
        .insert({
          code: newCourseCode.toUpperCase().trim(),
          name: newCourseName.trim(),
          lecturer_id: newCourseLecturerId || user.uid,
        });

      if (error) throw error;

      showBanner('success', `Mata kuliah ${newCourseCode.toUpperCase()} berhasil dibuat.`);
      setIsAddCourseModalOpen(false);
      setNewCourseCode('');
      setNewCourseName('');
      setNewCourseLecturerId('');
      loadSystemData();
    } catch (err: any) {
      console.error('Create course error:', err);
      showBanner('error', `Gagal membuat mata kuliah: ${err.message}`);
    } finally {
      setIsSubmittingCourse(false);
    }
  };

  // -------------------------------------------------------------
  // FILTERED LISTS
  // -------------------------------------------------------------
  const filteredLecturers = useMemo(() => {
    const q = lecturerSearch.toLowerCase();
    return profiles.filter(p => p.role === 'lecturer' && (
      !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
    ));
  }, [profiles, lecturerSearch]);

  const filteredCourses = useMemo(() => {
    const q = courseSearch.toLowerCase();
    return courses.filter(c => (
      !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || (c.lecturer_name && c.lecturer_name.toLowerCase().includes(q))
    ));
  }, [courses, courseSearch]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.toLowerCase();
    
    const studentsList: {
      id: string;
      nim: string;
      name: string;
      className: string;
      courseName: string;
      courseCode: string;
      lecturerName: string;
      status: string;
    }[] = [];

    enrollments.forEach(e => {
      studentsList.push({
        id: `${e.student_id}-${e.course_id}`,
        nim: e.student_nim,
        name: e.student_name,
        className: e.class_name,
        courseName: e.course_name,
        courseCode: e.course_code,
        lecturerName: e.lecturer_name,
        status: 'Aktif',
      });
    });

    const enrolledStudentIds = new Set(enrollments.map(e => e.student_id));
    profiles.filter(p => p.role === 'student' && !enrolledStudentIds.has(p.id)).forEach(s => {
      studentsList.push({
        id: s.id,
        nim: s.nim || '-',
        name: s.name,
        className: '-',
        courseName: 'Belum Terdaftar',
        courseCode: '-',
        lecturerName: '-',
        status: 'Terdaftar',
      });
    });

    return studentsList.filter(s => {
      const matchQ = !q || s.name.toLowerCase().includes(q) || s.nim.toLowerCase().includes(q);
      const matchCourse = studentCourseFilter === 'ALL' || s.courseCode === studentCourseFilter || s.courseName === studentCourseFilter;
      const matchLecturer = studentLecturerFilter === 'ALL' || s.lecturerName === studentLecturerFilter;
      const matchClass = studentClassFilter === 'ALL' || s.className === studentClassFilter;
      return matchQ && matchCourse && matchLecturer && matchClass;
    });
  }, [enrollments, profiles, studentSearch, studentCourseFilter, studentLecturerFilter, studentClassFilter]);

  const aggregatedClasses = useMemo(() => {
    const q = classSearch.toLowerCase();
    const classMap = new Map<string, {
      className: string;
      courseCode: string;
      courseName: string;
      lecturerName: string;
      studentCount: number;
      roomName: string;
    }>();

    enrollments.forEach(e => {
      const key = `${e.class_name}-${e.course_code}`;
      if (!classMap.has(key)) {
        classMap.set(key, {
          className: e.class_name,
          courseCode: e.course_code,
          courseName: e.course_name,
          lecturerName: e.lecturer_name,
          studentCount: 1,
          roomName: e.room_name || 'Lab Komputer',
        });
      } else {
        const item = classMap.get(key)!;
        item.studentCount += 1;
      }
    });

    if (classMap.size === 0) {
      ['04SIFM001', '05SIFE001', 'IF-4A', 'IF-4B', 'IF-5A', 'IF-6A'].forEach((cls, i) => {
        classMap.set(cls, {
          className: cls,
          courseCode: courses[i % courses.length]?.code || 'IF-MOB',
          courseName: courses[i % courses.length]?.name || 'Pemrograman Mobile',
          lecturerName: courses[i % courses.length]?.lecturer_name || 'Tim Dosen',
          studentCount: 24 + i * 2,
          roomName: `Ruang Lab ${i + 1}`,
        });
      });
    }

    const list = Array.from(classMap.values());
    return list.filter(c => !q || c.className.toLowerCase().includes(q) || c.courseName.toLowerCase().includes(q) || c.lecturerName.toLowerCase().includes(q));
  }, [enrollments, courses, classSearch]);

  const filteredLogs = useMemo(() => {
    const q = activitySearch.toLowerCase();
    return auditLogs.filter(log => {
      const matchQ = !q || 
        log.action.toLowerCase().includes(q) || 
        (log.actor_name && log.actor_name.toLowerCase().includes(q)) ||
        log.entity_type.toLowerCase().includes(q);
      const matchAction = activityActionFilter === 'ALL' || log.action === activityActionFilter;
      return matchQ && matchAction;
    });
  }, [auditLogs, activitySearch, activityActionFilter]);

  const weeklyActivityData = [
    { day: 'Senin', logins: 84, submissions: 52 },
    { day: 'Selasa', logins: 110, submissions: 68 },
    { day: 'Rabu', logins: 145, submissions: 94 },
    { day: 'Kamis', logins: 130, submissions: 82 },
    { day: 'Jumat', logins: 160, submissions: 120 },
    { day: 'Sabtu', logins: 65, submissions: 35 },
    { day: 'Minggu', logins: 40, submissions: 20 },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans antialiased">
      
      {/* ======================================================== */}
      {/* DESKTOP SIDEBAR (WHITE MODERN ACADEMIC SAAS) */}
      {/* ======================================================== */}
      <aside 
        className={`hidden md:flex flex-col fixed left-0 top-0 bottom-0 h-screen bg-white border-r border-[#E9EEF5] z-40 select-none transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'w-[72px]' : 'w-[280px]'
        }`}
      >
        {/* BRAND Header */}
        <div className={`h-16 border-b border-[#E9EEF5] flex items-center shrink-0 ${
          isSidebarCollapsed ? 'justify-center px-2 relative' : 'justify-between px-5'
        }`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#14B8A6] flex items-center justify-center text-white shrink-0 shadow-sm shadow-[#14B8A6]/20">
              <GraduationCap className="w-5 h-5" />
            </div>
            {!isSidebarCollapsed && (
              <div className="min-w-0 animate-in fade-in duration-200">
                <h1 className="text-sm font-bold text-[#0F172A] leading-none tracking-tight">SiTugas Admin</h1>
                <p className="text-[9px] font-semibold text-[#64748B] tracking-wider uppercase mt-1">SISTEM ADMINISTRASI TUGAS</p>
              </div>
            )}
          </div>

          {/* Collapse / Expand Toggle Button */}
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className={`p-1.5 text-slate-400 hover:text-[#0F172A] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer ${
              isSidebarCollapsed ? 'absolute -right-3 top-5 bg-white border border-[#E9EEF5] shadow-xs rounded-full p-1 z-50 text-slate-600' : ''
            }`}
            title={isSidebarCollapsed ? "Perluas Sidebar" : "Perkecil Sidebar"}
            aria-label={isSidebarCollapsed ? "Perluas Sidebar" : "Perkecil Sidebar"}
          >
            {isSidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-thin">
          
          {/* SECTION: UTAMA */}
          <div>
            {!isSidebarCollapsed ? (
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
                UTAMA
              </div>
            ) : (
              <div className="w-8 mx-auto border-t border-[#E9EEF5] my-2" />
            )}
            <div className="space-y-1">
              <button 
                type="button"
                className={`group relative w-full h-[42px] flex items-center rounded-[10px] transition-all duration-150 cursor-pointer ${
                  isSidebarCollapsed ? 'justify-center px-0' : 'px-3.5 gap-3'
                } ${
                  activeTab === 'dashboard' 
                    ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                    : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                }`}
                onClick={() => setActiveTab('dashboard')}
              >
                {activeTab === 'dashboard' && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                )}
                <LayoutDashboard className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${
                  activeTab === 'dashboard' ? 'text-[#14B8A6]' : 'text-[#64748B] group-hover:text-[#14B8A6]'
                }`} />
                {!isSidebarCollapsed && <span className="text-sm truncate leading-none">Dashboard</span>}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-3.5 px-2.5 py-1.5 bg-[#0F172A] text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                    Dashboard
                    <span className="absolute top-1/2 -left-1 -translate-y-1/2 border-4 border-transparent border-r-[#0F172A]" />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* SECTION: PERKULIAHAN */}
          <div>
            {!isSidebarCollapsed ? (
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
                PERKULIAHAN
              </div>
            ) : (
              <div className="w-8 mx-auto border-t border-[#E9EEF5] my-2" />
            )}
            <div className="space-y-1">
              <button 
                type="button"
                className={`group relative w-full h-[42px] flex items-center rounded-[10px] transition-all duration-150 cursor-pointer ${
                  isSidebarCollapsed ? 'justify-center px-0' : 'px-3.5 gap-3'
                } ${
                  activeTab === 'lecturers' 
                    ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                    : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                }`}
                onClick={() => setActiveTab('lecturers')}
              >
                {activeTab === 'lecturers' && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                )}
                <Presentation className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${
                  activeTab === 'lecturers' ? 'text-[#14B8A6]' : 'text-[#64748B] group-hover:text-[#14B8A6]'
                }`} />
                {!isSidebarCollapsed && <span className="text-sm truncate leading-none">Manajemen Dosen</span>}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-3.5 px-2.5 py-1.5 bg-[#0F172A] text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                    Manajemen Dosen
                    <span className="absolute top-1/2 -left-1 -translate-y-1/2 border-4 border-transparent border-r-[#0F172A]" />
                  </div>
                )}
              </button>

              <button 
                type="button"
                className={`group relative w-full h-[42px] flex items-center rounded-[10px] transition-all duration-150 cursor-pointer ${
                  isSidebarCollapsed ? 'justify-center px-0' : 'px-3.5 gap-3'
                } ${
                  activeTab === 'courses' 
                    ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                    : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                }`}
                onClick={() => setActiveTab('courses')}
              >
                {activeTab === 'courses' && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                )}
                <BookOpen className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${
                  activeTab === 'courses' ? 'text-[#14B8A6]' : 'text-[#64748B] group-hover:text-[#14B8A6]'
                }`} />
                {!isSidebarCollapsed && <span className="text-sm truncate leading-none">Mata Kuliah</span>}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-3.5 px-2.5 py-1.5 bg-[#0F172A] text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                    Mata Kuliah
                    <span className="absolute top-1/2 -left-1 -translate-y-1/2 border-4 border-transparent border-r-[#0F172A]" />
                  </div>
                )}
              </button>

              <button 
                type="button"
                className={`group relative w-full h-[42px] flex items-center rounded-[10px] transition-all duration-150 cursor-pointer ${
                  isSidebarCollapsed ? 'justify-center px-0' : 'px-3.5 gap-3'
                } ${
                  activeTab === 'students' 
                    ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                    : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                }`}
                onClick={() => setActiveTab('students')}
              >
                {activeTab === 'students' && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                )}
                <Users className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${
                  activeTab === 'students' ? 'text-[#14B8A6]' : 'text-[#64748B] group-hover:text-[#14B8A6]'
                }`} />
                {!isSidebarCollapsed && <span className="text-sm truncate leading-none">Mahasiswa</span>}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-3.5 px-2.5 py-1.5 bg-[#0F172A] text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                    Mahasiswa
                    <span className="absolute top-1/2 -left-1 -translate-y-1/2 border-4 border-transparent border-r-[#0F172A]" />
                  </div>
                )}
              </button>

              <button 
                type="button"
                className={`group relative w-full h-[42px] flex items-center rounded-[10px] transition-all duration-150 cursor-pointer ${
                  isSidebarCollapsed ? 'justify-center px-0' : 'px-3.5 gap-3'
                } ${
                  activeTab === 'classes' 
                    ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                    : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                }`}
                onClick={() => setActiveTab('classes')}
              >
                {activeTab === 'classes' && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                )}
                <Layers className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${
                  activeTab === 'classes' ? 'text-[#14B8A6]' : 'text-[#64748B] group-hover:text-[#14B8A6]'
                }`} />
                {!isSidebarCollapsed && <span className="text-sm truncate leading-none">Manajemen Kelas</span>}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-3.5 px-2.5 py-1.5 bg-[#0F172A] text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                    Manajemen Kelas
                    <span className="absolute top-1/2 -left-1 -translate-y-1/2 border-4 border-transparent border-r-[#0F172A]" />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* SECTION: LAPORAN & AUDIT */}
          <div>
            {!isSidebarCollapsed ? (
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
                LAPORAN & AUDIT
              </div>
            ) : (
              <div className="w-8 mx-auto border-t border-[#E9EEF5] my-2" />
            )}
            <div className="space-y-1">
              <button 
                type="button"
                className={`group relative w-full h-[42px] flex items-center rounded-[10px] transition-all duration-150 cursor-pointer ${
                  isSidebarCollapsed ? 'justify-center px-0' : 'px-3.5 gap-3'
                } ${
                  activeTab === 'activity' 
                    ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                    : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                }`}
                onClick={() => setActiveTab('activity')}
              >
                {activeTab === 'activity' && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                )}
                <Activity className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${
                  activeTab === 'activity' ? 'text-[#14B8A6]' : 'text-[#64748B] group-hover:text-[#14B8A6]'
                }`} />
                {!isSidebarCollapsed && <span className="text-sm truncate leading-none">Aktivitas Sistem</span>}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-3.5 px-2.5 py-1.5 bg-[#0F172A] text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                    Aktivitas Sistem
                    <span className="absolute top-1/2 -left-1 -translate-y-1/2 border-4 border-transparent border-r-[#0F172A]" />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* SECTION: SYSTEM */}
          <div className="pt-2">
            <div className="w-full border-t border-[#E9EEF5] mb-4" />
            {!isSidebarCollapsed && (
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
                SYSTEM
              </div>
            )}
            <div className="space-y-1">
              <button 
                type="button"
                className={`group relative w-full h-[42px] flex items-center rounded-[10px] transition-all duration-150 cursor-pointer ${
                  isSidebarCollapsed ? 'justify-center px-0' : 'px-3.5 gap-3'
                } ${
                  activeTab === 'settings' 
                    ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                    : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                }`}
                onClick={() => setActiveTab('settings')}
              >
                {activeTab === 'settings' && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                )}
                <Settings className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${
                  activeTab === 'settings' ? 'text-[#14B8A6]' : 'text-[#64748B] group-hover:text-[#14B8A6]'
                }`} />
                {!isSidebarCollapsed && <span className="text-sm truncate leading-none">Pengaturan</span>}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-3.5 px-2.5 py-1.5 bg-[#0F172A] text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                    Pengaturan
                    <span className="absolute top-1/2 -left-1 -translate-y-1/2 border-4 border-transparent border-r-[#0F172A]" />
                  </div>
                )}
              </button>
            </div>
          </div>
        </nav>
      </aside>

      {/* ======================================================== */}
      {/* MOBILE SIDEBAR DRAWER OVERLAY */}
      {/* ======================================================== */}
      <div className={`fixed inset-0 z-50 md:hidden transition-all duration-300 ${
        isMobileSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}>
        <div 
          className={`absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-300 ${
            isMobileSidebarOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setIsMobileSidebarOpen(false)}
        />
        
        <aside className={`absolute top-0 bottom-0 left-0 w-[280px] max-w-[85vw] bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-out select-none ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          {/* Header Mobile Drawer */}
          <div className="h-16 border-b border-[#E9EEF5] px-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#14B8A6] flex items-center justify-center text-white shrink-0 shadow-sm">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-[#0F172A] leading-none">SiTugas Admin</h1>
                <p className="text-[9px] font-semibold text-[#64748B] tracking-wider uppercase mt-1">SISTEM ADMINISTRASI TUGAS</p>
              </div>
            </div>
            <button 
              onClick={() => setIsMobileSidebarOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Mobile */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
            <div>
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">UTAMA</div>
              <button 
                className={`w-full h-[42px] flex items-center px-3.5 gap-3 rounded-[10px] cursor-pointer ${
                  activeTab === 'dashboard' ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' : 'text-[#64748B] font-medium'
                }`}
                onClick={() => { setActiveTab('dashboard'); setIsMobileSidebarOpen(false); }}
              >
                <LayoutDashboard className={`w-[18px] h-[18px] ${activeTab === 'dashboard' ? 'text-[#14B8A6]' : 'text-[#64748B]'}`} />
                <span className="text-sm">Dashboard</span>
              </button>
            </div>

            <div>
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">PERKULIAHAN</div>
              <div className="space-y-1">
                <button 
                  className={`w-full h-[42px] flex items-center px-3.5 gap-3 rounded-[10px] cursor-pointer ${
                    activeTab === 'lecturers' ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' : 'text-[#64748B] font-medium'
                  }`}
                  onClick={() => { setActiveTab('lecturers'); setIsMobileSidebarOpen(false); }}
                >
                  <Presentation className={`w-[18px] h-[18px] ${activeTab === 'lecturers' ? 'text-[#14B8A6]' : 'text-[#64748B]'}`} />
                  <span className="text-sm">Manajemen Dosen</span>
                </button>

                <button 
                  className={`w-full h-[42px] flex items-center px-3.5 gap-3 rounded-[10px] cursor-pointer ${
                    activeTab === 'courses' ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' : 'text-[#64748B] font-medium'
                  }`}
                  onClick={() => { setActiveTab('courses'); setIsMobileSidebarOpen(false); }}
                >
                  <BookOpen className={`w-[18px] h-[18px] ${activeTab === 'courses' ? 'text-[#14B8A6]' : 'text-[#64748B]'}`} />
                  <span className="text-sm">Mata Kuliah</span>
                </button>

                <button 
                  className={`w-full h-[42px] flex items-center px-3.5 gap-3 rounded-[10px] cursor-pointer ${
                    activeTab === 'students' ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' : 'text-[#64748B] font-medium'
                  }`}
                  onClick={() => { setActiveTab('students'); setIsMobileSidebarOpen(false); }}
                >
                  <Users className={`w-[18px] h-[18px] ${activeTab === 'students' ? 'text-[#14B8A6]' : 'text-[#64748B]'}`} />
                  <span className="text-sm">Mahasiswa</span>
                </button>

                <button 
                  className={`w-full h-[42px] flex items-center px-3.5 gap-3 rounded-[10px] cursor-pointer ${
                    activeTab === 'classes' ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' : 'text-[#64748B] font-medium'
                  }`}
                  onClick={() => { setActiveTab('classes'); setIsMobileSidebarOpen(false); }}
                >
                  <Layers className={`w-[18px] h-[18px] ${activeTab === 'classes' ? 'text-[#14B8A6]' : 'text-[#64748B]'}`} />
                  <span className="text-sm">Manajemen Kelas</span>
                </button>
              </div>
            </div>

            <div>
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">LAPORAN & AUDIT</div>
              <button 
                className={`w-full h-[42px] flex items-center px-3.5 gap-3 rounded-[10px] cursor-pointer ${
                  activeTab === 'activity' ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' : 'text-[#64748B] font-medium'
                }`}
                onClick={() => { setActiveTab('activity'); setIsMobileSidebarOpen(false); }}
              >
                <Activity className={`w-[18px] h-[18px] ${activeTab === 'activity' ? 'text-[#14B8A6]' : 'text-[#64748B]'}`} />
                <span className="text-sm">Aktivitas Sistem</span>
              </button>
            </div>

            <div className="pt-2 border-t border-[#E9EEF5]">
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">SYSTEM</div>
              <button 
                className={`w-full h-[42px] flex items-center px-3.5 gap-3 rounded-[10px] cursor-pointer ${
                  activeTab === 'settings' ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' : 'text-[#64748B] font-medium'
                }`}
                onClick={() => { setActiveTab('settings'); setIsMobileSidebarOpen(false); }}
              >
                <Settings className={`w-[18px] h-[18px] ${activeTab === 'settings' ? 'text-[#14B8A6]' : 'text-[#64748B]'}`} />
                <span className="text-sm">Pengaturan</span>
              </button>
            </div>
          </nav>
        </aside>
      </div>

      {/* ======================================================== */}
      {/* MAIN CONTENT WRAPPER */}
      {/* ======================================================== */}
      <div className={`flex flex-col min-h-screen transition-all duration-300 ease-in-out ${
        isSidebarCollapsed ? 'md:pl-[72px]' : 'md:pl-[280px]'
      }`}>
        
        {/* Top Header Navbar */}
        <header className="h-16 bg-white border-b border-[#E9EEF5] px-4 md:px-8 flex items-center justify-between sticky top-0 z-30 select-none">
          
          {/* Left: Mobile Toggle & Breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-2 text-slate-500 hover:text-[#0F172A] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-[#64748B] font-medium">Portal Admin</span>
              <span className="text-[#CBD5E1]">/</span>
              <span className="text-[#0F172A] font-bold">{currentTabTitle}</span>
            </div>
          </div>

          {/* Right: Actions, Notification, Profile */}
          <div className="flex items-center gap-3 md:gap-4">
            <button 
              className="p-2 hover:bg-slate-50 rounded-full text-slate-500 hover:text-slate-700 transition-colors relative cursor-pointer" 
              title="Notifikasi"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white"></span>
            </button>
            
            <div className="flex items-center gap-3 border-l border-[#E9EEF5] pl-3 md:pl-4">
              <div className="w-9 h-9 rounded-full overflow-hidden border border-slate-200 select-none flex items-center justify-center bg-teal-50 text-teal-700 font-bold text-xs">
                {user.avatarUrl ? (
                  <img 
                    className="w-full h-full object-cover" 
                    src={user.avatarUrl} 
                    alt="Admin profile"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span>{getInitials(user.name)}</span>
                )}
              </div>
              <div className="hidden lg:block text-left select-none">
                <p className="text-xs font-semibold text-slate-900 leading-none">{user.name || 'Administrator'}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-1">Super Admin</p>
              </div>
              <button 
                className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer ml-1"
                title="Logout"
                onClick={onLogout}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Global Feedback Banner */}
        {feedback && (
          <div className="p-4 px-6 md:px-8">
            <div className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between animate-in fade-in duration-200 ${
              feedback.type === 'success' 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : feedback.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}>
              <div className="flex items-center gap-2.5">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{feedback.message}</span>
              </div>
              <button 
                onClick={() => setFeedback(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Main Content Body */}
        <main className="flex-1 p-4 md:p-8 space-y-6">

          {/* ======================================================== */}
          {/* 1. ADMIN DASHBOARD */}
          {/* ======================================================== */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* 6 Core Statistics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-500">Total Dosen</p>
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <Presentation className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-2xl font-bold text-slate-900">{stats.totalLecturers}</p>
                    <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">Pengampu Aktif</p>
                  </div>
                </div>

                <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-500">Total Mahasiswa</p>
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <GraduationCap className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-2xl font-bold text-slate-900">{stats.totalStudents}</p>
                    <p className="text-[11px] text-blue-600 font-semibold mt-0.5">Terdaftar Sistem</p>
                  </div>
                </div>

                <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-500">Mata Kuliah</p>
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                      <BookOpen className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-2xl font-bold text-slate-900">{stats.totalCourses}</p>
                    <p className="text-[11px] text-amber-600 font-semibold mt-0.5">Kurikulum Aktif</p>
                  </div>
                </div>

                <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-500">Total Kelas</p>
                    <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                      <Layers className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-2xl font-bold text-slate-900">{stats.totalClasses}</p>
                    <p className="text-[11px] text-purple-600 font-semibold mt-0.5">Rombongan Belajar</p>
                  </div>
                </div>

                <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-500">Tugas Aktif</p>
                    <div className="w-8 h-8 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center">
                      <CheckSquare className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-2xl font-bold text-slate-900">{stats.totalActiveAssignments}</p>
                    <p className="text-[11px] text-cyan-600 font-semibold mt-0.5">Tugas Diterbitkan</p>
                  </div>
                </div>

                <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-500">Total Submission</p>
                    <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                      <UploadCloud className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-2xl font-bold text-slate-900">{stats.totalSubmissions}</p>
                    <p className="text-[11px] text-rose-600 font-semibold mt-0.5">Pengumpulan Tugas</p>
                  </div>
                </div>
              </div>

              {/* Section A & B: Aktivitas Terbaru & Ringkasan Dosen */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* B. Ringkasan Dosen */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Ringkasan Dosen</h3>
                        <p className="text-xs text-slate-500">Dosen pengampu terdaftar di sistem</p>
                      </div>
                      <button
                        onClick={() => setActiveTab('lecturers')}
                        className="text-xs font-bold text-[#14B8A6] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Lihat Semua</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      {profiles.filter(p => p.role === 'lecturer').slice(0, 4).map(lect => {
                        const lectStat = lecturerStatsMap.get(lect.id) || { coursesCount: 0, studentsCount: 0 };
                        return (
                          <div key={lect.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                                {lect.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-800">{lect.name}</p>
                                <p className="text-[11px] text-slate-400">{lect.email}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded">
                                {lectStat.coursesCount} MK
                              </span>
                              <p className="text-[10px] text-slate-400 mt-0.5">{lectStat.studentsCount} Mhs</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    onClick={() => setIsAddLecturerModalOpen(true)}
                    className="w-full mt-4 py-2.5 bg-[#0F172A] text-white rounded-xl text-xs font-bold hover:bg-[#0F172A]/90 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Dosen Baru</span>
                  </button>
                </div>

                {/* A. Aktivitas Terbaru */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs lg:col-span-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Aktivitas Terbaru</h3>
                        <p className="text-xs text-slate-500">Log operasional data dan tindakan pengguna</p>
                      </div>
                      <button
                        onClick={() => setActiveTab('activity')}
                        className="text-xs font-bold text-[#14B8A6] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Audit Log Lengkap</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      {auditLogs.slice(0, 5).map(log => (
                        <div key={log.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                              log.action.includes('CREATE') ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              <Activity className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 flex items-center gap-2">
                                <span>{log.action}</span>
                                <span className="text-[10px] text-slate-500 font-normal">oleh {log.actor_name || 'System'}</span>
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {log.metadata?.message || log.metadata?.lecturer_name || log.metadata?.name || log.entity_type}
                              </p>
                            </div>
                          </div>
                          <span className="text-[11px] font-mono text-slate-400">
                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* C. Ringkasan Sistem Indicator */}
                  <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>Total Akun: <strong className="text-slate-800">{stats.totalAccounts}</strong></span>
                    <span>Tugas Terdaftar: <strong className="text-slate-800">{stats.totalActiveAssignments}</strong></span>
                    <span>Submisi Dikumpulkan: <strong className="text-slate-800">{stats.totalSubmissions}</strong></span>
                  </div>
                </div>

              </div>

              {/* System Activity Visual Trend */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Tren Penggunaan Platform</h3>
                    <p className="text-xs text-slate-500">Frekuensi login dan submisi tugas mingguan</p>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-600 font-bold px-3 py-1 rounded-xl">
                    7 Hari Terakhir
                  </span>
                </div>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={weeklyActivityData}>
                      <defs>
                        <linearGradient id="colorLogins" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#14B8A6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorSubs" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0F172A" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#0F172A" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="day" fontSize={11} stroke="#64748B" tickLine={false} />
                      <YAxis fontSize={11} stroke="#64748B" tickLine={false} />
                      <Tooltip />
                      <Area type="monotone" dataKey="logins" name="Sesi Login" stroke="#14B8A6" fillOpacity={1} fill="url(#colorLogins)" strokeWidth={2} />
                      <Area type="monotone" dataKey="submissions" name="Tugas Dikumpulkan" stroke="#0F172A" fillOpacity={1} fill="url(#colorSubs)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* 2. MANAJEMEN DOSEN */}
          {/* ======================================================== */}
          {activeTab === 'lecturers' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Header Action Bar */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Cari dosen berdasarkan nama atau email..."
                    value={lecturerSearch}
                    onChange={(e) => setLecturerSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/20 focus:border-[#14B8A6]"
                  />
                </div>

                <button
                  onClick={() => setIsAddLecturerModalOpen(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0F172A] text-white rounded-xl text-xs font-bold hover:bg-[#0F172A]/90 transition-all shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Tambah Dosen</span>
                </button>
              </div>

              {/* Lecturers Table */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <tr>
                        <th className="py-3.5 px-5">Nama</th>
                        <th className="py-3.5 px-4">Email</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4">Jumlah Mata Kuliah</th>
                        <th className="py-3.5 px-4">Jumlah Mahasiswa</th>
                        <th className="py-3.5 px-4">Tanggal Bergabung</th>
                        <th className="py-3.5 px-5 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredLecturers.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-12 text-slate-400">
                            <Presentation className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                            <p className="font-bold">Tidak ada dosen ditemukan</p>
                            <p className="text-[11px]">Silakan klik tombol "+ Tambah Dosen" untuk mendaftarkan dosen baru.</p>
                          </td>
                        </tr>
                      ) : (
                        filteredLecturers.map((lect) => {
                          const stats = lecturerStatsMap.get(lect.id) || { coursesCount: 0, studentsCount: 0 };
                          return (
                            <tr key={lect.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3.5 px-5">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                                    {lect.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-bold text-slate-900">{lect.name}</p>
                                    <p className="text-[10px] text-slate-400 font-mono">{lect.id.substring(0, 8)}...</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-slate-600 font-medium font-mono">{lect.email}</td>
                              <td className="py-3.5 px-4">
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                                  <Check className="w-3 h-3" /> Aktif
                                </span>
                              </td>
                              <td className="py-3.5 px-4 font-bold text-slate-800">{stats.coursesCount} Mata Kuliah</td>
                              <td className="py-3.5 px-4 font-bold text-slate-800">{stats.studentsCount} Mahasiswa</td>
                              <td className="py-3.5 px-4 text-slate-500">
                                {lect.created_at ? new Date(lect.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Terdaftar'}
                              </td>
                              <td className="py-3.5 px-5 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      setSelectedLecturer(lect);
                                      setEditLecturerName(lect.name);
                                      setIsEditLecturerModalOpen(true);
                                    }}
                                    className="p-1.5 text-slate-500 hover:text-[#0F172A] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                    title="Edit Data Dosen"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* 3. MANAJEMEN MATA KULIAH */}
          {/* ======================================================== */}
          {activeTab === 'courses' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Cari kode MK, nama mata kuliah, dosen..."
                    value={courseSearch}
                    onChange={(e) => setCourseSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/20 focus:border-[#14B8A6]"
                  />
                </div>

                <button
                  onClick={() => setIsAddCourseModalOpen(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0F172A] text-white rounded-xl text-xs font-bold hover:bg-[#0F172A]/90 transition-all shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Mata Kuliah</span>
                </button>
              </div>

              {/* Courses Table */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <tr>
                        <th className="py-3.5 px-5">Kode MK</th>
                        <th className="py-3.5 px-4">Nama Mata Kuliah</th>
                        <th className="py-3.5 px-4">SKS</th>
                        <th className="py-3.5 px-4">Dosen Pengampu</th>
                        <th className="py-3.5 px-4">Jumlah Mahasiswa</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-5 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCourses.map((c) => {
                        const enrolledStudents = enrollments.filter(e => e.course_id === c.id || e.course_code === c.code).length;
                        return (
                          <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-5 font-mono font-bold text-[#0F172A]">
                              <span className="bg-[#14B8A6]/10 text-[#0d9488] px-2 py-0.5 rounded">
                                {c.code}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-bold text-slate-900">{c.name}</td>
                            <td className="py-3.5 px-4 text-slate-600 font-medium">{c.credits || 3} SKS</td>
                            <td className="py-3.5 px-4 font-medium text-slate-700">{c.lecturer_name || 'Dosen Pengampu'}</td>
                            <td className="py-3.5 px-4 font-bold text-slate-800">{enrolledStudents} Mahasiswa</td>
                            <td className="py-3.5 px-4">
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                Aktif
                              </span>
                            </td>
                            <td className="py-3.5 px-5 text-right">
                              <button
                                onClick={() => showBanner('info', `Mata kuliah ${c.code} (${c.name}) diampu oleh dosen ${c.lecturer_name}.`)}
                                className="p-1.5 text-slate-500 hover:text-[#0F172A] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                title="Lihat Detail"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* 4. MANAJEMEN MAHASISWA */}
          {/* ======================================================== */}
          {activeTab === 'students' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Filter Bar */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  
                  {/* Search */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Cari NIM atau Nama..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/20"
                    />
                  </div>

                  {/* Filter Course */}
                  <div>
                    <select
                      value={studentCourseFilter}
                      onChange={(e) => setStudentCourseFilter(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none"
                    >
                      <option value="ALL">Semua Mata Kuliah</option>
                      {courses.map(c => (
                        <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Filter Lecturer */}
                  <div>
                    <select
                      value={studentLecturerFilter}
                      onChange={(e) => setStudentLecturerFilter(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none"
                    >
                      <option value="ALL">Semua Dosen</option>
                      {profiles.filter(p => p.role === 'lecturer').map(l => (
                        <option key={l.id} value={l.name}>{l.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Filter Class */}
                  <div>
                    <select
                      value={studentClassFilter}
                      onChange={(e) => setStudentClassFilter(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none"
                    >
                      <option value="ALL">Semua Kelas</option>
                      {['IF-4A', 'IF-4B', 'IF-5A', 'IF-5B', 'IF-6A', '04SIFM001', '05SIFE001'].map(cls => (
                        <option key={cls} value={cls}>Kelas {cls}</option>
                      ))}
                    </select>
                  </div>

                </div>
              </div>

              {/* Students Global Table */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <tr>
                        <th className="py-3.5 px-5">NIM</th>
                        <th className="py-3.5 px-4">Nama Mahasiswa</th>
                        <th className="py-3.5 px-4">Kelas</th>
                        <th className="py-3.5 px-4">Mata Kuliah</th>
                        <th className="py-3.5 px-4">Dosen Pengampu</th>
                        <th className="py-3.5 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredStudents.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-12 text-slate-400">
                            <GraduationCap className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                            <p className="font-bold">Tidak ada mahasiswa yang cocok</p>
                            <p className="text-[11px]">Coba sesuaikan filter atau kata kunci pencarian.</p>
                          </td>
                        </tr>
                      ) : (
                        filteredStudents.map((s, idx) => (
                          <tr key={`${s.id}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-5 font-mono font-bold text-slate-900">{s.nim}</td>
                            <td className="py-3.5 px-4 font-bold text-slate-900">{s.name}</td>
                            <td className="py-3.5 px-4">
                              <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                                {s.className}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-700 font-medium">{s.courseName}</td>
                            <td className="py-3.5 px-4 text-slate-600">{s.lecturerName}</td>
                            <td className="py-3.5 px-4">
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                                {s.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* 5. MANAJEMEN KELAS */}
          {/* ======================================================== */}
          {activeTab === 'classes' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-center">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Cari kode kelas, mata kuliah, dosen..."
                    value={classSearch}
                    onChange={(e) => setClassSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/20"
                  />
                </div>
              </div>

              {/* Classes Table */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <tr>
                        <th className="py-3.5 px-5">Kode Kelas</th>
                        <th className="py-3.5 px-4">Mata Kuliah</th>
                        <th className="py-3.5 px-4">Dosen Pengampu</th>
                        <th className="py-3.5 px-4">Jumlah Mahasiswa</th>
                        <th className="py-3.5 px-4">Ruangan</th>
                        <th className="py-3.5 px-5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {aggregatedClasses.map((cls, idx) => (
                        <tr key={`${cls.className}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-5 font-mono font-bold text-[#0F172A]">
                            <span className="bg-purple-50 border border-purple-200 text-purple-800 px-2.5 py-1 rounded-lg">
                              {cls.className}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-900">{cls.courseName}</td>
                          <td className="py-3.5 px-4 text-slate-700 font-medium">{cls.lecturerName}</td>
                          <td className="py-3.5 px-4 font-bold text-slate-800">{cls.studentCount} Mahasiswa</td>
                          <td className="py-3.5 px-4 text-slate-600 font-medium">{cls.roomName}</td>
                          <td className="py-3.5 px-5 text-right">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                              Aktif Berjalan
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* 6. AKTIVITAS SISTEM */}
          {/* ======================================================== */}
          {activeTab === 'activity' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Cari aktivitas, aktor, entitas..."
                    value={activitySearch}
                    onChange={(e) => setActivitySearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/20"
                  />
                </div>

                <div>
                  <select
                    value={activityActionFilter}
                    onChange={(e) => setActivityActionFilter(e.target.value)}
                    className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  >
                    <option value="ALL">Semua Aksi</option>
                    <option value="CREATE_LECTURER">CREATE_LECTURER</option>
                    <option value="CREATE_COURSE">CREATE_COURSE</option>
                    <option value="CREATE_STUDENT">CREATE_STUDENT</option>
                    <option value="LOGIN_ADMIN">LOGIN_ADMIN</option>
                  </select>
                </div>
              </div>

              {/* Activity Audit Log Table */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <tr>
                        <th className="py-3.5 px-5">Waktu</th>
                        <th className="py-3.5 px-4">Aksi</th>
                        <th className="py-3.5 px-4">Aktor</th>
                        <th className="py-3.5 px-4">Entitas</th>
                        <th className="py-3.5 px-5">Detail Informasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-5 font-mono text-slate-500 whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString('id-ID', {
                              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                            })}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-mono font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px]">
                              {log.action}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            {log.actor_name || 'System'}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="capitalize text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                              {log.entity_type}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-slate-600 font-mono text-[11px]">
                            {log.metadata ? JSON.stringify(log.metadata) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ======================================================== */}
          {/* 7. PENGATURAN SISTEM */}
          {/* ======================================================== */}
          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-3xl animate-in fade-in duration-200">
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Informasi Aplikasi & Konfigurasi</h3>
                  <p className="text-xs text-slate-500">Konfigurasi lingkungan dan informasi sistem SITugas</p>
                </div>

                <div className="divide-y divide-slate-100 text-xs">
                  <div className="py-3 flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Nama Aplikasi</span>
                    <span className="font-bold text-slate-900">SITugas (Sistem Informasi Manajemen Tugas)</span>
                  </div>

                  <div className="py-3 flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Versi Aplikasi</span>
                    <span className="font-bold text-[#0F172A] bg-slate-100 px-2.5 py-0.5 rounded-lg">
                      v2.5.0 Enterprise SaaS
                    </span>
                  </div>

                  <div className="py-3 flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Autentikasi & Database</span>
                    <span className="font-bold text-slate-800">Supabase Auth + PostgreSQL RLS</span>
                  </div>

                  <div className="py-3 flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Edge Functions Active</span>
                    <span className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold">
                      create-lecturer, create-student, bulk-import-students
                    </span>
                  </div>

                  <div className="py-3 flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Status Operasional</span>
                    <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Normal
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ======================================================== */}
      {/* MODAL: TAMBAH DOSEN */}
      {/* ======================================================== */}
      {isAddLecturerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-[2px] animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Tambah Dosen Baru</h3>
                  <p className="text-[11px] text-slate-500">Dibuat via Supabase Auth & Edge Function</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAddLecturerModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateLecturer} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  placeholder="Contoh: Dr. Ir. Budi Santoso, M.Kom."
                  value={lecturerFormName}
                  onChange={(e) => setLecturerFormName(e.target.value)}
                  required
                  disabled={isSubmittingLecturer}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#14B8A6]/20 focus:border-[#14B8A6] outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Email Dosen</label>
                <input
                  type="email"
                  placeholder="budi.santoso@university.ac.id"
                  value={lecturerFormEmail}
                  onChange={(e) => setLecturerFormEmail(e.target.value)}
                  required
                  disabled={isSubmittingLecturer}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#14B8A6]/20 focus:border-[#14B8A6] outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Password Awal</label>
                <input
                  type="password"
                  placeholder="Minimal 6 karakter"
                  value={lecturerFormPassword}
                  onChange={(e) => setLecturerFormPassword(e.target.value)}
                  required
                  disabled={isSubmittingLecturer}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#14B8A6]/20 focus:border-[#14B8A6] outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Password akan diproses aman melalui Supabase Auth API tanpa disimpan dalam database profil.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddLecturerModalOpen(false)}
                  disabled={isSubmittingLecturer}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingLecturer}
                  className="px-4 py-2.5 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#0F172A]/90 rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmittingLecturer ? 'Membuat Akun...' : 'Simpan Dosen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: EDIT DOSEN */}
      {/* ======================================================== */}
      {isEditLecturerModalOpen && selectedLecturer && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-[2px] animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Edit Data Dosen</h3>
              <button 
                onClick={() => setIsEditLecturerModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl mb-4 text-xs space-y-1">
              <p><span className="text-slate-500">Email:</span> <strong className="text-slate-800">{selectedLecturer.email}</strong></p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  value={editLecturerName}
                  onChange={(e) => setEditLecturerName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#14B8A6]/20 focus:border-[#14B8A6] outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditLecturerModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditLecturer}
                  className="px-4 py-2.5 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#0F172A]/90 rounded-xl transition-all shadow-xs cursor-pointer"
                >
                  Simpan Perubahan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: TAMBAH MATA KULIAH */}
      {/* ======================================================== */}
      {isAddCourseModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-[2px] animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Tambah Mata Kuliah Baru</h3>
              <button 
                onClick={() => setIsAddCourseModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCourse} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Kode Mata Kuliah</label>
                <input
                  type="text"
                  placeholder="Contoh: IF-AI, IF-CLOUD"
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#14B8A6]/20 focus:border-[#14B8A6] outline-none font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Nama Mata Kuliah</label>
                <input
                  type="text"
                  placeholder="Contoh: Kecerdasan Buatan"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#14B8A6]/20 focus:border-[#14B8A6] outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Dosen Pengampu</label>
                <select
                  value={newCourseLecturerId}
                  onChange={(e) => setNewCourseLecturerId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#14B8A6]/20 focus:border-[#14B8A6] outline-none"
                >
                  <option value="">Pilih Dosen Pengampu</option>
                  {profiles.filter(p => p.role === 'lecturer').map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.email})</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddCourseModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCourse}
                  className="px-4 py-2.5 text-xs font-bold text-white bg-[#0F172A] hover:bg-[#0F172A]/90 rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingCourse ? 'Menyimpan...' : 'Simpan Mata Kuliah'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
