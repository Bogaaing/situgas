import React, { useState, useEffect, startTransition, useMemo } from 'react';
import { 
  LayoutDashboard, Users, BarChart3, Search, Bell, Settings, LogOut, 
  Plus, Edit, Trash2, ArrowRight, BookOpen, Clock, Calendar, CheckSquare, ClipboardList,
  GraduationCap, UserPlus, FileSpreadsheet, Download, AlertTriangle, CheckCircle2, Loader2, Upload, Eye,
  Link2, ExternalLink, FileText, Menu, X, HelpCircle, ChevronLeft, ChevronRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { User, Assignment } from '../types';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Legend
} from 'recharts';
import { COURSES } from '../data';
import { apiRequest } from '../lib/api';
import { supabase } from '../lib/supabase';
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from '@supabase/supabase-js';

interface LecturerPortalProps {
  user: User;
  onLogout: () => void;
}

function getTotalMeetings(credits: number): number {
  if (credits === 2) return 14;
  if (credits === 3) return 21;
  throw new Error(`SKS tidak didukung: ${credits}`);
}

export default function LecturerPortal({ user, onLogout }: LecturerPortalProps) {
  // Sidebar state: 'overview' | 'assignments' | 'students' | 'attendance' | 'schedules' | 'reports' | 'master_students' | 'courses' | 'materials'
  const [activeTab, setActiveTab] = useState<'overview' | 'assignments' | 'students' | 'attendance' | 'schedules' | 'reports' | 'master_students' | 'courses' | 'materials'>('overview');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  const currentTabTitle = useMemo(() => {
    switch (activeTab) {
      case 'overview': return 'Dashboard';
      case 'courses': return 'Mata Kuliah';
      case 'materials': return 'Materi Perkuliahan';
      case 'students': return 'Mahasiswa';
      case 'master_students': return 'Data Mahasiswa';
      case 'assignments': return 'Tugas';
      case 'reports': return 'Statistik & Laporan';
      default: return 'Portal Dosen';
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

  const getInitials = (name: string) => {
    if (!name) return 'DS';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  };

  // Course Supabase States
  const [courses, setCourses] = useState<any[]>([]);
  const [isCoursesLoading, setIsCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState<string | null>(null);

  // Course Modal State
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any | null>(null);
  const [courseFormCode, setCourseFormCode] = useState('');
  const [courseFormName, setCourseFormName] = useState('');
  const [courseFormCredits, setCourseFormCredits] = useState<number>(3);
  const [courseFormError, setCourseFormError] = useState('');
  const [isCourseSubmitting, setIsCourseSubmitting] = useState(false);

  // Course Meetings and Materials States
  const [selectedMaterialCourseId, setSelectedMaterialCourseId] = useState<string>('');
  const [courseMeetings, setCourseMeetings] = useState<any[]>([]);
  const [isMeetingsLoading, setIsMeetingsLoading] = useState(false);
  const [meetingsError, setMeetingsError] = useState<string | null>(null);

  const [selectedMeetingForMaterials, setSelectedMeetingForMaterials] = useState<any | null>(null);
  const [meetingMaterials, setMeetingMaterials] = useState<any[]>([]);
  const [isMaterialsLoading, setIsMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState<string | null>(null);

  // Meeting Form Modal State
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<any | null>(null);
  const [meetingFormNumber, setMeetingFormNumber] = useState<number>(1);
  const [meetingFormTitle, setMeetingFormTitle] = useState('');
  const [meetingFormDescription, setMeetingFormDescription] = useState('');
  const [meetingFormPublished, setMeetingFormPublished] = useState(false);
  const [isMeetingSubmitting, setIsMeetingSubmitting] = useState(false);
  const [meetingFormError, setMeetingFormError] = useState<string | null>(null);

  // Material Form Modal State
  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);
  const [materialFormType, setMaterialFormType] = useState<'file' | 'link'>('file');
  const [materialFormTitle, setMaterialFormTitle] = useState('');
  const [materialFormUrl, setMaterialFormUrl] = useState('');
  const [materialFormFile, setMaterialFormFile] = useState<File | null>(null);
  const [isMaterialSubmitting, setIsMaterialSubmitting] = useState(false);
  const [materialFormError, setMaterialFormError] = useState<string | null>(null);

  // Material Delete Confirmation State
  const [selectedMaterialToDelete, setSelectedMaterialToDelete] = useState<any | null>(null);
  const [isMaterialDeleting, setIsMaterialDeleting] = useState(false);
  const [materialDeleteError, setMaterialDeleteError] = useState<string | null>(null);

  // Course Delete States
  const [selectedCourseToDelete, setSelectedCourseToDelete] = useState<any | null>(null);
  const [isCourseDeleting, setIsCourseDeleting] = useState(false);
  const [courseDeleteError, setCourseDeleteError] = useState<string | null>(null);

  const loadCourses = async () => {
    setIsCoursesLoading(true);
    setCoursesError(null);
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('lecturer_id', user.uid)
        .order('code', { ascending: true });

      if (error) throw error;
      setCourses(data || []);
      await loadAssignments(data || []);
    } catch (err: any) {
      console.error('Error fetching courses:', err);
      setCoursesError('Gagal memuat data mata kuliah.');
    } finally {
      setIsCoursesLoading(false);
    }
  };

  const handleDeleteCourseClick = (course: any) => {
    console.log('Hapus button clicked for course:', course);
    setSelectedCourseToDelete(course);
    setCourseDeleteError(null);
  };

  const handleConfirmDeleteCourse = async () => {
    if (!selectedCourseToDelete) return;
    setIsCourseDeleting(true);
    setCourseDeleteError(null);

    try {
      console.log('Starting Supabase delete for course id:', selectedCourseToDelete.id);
      const { data, error } = await supabase
        .from('courses')
        .delete()
        .eq('id', selectedCourseToDelete.id)
        .select('id');

      if (error) {
        console.error('Error deleting course from Supabase:', error);
        setCourseDeleteError('Gagal menghapus mata kuliah.');
        setIsCourseDeleting(false);
        return;
      }

      if (!data || data.length === 0) {
        console.error('Delete was executed but returned empty data (possibly RLS or ownership issue).');
        setCourseDeleteError('Gagal menghapus mata kuliah.');
        setIsCourseDeleting(false);
        return;
      }

      console.log('Successfully deleted course data:', data);
      setSelectedCourseToDelete(null);
      await loadCourses();
    } catch (err: any) {
      console.error('Error in delete course handler:', err);
      setCourseDeleteError('Gagal menghapus mata kuliah.');
    } finally {
      setIsCourseDeleting(false);
    }
  };

  const handleCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseFormCode.trim() || !courseFormName.trim()) {
      setCourseFormError('Semua field harus diisi!');
      return;
    }

    const selectedCredits = Number(courseFormCredits);
    if (selectedCredits !== 2 && selectedCredits !== 3) {
      setCourseFormError('SKS harus 2 atau 3.');
      return;
    }

    setCourseFormError('');
    setIsCourseSubmitting(true);

    try {
      const codeUpper = courseFormCode.trim().toUpperCase();
      const nameTrimmed = courseFormName.trim();

      if (editingCourse) {
        // Before changing credits from 3 to 2, check meetings
        if (editingCourse.credits === 3 && selectedCredits === 2) {
          const { data: meetingsAbove14, error: checkError } = await supabase
            .from('course_meetings')
            .select('id, meeting_number')
            .eq('course_id', editingCourse.id)
            .gt('meeting_number', 14);

          if (checkError) {
            setCourseFormError('Gagal memeriksa data pertemuan.');
            setIsCourseSubmitting(false);
            return;
          }

          if (meetingsAbove14 && meetingsAbove14.length > 0) {
            setCourseFormError('Mata kuliah tidak dapat diubah menjadi 2 SKS karena sudah memiliki materi di atas Pertemuan 14.');
            setIsCourseSubmitting(false);
            return;
          }
        }

        // Edit course
        const { error } = await supabase
          .from('courses')
          .update({
            code: codeUpper,
            name: nameTrimmed,
            credits: selectedCredits,
          })
          .eq('id', editingCourse.id);

        if (error) {
          if (error.code === '23505') {
            setCourseFormError('Kode mata kuliah sudah digunakan.');
          } else {
            setCourseFormError('Gagal memperbarui mata kuliah.');
          }
          setIsCourseSubmitting(false);
          return;
        }
      } else {
        // Create course
        const { error } = await supabase
          .from('courses')
          .insert({
            code: codeUpper,
            name: nameTrimmed,
            credits: selectedCredits,
            lecturer_id: user.uid,
          });

        if (error) {
          if (error.code === '23505') {
            setCourseFormError('Kode mata kuliah sudah digunakan.');
          } else {
            setCourseFormError('Gagal menambahkan mata kuliah.');
          }
          setIsCourseSubmitting(false);
          return;
        }
      }

      setIsCourseModalOpen(false);
      setCourseFormCode('');
      setCourseFormName('');
      setEditingCourse(null);
      await loadCourses();
    } catch (err: any) {
      console.error('Error submitting course:', err);
      setCourseFormError('Gagal memproses data mata kuliah.');
    } finally {
      setIsCourseSubmitting(false);
    }
  };

  // Master Mahasiswa Database States
  const [mockStudents, setMockStudents] = useState<Array<{ id: string; nim: string; name: string }>>([]);
  const [mockEnrollments, setMockEnrollments] = useState<Array<{ id: string; studentId: string; courseId: string; className: string; roomName: string }>>([]);
  const [selectedEnrollmentToDelete, setSelectedEnrollmentToDelete] = useState<any | null>(null);
  const [isEnrollmentDeleting, setIsEnrollmentDeleting] = useState(false);
  const [enrollmentDeleteError, setEnrollmentDeleteError] = useState<string | null>(null);

  // Master Mahasiswa Search & Filter states
  const [masterSearch, setMasterSearch] = useState('');
  const [masterCourseFilter, setMasterCourseFilter] = useState('all');
  const [masterClassFilter, setMasterClassFilter] = useState('all');

  // Master Mahasiswa Modal Form states
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [isMasterSubmitting, setIsMasterSubmitting] = useState(false);
  const [editingEnrollment, setEditingEnrollment] = useState<any | null>(null);
  
  const [masterFormNim, setMasterFormNim] = useState('');
  const [masterFormName, setMasterFormName] = useState('');
  const [masterFormPassword, setMasterFormPassword] = useState('');
  const [masterFormCourse, setMasterFormCourse] = useState('IF-MOB');
  const [masterFormClass, setMasterFormClass] = useState('04SIFM001');
  const [masterFormRoom, setMasterFormRoom] = useState('');
  const [masterFormError, setMasterFormError] = useState('');

  // Master Mahasiswa Import Excel states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFormCourse, setImportFormCourse] = useState('');
  const [importFormClass, setImportFormClass] = useState('');
  const [importFormRoom, setImportFormRoom] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStudents, setImportStudents] = useState<Array<{ nim: string; name: string; status: 'valid' | 'error'; message?: string }>>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResultSummary, setImportResultSummary] = useState<{ total: number; success: number; alreadyEnrolled: number; failed: number } | null>(null);
  const [importResultRows, setImportResultRows] = useState<Array<{ nim: string; status: 'success' | 'already_enrolled' | 'error'; message: string }> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Load master students and enrollments from Supabase
  const [isEnrollmentsLoading, setIsEnrollmentsLoading] = useState(false);
  const [enrollmentsError, setEnrollmentsError] = useState<string | null>(null);

  const loadEnrollments = async () => {
    setIsEnrollmentsLoading(true);
    setEnrollmentsError(null);
    try {
      const { data: enrollmentsData, error: enrollmentsErr } = await supabase
        .from('enrollments')
        .select(`
          id,
          class_name,
          room_name,
          course_id,
          student_id,
          student:profiles!student_id (
            id,
            nim,
            name,
            avatar_url
          ),
          course:courses!course_id (
            id,
            code,
            name
          )
        `);

      if (enrollmentsErr) throw enrollmentsErr;

      const formattedEnrollments = (enrollmentsData || []).map((env: any) => ({
        id: env.id,
        studentId: env.student_id,
        courseId: env.course?.code || env.course_id,
        className: env.class_name,
        roomName: env.room_name,
        courseUuid: env.course_id,
        student: env.student,
        course: env.course,
      }));

      setMockEnrollments(formattedEnrollments);

      // Fetch all student profiles readable by lecturer
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, nim, name, avatar_url')
        .eq('role', 'student');

      if (profilesError) throw profilesError;

      const formattedStudents = (profilesData || []).map((p: any) => ({
        id: p.id,
        nim: p.nim || '',
        name: p.name || '',
        avatarUrl: p.avatar_url || '',
      }));

      setMockStudents(formattedStudents);
    } catch (err: any) {
      console.error('Error loading master student enrollments:', err);
      setEnrollmentsError('Gagal memuat data master mahasiswa dari database.');
    } finally {
      setIsEnrollmentsLoading(false);
    }
  };

  // Auto-lookup for NIM in Master Mahasiswa modal
  useEffect(() => {
    if (editingEnrollment) return; // do not lookup/overwrite in edit mode
    
    const cleanNim = masterFormNim.trim();
    if (cleanNim) {
      const found = mockStudents.find(s => s.nim === cleanNim);
      if (found) {
        setMasterFormName(found.name);
      } else {
        // Only clear if it was previously set to an existing student's name
        // to avoid clearing while they are typing a new name
        const wasExisting = mockStudents.some(s => s.name === masterFormName && s.nim !== cleanNim);
        if (wasExisting) {
          setMasterFormName('');
        }
      }
    }
  }, [masterFormNim, mockStudents, editingEnrollment]);

  // Helper for visual status indicator
  const foundExistingStudent = useMemo(() => {
    if (!masterFormNim.trim() || editingEnrollment) return null;
    return mockStudents.find(s => s.nim === masterFormNim.trim()) || null;
  }, [masterFormNim, mockStudents, editingEnrollment]);

  // Helper for duplicate check
  const isAlreadyEnrolled = useMemo(() => {
    if (!masterFormNim.trim() || !masterFormCourse) return false;
    const cleanNim = masterFormNim.trim();
    const existingStudent = mockStudents.find(s => s.nim === cleanNim);
    if (!existingStudent) return false;
    
    return mockEnrollments.some(
      env => env.studentId === existingStudent.id && 
             env.courseId === masterFormCourse && 
             (!editingEnrollment || env.id !== editingEnrollment.id)
    );
  }, [masterFormNim, masterFormCourse, mockStudents, mockEnrollments, editingEnrollment]);

  // Unique classes dynamic list for filter dropdown
  const uniqueClasses = useMemo(() => {
    const classes = new Set<string>();
    mockEnrollments.forEach(e => {
      if (e.className) classes.add(e.className);
    });
    return Array.from(classes).sort();
  }, [mockEnrollments]);

  // Search & Filtered Enrollments
  const filteredMasterEnrollments = useMemo(() => {
    return mockEnrollments.filter(enrollment => {
      const student = mockStudents.find(s => s.id === enrollment.studentId);
      if (!student) return false;

      const matchesSearch = student.name.toLowerCase().includes(masterSearch.toLowerCase()) ||
                            student.nim.toLowerCase().includes(masterSearch.toLowerCase());
      const matchesCourse = masterCourseFilter === 'all' || enrollment.courseId === masterCourseFilter;
      const matchesClass = masterClassFilter === 'all' || enrollment.className === masterClassFilter;

      return matchesSearch && matchesCourse && matchesClass;
    });
  }, [mockEnrollments, mockStudents, masterSearch, masterCourseFilter, masterClassFilter]);

  // Open Master Modal for adding new student
  const openAddMasterModal = () => {
    setEditingEnrollment(null);
    setMasterFormNim('');
    setMasterFormName('');
    setMasterFormPassword('');
    if (courses.length > 0) {
      setMasterFormCourse(courses[0].code);
    } else {
      setMasterFormCourse('IF-MOB');
    }
    setMasterFormClass('IF-4A');
    setMasterFormRoom('');
    setMasterFormError('');
    setIsMasterModalOpen(true);
  };

  // Open Master Modal for editing enrollment
  const openEditMasterModal = (enrollment: any) => {
    const student = mockStudents.find(s => s.id === enrollment.studentId);
    if (!student) return;

    setEditingEnrollment(enrollment);
    setMasterFormNim(student.nim);
    setMasterFormName(student.name);
    setMasterFormPassword('');
    setMasterFormCourse(enrollment.courseId);
    setMasterFormClass(enrollment.className);
    setMasterFormRoom(enrollment.roomName);
    setMasterFormError('');
    setIsMasterModalOpen(true);
  };

  // Open Master Modal for importing excel
  const openImportExcelModal = () => {
    setIsImportModalOpen(true);
    setImportFormCourse(courses[0]?.id || '');
    setImportFormClass('');
    setImportFormRoom('');
    setImportFile(null);
    setImportStudents([]);
    setImportResultSummary(null);
    setImportResultRows(null);
    setImportError(null);
  };

  // Download template Excel
  const handleDownloadTemplate = () => {
    try {
      const wb = XLSX.utils.book_new();
      const wsData = [
        ['NIM', 'NAMA_MAHASISWA']
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Mahasiswa');
      XLSX.writeFile(wb, 'template_import_mahasiswa_situgas.xlsx');
    } catch (err: any) {
      console.error('Error generating template:', err);
      alert('Gagal mengunduh template Excel.');
    }
  };

  // Parse excel file
  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setImportError('Ukuran file terlalu besar. Maksimum 5 MB.');
      setImportStudents([]);
      setImportFile(null);
      return;
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    if (fileExt !== 'xlsx' && fileExt !== 'xls') {
      setImportError('Format file tidak didukung. Gunakan file Excel.');
      setImportStudents([]);
      setImportFile(null);
      return;
    }

    setImportError(null);
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length <= 1) {
          setImportError('File Excel tidak memiliki data mahasiswa.');
          setImportStudents([]);
          return;
        }

        // Read headers from first row
        const headersRow = jsonData[0];
        if (!headersRow || !Array.isArray(headersRow)) {
          setImportError('Baris header tidak ditemukan.');
          setImportStudents([]);
          return;
        }

        let nimIndex = -1;
        let nameIndex = -1;

        for (let i = 0; i < headersRow.length; i++) {
          const val = String(headersRow[i] || '').trim().toLowerCase();
          if (val === 'nim') {
            nimIndex = i;
          } else if (
            val === 'nama_mahasiswa' || 
            val === 'nama mahasiswa' || 
            val === 'nama' || 
            val === 'name' || 
            val === 'nama_lengkap'
          ) {
            nameIndex = i;
          }
        }

        if (nimIndex === -1) {
          setImportError('Kolom NIM tidak ditemukan.');
          setImportStudents([]);
          return;
        }
        if (nameIndex === -1) {
          setImportError('Kolom NAMA_MAHASISWA tidak ditemukan.');
          setImportStudents([]);
          return;
        }

        const parsedRows: any[] = [];
        const seenNims = new Set<string>();

        for (let r = 1; r < jsonData.length; r++) {
          const row = jsonData[r];
          if (!row || row.length === 0) continue;

          // ignore fully empty rows
          const isAllEmpty = row.every((cell: any) => cell === undefined || cell === null || String(cell).trim() === '');
          if (isAllEmpty) continue;

          let rawNim = row[nimIndex];
          let nimStr = '';
          if (rawNim !== undefined && rawNim !== null) {
            nimStr = String(rawNim).trim();
          }

          let rawName = row[nameIndex];
          let nameStr = '';
          if (rawName !== undefined && rawName !== null) {
            nameStr = String(rawName).trim();
          }

          let status: 'valid' | 'error' = 'valid';
          let message = '';

          if (!nimStr) {
            status = 'error';
            message = 'NIM wajib diisi';
          } else if (!nameStr) {
            status = 'error';
            message = 'Nama wajib diisi';
          } else if (seenNims.has(nimStr)) {
            status = 'error';
            message = 'NIM duplikat dalam file';
          } else {
            seenNims.add(nimStr);
          }

          parsedRows.push({
            nim: nimStr,
            name: nameStr,
            status,
            message
          });
        }

        if (parsedRows.length === 0) {
          setImportError('File Excel tidak memiliki baris data yang valid.');
        }
        setImportStudents(parsedRows);
      } catch (err: any) {
        console.error('Error parsing excel:', err);
        setImportError(`Gagal membaca file Excel: ${err.message || 'Unknown error'}`);
        setImportStudents([]);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Submit bulk import
  const handleImportExcelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);

    const validStudentsToImport = importStudents.filter(s => s.status === 'valid').map(s => ({
      nim: s.nim,
      name: s.name
    }));

    if (!importFormCourse) {
      setImportError('Pilih mata kuliah terlebih dahulu.');
      return;
    }
    if (!importFormClass.trim()) {
      setImportError('Isi Kode Kelas terlebih dahulu.');
      return;
    }
    if (!importFormRoom.trim()) {
      setImportError('Isi Ruang Kelas terlebih dahulu.');
      return;
    }
    if (validStudentsToImport.length === 0) {
      setImportError('Tidak ada data mahasiswa valid untuk diimport.');
      return;
    }

    setIsImporting(true);

    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke('bulk-import-students', {
        body: {
          courseId: importFormCourse,
          className: importFormClass.trim(),
          roomName: importFormRoom.trim(),
          students: validStudentsToImport
        }
      });

      if (invokeError) {
        throw invokeError;
      }

      if (result?.error) {
        throw new Error(result.error);
      }

      if (result?.success) {
        setImportResultSummary(result.summary);
        setImportResultRows(result.results);
        // Refresh master student list and core data
        await loadEnrollments();
        await loadData();
      } else {
        throw new Error('Format response dari server tidak valid.');
      }

    } catch (err: any) {
      console.error('Error in handleImportExcelSubmit:', err);
      let errorMessage = 'Gagal mengimport mahasiswa.';
      if (err instanceof FunctionsHttpError) {
        const httpStatus = err.context?.status || (err as any).status || 'Unknown';
        try {
          if (err.context && typeof err.context.json === 'function') {
            const cloned = err.context.clone();
            const errorResponse = await cloned.json();
            errorMessage = errorResponse?.error || errorResponse?.message || `HTTP Error ${httpStatus}`;
          } else if (err.context && typeof err.context === 'object') {
            errorMessage = err.context.error || err.context.message || `HTTP Error ${httpStatus}`;
          } else {
            errorMessage = `HTTP Error ${httpStatus}: ${err.message}`;
          }
        } catch (jsonErr) {
          errorMessage = `HTTP Error ${httpStatus}: ${err.message}`;
        }
      } else if (err instanceof FunctionsRelayError) {
        errorMessage = 'Gagal terhubung ke layanan import mahasiswa (Relay Error).';
      } else if (err instanceof FunctionsFetchError) {
        errorMessage = 'Gagal terhubung ke layanan import mahasiswa (Fetch Error).';
      } else if (err.message) {
        errorMessage = err.message;
      }
      setImportError(errorMessage);
    } finally {
      setIsImporting(false);
    }
  };

  // Delete enrollment handler with confirmation
  const handleDeleteMasterEnrollment = (id: string) => {
    const enrollment = mockEnrollments.find(e => e.id === id);
    if (!enrollment) return;
    setSelectedEnrollmentToDelete(enrollment);
    setEnrollmentDeleteError(null);
  };

  const handleConfirmDeleteEnrollment = async () => {
    if (!selectedEnrollmentToDelete) return;
    setIsEnrollmentDeleting(true);
    setEnrollmentDeleteError(null);

    try {
      console.log('Starting Supabase delete for enrollment id:', selectedEnrollmentToDelete.id);
      const { data, error } = await supabase
        .from('enrollments')
        .delete()
        .eq('id', selectedEnrollmentToDelete.id)
        .select('id');

      if (error) {
        console.error('Error deleting enrollment from Supabase:', error);
        setEnrollmentDeleteError('Gagal menghapus mahasiswa dari mata kuliah.');
        setIsEnrollmentDeleting(false);
        return;
      }

      if (!data || data.length === 0) {
        console.error('Delete enrollment executed but returned empty data (possibly RLS or ownership issue).');
        setEnrollmentDeleteError('Gagal menghapus mahasiswa dari mata kuliah.');
        setIsEnrollmentDeleting(false);
        return;
      }

      console.log('Successfully deleted enrollment data:', data);
      setSelectedEnrollmentToDelete(null);
      await loadEnrollments();
      await loadData();
    } catch (err: any) {
      console.error('Unexpected error deleting enrollment:', err);
      setEnrollmentDeleteError(`Terjadi kesalahan: ${err.message || 'Unknown error'}`);
    } finally {
      setIsEnrollmentDeleting(false);
    }
  };

  // Form Submission
  const handleMasterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMasterFormError('');
    setIsMasterSubmitting(true);

    if (!masterFormNim.trim() || !masterFormCourse || !masterFormClass || !masterFormRoom.trim()) {
      setMasterFormError('Semua field harus diisi!');
      setIsMasterSubmitting(false);
      return;
    }

    const cleanNim = masterFormNim.trim();
    const course = courses.find(c => c.code === masterFormCourse);
    if (!course) {
      setMasterFormError('Mata kuliah tidak valid atau tidak ditemukan.');
      setIsMasterSubmitting(false);
      return;
    }

    try {
      if (editingEnrollment) {
        // Edit enrollment mode
        const { error } = await supabase
          .from('enrollments')
          .update({
            course_id: course.id,
            class_name: masterFormClass,
            room_name: masterFormRoom.trim()
          })
          .eq('id', editingEnrollment.id);

        if (error) throw error;
        
        setIsMasterModalOpen(false);
        await loadEnrollments();
        await loadData();
      } else {
        // Create student mode calling the Edge Function
        const { data: result, error: invokeError } = await supabase.functions.invoke('create-student', {
          body: {
            nim: cleanNim,
            name: masterFormName.trim(),
            initialPassword: masterFormPassword,
            courseId: course.id,
            className: masterFormClass,
            roomName: masterFormRoom.trim()
          }
        });

        if (invokeError) throw invokeError;
        if (result?.error) throw new Error(result.error);

        setIsMasterModalOpen(false);
        await loadEnrollments();
        await loadData();
      }
    } catch (err: any) {
      console.error('Error in handleMasterSubmit:', err);
      let errorMessage = 'Terjadi kesalahan saat memproses permintaan.';
      if (err instanceof FunctionsHttpError) {
        const httpStatus = err.context?.status || (err as any).status || 'Unknown';
        try {
          if (err.context && typeof err.context.json === 'function') {
            const cloned = err.context.clone();
            const errorResponse = await cloned.json();
            errorMessage = errorResponse?.error || errorResponse?.message || `HTTP Error ${httpStatus}`;
          } else if (err.context && typeof err.context === 'object') {
            errorMessage = err.context.error || err.context.message || `HTTP Error ${httpStatus}`;
          } else {
            errorMessage = `HTTP Error ${httpStatus}: ${err.message}`;
          }
        } catch {
          try {
            if (err.context && typeof err.context.text === 'function') {
              errorMessage = await err.context.clone().text();
            }
          } catch {}
          if (!errorMessage || errorMessage.includes('non-2xx status code')) {
            errorMessage = `HTTP Error ${httpStatus}: ${err.message}`;
          }
        }
        console.error(`[Edge Function HTTP Error] Status ${httpStatus}:`, err.message);
      } else if (err instanceof FunctionsRelayError) {
        errorMessage = `Relay Error: ${err.message}`;
        console.error('[Edge Function Relay Error]:', err.message);
      } else if (err instanceof FunctionsFetchError) {
        errorMessage = `Network/Fetch Error: ${err.message}. Pastikan koneksi internet aktif dan Edge Function tersedia.`;
        console.error('[Edge Function Fetch Error]:', err.message);
      } else {
        errorMessage = err.message || errorMessage;
      }
      setMasterFormError(errorMessage);
    } finally {
      setIsMasterSubmitting(false);
    }
  };

  // Database-driven State
  const [students, setStudents] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filters
  const [studentSearch, setStudentSearch] = useState('');
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>('all');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');

  // Assignment Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formCourse, setFormCourse] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [formPoints, setFormPoints] = useState(100);
  const [formStatus, setFormStatus] = useState<'draft' | 'published' | 'closed'>('draft');

  // New assignment target class and loading states
  const [targetClasses, setTargetClasses] = useState<string[]>([]);
  const [formTargetClass, setFormTargetClass] = useState<string>('all');
  const [isAssignmentsLoading, setIsAssignmentsLoading] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);

  // Assignment Delete State
  const [selectedAssignmentToDelete, setSelectedAssignmentToDelete] = useState<any | null>(null);
  const [isAssignmentDeleting, setIsAssignmentDeleting] = useState(false);
  const [assignmentDeleteError, setAssignmentDeleteError] = useState<string | null>(null);

  // Grading Modal/State
  const [selectedSubmission, setSelectedSubmission] = useState<any | null>(null);
  const [gradeValue, setGradeValue] = useState<number>(100);
  const [feedbackValue, setFeedbackValue] = useState<string>('');
  const [isGradingOpen, setIsGradingOpen] = useState(false);

  // --- SUBMISSION MANAGEMENT ---
  const [selectedAsgSubmissionsId, setSelectedAsgSubmissionsId] = useState<string | null>(null);
  const [selectedSubmissionForDetail, setSelectedSubmissionForDetail] = useState<any | null>(null);
  const [submissionManagementSearch, setSubmissionManagementSearch] = useState('');
  const [targetStudents, setTargetStudents] = useState<any[]>([]);
  const [targetStudentsLoading, setTargetStudentsLoading] = useState(false);
  const [targetStudentsError, setTargetStudentsError] = useState<string | null>(null);
  const [isSavingGrade, setIsSavingGrade] = useState(false);
  const [gradingError, setGradingError] = useState<string | null>(null);
  const [gradingSuccess, setGradingSuccess] = useState<boolean>(false);
  const [isGradingSuccessModalOpen, setIsGradingSuccessModalOpen] = useState<boolean>(false);
  const [gradedStudentInfo, setGradedStudentInfo] = useState<{ name: string; grade: number; maxPoints: number } | null>(null);
  const [localGradeValue, setLocalGradeValue] = useState<string>('');
  const [localFeedbackValue, setLocalFeedbackValue] = useState<string>('');

  // Report filters state
  const [reportSearch, setReportSearch] = useState<string>('');
  const [reportCourseFilter, setReportCourseFilter] = useState<string>('all');
  const [reportClassFilter, setReportClassFilter] = useState<string>('all');
  const [reportStatusFilter, setReportStatusFilter] = useState<string>('all');

  const loadTargetStudentsForAssignment = async (assignmentId: string) => {
    setTargetStudentsLoading(true);
    setTargetStudentsError(null);
    try {
      const assignment = assignments.find(a => a.id === assignmentId);
      if (!assignment) {
        throw new Error('Tugas tidak ditemukan.');
      }

      // 1. Fetch enrollments for the course
      let query = supabase
        .from('enrollments')
        .select(`
          id,
          class_name,
          room_name,
          student_id,
          student:profiles!student_id (
            id,
            nim,
            name,
            avatar_url
          )
        `)
        .eq('course_id', assignment.course_id);

      if (assignment.class_name) {
        query = query.eq('class_name', assignment.class_name);
      }

      const { data: enrollData, error: enrollError } = await query;
      if (enrollError) {
        setTargetStudentsError("Gagal memuat daftar mahasiswa.");
        return;
      }

      // 2. Fetch submissions for this assignment
      const { data: subsData, error: subsError } = await supabase
        .from('submissions')
        .select('*')
        .eq('assignment_id', assignmentId);

      if (subsError) {
        setTargetStudentsError("Gagal memuat data pengumpulan.");
        return;
      }

      // 3. Merge target students and submissions
      const merged = (enrollData || []).map((enroll: any) => {
        const student = enroll.student;
        const sub = (subsData || []).find((s: any) => s.student_id === enroll.student_id);
        
        return {
          studentId: enroll.student_id,
          nim: student?.nim || '-',
          name: student?.name || 'Unknown student',
          className: enroll.class_name,
          roomName: enroll.room_name,
          submission: sub ? {
            id: sub.id,
            assignmentId: sub.assignment_id,
            student_id: sub.student_id,
            submitted_at: sub.submitted_at,
            file_path: sub.file_path,
            submitted_link: sub.submitted_link,
            submitted_note: sub.submitted_note,
            grade: sub.grade,
            feedback: sub.feedback,
            graded_at: sub.graded_at,
            created_at: sub.created_at,
            updated_at: sub.updated_at
          } : null,
        };
      });

      // Sort: Mahasiswa yang baru mengumpulkan tugas berada di paling atas
      merged.sort((a, b) => {
        const aSub = a.submission;
        const bSub = b.submission;

        // Kedua mahasiswa sudah mengumpulkan: urutkan dari waktu pengumpulan terbaru (descending)
        if (aSub && bSub) {
          const aTime = aSub.submitted_at ? new Date(aSub.submitted_at).getTime() : 0;
          const bTime = bSub.submitted_at ? new Date(bSub.submitted_at).getTime() : 0;
          if (bTime !== aTime) {
            return bTime - aTime;
          }
          return a.name.localeCompare(b.name);
        }

        // Mahasiswa 'a' sudah mengumpulkan, 'b' belum -> 'a' lebih atas
        if (aSub && !bSub) return -1;

        // Mahasiswa 'b' sudah mengumpulkan, 'a' belum -> 'b' lebih atas
        if (!aSub && bSub) return 1;

        // Keduanya belum mengumpulkan: urutkan alfabetis nama
        return a.name.localeCompare(b.name);
      });

      setTargetStudents(merged);

      // If viewing a submission, update local view data
      if (selectedSubmissionForDetail) {
        const updatedStudent = merged.find(t => t.studentId === selectedSubmissionForDetail.studentId);
        if (updatedStudent) {
          setSelectedSubmissionForDetail(updatedStudent);
        }
      }
    } catch (err: any) {
      console.error('Error loading target students/submissions:', err);
      setTargetStudentsError(err.message || 'Gagal memuat daftar mahasiswa.');
    } finally {
      setTargetStudentsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAsgSubmissionsId) {
      loadTargetStudentsForAssignment(selectedAsgSubmissionsId);
    } else {
      setTargetStudents([]);
      setSelectedSubmissionForDetail(null);
    }
  }, [selectedAsgSubmissionsId]);

  useEffect(() => {
    if (selectedSubmissionForDetail && selectedSubmissionForDetail.submission) {
      const sub = selectedSubmissionForDetail.submission;
      setLocalGradeValue(sub.grade !== null && sub.grade !== undefined ? sub.grade.toString() : '');
      setLocalFeedbackValue(sub.feedback || '');
      setGradingError(null);
      setGradingSuccess(false);
    }
  }, [selectedSubmissionForDetail]);

  const handleSaveGrading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubmissionForDetail || !selectedSubmissionForDetail.submission) return;
    const assignment = assignments.find(a => a.id === selectedAsgSubmissionsId);
    if (!assignment) return;

    setGradingError(null);
    setGradingSuccess(false);
    setIsSavingGrade(true);

    const rawGrade = Number(localGradeValue);
    if (localGradeValue === '' || isNaN(rawGrade)) {
      setGradingError('Nilai wajib diisi.');
      setIsSavingGrade(false);
      return;
    }

    if (rawGrade < 0 || rawGrade > assignment.max_points) {
      setGradingError(`Nilai harus berada antara 0 dan ${assignment.max_points}.`);
      setIsSavingGrade(false);
      return;
    }

    try {
      const submissionId = selectedSubmissionForDetail.submission.id;
      const normalizedGrade = rawGrade;
      const normalizedFeedback = localFeedbackValue.trim();

      // Use the robust proxy backend API to perform the update on Supabase.
      // This completely avoids any browser CORS/preflight or adblock blocks for cross-origin PATCH requests.
      await apiRequest<any>(`/api/submissions/${submissionId}/grade`, {
        method: 'PATCH',
        body: JSON.stringify({
          grade: normalizedGrade,
          feedback: normalizedFeedback,
        }),
      });

      setGradedStudentInfo({
        name: selectedSubmissionForDetail.name,
        grade: normalizedGrade,
        maxPoints: assignment.max_points,
      });
      setIsGradingSuccessModalOpen(true);
      setSelectedSubmissionForDetail(null); // Otomatis kembali ke tampilan daftar pengumpulan

      await loadTargetStudentsForAssignment(selectedAsgSubmissionsId);
      await loadData();
      await loadEnrollments();
      await loadCourses();
    } catch (err: any) {
      console.error('Error saving grade:', err);
      setGradingError(err.message || 'Gagal menyimpan penilaian.');
    } finally {
      setIsSavingGrade(false);
    }
  };

  // Attendance marking state
  const [selectedAttendanceCourse, setSelectedAttendanceCourse] = useState('IF-MOB');
  const [selectedAttendanceClass, setSelectedAttendanceClass] = useState('IF-4A');
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);

  // Schedule modal state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleCourse, setScheduleCourse] = useState('IF-MOB');
  const [scheduleClass, setScheduleClass] = useState('IF-4A');
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleTime, setScheduleTime] = useState('08:00 - 10:00');
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split('T')[0]);

  const loadAssignments = async (currentCourses?: any[]) => {
    setIsAssignmentsLoading(true);
    setAssignmentsError(null);
    try {
      const activeCourses = currentCourses || courses;
      if (activeCourses.length === 0) {
        setAssignments([]);
        return;
      }
      const courseIds = activeCourses.map(c => c.id);

      const { data, error } = await supabase
        .from('assignments')
        .select(`
          id,
          course_id,
          class_name,
          title,
          description,
          deadline,
          max_points,
          status,
          created_at,
          updated_at,
          course:courses!course_id (
            id,
            code,
            name
          )
        `)
        .in('course_id', courseIds)
        .order('deadline', { ascending: true });

      if (error) throw error;
      setAssignments(data || []);
    } catch (err: any) {
      console.error('Error fetching assignments:', err);
      setAssignmentsError('Gagal memuat data tugas.');
    } finally {
      setIsAssignmentsLoading(false);
    }
  };

  const loadTargetClasses = async (courseId: string) => {
    if (!courseId) {
      setTargetClasses([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('enrollments')
        .select('class_name')
        .eq('course_id', courseId);
      
      if (error) throw error;
      
      const classes = new Set<string>();
      if (data) {
        data.forEach((item: any) => {
          if (item.class_name && item.class_name.trim()) {
            classes.add(item.class_name.trim());
          }
        });
      }
      setTargetClasses(Array.from(classes).sort());
    } catch (err) {
      console.error('Error loading target classes:', err);
    }
  };

  useEffect(() => {
    if (formCourse) {
      loadTargetClasses(formCourse);
    } else {
      setTargetClasses([]);
    }
  }, [formCourse]);

  // Fetch all backend data (excluding assignments)
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [studentsData, attendanceData, schedulesData, apiSubs] = await Promise.all([
        apiRequest<any[]>('/api/students').catch(() => []),
        apiRequest<any[]>('/api/attendance').catch(() => []),
        apiRequest<any[]>('/api/schedules').catch(() => []),
        apiRequest<any[]>('/api/submissions').catch(() => []),
      ]);

      // Fetch submissions directly from Supabase
      const { data: subsData, error: subsError } = await supabase
        .from('submissions')
        .select('*');

      if (subsError) {
        console.error('Error loading submissions from Supabase:', subsError);
      }

      // Merge Supabase submissions and API submissions, deduplicating by ID or composite key
      const rawCombined = [...(subsData || []), ...(Array.isArray(apiSubs) ? apiSubs : [])];
      const seenKeys = new Set<string>();
      const formattedSubmissions: any[] = [];

      for (const sub of rawCombined) {
        if (!sub) continue;
        const subId = String(sub.id || '').trim();
        const asgId = String(sub.assignment_id || sub.assignmentId || '').trim();
        const studId = String(sub.student_id || sub.userUid || sub.studentId || '').trim();
        const key = subId || `${asgId}_${studId}`;

        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          const rawGrade = sub.grade;
          const parsedGrade = rawGrade !== null && rawGrade !== undefined && rawGrade !== '' && !isNaN(Number(rawGrade))
            ? Number(rawGrade)
            : null;

          formattedSubmissions.push({
            id: sub.id,
            assignmentId: asgId,
            assignment_id: asgId,
            userUid: studId,
            student_id: studId,
            studentId: studId,
            submittedAt: sub.submitted_at || sub.submittedAt,
            submittedFile: sub.file_path || sub.submittedFile,
            submittedLink: sub.submitted_link || sub.submittedLink,
            submittedNote: sub.submitted_note || sub.submittedNote,
            grade: parsedGrade,
            feedback: sub.feedback || '',
            graded_at: sub.graded_at || sub.gradedAt,
          });
        }
      }

      setStudents(studentsData);
      setSubmissions(formattedSubmissions);
      setAttendance(attendanceData);
      setSchedules(schedulesData);
    } catch (err) {
      console.error('Error fetching lecturer portal data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadCourses();
    loadEnrollments();
  }, []);

  // Reload latest data whenever lecturer navigates to reports tab
  useEffect(() => {
    if (activeTab === 'reports') {
      loadData();
      loadCourses();
      loadEnrollments();
    }
  }, [activeTab]);

  useEffect(() => {
    if (courses.length > 0) {
      if (!courses.some(c => c.code === selectedAttendanceCourse)) {
        setSelectedAttendanceCourse(courses[0].code);
      }
      if (!courses.some(c => c.code === scheduleCourse)) {
        setScheduleCourse(courses[0].code);
      }
      if (!courses.some(c => c.id === formCourse)) {
        setFormCourse(courses[0].id);
      }
    }
  }, [courses]);

  // Filtered Lists
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      const nameMatch = student.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
        (student.idNumber && student.idNumber.toLowerCase().includes(studentSearch.toLowerCase())) ||
        student.email.toLowerCase().includes(studentSearch.toLowerCase());
      const courseMatch = selectedCourseFilter === 'all' || student.enrolledCourseCode === selectedCourseFilter;
      const classMatch = selectedClassFilter === 'all' || student.enrolledClassName === selectedClassFilter;
      return nameMatch && courseMatch && classMatch;
    });
  }, [students, studentSearch, selectedCourseFilter, selectedClassFilter]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter(assignment => 
      assignment.title.toLowerCase().includes(assignmentSearch.toLowerCase()) ||
      (assignment.course?.code || '').toLowerCase().includes(assignmentSearch.toLowerCase()) ||
      (assignment.course?.name || '').toLowerCase().includes(assignmentSearch.toLowerCase())
    );
  }, [assignments, assignmentSearch]);

  // Combined statistics for Dashboard cards
  const stats = useMemo(() => {
    const lecturerCourseIds = new Set(courses.map(c => c.id));
    const lecturerEnrollments = mockEnrollments.filter(e => lecturerCourseIds.has(e.courseUuid));
    const uniqueStudentIds = new Set(lecturerEnrollments.map(e => e.studentId));
    // Fallback to students.length if mockEnrollments is empty or has no match
    const totalStudentsCount = uniqueStudentIds.size > 0 ? uniqueStudentIds.size : students.length;

    // Filter submissions to only those belonging to the lecturer's assignments
    const lecturerAssignmentIds = new Set(assignments.map(a => String(a.id)));
    const lecturerSubmissions = submissions.filter(s => lecturerAssignmentIds.has(String(s.assignmentId)));

    return {
      totalStudents: totalStudentsCount,
      totalAssignments: assignments.length,
      totalSubmissions: lecturerSubmissions.length,
      gradedSubmissions: lecturerSubmissions.filter(s => s.grade !== null).length,
    };
  }, [courses, mockEnrollments, students, assignments, submissions]);

  // Trend Chart Data (aggregated submissions by course)
  const chartData = useMemo(() => {
    return courses.map(course => {
      const courseAssignments = assignments.filter(a => a.course_id === course.id);
      const courseAssignmentIds = courseAssignments.map(a => a.id);
      const courseSubmissionsCount = submissions.filter(s => 
        courseAssignmentIds.some(asgId => String(asgId) === String(s.assignmentId))
      ).length;
      return {
        name: course.code,
        Tugas: courseAssignments.length,
        Kumpulan: courseSubmissionsCount,
      };
    });
  }, [courses, assignments, submissions]);

  // Student task reports calculation per enrollment (student x course x class)
  const studentTaskReports = useMemo(() => {
    return mockEnrollments.map((env) => {
      // 1. Resolve student info
      const studentObj = (env as any).student ||
        mockStudents.find(s => String(s.id).trim() === String(env.studentId).trim()) ||
        students.find(s => String(s.id).trim() === String(env.studentId).trim() || String(s.uid).trim() === String(env.studentId).trim());

      const studentNim = studentObj?.nim || studentObj?.idNumber || '-';
      const studentName = studentObj?.name || 'Mahasiswa';
      const studentAvatar = studentObj?.avatarUrl || '';

      // 2. Resolve course info
      const courseObj = (env as any).course || courses.find(c => 
        (env.courseUuid && String(c.id).trim() === String(env.courseUuid).trim()) ||
        (env.courseId && String(c.code).trim().toLowerCase() === String(env.courseId).trim().toLowerCase()) ||
        (env.courseId && String(c.id).trim() === String(env.courseId).trim())
      );
      
      const courseCode = courseObj?.code || env.courseId || '-';
      const courseName = courseObj?.name || courseCode;
      const courseUuid = env.courseUuid || courseObj?.id;

      // 3. Find all assignments belonging to this course
      const courseAssignments = assignments.filter(a => {
        const matchUuid = courseUuid && String(a.course_id).trim() === String(courseUuid).trim();
        const matchCode = courseCode && (
          String(a.course_id).trim().toLowerCase() === String(courseCode).trim().toLowerCase() ||
          (a.course?.code && String(a.course.code).trim().toLowerCase() === String(courseCode).trim().toLowerCase())
        );
        const matchNestedId = a.course?.id && courseUuid && String(a.course.id).trim() === String(courseUuid).trim();
        return Boolean(matchUuid || matchCode || matchNestedId);
      });

      // Filter to relevant assignments for this student's class (or general / all classes)
      const relevantAssignments = courseAssignments.filter(a => {
        if (!a.class_name || a.class_name.trim() === '') return true;
        const normAsgClass = a.class_name.trim().toLowerCase();
        if (normAsgClass === 'all' || normAsgClass === 'semua kelas') return true;
        const normStudentClass = (env.className || '').trim().toLowerCase();
        return normAsgClass === normStudentClass;
      });

      const relevantAssignmentIds = new Set(relevantAssignments.map(a => String(a.id).toLowerCase().trim()));
      const courseAssignmentIds = new Set(courseAssignments.map(a => String(a.id).toLowerCase().trim()));

      // 4. Match student's submissions for this course & class
      const validStudentIds = new Set([
        String(env.studentId || '').toLowerCase().trim(),
        String((env as any).student?.id || '').toLowerCase().trim(),
        String(studentObj?.id || '').toLowerCase().trim(),
        String(studentObj?.uid || '').toLowerCase().trim(),
      ].filter(Boolean));

      const studentSubmissions = submissions.filter(s => {
        const subStudentId = String(s.userUid || s.student_id || s.studentId || '').toLowerCase().trim();
        if (!validStudentIds.has(subStudentId)) return false;

        const asgId = String(s.assignmentId || s.assignment_id || '').toLowerCase().trim();
        if (relevantAssignmentIds.has(asgId) || courseAssignmentIds.has(asgId)) {
          return true;
        }

        // Check if the assignment in assignments array belongs to this course
        const asgObj = assignments.find(a => String(a.id).toLowerCase().trim() === asgId);
        if (asgObj) {
          const matchCourseUuid = courseUuid && String(asgObj.course_id).toLowerCase().trim() === String(courseUuid).toLowerCase().trim();
          const matchCourseCode = courseCode && (
            String(asgObj.course_id).toLowerCase().trim() === String(courseCode).toLowerCase().trim() ||
            (asgObj.course?.code && String(asgObj.course.code).toLowerCase().trim() === String(courseCode).toLowerCase().trim())
          );
          return Boolean(matchCourseUuid || matchCourseCode);
        }

        // Default to true if submission is from this student
        return true;
      });

      const totalAssignments = Math.max(relevantAssignments.length, studentSubmissions.length);
      const totalSubmitted = studentSubmissions.length;
      const gradedSubmissions = studentSubmissions.filter(s => s.grade !== null && s.grade !== undefined && s.grade !== '' && !isNaN(Number(s.grade)));
      const totalGraded = gradedSubmissions.length;
      const unsubmitted = Math.max(0, totalAssignments - totalSubmitted);
      const ungraded = Math.max(0, totalSubmitted - totalGraded);

      const totalScore = gradedSubmissions.reduce((acc, curr) => acc + Number(curr.grade || 0), 0);
      const averageGrade = totalGraded > 0 ? Math.round((totalScore / totalGraded) * 10) / 10 : null;
      const completionRate = totalAssignments > 0 ? Math.round((totalSubmitted / totalAssignments) * 100) : 0;

      let status: 'complete' | 'partial' | 'none' = 'none';
      if (totalAssignments > 0) {
        if (totalSubmitted >= totalAssignments) {
          status = 'complete';
        } else if (totalSubmitted > 0) {
          status = 'partial';
        } else {
          status = 'none';
        }
      } else {
        status = 'complete';
      }

      return {
        enrollmentId: env.id,
        studentId: env.studentId,
        nim: studentNim,
        name: studentName,
        avatarUrl: studentAvatar,
        courseId: courseUuid,
        courseCode,
        courseName,
        className: env.className,
        roomName: env.roomName || '-',
        totalAssignments,
        totalSubmitted,
        totalGraded,
        unsubmitted,
        ungraded,
        averageGrade,
        completionRate,
        status,
      };
    });
  }, [mockEnrollments, mockStudents, students, courses, assignments, submissions]);

  // Filtered Student Task Reports
  const filteredStudentTaskReports = useMemo(() => {
    return studentTaskReports.filter((item) => {
      const q = reportSearch.trim().toLowerCase();
      const matchSearch = !q || item.name.toLowerCase().includes(q) || item.nim.toLowerCase().includes(q);
      const matchCourse = reportCourseFilter === 'all' || 
        String(item.courseCode).trim().toLowerCase() === String(reportCourseFilter).trim().toLowerCase() ||
        String(item.courseId).trim() === String(reportCourseFilter).trim();
      const matchClass = reportClassFilter === 'all' || 
        String(item.className).trim().toLowerCase() === String(reportClassFilter).trim().toLowerCase();
      const matchStatus = reportStatusFilter === 'all' || item.status === reportStatusFilter;

      return matchSearch && matchCourse && matchClass && matchStatus;
    });
  }, [studentTaskReports, reportSearch, reportCourseFilter, reportClassFilter, reportStatusFilter]);

  // Overall report summary metrics
  const reportMetrics = useMemo(() => {
    const totalRecords = filteredStudentTaskReports.length;
    const totalExpected = filteredStudentTaskReports.reduce((acc, r) => acc + r.totalAssignments, 0);
    const totalSubmitted = filteredStudentTaskReports.reduce((acc, r) => acc + r.totalSubmitted, 0);
    const totalGraded = filteredStudentTaskReports.reduce((acc, r) => acc + r.totalGraded, 0);
    
    const gradedWithScore = filteredStudentTaskReports.filter(r => r.averageGrade !== null);
    const avgOverallScore = gradedWithScore.length > 0
      ? Math.round((gradedWithScore.reduce((acc, r) => acc + (r.averageGrade || 0), 0) / gradedWithScore.length) * 10) / 10
      : null;

    const overallCompletionRate = totalExpected > 0 ? Math.round((totalSubmitted / totalExpected) * 100) : 0;
    const overallGradedRate = totalSubmitted > 0 ? Math.round((totalGraded / totalSubmitted) * 100) : 0;

    return {
      totalRecords,
      totalExpected,
      totalSubmitted,
      totalGraded,
      avgOverallScore,
      overallCompletionRate,
      overallGradedRate,
    };
  }, [filteredStudentTaskReports]);

  // Export report to Excel
  const handleExportReportExcel = () => {
    if (filteredStudentTaskReports.length === 0) {
      alert('Tidak ada data laporan untuk diexport.');
      return;
    }

    const exportRows = filteredStudentTaskReports.map((item, idx) => ({
      'No': idx + 1,
      'NIM': item.nim,
      'Nama Mahasiswa': item.name,
      'Mata Kuliah': item.courseName,
      'Kode MK': item.courseCode,
      'Kelas': item.className,
      'Ruangan': item.roomName,
      'Total Target Tugas': item.totalAssignments,
      'Tugas Dikumpulkan': item.totalSubmitted,
      'Tugas Dinilai': item.totalGraded,
      'Tugas Belum Kumpul': item.unsubmitted,
      'Belum Dinilai': item.ungraded,
      'Rata-rata Nilai': item.averageGrade !== null ? item.averageGrade : 'Belum Dinilai',
      'Progres Pengumpulan (%)': `${item.completionRate}%`,
      'Status': item.status === 'complete' ? 'Lengkap' : item.status === 'partial' ? 'Sebagian' : 'Belum Kumpul',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Tugas Mahasiswa');
    XLSX.writeFile(workbook, `Rekap_Tugas_Mahasiswa_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Handle assignment modal submission
  const handleAssignmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formTitle.trim()) {
      alert('Judul tugas wajib diisi.');
      return;
    }
    if (!formDescription.trim()) {
      alert('Deskripsi tugas wajib diisi.');
      return;
    }
    if (!formDeadline) {
      alert('Deadline tidak valid.');
      return;
    }
    
    const deadlineDate = new Date(formDeadline);
    if (isNaN(deadlineDate.getTime())) {
      alert('Deadline tidak valid.');
      return;
    }
    
    if (deadlineDate.getTime() < Date.now()) {
      alert('Deadline harus berada di waktu yang akan datang.');
      return;
    }
    
    const normalizedMaxPoints = Number(formPoints);
    if (isNaN(normalizedMaxPoints) || normalizedMaxPoints <= 0) {
      alert('Poin maksimal harus lebih dari 0.');
      return;
    }

    const deadlineIso = deadlineDate.toISOString();
    const payload = {
      course_id: formCourse,
      class_name: formTargetClass === 'all' ? null : formTargetClass,
      title: formTitle.trim(),
      description: formDescription.trim(),
      deadline: deadlineIso,
      max_points: normalizedMaxPoints,
      status: formStatus,
    };

    try {
      if (editingAssignment) {
        const { data, error } = await supabase
          .from('assignments')
          .update(payload)
          .eq('id', editingAssignment.id)
          .select('id');

        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('Gagal memperbarui tugas.');
        }
      } else {
        const { data, error } = await supabase
          .from('assignments')
          .insert(payload)
          .select('id');

        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('Gagal menyimpan tugas.');
        }
      }
      setIsModalOpen(false);
      await loadAssignments();
    } catch (err: any) {
      console.error('Error saving assignment:', err);
      alert('Gagal menyimpan tugas: ' + (err.message || 'Error tidak diketahui'));
    }
  };

  const convertToDatetimeLocal = (isoString: string): string => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return '';
      const tzoffset = date.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(date.getTime() - tzoffset)).toISOString().slice(0, -1);
      return localISOTime.substring(0, 16);
    } catch (err) {
      console.error('Error converting date:', err);
      return '';
    }
  };

  const openCreateModal = () => {
    setEditingAssignment(null);
    setFormTitle('');
    const defaultCourseId = courses.length > 0 ? courses[0].id : '';
    setFormCourse(defaultCourseId);
    setFormDescription('');
    
    const defaultDeadline = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    defaultDeadline.setHours(23, 59, 0, 0);
    const tzoffset = defaultDeadline.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(defaultDeadline.getTime() - tzoffset)).toISOString().slice(0, -1);
    const datetimeLocal = localISOTime.substring(0, 16);
    setFormDeadline(datetimeLocal);
    
    setFormPoints(100);
    setFormStatus('draft');
    setFormTargetClass('all');
    setIsModalOpen(true);
  };

  const openEditModal = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setFormTitle(assignment.title);
    setFormCourse(assignment.course_id);
    setFormDescription(assignment.description);
    
    const datetimeLocal = convertToDatetimeLocal(assignment.deadline);
    setFormDeadline(datetimeLocal);
    
    setFormPoints(assignment.max_points);
    setFormStatus(assignment.status);
    setFormTargetClass(assignment.class_name || 'all');
    setIsModalOpen(true);
  };

  const handleDeleteAssignmentClick = (asg: any) => {
    setSelectedAssignmentToDelete(asg);
    setAssignmentDeleteError(null);
  };

  const handleConfirmDeleteAssignment = async () => {
    if (!selectedAssignmentToDelete) return;
    setIsAssignmentDeleting(true);
    setAssignmentDeleteError(null);
    try {
      const { data, error } = await supabase
        .from('assignments')
        .delete()
        .eq('id', selectedAssignmentToDelete.id)
        .select('id');

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        throw new Error('Gagal menghapus tugas.');
      }

      setSelectedAssignmentToDelete(null);
      await loadAssignments();
    } catch (err: any) {
      console.error('Error deleting assignment:', err);
      setAssignmentDeleteError(err.message || 'Gagal menghapus tugas.');
    } finally {
      setIsAssignmentDeleting(false);
    }
  };

  // Grade student submission
  const handleGradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubmission) return;

    try {
      const { error: gradeError } = await supabase
        .from('submissions')
        .update({
          grade: Number(gradeValue),
          feedback: feedbackValue,
          graded_at: new Date().toISOString()
        })
        .eq('id', selectedSubmission.id);

      if (gradeError) throw gradeError;

      setIsGradingOpen(false);
      setSelectedSubmission(null);
      await loadData();
    } catch (err: any) {
      alert('Gagal mengirim penilaian: ' + err.message);
    }
  };

  // Course Meetings and Materials functions
  const loadMeetings = async (courseId: string) => {
    if (!courseId) return;
    setIsMeetingsLoading(true);
    setMeetingsError(null);
    try {
      const { data, error } = await supabase
        .from('course_meetings')
        .select('*')
        .eq('course_id', courseId)
        .order('meeting_number', { ascending: true });

      if (error) throw error;
      setCourseMeetings(data || []);
    } catch (err: any) {
      console.error('Error fetching course meetings:', err);
      setMeetingsError('Gagal memuat materi perkuliahan.');
    } finally {
      setIsMeetingsLoading(false);
    }
  };

  const loadMaterials = async (meetingId: string) => {
    if (!meetingId) return;
    setIsMaterialsLoading(true);
    setMaterialsError(null);
    try {
      const { data, error } = await supabase
        .from('course_materials')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMeetingMaterials(data || []);
    } catch (err: any) {
      console.error('Error fetching course materials:', err);
      setMaterialsError('Gagal memuat materi perkuliahan.');
    } finally {
      setIsMaterialsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedMaterialCourseId) {
      loadMeetings(selectedMaterialCourseId);
      setSelectedMeetingForMaterials(null);
    } else {
      setCourseMeetings([]);
      setSelectedMeetingForMaterials(null);
    }
  }, [selectedMaterialCourseId]);

  useEffect(() => {
    if (selectedMeetingForMaterials) {
      loadMaterials(selectedMeetingForMaterials.id);
    } else {
      setMeetingMaterials([]);
    }
  }, [selectedMeetingForMaterials]);

  useEffect(() => {
    if (activeTab === 'materials' && courses.length > 0 && !selectedMaterialCourseId) {
      setSelectedMaterialCourseId(courses[0].id);
    }
  }, [activeTab, courses, selectedMaterialCourseId]);

  const handleMeetingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterialCourseId) return;
    if (!meetingFormTitle.trim()) {
      setMeetingFormError('Judul pertemuan wajib diisi.');
      return;
    }
    setMeetingFormError(null);
    setIsMeetingSubmitting(true);

    try {
      const trimmedTitle = meetingFormTitle.trim();
      const trimmedDescription = meetingFormDescription.trim();

      if (editingMeeting) {
        // Edit meeting
        const { error } = await supabase
          .from('course_meetings')
          .update({
            title: trimmedTitle,
            description: trimmedDescription || null,
            is_published: meetingFormPublished,
          })
          .eq('id', editingMeeting.id);

        if (error) throw error;

        // Update active selection detail if it was edited
        if (selectedMeetingForMaterials && selectedMeetingForMaterials.id === editingMeeting.id) {
          setSelectedMeetingForMaterials({
            ...selectedMeetingForMaterials,
            title: trimmedTitle,
            description: trimmedDescription || null,
            is_published: meetingFormPublished,
          });
        }
      } else {
        // Create meeting
        const { error } = await supabase
          .from('course_meetings')
          .insert({
            course_id: selectedMaterialCourseId,
            meeting_number: meetingFormNumber,
            title: trimmedTitle,
            description: trimmedDescription || null,
            is_published: meetingFormPublished,
          });

        if (error) throw error;
      }

      setIsMeetingModalOpen(false);
      setMeetingFormTitle('');
      setMeetingFormDescription('');
      setMeetingFormPublished(false);
      setEditingMeeting(null);
      await loadMeetings(selectedMaterialCourseId);
    } catch (err: any) {
      console.error('Error submitting meeting:', err);
      setMeetingFormError('Gagal menyimpan pertemuan.');
    } finally {
      setIsMeetingSubmitting(false);
    }
  };

  const handleMaterialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMeetingForMaterials) return;
    
    const trimmedTitle = materialFormTitle.trim();
    if (!trimmedTitle) {
      setMaterialFormError('Judul materi wajib diisi.');
      return;
    }

    setMaterialFormError(null);
    setIsMaterialSubmitting(true);

    try {
      if (materialFormType === 'link') {
        const urlTrimmed = materialFormUrl.trim();
        if (!urlTrimmed) {
          setMaterialFormError('URL materi wajib diisi.');
          setIsMaterialSubmitting(false);
          return;
        }

        // Validate URL starting with http/https
        try {
          const parsedUrl = new URL(urlTrimmed);
          if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new Error();
          }
        } catch {
          setMaterialFormError('URL materi tidak valid (harus diawali http:// atau https://).');
          setIsMaterialSubmitting(false);
          return;
        }

        const { error } = await supabase
          .from('course_materials')
          .insert({
            meeting_id: selectedMeetingForMaterials.id,
            title: trimmedTitle,
            material_type: 'link',
            file_path: null,
            external_url: urlTrimmed,
          });

        if (error) throw error;

      } else {
        // file upload
        if (!materialFormFile) {
          setMaterialFormError('File materi wajib diunggah.');
          setIsMaterialSubmitting(false);
          return;
        }

        // Check file size (50MB)
        if (materialFormFile.size > 50 * 1024 * 1024) {
          setMaterialFormError('Ukuran file maksimal 50 MB.');
          setIsMaterialSubmitting(false);
          return;
        }

        // Get extension
        const ext = materialFormFile.name.split('.').pop()?.toLowerCase() || '';

        // Executables block list
        const blockList = ['exe', 'msi', 'bat', 'cmd', 'sh', 'apk'];
        if (blockList.includes(ext)) {
          setMaterialFormError('Format file tidak didukung.');
          setIsMaterialSubmitting(false);
          return;
        }

        // Safe filename: remove path traversal, replace / and \
        const safeFileName = materialFormFile.name.replace(/[\/\\]/g, '_');
        const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}-${safeFileName}`;
        const storagePath = `${selectedMaterialCourseId}/${selectedMeetingForMaterials.id}/${uniqueFileName}`;

        // Ensure private bucket exists: course-materials
        try {
          await supabase.storage.createBucket('course-materials', { public: false });
        } catch (bucketErr) {
          console.log('Bucket check/creation non-fatal:', bucketErr);
        }

        // Upload to private bucket: course-materials
        const { error: uploadError } = await supabase.storage
          .from('course-materials')
          .upload(storagePath, materialFormFile);

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          const detailedMsg = uploadError.message || JSON.stringify(uploadError);
          setMaterialFormError(`Gagal mengunggah file materi: ${detailedMsg}. Pastikan bucket dan policy 'course-materials' sudah dikonfigurasi di Supabase.`);
          setIsMaterialSubmitting(false);
          return;
        }

        // Insert database row
        const { error: dbError } = await supabase
          .from('course_materials')
          .insert({
            meeting_id: selectedMeetingForMaterials.id,
            title: trimmedTitle,
            material_type: 'file',
            file_path: storagePath,
            external_url: null,
          });

        if (dbError) {
          console.error('Database insert error, rolling back storage upload:', dbError);
          // Rollback storage upload (best-effort)
          try {
            await supabase.storage
              .from('course-materials')
              .remove([storagePath]);
          } catch (cleanupErr) {
            console.error('Failed to cleanup orphan file in rollback:', cleanupErr);
          }
          setMaterialFormError('Gagal menyimpan data materi.');
          setIsMaterialSubmitting(false);
          return;
        }
      }

      // Success
      setIsAddMaterialOpen(false);
      setMaterialFormTitle('');
      setMaterialFormUrl('');
      setMaterialFormFile(null);
      await loadMaterials(selectedMeetingForMaterials.id);
      if (selectedMaterialCourseId) {
        await loadMeetings(selectedMaterialCourseId);
      }
    } catch (err: any) {
      console.error('Error submitting material:', err);
      setMaterialFormError(err.message || 'Gagal menyimpan data materi.');
    } finally {
      setIsMaterialSubmitting(false);
    }
  };

  const handleConfirmDeleteMaterial = async () => {
    if (!selectedMaterialToDelete) return;
    setIsMaterialDeleting(true);
    setMaterialDeleteError(null);

    try {
      const material = selectedMaterialToDelete;

      if (material.material_type === 'file' && material.file_path) {
        // Delete from Storage first
        const { error: storageError } = await supabase.storage
          .from('course-materials')
          .remove([material.file_path]);

        if (storageError) {
          console.error('Error deleting from storage:', storageError);
          setMaterialDeleteError('Gagal menghapus file materi.');
          setIsMaterialDeleting(false);
          return;
        }
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('course_materials')
        .delete()
        .eq('id', material.id);

      if (dbError) {
        if (material.material_type === 'file') {
          setMaterialDeleteError('File berhasil dihapus tetapi data materi gagal dihapus.');
        } else {
          setMaterialDeleteError('Gagal menghapus materi.');
        }
        setIsMaterialDeleting(false);
        return;
      }

      setSelectedMaterialToDelete(null);
      if (selectedMeetingForMaterials) {
        await loadMaterials(selectedMeetingForMaterials.id);
      }
      if (selectedMaterialCourseId) {
        await loadMeetings(selectedMaterialCourseId);
      }
    } catch (err: any) {
      console.error('Error deleting material:', err);
      setMaterialDeleteError('Gagal menghapus materi.');
    } finally {
      setIsMaterialDeleting(false);
    }
  };

  const handleDownloadMaterialFile = async (filePath: string, title: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('course-materials')
        .download(filePath);

      if (error) throw error;
      if (!data) throw new Error('Data file kosong');

      const blobUrl = window.URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = blobUrl;
      const baseName = filePath.split('/').pop() || 'materi';
      const cleanName = baseName.replace(/^\d+-[a-z0-9]+-/, '');
      link.download = cleanName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      console.error('Download material file error:', err);
      alert('Gagal mengunduh materi.');
    }
  };

  const handleDownloadStudentSubmission = async (filePath: string, studentName?: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('assignment-submissions')
        .download(filePath);

      if (error) {
        console.error('Download student submission error:', error);
        alert('Gagal mengunduh berkas: ' + (error.message || 'File tidak ditemukan di storage'));
        return;
      }

      if (!data) throw new Error('Data file kosong');

      const blobUrl = window.URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = blobUrl;
      const baseName = filePath.split('/').pop() || 'submission.pdf';
      const cleanName = baseName.replace(/^\d+-/, '');
      link.download = `${studentName ? studentName.replace(/\s+/g, '_') + '_' : ''}${cleanName}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      console.error('Download student submission error:', err);
      alert('Gagal mengunduh berkas tugas mahasiswa.');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="mt-4 text-xs font-semibold text-primary">Memuat dashboard dosen...</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-50/50 min-h-screen text-slate-800 font-sans antialiased">
      {/* TopNavBar */}
      <header className={`fixed top-0 right-0 h-16 bg-white border-b border-[#E9EEF5] z-30 px-4 md:px-8 flex items-center justify-between select-none transition-all duration-300 ease-in-out ${
        isSidebarCollapsed ? 'md:left-[72px] left-0' : 'md:left-[280px] left-0'
      }`}>
        <div className="flex items-center gap-3 md:gap-4">
          {/* Mobile Hamburger Menu Button */}
          <button 
            onClick={() => setIsMobileSidebarOpen(true)}
            className="md:hidden p-2 hover:bg-slate-50 rounded-xl text-slate-600 hover:text-slate-900 transition-colors cursor-pointer flex items-center justify-center min-w-[44px] min-h-[44px]"
            aria-label="Buka menu"
            aria-expanded={isMobileSidebarOpen}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Mobile Brand Title */}
          <div className="flex md:hidden items-center gap-2">
            <span className="w-8 h-8 bg-[#14B8A6] rounded-lg flex items-center justify-center text-white shadow-sm shadow-[#14B8A6]/20">
              <GraduationCap className="w-4.5 h-4.5" />
            </span>
            <span className="font-bold text-slate-900 text-base">SiTugas</span>
          </div>

          {/* Desktop Breadcrumb / Section Context */}
          <div className="hidden md:flex items-center gap-2 text-xs font-medium text-[#64748B]">
            <span className="hover:text-slate-900 cursor-default">Portal Dosen</span>
            <span className="text-slate-300">/</span>
            <span className="text-[#0F172A] font-semibold">{currentTabTitle}</span>
          </div>
        </div>

        {/* User Profile & Logout */}
        <div className="flex items-center gap-3 md:gap-4">
          <button className="p-2 hover:bg-slate-50 rounded-full text-slate-500 hover:text-slate-700 transition-colors relative cursor-pointer" title="Notifikasi">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white"></span>
          </button>
          
          <div className="flex items-center gap-3 border-l border-[#E9EEF5] pl-3 md:pl-4">
            <div className="w-9 h-9 rounded-full overflow-hidden border border-slate-200 select-none flex items-center justify-center bg-teal-50 text-teal-700 font-bold text-xs">
              {user.avatarUrl ? (
                <img 
                  className="w-full h-full object-cover" 
                  src={user.avatarUrl} 
                  alt="Lecturer profile"
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
              <p className="text-xs font-semibold text-slate-900 leading-none">{user.name}</p>
              <p className="text-[10px] text-slate-400 font-medium mt-1">Dosen Pengampu</p>
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

      {/* SideNavBar (Desktop Permanent Modern Academic SaaS Sidebar) */}
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
                <h1 className="text-sm font-bold text-[#0F172A] leading-none tracking-tight">SiTugas Dosen</h1>
                <p className="text-[9px] font-semibold text-[#64748B] tracking-wider uppercase mt-1">SISTEM MANAJEMEN TUGAS</p>
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
                  activeTab === 'overview' 
                    ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                    : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                }`}
                onClick={() => setActiveTab('overview')}
              >
                {activeTab === 'overview' && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                )}
                <LayoutDashboard className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${
                  activeTab === 'overview' ? 'text-[#14B8A6]' : 'text-[#64748B] group-hover:text-[#14B8A6]'
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
                  activeTab === 'materials' 
                    ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                    : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                }`}
                onClick={() => {
                  setActiveTab('materials');
                  setSelectedMeetingForMaterials(null);
                }}
              >
                {activeTab === 'materials' && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                )}
                <FileSpreadsheet className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${
                  activeTab === 'materials' ? 'text-[#14B8A6]' : 'text-[#64748B] group-hover:text-[#14B8A6]'
                }`} />
                {!isSidebarCollapsed && <span className="text-sm truncate leading-none">Materi Perkuliahan</span>}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-3.5 px-2.5 py-1.5 bg-[#0F172A] text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                    Materi Perkuliahan
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
                  activeTab === 'master_students' 
                    ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                    : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                }`}
                onClick={() => setActiveTab('master_students')}
              >
                {activeTab === 'master_students' && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                )}
                <GraduationCap className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${
                  activeTab === 'master_students' ? 'text-[#14B8A6]' : 'text-[#64748B] group-hover:text-[#14B8A6]'
                }`} />
                {!isSidebarCollapsed && <span className="text-sm truncate leading-none">Data Mahasiswa</span>}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-3.5 px-2.5 py-1.5 bg-[#0F172A] text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                    Data Mahasiswa
                    <span className="absolute top-1/2 -left-1 -translate-y-1/2 border-4 border-transparent border-r-[#0F172A]" />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* SECTION: TUGAS */}
          <div>
            {!isSidebarCollapsed ? (
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
                TUGAS
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
                  activeTab === 'assignments' 
                    ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                    : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                }`}
                onClick={() => setActiveTab('assignments')}
              >
                {activeTab === 'assignments' && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                )}
                <CheckSquare className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${
                  activeTab === 'assignments' ? 'text-[#14B8A6]' : 'text-[#64748B] group-hover:text-[#14B8A6]'
                }`} />
                {!isSidebarCollapsed && <span className="text-sm truncate leading-none">Tugas</span>}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-3.5 px-2.5 py-1.5 bg-[#0F172A] text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                    Tugas
                    <span className="absolute top-1/2 -left-1 -translate-y-1/2 border-4 border-transparent border-r-[#0F172A]" />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* SECTION: LAPORAN */}
          <div>
            {!isSidebarCollapsed ? (
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
                LAPORAN
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
                  activeTab === 'reports' 
                    ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                    : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                }`}
                onClick={() => setActiveTab('reports')}
              >
                {activeTab === 'reports' && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                )}
                <BarChart3 className={`w-[18px] h-[18px] shrink-0 transition-colors duration-150 ${
                  activeTab === 'reports' ? 'text-[#14B8A6]' : 'text-[#64748B] group-hover:text-[#14B8A6]'
                }`} />
                {!isSidebarCollapsed && <span className="text-sm truncate leading-none">Statistik & Laporan</span>}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-3.5 px-2.5 py-1.5 bg-[#0F172A] text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                    Statistik & Laporan
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
                className={`group relative w-full h-[42px] flex items-center rounded-[10px] transition-all duration-150 cursor-pointer text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium ${
                  isSidebarCollapsed ? 'justify-center px-0' : 'px-3.5 gap-3'
                }`}
                onClick={() => setIsSettingsModalOpen(true)}
              >
                <Settings className="w-[18px] h-[18px] shrink-0 text-[#64748B] group-hover:text-[#14B8A6] transition-colors duration-150" />
                {!isSidebarCollapsed && <span className="text-sm truncate leading-none">Pengaturan</span>}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-3.5 px-2.5 py-1.5 bg-[#0F172A] text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                    Pengaturan
                    <span className="absolute top-1/2 -left-1 -translate-y-1/2 border-4 border-transparent border-r-[#0F172A]" />
                  </div>
                )}
              </button>

              <button 
                type="button"
                className={`group relative w-full h-[42px] flex items-center rounded-[10px] transition-all duration-150 cursor-pointer text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium ${
                  isSidebarCollapsed ? 'justify-center px-0' : 'px-3.5 gap-3'
                }`}
                onClick={() => setIsHelpModalOpen(true)}
              >
                <HelpCircle className="w-[18px] h-[18px] shrink-0 text-[#64748B] group-hover:text-[#14B8A6] transition-colors duration-150" />
                {!isSidebarCollapsed && <span className="text-sm truncate leading-none">Bantuan</span>}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-3.5 px-2.5 py-1.5 bg-[#0F172A] text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                    Bantuan
                    <span className="absolute top-1/2 -left-1 -translate-y-1/2 border-4 border-transparent border-r-[#0F172A]" />
                  </div>
                )}
              </button>
            </div>
          </div>
        </nav>
      </aside>

      {/* Mobile Sidebar Drawer Navigation Overlay */}
      <div className={`fixed inset-0 z-50 md:hidden transition-all duration-300 ${
        isMobileSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}>
        {/* Backdrop transparent subtle dark overlay */}
        <div 
          className={`absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-300 ${
            isMobileSidebarOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setIsMobileSidebarOpen(false)}
        />
        
        {/* Slide-in Navigation Drawer */}
        <aside className={`absolute top-0 bottom-0 left-0 w-[280px] max-w-[85vw] bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-out select-none ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          {/* Drawer Header branding & close button */}
          <div className="h-16 px-5 border-b border-[#E9EEF5] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#14B8A6] flex items-center justify-center text-white shadow-sm shadow-[#14B8A6]/20">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#0F172A] leading-none tracking-tight">SiTugas Dosen</h2>
                <p className="text-[9px] font-semibold text-[#64748B] tracking-wider uppercase mt-1">SISTEM MANAJEMEN TUGAS</p>
              </div>
            </div>

            {/* Close Button */}
            <button 
              onClick={() => setIsMobileSidebarOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              aria-label="Tutup menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-thin">
            {/* UTAMA */}
            <div>
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
                UTAMA
              </div>
              <div className="space-y-1">
                <button 
                  type="button"
                  className={`relative w-full h-[42px] flex items-center px-3.5 gap-3 rounded-[10px] transition-all duration-150 cursor-pointer ${
                    activeTab === 'overview' 
                      ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                      : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                  }`}
                  onClick={() => {
                    setActiveTab('overview');
                    setIsMobileSidebarOpen(false);
                  }}
                >
                  {activeTab === 'overview' && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                  )}
                  <LayoutDashboard className={`w-[18px] h-[18px] shrink-0 ${activeTab === 'overview' ? 'text-[#14B8A6]' : 'text-[#64748B]'}`} />
                  <span className="text-sm truncate leading-none">Dashboard</span>
                </button>
              </div>
            </div>

            {/* PERKULIAHAN */}
            <div>
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
                PERKULIAHAN
              </div>
              <div className="space-y-1">
                <button 
                  type="button"
                  className={`relative w-full h-[42px] flex items-center px-3.5 gap-3 rounded-[10px] transition-all duration-150 cursor-pointer ${
                    activeTab === 'courses' 
                      ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                      : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                  }`}
                  onClick={() => {
                    setActiveTab('courses');
                    setIsMobileSidebarOpen(false);
                  }}
                >
                  {activeTab === 'courses' && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                  )}
                  <BookOpen className={`w-[18px] h-[18px] shrink-0 ${activeTab === 'courses' ? 'text-[#14B8A6]' : 'text-[#64748B]'}`} />
                  <span className="text-sm truncate leading-none">Mata Kuliah</span>
                </button>

                <button 
                  type="button"
                  className={`relative w-full h-[42px] flex items-center px-3.5 gap-3 rounded-[10px] transition-all duration-150 cursor-pointer ${
                    activeTab === 'materials' 
                      ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                      : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                  }`}
                  onClick={() => {
                    setActiveTab('materials');
                    setSelectedMeetingForMaterials(null);
                    setIsMobileSidebarOpen(false);
                  }}
                >
                  {activeTab === 'materials' && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                  )}
                  <FileSpreadsheet className={`w-[18px] h-[18px] shrink-0 ${activeTab === 'materials' ? 'text-[#14B8A6]' : 'text-[#64748B]'}`} />
                  <span className="text-sm truncate leading-none">Materi Perkuliahan</span>
                </button>

                <button 
                  type="button"
                  className={`relative w-full h-[42px] flex items-center px-3.5 gap-3 rounded-[10px] transition-all duration-150 cursor-pointer ${
                    activeTab === 'students' 
                      ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                      : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                  }`}
                  onClick={() => {
                    setActiveTab('students');
                    setIsMobileSidebarOpen(false);
                  }}
                >
                  {activeTab === 'students' && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                  )}
                  <Users className={`w-[18px] h-[18px] shrink-0 ${activeTab === 'students' ? 'text-[#14B8A6]' : 'text-[#64748B]'}`} />
                  <span className="text-sm truncate leading-none">Mahasiswa</span>
                </button>

                <button 
                  type="button"
                  className={`relative w-full h-[42px] flex items-center px-3.5 gap-3 rounded-[10px] transition-all duration-150 cursor-pointer ${
                    activeTab === 'master_students' 
                      ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                      : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                  }`}
                  onClick={() => {
                    setActiveTab('master_students');
                    setIsMobileSidebarOpen(false);
                  }}
                >
                  {activeTab === 'master_students' && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                  )}
                  <GraduationCap className={`w-[18px] h-[18px] shrink-0 ${activeTab === 'master_students' ? 'text-[#14B8A6]' : 'text-[#64748B]'}`} />
                  <span className="text-sm truncate leading-none">Data Mahasiswa</span>
                </button>
              </div>
            </div>

            {/* TUGAS */}
            <div>
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
                TUGAS
              </div>
              <div className="space-y-1">
                <button 
                  type="button"
                  className={`relative w-full h-[42px] flex items-center px-3.5 gap-3 rounded-[10px] transition-all duration-150 cursor-pointer ${
                    activeTab === 'assignments' 
                      ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                      : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                  }`}
                  onClick={() => {
                    setActiveTab('assignments');
                    setIsMobileSidebarOpen(false);
                  }}
                >
                  {activeTab === 'assignments' && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                  )}
                  <CheckSquare className={`w-[18px] h-[18px] shrink-0 ${activeTab === 'assignments' ? 'text-[#14B8A6]' : 'text-[#64748B]'}`} />
                  <span className="text-sm truncate leading-none">Tugas</span>
                </button>
              </div>
            </div>

            {/* LAPORAN */}
            <div>
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
                LAPORAN
              </div>
              <div className="space-y-1">
                <button 
                  type="button"
                  className={`relative w-full h-[42px] flex items-center px-3.5 gap-3 rounded-[10px] transition-all duration-150 cursor-pointer ${
                    activeTab === 'reports' 
                      ? 'bg-[#EAFBF8] text-[#0F172A] font-semibold' 
                      : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium'
                  }`}
                  onClick={() => {
                    setActiveTab('reports');
                    setIsMobileSidebarOpen(false);
                  }}
                >
                  {activeTab === 'reports' && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#14B8A6] rounded-r-full" />
                  )}
                  <BarChart3 className={`w-[18px] h-[18px] shrink-0 ${activeTab === 'reports' ? 'text-[#14B8A6]' : 'text-[#64748B]'}`} />
                  <span className="text-sm truncate leading-none">Statistik & Laporan</span>
                </button>
              </div>
            </div>

            {/* SYSTEM */}
            <div className="pt-2">
              <div className="w-full border-t border-[#E9EEF5] mb-4" />
              <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-[#64748B] uppercase">
                SYSTEM
              </div>
              <div className="space-y-1">
                <button 
                  type="button"
                  className="w-full h-[42px] flex items-center px-3.5 gap-3 rounded-[10px] text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium transition-all duration-150 cursor-pointer"
                  onClick={() => {
                    setIsMobileSidebarOpen(false);
                    setIsSettingsModalOpen(true);
                  }}
                >
                  <Settings className="w-[18px] h-[18px] shrink-0 text-[#64748B]" />
                  <span className="text-sm truncate leading-none">Pengaturan</span>
                </button>

                <button 
                  type="button"
                  className="w-full h-[42px] flex items-center px-3.5 gap-3 rounded-[10px] text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] font-medium transition-all duration-150 cursor-pointer"
                  onClick={() => {
                    setIsMobileSidebarOpen(false);
                    setIsHelpModalOpen(true);
                  }}
                >
                  <HelpCircle className="w-[18px] h-[18px] shrink-0 text-[#64748B]" />
                  <span className="text-sm truncate leading-none">Bantuan</span>
                </button>
              </div>
            </div>
          </nav>
        </aside>
      </div>

      {/* Main Content Area */}
      <main className={`pt-24 pb-8 px-4 md:px-8 md:pt-24 min-h-screen transition-[margin] duration-300 ease-in-out ${
        isSidebarCollapsed ? 'md:ml-[72px]' : 'md:ml-[280px]'
      }`}>
        
        {/* TAB 1: IKHTISAR UTAMA */}
        {activeTab === 'overview' && (
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* Welcome Header */}
            <section className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">Selamat datang kembali,</p>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mt-1">{user.name}</h1>
                <p className="text-xs text-slate-500 mt-1">Kelola tugas dan perkuliahan Anda dengan lebih efisien.</p>
              </div>
              <button 
                onClick={openCreateModal}
                className="bg-slate-950 text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-800 hover:shadow-md hover:shadow-slate-950/10 active:scale-98 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Tambah Tugas Baru
              </button>
            </section>

            {/* Stats Bento Grid */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Card 1: TOTAL MAHASISWA */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex justify-between items-center relative overflow-hidden group border-b-2 border-b-teal-500/20 hover:scale-[1.02] transition-all duration-300">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Mahasiswa</p>
                  <h3 className="text-3xl font-bold text-slate-900 mt-2 tracking-tight">{stats.totalStudents}</h3>
                  <p className="text-[10px] text-slate-400 mt-1.5 font-medium">Siswa Terdaftar Aktif</p>
                </div>
                <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center text-teal-600 transition-transform group-hover:scale-105 duration-200">
                  <Users className="w-6 h-6" />
                </div>
              </div>

              {/* Card 2: TUGAS AKTIF */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex justify-between items-center relative overflow-hidden group border-b-2 border-b-blue-500/20 hover:scale-[1.02] transition-all duration-300">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tugas Aktif</p>
                  <h3 className="text-3xl font-bold text-slate-900 mt-2 tracking-tight">{stats.totalAssignments}</h3>
                  <p className="text-[10px] text-slate-400 mt-1.5 font-medium">Diterbitkan di Platform</p>
                </div>
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 transition-transform group-hover:scale-105 duration-200">
                  <CheckSquare className="w-6 h-6" />
                </div>
              </div>

              {/* Card 3: PENGUMPULAN TUGAS */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex justify-between items-center relative overflow-hidden group border-b-2 border-b-violet-500/20 hover:scale-[1.02] transition-all duration-300">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pengumpulan Tugas</p>
                  <h3 className="text-3xl font-bold text-slate-900 mt-2 tracking-tight">{stats.totalSubmissions}</h3>
                  <p className="text-[10px] text-slate-400 mt-1.5 font-medium">Sudah Kumpul</p>
                </div>
                <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600 transition-transform group-hover:scale-105 duration-200">
                  <Upload className="w-6 h-6" />
                </div>
              </div>

              {/* Card 4: BELUM DINILAI */}
              {(() => {
                const count = stats.totalSubmissions - stats.gradedSubmissions;
                const isUrgent = count > 0;
                return (
                  <div className={`bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex justify-between items-center relative overflow-hidden group border-b-2 hover:scale-[1.02] transition-all duration-300 ${
                    isUrgent ? 'border-b-red-500/20' : 'border-b-emerald-500/20'
                  }`}>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Belum Dinilai</p>
                      <h3 className={`text-3xl font-bold mt-2 tracking-tight ${isUrgent ? 'text-red-500' : 'text-slate-900'}`}>{count}</h3>
                      <p className={`text-[10px] mt-1.5 font-medium ${isUrgent ? 'text-red-500' : 'text-emerald-600'}`}>
                        {isUrgent ? 'Butuh Penilaian Segera' : 'Semua tugas telah dinilai'}
                      </p>
                    </div>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 duration-200 ${
                      isUrgent ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'
                    }`}>
                      {isUrgent ? <AlertTriangle className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
                    </div>
                  </div>
                );
              })()}
            </section>

            {/* Chart and Quick Submissions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Analytics Summary */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs lg:col-span-2 flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Pengumpulan Tugas per Mata Kuliah</h3>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="name" 
                        stroke="#94a3b8" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        dy={8}
                        className="font-mono"
                      />
                      <YAxis 
                        stroke="#94a3b8" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        dx={-8}
                        className="font-mono"
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#ffffff', 
                          border: '1px solid #e2e8f0', 
                          borderRadius: '12px',
                          fontSize: '11px',
                          color: '#0f172a',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)'
                        }} 
                      />
                      <Legend 
                        verticalAlign="top" 
                        height={36} 
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: '11px', fontWeight: 500, color: '#475569' }}
                      />
                      <Bar name="Tugas" dataKey="Tugas" fill="#1e293b" radius={[6, 6, 0, 0]} barSize={24} />
                      <Bar name="Kumpulan" dataKey="Kumpulan" fill="#0f766e" radius={[6, 6, 0, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Submissions Waiting to be Graded */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xs flex flex-col h-full min-h-[360px]">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4">Pengumpulan Terbaru (Perlu Dinilai)</h3>
                
                {(() => {
                  const filteredSubmissions = submissions.filter(sub => sub.grade === null);
                  if (filteredSubmissions.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center text-center py-12 px-4 flex-1">
                        <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mb-3.5">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <h4 className="text-xs font-bold text-slate-800">Semua tugas terkumpul telah dinilai</h4>
                        <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] leading-relaxed">
                          Tidak ada pengumpulan yang menunggu penilaian saat ini.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[280px] pr-1 scrollbar-thin">
                      {filteredSubmissions.map(sub => {
                        const stud = students.find(s => s.uid === sub.userUid);
                        const asg = assignments.find(a => a.id === sub.assignmentId);
                        const course = courses.find(c => c.id === asg?.course_id);
                        
                        return (
                          <div key={sub.id} className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl flex justify-between items-center transition-colors border border-slate-100">
                            <div className="min-w-0 flex-1 pr-2">
                              <h4 className="text-xs font-bold text-slate-900 truncate">
                                {stud ? stud.name : 'Mahasiswa'}
                              </h4>
                              <p className="text-[10px] text-slate-500 font-semibold truncate mt-0.5">
                                {asg ? asg.title : 'Tugas'}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                {course && (
                                  <span className="text-[8px] bg-teal-50 text-teal-700 font-bold px-1.5 py-0.5 rounded">
                                    {course.code}
                                  </span>
                                )}
                                <span className="text-[8px] text-slate-400 font-medium">
                                  {sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : 'Baru saja'}
                                </span>
                              </div>
                            </div>
                            <button 
                              onClick={() => {
                                setSelectedSubmission(sub);
                                setGradeValue(100);
                                setFeedbackValue('');
                                setIsGradingOpen(true);
                              }}
                              className="shrink-0 px-3 py-1.5 bg-slate-900 text-white hover:bg-slate-800 text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                            >
                              Nilai
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* TAB MATA KULIAH */}
        {activeTab === 'courses' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-primary">Kelola Mata Kuliah</h1>
                <p className="text-xs text-on-surface-variant font-semibold mt-0.5">Kelola seluruh mata kuliah yang Anda ampu secara dinamis.</p>
              </div>
              <button 
                onClick={() => {
                  setEditingCourse(null);
                  setCourseFormCode('');
                  setCourseFormName('');
                  setCourseFormCredits(3);
                  setCourseFormError('');
                  setIsCourseModalOpen(true);
                }}
                className="bg-primary text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:opacity-95 transition-all flex items-center gap-1.5 cursor-pointer auth-card-shadow font-sans"
              >
                <Plus className="w-4 h-4" /> Tambah Mata Kuliah
              </button>
            </div>

            {coursesError && (
              <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs font-semibold border border-red-100 font-sans">
                ⚠️ {coursesError}
              </div>
            )}

            {isCoursesLoading ? (
              <div className="bg-white rounded-2xl border border-outline-variant/30 auth-card-shadow p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="mt-4 text-xs font-semibold text-primary">Memuat data mata kuliah...</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-outline-variant/30 auth-card-shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-55 border-b border-outline-variant/15 text-primary uppercase tracking-wider font-bold font-sans">
                        <th className="p-4 w-32">Kode MK</th>
                        <th className="p-4">Nama Mata Kuliah</th>
                        <th className="p-4 w-24 text-center">SKS</th>
                        <th className="p-4 w-36 text-center">Jumlah Pertemuan</th>
                        <th className="p-4 text-right w-32">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {courses.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-on-surface-variant font-semibold font-sans">
                            Belum ada mata kuliah yang terdaftar. Silakan tambahkan mata kuliah baru.
                          </td>
                        </tr>
                      ) : (
                        courses.map(course => (
                          <tr key={course.id} className="hover:bg-gray-55/50 transition-colors">
                            <td className="p-4 font-mono font-bold text-primary text-sm uppercase">{course.code}</td>
                            <td className="p-4 font-bold text-primary font-sans text-sm">{course.name}</td>
                            <td className="p-4 text-center font-semibold text-primary font-sans text-sm">{course.credits || 3} SKS</td>
                            <td className="p-4 text-center font-semibold text-on-surface-variant font-sans text-sm">{getTotalMeetings(course.credits || 3)} Pertemuan</td>
                            <td className="p-4 text-right space-x-1 whitespace-nowrap">
                              <button 
                                onClick={() => {
                                  setEditingCourse(course);
                                  setCourseFormCode(course.code);
                                  setCourseFormName(course.name);
                                  setCourseFormCredits(course.credits || 3);
                                  setCourseFormError('');
                                  setIsCourseModalOpen(true);
                                }}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-primary transition-colors cursor-pointer inline-flex items-center"
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button 
                                type="button"
                                onClick={() => handleDeleteCourseClick(course)}
                                className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors cursor-pointer inline-flex items-center"
                                title="Hapus"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

                {/* TAB 2: KELOLA TUGAS */}
        {activeTab === 'assignments' && (
          selectedAsgSubmissionsId === null ? (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h1 className="text-xl md:text-2xl font-bold tracking-tight text-primary">Daftar Tugas Perkuliahan</h1>
                  <p className="text-xs text-on-surface-variant font-semibold mt-0.5">Kelola seluruh tugas, tenggat, dan bobot nilai di sini.</p>
                </div>
                <button 
                  onClick={openCreateModal}
                  className="bg-primary text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:opacity-95 transition-all flex items-center gap-1.5 cursor-pointer auth-card-shadow"
                >
                  <Plus className="w-4 h-4" /> Buat Tugas Baru
                </button>
              </div>

              {/* Assignments list table */}
              <div className="bg-white rounded-2xl border border-outline-variant/30 auth-card-shadow overflow-hidden">
                <div className="p-4 border-b border-outline-variant/15 flex gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                    <input 
                      className="pl-9 pr-4 py-2 bg-gray-50 border border-outline-variant/60 rounded-xl text-xs focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all w-full font-medium text-primary"
                      placeholder="Cari tugas berdasarkan judul atau kode..." 
                      type="text"
                      value={assignmentSearch}
                      onChange={(e) => setAssignmentSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-55/70 border-b border-outline-variant/15 text-primary uppercase tracking-wider font-bold">
                        <th className="p-4">Mata Kuliah</th>
                        <th className="p-4">Target Kelas</th>
                        <th className="p-4">Judul Tugas</th>
                        <th className="p-4">Tenggat Pengumpulan</th>
                        <th className="p-4">Poin Maksimal</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {filteredAssignments.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-on-surface-variant font-semibold">Tugas tidak ditemukan.</td>
                        </tr>
                      ) : (
                        filteredAssignments.map(asg => (
                          <tr key={asg.id} className="hover:bg-gray-55/50 transition-colors">
                            <td className="p-4 font-bold text-primary">
                              <p>{asg.course?.name || 'Unknown'}</p>
                              <p className="text-[10px] text-on-surface-variant font-semibold mt-0.5">{asg.course?.code || ''}</p>
                            </td>
                            <td className="p-4 font-bold text-secondary">
                              {asg.class_name === null ? 'Semua Kelas' : asg.class_name}
                            </td>
                            <td className="p-4">
                              <p className="font-bold text-primary">{asg.title}</p>
                              <p className="text-[10px] text-on-surface-variant truncate max-w-xs mt-0.5">{asg.description}</p>
                            </td>
                            <td className="p-4 font-medium">
                              {new Date(asg.deadline).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} {new Date(asg.deadline).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="p-4 font-bold text-secondary">{asg.max_points} Poin</td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase ${
                                asg.status === 'published' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                asg.status === 'closed' ? 'bg-red-50 text-red-700 border border-red-100' :
                                'bg-gray-100 text-gray-600 border border-gray-200'
                              }`}>
                                {asg.status === 'published' ? 'Dipublikasikan' :
                                 asg.status === 'closed' ? 'Ditutup' : 'Draft'}
                              </span>
                            </td>
                            <td className="p-4 text-right space-x-1 whitespace-nowrap">
                              <button 
                                type="button"
                                onClick={() => {
                                  setSelectedAsgSubmissionsId(asg.id);
                                }}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-primary transition-colors cursor-pointer inline-flex items-center"
                                title="Lihat Pengumpulan"
                              >
                                <ClipboardList className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => openEditModal(asg)}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-primary transition-colors cursor-pointer inline-flex items-center"
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteAssignmentClick(asg)}
                                className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors cursor-pointer inline-flex items-center"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* SUBMISSION MANAGEMENT VIEW */
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Back Button */}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAsgSubmissionsId(null);
                    setSubmissionManagementSearch('');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  ← Kembali ke Kelola Tugas
                </button>
              </div>

              {(() => {
                const selectedAssignmentObj = assignments.find(a => a.id === selectedAsgSubmissionsId);
                if (!selectedAssignmentObj) {
                  return (
                    <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 text-xs font-bold font-sans">
                      Tugas tidak ditemukan.
                    </div>
                  );
                }

                if (selectedSubmissionForDetail !== null) {
                  /* SUB-SUB VIEW: SUBMISSION DETAIL */
                  const isSubmitted = selectedSubmissionForDetail.submission !== null;
                  return (
                    <div className="space-y-6 animate-in fade-in duration-200">
                      {/* Back to List Button */}
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSubmissionForDetail(null);
                            setGradingSuccess(false);
                            setGradingError(null);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline cursor-pointer"
                        >
                          ← Kembali ke Daftar Pengumpulan
                        </button>
                      </div>

                      {/* Two Column Layout */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left Column: Submission Content */}
                        <div className="lg:col-span-2 space-y-6">
                          {/* Student & Assignment Card */}
                          <div className="bg-white p-6 rounded-2xl border border-outline-variant/30 auth-card-shadow space-y-4">
                            <div className="border-b border-outline-variant/15 pb-4">
                              <p className="text-[10px] text-secondary font-semibold uppercase tracking-wider">{selectedAssignmentObj.course?.name || 'Mata Kuliah'}</p>
                              <h2 className="text-lg font-bold text-primary mt-1 font-sans">{selectedAssignmentObj.title}</h2>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                              <div>
                                <span className="text-[10px] text-on-surface-variant block font-bold uppercase">Nama Mahasiswa</span>
                                <span className="font-bold text-primary text-sm block mt-0.5">{selectedSubmissionForDetail.name}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-on-surface-variant block font-bold uppercase">NIM</span>
                                <span className="font-bold text-primary text-sm block mt-0.5">{selectedSubmissionForDetail.nim}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-on-surface-variant block font-bold uppercase">Kelas / Ruangan</span>
                                <span className="font-semibold text-secondary block mt-0.5">{selectedSubmissionForDetail.className} / {selectedSubmissionForDetail.roomName}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-on-surface-variant block font-bold uppercase">Waktu Pengumpulan</span>
                                <span className="font-semibold text-primary block mt-0.5">
                                  {selectedSubmissionForDetail.submission ? (
                                    <>
                                      {new Date(selectedSubmissionForDetail.submission.submitted_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}{' '}
                                      {new Date(selectedSubmissionForDetail.submission.submitted_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                    </>
                                  ) : (
                                    '-'
                                  )}
                                </span>
                              </div>
                            </div>

                            {selectedSubmissionForDetail.submission && (
                              <div className="pt-3 border-t border-outline-variant/15 flex items-center gap-2">
                                <span className="text-[10px] text-on-surface-variant font-bold uppercase mr-1">Status Pengumpulan:</span>
                                {(() => {
                                  const subDate = new Date(selectedSubmissionForDetail.submission.submitted_at);
                                  const deadDate = new Date(selectedAssignmentObj.deadline);
                                  const isLate = subDate > deadDate;
                                  return (
                                    <span className={`px-2.5 py-1 text-[9px] font-bold rounded-full uppercase ${
                                      isLate ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                    }`}>
                                      {isLate ? 'Terlambat' : 'Tepat Waktu'}
                                    </span>
                                  );
                                })()}
                              </div>
                            )}
                          </div>

                          {/* Submission Content Card */}
                          <div className="bg-white p-6 rounded-2xl border border-outline-variant/30 auth-card-shadow space-y-5">
                            <h3 className="text-xs font-bold text-primary uppercase tracking-wider border-b border-outline-variant/15 pb-2">Konten Tugas Mahasiswa</h3>
                            
                            {selectedSubmissionForDetail.submission ? (
                              <div className="space-y-4">
                                {/* Link Submission */}
                                {selectedSubmissionForDetail.submission.submitted_link && (
                                  <div className="space-y-1.5">
                                    <span className="text-[10px] text-on-surface-variant block font-bold uppercase">Link Submission</span>
                                    {(() => {
                                      const link = selectedSubmissionForDetail.submission.submitted_link;
                                      const isSecure = link.startsWith('http://') || link.startsWith('https://');
                                      if (isSecure) {
                                        return (
                                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                            <span className="text-xs font-semibold text-primary truncate bg-slate-50 border border-outline-variant/20 p-2.5 rounded-xl flex-1 block">
                                              {link}
                                            </span>
                                            <a
                                              href={link}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="shrink-0 px-4 py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:opacity-95 transition-all inline-flex items-center gap-1 cursor-pointer justify-center"
                                            >
                                              Buka Link
                                            </a>
                                          </div>
                                        );
                                      } else {
                                        return (
                                          <span className="text-xs font-semibold text-primary truncate bg-slate-50 border border-outline-variant/20 p-2.5 rounded-xl block">
                                            {link} <span className="text-[10px] text-amber-600 ml-2 font-bold">(Insecure Protocol - Tidak Dapat Diklik)</span>
                                          </span>
                                        );
                                      }
                                    })()}
                                  </div>
                                )}

                                {/* Catatan Mahasiswa */}
                                {selectedSubmissionForDetail.submission.submitted_note && (
                                  <div className="space-y-1.5">
                                    <span className="text-[10px] text-on-surface-variant block font-bold uppercase">Catatan Mahasiswa</span>
                                    <div className="bg-slate-50 border border-outline-variant/20 p-4 rounded-xl text-xs font-medium text-primary whitespace-pre-wrap leading-relaxed">
                                      {selectedSubmissionForDetail.submission.submitted_note}
                                    </div>
                                  </div>
                                )}

                                {/* File Submission */}
                                {selectedSubmissionForDetail.submission.file_path && (
                                  <div className="space-y-1.5">
                                    <span className="text-[10px] text-on-surface-variant block font-bold uppercase">Berkas Tugas Mahasiswa</span>
                                    <div className="bg-slate-50 border border-outline-variant/20 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-500 shrink-0">
                                          <FileText className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0">
                                          <p className="text-xs font-bold text-primary truncate">
                                            {selectedSubmissionForDetail.submission.file_path.split('/').pop()?.replace(/^\d+-/, '') || selectedSubmissionForDetail.submission.file_path}
                                          </p>
                                          <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                                            Tersimpan di Cloud Storage
                                          </p>
                                        </div>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleDownloadStudentSubmission(selectedSubmissionForDetail.submission.file_path, selectedSubmissionForDetail.name)}
                                        className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:opacity-95 transition-all inline-flex items-center gap-1.5 cursor-pointer shrink-0 justify-center shadow-2xs"
                                      >
                                        <Download className="w-3.5 h-3.5" /> Unduh Berkas
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {!selectedSubmissionForDetail.submission.submitted_link && 
                                 !selectedSubmissionForDetail.submission.submitted_note && 
                                 !selectedSubmissionForDetail.submission.file_path && (
                                  <p className="text-xs text-on-surface-variant font-medium py-4 text-center border border-dashed rounded-xl">Mahasiswa mengumpulkan tugas kosong.</p>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-on-surface-variant font-medium py-8 text-center border border-dashed rounded-xl">Belum ada file atau tautan yang dikumpulkan.</p>
                            )}
                          </div>
                        </div>

                        {/* Right Column: Grading Form */}
                        <div className="space-y-6">
                          <div className="bg-white p-6 rounded-2xl border border-outline-variant/30 auth-card-shadow flex flex-col space-y-4">
                            <h3 className="text-xs font-bold text-primary uppercase tracking-wider border-b border-outline-variant/15 pb-2">Penilaian Dosen</h3>

                            {/* Status Nilai Sebelumnya */}
                            <div className="bg-slate-50 p-3 rounded-xl border border-outline-variant/10 text-xs font-sans font-semibold space-y-1">
                              <p className="text-primary">Status Penilaian: <span className="font-bold">{selectedSubmissionForDetail.submission?.grade !== null && selectedSubmissionForDetail.submission?.grade !== undefined ? 'Sudah Dinilai' : 'Belum Dinilai'}</span></p>
                              {selectedSubmissionForDetail.submission?.grade !== null && selectedSubmissionForDetail.submission?.grade !== undefined && (
                                <p className="text-secondary">Nilai Saat Ini: <span className="font-bold">{selectedSubmissionForDetail.submission.grade} / {selectedAssignmentObj.max_points}</span></p>
                              )}
                            </div>

                            <form onSubmit={handleSaveGrading} className="space-y-4">
                              {gradingError && (
                                <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-bold border border-red-100 font-sans">
                                  ⚠️ {gradingError}
                                </div>
                              )}

                              {gradingSuccess && (
                                <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-100 font-sans flex items-start gap-2 animate-in fade-in duration-200">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                  <div>
                                    <p>Penilaian Berhasil Disimpan</p>
                                    <p className="text-[10px] font-normal text-emerald-700 mt-0.5">Nilai dan umpan balik berhasil diperbarui.</p>
                                  </div>
                                </div>
                              )}

                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-primary block" htmlFor="localGrade">
                                  Nilai Angka (Maksimal {selectedAssignmentObj.max_points}) <span className="text-red-500">*</span>
                                </label>
                                <input
                                  id="localGrade"
                                  type="number"
                                  className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-bold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary"
                                  placeholder={`Masukkan nilai 0 - ${selectedAssignmentObj.max_points}`}
                                  value={localGradeValue}
                                  onChange={(e) => {
                                    setLocalGradeValue(e.target.value);
                                    setGradingSuccess(false);
                                    setGradingError(null);
                                  }}
                                  min={0}
                                  max={selectedAssignmentObj.max_points}
                                  required
                                  disabled={isSavingGrade}
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-primary block" htmlFor="localFeedback">Umpan Balik / Catatan Koreksi</label>
                                <textarea
                                  id="localFeedback"
                                  className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary h-32 resize-none"
                                  placeholder="Tulis umpan balik..."
                                  value={localFeedbackValue}
                                  onChange={(e) => {
                                    setLocalFeedbackValue(e.target.value);
                                    setGradingSuccess(false);
                                    setGradingError(null);
                                  }}
                                  disabled={isSavingGrade}
                                />
                              </div>

                              <button
                                type="submit"
                                className="w-full py-2.5 bg-primary text-white font-bold text-xs rounded-xl hover:opacity-95 transition-all cursor-pointer font-sans flex items-center justify-center gap-1.5 disabled:opacity-50"
                                disabled={isSavingGrade}
                              >
                                {isSavingGrade ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
                                  </>
                                ) : (
                                  'Simpan Penilaian'
                                )}
                              </button>
                            </form>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                /* SUB-SUB VIEW: LIST TARGET STUDENTS & SUBMISSIONS */
                const filteredTargetStudents = (targetStudents || []).filter(s => {
                  const q = submissionManagementSearch.trim().toLowerCase();
                  if (!q) return true;
                  return s.name.toLowerCase().includes(q) || s.nim.toLowerCase().includes(q);
                });

                return (
                  <div className="space-y-6">
                    {/* Assignment Header / Meta info */}
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/30 auth-card-shadow">
                      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                        <div>
                          <p className="text-[10px] text-secondary font-semibold uppercase tracking-wider">{selectedAssignmentObj.course?.name || 'Mata Kuliah'}</p>
                          <h1 className="text-xl font-bold text-primary mt-1 font-sans">{selectedAssignmentObj.title}</h1>
                          <p className="text-xs text-on-surface-variant font-medium mt-1 leading-relaxed">{selectedAssignmentObj.description}</p>
                        </div>
                        <div className="flex flex-wrap gap-2.5 shrink-0">
                          <div className="bg-primary/5 border border-primary/10 px-3 py-2 rounded-xl text-xs font-semibold text-primary">
                            <span className="text-[10px] text-on-surface-variant block font-bold">Target Kelas</span>
                            <span className="font-bold text-xs block mt-0.5">{selectedAssignmentObj.class_name === null ? 'Semua Kelas' : selectedAssignmentObj.class_name}</span>
                          </div>
                          <div className="bg-primary/5 border border-primary/10 px-3 py-2 rounded-xl text-xs font-semibold text-primary">
                            <span className="text-[10px] text-on-surface-variant block font-bold">Tenggat Pengumpulan</span>
                            <span className="font-bold text-xs block mt-0.5">
                              {new Date(selectedAssignmentObj.deadline).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} {new Date(selectedAssignmentObj.deadline).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="bg-primary/5 border border-primary/10 px-3 py-2 rounded-xl text-xs font-semibold text-primary">
                            <span className="text-[10px] text-on-surface-variant block font-bold">Poin Maksimal</span>
                            <span className="font-bold text-xs text-secondary block mt-0.5">{selectedAssignmentObj.max_points} Poin</span>
                          </div>
                          <div className="bg-primary/5 border border-primary/10 px-3 py-2 rounded-xl text-xs font-semibold text-primary">
                            <span className="text-[10px] text-on-surface-variant block font-bold">Status</span>
                            <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase inline-block mt-0.5 ${
                              selectedAssignmentObj.status === 'published' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                              selectedAssignmentObj.status === 'closed' ? 'bg-red-50 text-red-700 border border-red-100' :
                              'bg-gray-100 text-gray-600 border border-gray-200'
                            }`}>
                              {selectedAssignmentObj.status === 'published' ? 'Dipublikasikan' :
                               selectedAssignmentObj.status === 'closed' ? 'Ditutup' : 'Draft'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Summary Counters Row */}
                    {targetStudentsLoading ? (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {[1, 2, 3, 4, 5].map(i => (
                          <div key={i} className="bg-white p-4 rounded-xl border border-outline-variant/20 animate-pulse h-20"></div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="bg-white p-4 rounded-2xl border border-outline-variant/30 auth-card-shadow text-center">
                          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Total Mahasiswa</p>
                          <p className="text-xl font-bold text-primary mt-1">{targetStudents.length}</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-outline-variant/30 auth-card-shadow text-center">
                          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Sudah Mengumpulkan</p>
                          <p className="text-xl font-bold text-emerald-600 mt-1">
                            {targetStudents.filter(t => t.submission !== null).length}
                          </p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-outline-variant/30 auth-card-shadow text-center">
                          <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Belum Mengumpulkan</p>
                          <p className="text-xl font-bold text-red-600 mt-1">
                            {targetStudents.filter(t => t.submission === null).length}
                          </p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-outline-variant/30 auth-card-shadow text-center">
                          <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Sudah Dinilai</p>
                          <p className="text-xl font-bold text-primary mt-1">
                            {targetStudents.filter(t => t.submission !== null && t.submission.grade !== null).length}
                          </p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl border border-outline-variant/30 auth-card-shadow text-center">
                          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Terlambat</p>
                          <p className="text-xl font-bold text-amber-600 mt-1">
                            {targetStudents.filter(t => {
                              if (!t.submission) return false;
                              return new Date(t.submission.submitted_at) > new Date(selectedAssignmentObj.deadline);
                            }).length}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Table area with search input */}
                    <div className="bg-white rounded-2xl border border-outline-variant/30 auth-card-shadow overflow-hidden">
                      <div className="p-4 border-b border-outline-variant/15 flex gap-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                          <input
                            className="pl-9 pr-4 py-2 bg-gray-50 border border-outline-variant/60 rounded-xl text-xs focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all w-full font-medium text-primary font-sans"
                            placeholder="Cari berdasarkan nama atau NIM..."
                            type="text"
                            value={submissionManagementSearch}
                            onChange={(e) => setSubmissionManagementSearch(e.target.value)}
                          />
                        </div>
                      </div>

                      {targetStudentsLoading ? (
                        <div className="p-12 text-center text-xs font-semibold text-primary flex items-center justify-center gap-2">
                          <Loader2 className="w-5 h-5 animate-spin text-primary" /> Memuat data pengumpulan tugas...
                        </div>
                      ) : targetStudentsError ? (
                        <div className="p-8 text-center text-xs font-bold text-red-600 font-sans">
                          ⚠️ {targetStudentsError}
                          <button
                            type="button"
                            onClick={() => loadTargetStudentsForAssignment(selectedAsgSubmissionsId)}
                            className="ml-2 underline text-primary hover:text-primary/80"
                          >
                            Coba Lagi
                          </button>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-gray-55/70 border-b border-outline-variant/15 text-primary uppercase tracking-wider font-bold font-sans">
                                <th className="p-4">NIM</th>
                                <th className="p-4">Nama Mahasiswa</th>
                                <th className="p-4">Kode Kelas</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">Waktu Pengumpulan</th>
                                <th className="p-4">Nilai</th>
                                <th className="p-4 text-right">Aksi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/10">
                              {filteredTargetStudents.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="p-8 text-center text-on-surface-variant font-semibold font-sans">
                                    Mahasiswa tidak ditemukan.
                                  </td>
                                </tr>
                              ) : (
                                filteredTargetStudents.map(stud => {
                                  const sub = stud.submission;
                                  let statusText = 'Belum Kumpul';
                                  let statusStyle = 'bg-gray-100 text-gray-500 border border-gray-200';
                                  
                                  if (sub) {
                                    const subTime = new Date(sub.submitted_at);
                                    const deadTime = new Date(selectedAssignmentObj.deadline);
                                    if (subTime > deadTime) {
                                      statusText = 'Terlambat';
                                      statusStyle = 'bg-amber-50 text-amber-700 border border-amber-100';
                                    } else {
                                      statusText = 'Tepat Waktu';
                                      statusStyle = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
                                    }
                                  }

                                  return (
                                    <tr key={stud.studentId} className="hover:bg-gray-55/30 transition-colors">
                                      <td className="p-4 font-mono font-semibold text-primary">{stud.nim}</td>
                                      <td className="p-4 font-bold text-primary font-sans">{stud.name}</td>
                                      <td className="p-4 font-semibold text-secondary font-sans">{stud.className}</td>
                                      <td className="p-4">
                                        <span className={`px-2.5 py-0.5 text-[9px] font-bold rounded-full uppercase ${statusStyle}`}>
                                          {statusText}
                                        </span>
                                      </td>
                                      <td className="p-4 font-medium text-on-surface-variant">
                                        {sub ? (
                                          <>
                                            {new Date(sub.submitted_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}{' '}
                                            {new Date(sub.submitted_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                          </>
                                        ) : (
                                          '-'
                                        )}
                                      </td>
                                      <td className="p-4 font-bold text-secondary">
                                        {sub === null ? (
                                          '-'
                                        ) : sub.grade === null ? (
                                          <span className="text-gray-500 font-medium font-sans">Belum Dinilai</span>
                                        ) : (
                                          `${sub.grade} / ${selectedAssignmentObj.max_points}`
                                        )}
                                      </td>
                                      <td className="p-4 text-right">
                                        {sub ? (
                                          <button
                                            type="button"
                                            onClick={() => setSelectedSubmissionForDetail(stud)}
                                            className="px-3 py-1.5 bg-primary text-white text-[10px] font-bold rounded-lg hover:opacity-95 transition-all cursor-pointer inline-flex items-center gap-1 font-sans"
                                          >
                                            <Eye className="w-3.5 h-3.5" /> Lihat
                                          </button>
                                        ) : (
                                          '-'
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )
        )}

        {/* TAB 3: DAFTAR MAHASISWA */}
        {activeTab === 'students' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-primary">Daftar Mahasiswa Terdaftar</h1>
              <p className="text-xs text-on-surface-variant font-semibold mt-0.5">Kelola data mahasiswa aktif, detail kelas, serta rekam nilai akademik.</p>
            </div>

            <div className="bg-white rounded-2xl border border-outline-variant/30 auth-card-shadow overflow-hidden">
              {/* Filter Row */}
              <div className="p-4 border-b border-outline-variant/15 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                  <input 
                    className="pl-9 pr-4 py-2 bg-gray-50 border border-outline-variant/60 rounded-xl text-xs focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all w-full font-medium text-primary"
                    placeholder="Cari mahasiswa berdasarkan nama/NIM..." 
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                  />
                </div>

                <select
                  className="px-3 py-2 bg-gray-50 border border-outline-variant/60 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-primary/10 outline-none text-primary cursor-pointer"
                  value={selectedCourseFilter}
                  onChange={(e) => setSelectedCourseFilter(e.target.value)}
                >
                  <option value="all">Semua Mata Kuliah</option>
                  {courses.map(c => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>

                <select
                  className="px-3 py-2 bg-gray-50 border border-outline-variant/60 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-primary/10 outline-none text-primary cursor-pointer"
                  value={selectedClassFilter}
                  onChange={(e) => setSelectedClassFilter(e.target.value)}
                >
                  <option value="all">Semua Kelas</option>
                  <option value="IF-4A">IF-4A</option>
                  <option value="IF-4B">IF-4B</option>
                  <option value="IF-5A">IF-5A</option>
                  <option value="IF-5B">IF-5B</option>
                  <option value="IF-6A">IF-6A</option>
                  <option value="IF-6B">IF-6B</option>
                </select>
              </div>

              {/* Students Grid */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredStudents.length === 0 ? (
                  <p className="col-span-2 text-center py-12 text-xs font-medium text-on-surface-variant">Mahasiswa tidak ditemukan.</p>
                ) : (
                  filteredStudents.map(stud => {
                    // Find his submissions
                    const studSubmissions = submissions.filter(s => s.userUid === stud.uid);
                    const graded = studSubmissions.filter(s => s.grade !== null);
                    const avgGrade = graded.length > 0 ? Math.round(graded.reduce((acc, curr) => acc + curr.grade, 0) / graded.length) : 'N/A';
                    
                    return (
                      <div key={stud.id} className="p-4 bg-slate-50 border border-outline-variant/20 rounded-xl hover:border-primary/20 transition-all space-y-4">
                        <div className="flex gap-4 items-center">
                          <img 
                            className="w-12 h-12 rounded-full object-cover border border-outline-variant" 
                            src={stud.avatarUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuB7ge-UpfQHDlk_KyVj-ZNtSDgwDENO3uUEByNxmVlFleVQYou_y3KnlyXyqLW27u8c661iO97BuoxkRNnALRJAQtjydFVvAmrjq9FUIICdZSKbK95t9dYWUS4GsIJbBh2vAG1JGDtm6IpzKoNq6bg-72QmgCX6Wt4-s59NQfOC64XpVtj0YN6JLnbhpyE6JIHDKajt4YCYrMqvUh4LP5hxoUAanVsd4DIqCkbhIFwhjn_jGp60e7_lNt2kCukcSvM4l1R9-ZepZXLE'} 
                            alt={stud.name} 
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <h4 className="text-sm font-bold text-primary">{stud.name}</h4>
                            <p className="text-[10px] text-on-surface-variant font-semibold mt-0.5">{stud.idNumber || '#AF-2023-045'} • Kelas {stud.enrolledClassName || 'IF-4A'}</p>
                            <p className="text-[10px] text-on-surface-variant font-semibold">{stud.enrolledCourseCode || 'IF-MOB'}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 border-t border-outline-variant/10 pt-3 text-[11px] font-semibold">
                          <div>
                            <span className="text-on-surface-variant block">Kumpul Tugas</span>
                            <span className="text-primary font-bold">{studSubmissions.length} Terkirim</span>
                          </div>
                          <div>
                            <span className="text-on-surface-variant block">Rata-Rata Nilai</span>
                            <span className="text-secondary font-bold">{avgGrade === 'N/A' ? 'N/A' : `${avgGrade} / 100`}</span>
                          </div>
                        </div>

                        {/* List of active student submissions to grade */}
                        {studSubmissions.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-outline-variant/10">
                            <span className="text-[10px] font-bold text-primary block uppercase tracking-wider">Submissions:</span>
                            {studSubmissions.map(sub => {
                              const asg = assignments.find(a => a.id === sub.assignmentId);
                              return (
                                <div key={sub.id} className="p-2 bg-white rounded-lg flex justify-between items-center text-[10px] font-semibold">
                                  <span className="truncate max-w-[150px] text-primary">{asg ? asg.title : 'Tugas'}</span>
                                  {sub.grade !== null ? (
                                    <span className="text-secondary font-bold">Grade: {sub.grade}</span>
                                  ) : (
                                    <button 
                                      onClick={() => {
                                        setSelectedSubmission(sub);
                                        setGradeValue(100);
                                        setFeedbackValue('');
                                        setIsGradingOpen(true);
                                      }}
                                      className="px-2 py-1 bg-primary text-white text-[9px] font-bold rounded cursor-pointer"
                                    >
                                      Beri Nilai
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: MATERI PERKULIAHAN */}
        {activeTab === 'materials' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {selectedMeetingForMaterials === null ? (
              // Case 1: Meetings list view
              <>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h1 className="text-xl md:text-2xl font-bold tracking-tight text-primary">Materi Perkuliahan</h1>
                    <p className="text-xs text-on-surface-variant font-semibold mt-0.5">Kelola pertemuan kuliah dan publikasikan materi/file atau link pendukung.</p>
                  </div>
                </div>

                {/* Filter and Course details card */}
                <div className="bg-white p-5 rounded-2xl border border-outline-variant/30 auth-card-shadow flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5 w-full md:w-80">
                    <label className="text-xs font-bold text-primary block">Pilih Mata Kuliah</label>
                    <select
                      className="w-full px-3 py-2.5 bg-slate-50 border border-outline-variant/60 rounded-xl text-xs font-bold text-primary focus:ring-2 focus:ring-primary/10 outline-none cursor-pointer"
                      value={selectedMaterialCourseId}
                      onChange={(e) => setSelectedMaterialCourseId(e.target.value)}
                    >
                      <option value="" disabled>-- Pilih Mata Kuliah --</option>
                      {courses.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                      ))}
                    </select>
                  </div>

                  {selectedMaterialCourseId && (() => {
                    const activeCourse = courses.find(c => c.id === selectedMaterialCourseId);
                    if (!activeCourse) return null;
                    return (
                      <div className="flex gap-6 text-xs text-on-surface-variant font-semibold border-t md:border-t-0 md:border-l border-outline-variant/20 pt-4 md:pt-0 md:pl-6">
                        <div>
                          <span className="text-[10px] text-gray-400 block uppercase font-bold">Kode</span>
                          <span className="text-primary font-bold text-sm uppercase">{activeCourse.code}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-400 block uppercase font-bold">SKS</span>
                          <span className="text-primary font-bold text-sm">{activeCourse.credits || 3} SKS</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-gray-400 block uppercase font-bold">Jumlah Pertemuan</span>
                          <span className="text-primary font-bold text-sm">{getTotalMeetings(activeCourse.credits || 3)} Pertemuan</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {meetingsError && (
                  <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs font-semibold border border-red-100 font-sans">
                    ⚠️ {meetingsError}
                  </div>
                )}

                {/* Meetings grid */}
                {!selectedMaterialCourseId ? (
                  <div className="bg-white p-12 text-center rounded-2xl border border-outline-variant/30 auth-card-shadow">
                    <FileSpreadsheet className="w-12 h-12 text-primary/20 mx-auto mb-3" />
                    <p className="text-xs font-semibold text-on-surface-variant">Silakan pilih mata kuliah terlebih dahulu untuk mengelola materi.</p>
                  </div>
                ) : isMeetingsLoading ? (
                  <div className="bg-white p-12 text-center rounded-2xl border border-outline-variant/30 auth-card-shadow">
                    <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
                    <p className="text-xs font-semibold text-primary">Memuat daftar pertemuan...</p>
                  </div>
                ) : (
                  (() => {
                    const activeCourse = courses.find(c => c.id === selectedMaterialCourseId);
                    if (!activeCourse) return null;
                    const totalSksMeetings = getTotalMeetings(activeCourse.credits || 3);
                    
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {Array.from({ length: totalSksMeetings }, (_, i) => {
                          const meetNum = i + 1;
                          const meetRecord = courseMeetings.find(m => m.meeting_number === meetNum);

                          if (meetRecord) {
                            return (
                              <div key={meetRecord.id} className="bg-white p-5 rounded-2xl border border-outline-variant/30 auth-card-shadow flex flex-col justify-between hover:border-primary/25 transition-all space-y-4">
                                <div className="space-y-2">
                                  <div className="flex justify-between items-start">
                                    <span className="px-2.5 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full">Pertemuan {meetNum}</span>
                                    <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${
                                      meetRecord.is_published 
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                        : 'bg-amber-50 text-amber-700 border border-amber-100'
                                    }`}>
                                      {meetRecord.is_published ? 'Dipublikasikan' : 'Draft'}
                                    </span>
                                  </div>
                                  <h3 className="text-sm font-bold text-primary line-clamp-1">{meetRecord.title}</h3>
                                  <p className="text-xs text-on-surface-variant line-clamp-2 h-8 font-medium">
                                    {meetRecord.description || 'Tidak ada deskripsi.'}
                                  </p>
                                </div>

                                <div className="pt-3 border-t border-outline-variant/10 flex items-center justify-between">
                                  <button
                                    onClick={() => setSelectedMeetingForMaterials(meetRecord)}
                                    className="px-3 py-2 bg-primary text-white text-[10px] font-bold rounded-xl hover:opacity-95 transition-all flex items-center gap-1 cursor-pointer"
                                  >
                                    <FileSpreadsheet className="w-3 h-3" /> Kelola Materi
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingMeeting(meetRecord);
                                      setMeetingFormNumber(meetNum);
                                      setMeetingFormTitle(meetRecord.title);
                                      setMeetingFormDescription(meetRecord.description || '');
                                      setMeetingFormPublished(meetRecord.is_published);
                                      setMeetingFormError(null);
                                      setIsMeetingModalOpen(true);
                                    }}
                                    className="p-1.5 hover:bg-slate-100 border border-outline-variant/50 rounded-xl text-primary transition-colors cursor-pointer inline-flex items-center"
                                    title="Edit Pertemuan"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          } else {
                            return (
                              <div key={`empty-${meetNum}`} className="bg-slate-50/50 p-5 rounded-2xl border border-dashed border-outline-variant/60 flex flex-col justify-between hover:border-primary/40 transition-all space-y-4">
                                <div className="space-y-2">
                                  <span className="px-2.5 py-0.5 bg-gray-200/60 text-gray-600 text-[10px] font-bold rounded-full">Pertemuan {meetNum}</span>
                                  <h3 className="text-sm font-bold text-gray-400 italic">Belum dibuat</h3>
                                  <p className="text-xs text-gray-400 font-medium">Pertemuan ini belum memiliki rincian materi atau deskripsi.</p>
                                </div>
                                <div className="pt-3">
                                  <button
                                    onClick={() => {
                                      setEditingMeeting(null);
                                      setMeetingFormNumber(meetNum);
                                      setMeetingFormTitle('');
                                      setMeetingFormDescription('');
                                      setMeetingFormPublished(false);
                                      setMeetingFormError(null);
                                      setIsMeetingModalOpen(true);
                                    }}
                                    className="w-full py-2 bg-white border border-outline-variant text-primary hover:border-primary hover:bg-primary/5 text-[10px] font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
                                  >
                                    <Plus className="w-3 h-3" /> Buat Pertemuan
                                  </button>
                                </div>
                              </div>
                            );
                          }
                        })}
                      </div>
                    );
                  })()
                )}
              </>
            ) : (
              // Case 2: Meeting detail & materials list view
              <>
                <div className="space-y-4">
                  <button
                    onClick={() => setSelectedMeetingForMaterials(null)}
                    className="text-xs font-bold text-on-surface-variant hover:text-primary transition-all duration-200 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    ← Kembali ke Daftar Pertemuan
                  </button>

                  <div className="bg-white p-6 rounded-2xl border border-outline-variant/30 auth-card-shadow space-y-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <span className="px-2.5 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full">Pertemuan {selectedMeetingForMaterials.meeting_number}</span>
                        <h2 className="text-base font-bold text-primary mt-1.5">{selectedMeetingForMaterials.title}</h2>
                        {selectedMeetingForMaterials.description && (
                          <p className="text-xs font-medium text-on-surface-variant mt-1 leading-relaxed">{selectedMeetingForMaterials.description}</p>
                        )}
                      </div>
                      <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full self-start sm:self-auto ${
                        selectedMeetingForMaterials.is_published 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                          : 'bg-amber-50 text-amber-700 border border-amber-100'
                      }`}>
                        {selectedMeetingForMaterials.is_published ? 'Dipublikasikan' : 'Draft'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                  {/* Left Column: Materials list */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white p-6 rounded-2xl border border-outline-variant/30 auth-card-shadow space-y-4">
                      <div className="flex justify-between items-center border-b border-outline-variant/10 pb-3">
                        <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Materi Terbit</h3>
                        <span className="text-[10px] bg-slate-100 text-on-surface-variant px-2 py-0.5 rounded-full font-bold">{meetingMaterials.length} Item</span>
                      </div>

                      {isMaterialsLoading ? (
                        <div className="py-12 text-center">
                          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-2" />
                          <p className="text-xs font-semibold text-primary">Memuat materi perkuliahan...</p>
                        </div>
                      ) : meetingMaterials.length === 0 ? (
                        <div className="py-12 text-center border-2 border-dashed border-outline-variant rounded-2xl">
                          <FileText className="w-10 h-10 text-primary/20 mx-auto mb-2" />
                          <p className="text-xs font-semibold text-on-surface-variant">Belum ada materi terunggah untuk pertemuan ini.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {meetingMaterials.map(mat => (
                            <div key={mat.id} className="p-3.5 bg-slate-50 border border-outline-variant/20 rounded-xl flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3 min-w-0">
                                {mat.material_type === 'file' ? (
                                  (() => {
                                    const ext = mat.file_path?.split('.').pop()?.toLowerCase();
                                    if (['ppt', 'pptx'].includes(ext || '')) return <span className="p-2 bg-orange-100 text-orange-700 rounded-lg text-xs font-bold uppercase font-mono">PPT</span>;
                                    if (['xls', 'xlsx', 'csv'].includes(ext || '')) return <span className="p-2 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold uppercase font-mono">XLS</span>;
                                    if (['doc', 'docx'].includes(ext || '')) return <span className="p-2 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold uppercase font-mono">DOC</span>;
                                    if (ext === 'pdf') return <span className="p-2 bg-red-100 text-red-700 rounded-lg text-xs font-bold uppercase font-mono">PDF</span>;
                                    if (ext === 'zip') return <span className="p-2 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold uppercase font-mono">ZIP</span>;
                                    return <span className="p-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold uppercase font-mono">FILE</span>;
                                  })()
                                ) : (
                                  <span className="p-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold uppercase font-mono">LINK</span>
                                )}
                                <div className="min-w-0">
                                  <h4 className="text-xs font-bold text-primary truncate">{mat.title}</h4>
                                  <p className="text-[10px] text-on-surface-variant font-semibold mt-0.5">
                                    {mat.material_type === 'file' ? 'Berkas Unggahan' : 'Tautan Eksternal'}
                                  </p>
                                </div>
                              </div>

                              <div className="flex gap-1.5 shrink-0">
                                {mat.material_type === 'file' ? (
                                  <button
                                    onClick={() => handleDownloadMaterialFile(mat.file_path, mat.title)}
                                    className="p-1.5 hover:bg-slate-200 border border-outline-variant/30 rounded-lg text-primary transition-colors cursor-pointer"
                                    title="Unduh Berkas"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <a
                                    href={mat.external_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 hover:bg-slate-200 border border-outline-variant/30 rounded-lg text-primary transition-colors cursor-pointer inline-flex items-center"
                                    title="Buka Tautan"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                                <button
                                  onClick={() => {
                                    setSelectedMaterialToDelete(mat);
                                    setMaterialDeleteError(null);
                                  }}
                                  className="p-1.5 hover:bg-red-50 text-red-500 border border-red-100 rounded-lg transition-colors cursor-pointer"
                                  title="Hapus Materi"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Add material form */}
                  <div className="bg-white p-6 rounded-2xl border border-outline-variant/30 auth-card-shadow space-y-4">
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider border-b border-outline-variant/10 pb-3">Tambah Materi Baru</h3>
                    
                    <form onSubmit={handleMaterialSubmit} className="space-y-4">
                      {materialFormError && (
                        <div className="p-2.5 bg-red-50 text-red-600 rounded-xl text-[10px] font-bold border border-red-100 font-sans">
                          ⚠️ {materialFormError}
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-primary block">Tipe Materi</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setMaterialFormType('file');
                              setMaterialFormError(null);
                            }}
                            className={`py-2 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer ${
                              materialFormType === 'file'
                                ? 'bg-primary border-primary text-white shadow-sm'
                                : 'bg-white border-outline-variant text-on-surface-variant hover:bg-slate-50'
                            }`}
                          >
                            Upload File
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMaterialFormType('link');
                              setMaterialFormError(null);
                            }}
                            className={`py-2 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer ${
                              materialFormType === 'link'
                                ? 'bg-primary border-primary text-white shadow-sm'
                                : 'bg-white border-outline-variant text-on-surface-variant hover:bg-slate-50'
                            }`}
                          >
                            Tambah Link
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-primary block" htmlFor="materialTitle">Judul Materi</label>
                        <input
                          id="materialTitle"
                          type="text"
                          value={materialFormTitle}
                          onChange={(e) => setMaterialFormTitle(e.target.value)}
                          placeholder="Contoh: Modul Kuliah Bab 1"
                          className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary"
                          required
                        />
                      </div>

                      {materialFormType === 'link' ? (
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-primary block" htmlFor="materialUrl">URL Tautan</label>
                          <input
                            id="materialUrl"
                            type="text"
                            value={materialFormUrl}
                            onChange={(e) => setMaterialFormUrl(e.target.value)}
                            placeholder="https://example.com/slides"
                            className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary font-mono"
                            required={materialFormType === 'link'}
                          />
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-primary block" htmlFor="materialFile">Pilih File</label>
                          <div className="border border-dashed border-outline-variant rounded-xl p-4 text-center hover:border-primary/50 transition-all bg-slate-50/50">
                            <input
                              id="materialFile"
                              type="file"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  setMaterialFormFile(e.target.files[0]);
                                }
                              }}
                              required={materialFormType === 'file'}
                            />
                            <label htmlFor="materialFile" className="cursor-pointer block space-y-1">
                              <Upload className="w-5 h-5 text-primary/40 mx-auto mb-1" />
                              <span className="text-[10px] font-bold text-primary block">Pilih berkas dari perangkat Anda</span>
                              <span className="text-[9px] text-on-surface-variant font-semibold block">PDF, PPT, PPTX, DOC, XLS, ZIP, dll (Maks. 50MB)</span>
                            </label>
                            {materialFormFile && (
                              <div className="mt-3 p-2 bg-primary/5 text-primary text-[10px] rounded-lg border border-primary/10 font-bold truncate">
                                Selected: {materialFormFile.name} ({(materialFormFile.size / (1024 * 1024)).toFixed(2)} MB)
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isMaterialSubmitting}
                        className="w-full py-2.5 bg-primary hover:bg-primary/95 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                      >
                        {isMaterialSubmitting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Menyimpan...
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4" /> Simpan Materi
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 6: STATISTIK & LAPORAN */}
        {activeTab === 'reports' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header Title & Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-primary font-sans">
                  Laporan & Rekapitulasi Tugas
                </h1>
                <p className="text-xs text-on-surface-variant font-semibold mt-0.5 font-sans">
                  Rekapitulasi total tugas yang telah dikumpulkan dan dinilai untuk setiap mahasiswa sesuai mata kuliah dan kelas.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    await Promise.all([loadData(), loadEnrollments(), loadCourses()]);
                  }}
                  className="bg-white border border-outline-variant/60 hover:bg-slate-50 text-primary px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer font-sans"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                  Refresh Data
                </button>
                <button
                  type="button"
                  onClick={handleExportReportExcel}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer auth-card-shadow font-sans shadow-xs"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Export Rekap Excel
                </button>
              </div>
            </div>

            {/* Summary KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-outline-variant/30 auth-card-shadow">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Total Mahasiswa</p>
                <h3 className="text-2xl font-bold text-primary mt-1">{reportMetrics.totalRecords}</h3>
                <p className="text-[10px] text-on-surface-variant font-medium mt-1">Pendaftaran kelas aktif</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-outline-variant/30 auth-card-shadow">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Tugas Dikumpulkan</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <h3 className="text-2xl font-bold text-emerald-600">{reportMetrics.totalSubmitted}</h3>
                  <span className="text-xs text-on-surface-variant font-semibold">/ {reportMetrics.totalExpected} total</span>
                </div>
                <div className="w-full bg-emerald-50 h-1.5 rounded-full overflow-hidden mt-2">
                  <div className="bg-emerald-500 h-full rounded-full transition-all duration-300" style={{ width: `${reportMetrics.overallCompletionRate}%` }}></div>
                </div>
                <p className="text-[10px] text-emerald-700 font-semibold mt-1.5">{reportMetrics.overallCompletionRate}% tingkat pengumpulan</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-outline-variant/30 auth-card-shadow">
                <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wider">Tugas Sudah Dinilai</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <h3 className="text-2xl font-bold text-teal-600">{reportMetrics.totalGraded}</h3>
                  <span className="text-xs text-on-surface-variant font-semibold">/ {reportMetrics.totalSubmitted} kumpul</span>
                </div>
                <div className="w-full bg-teal-50 h-1.5 rounded-full overflow-hidden mt-2">
                  <div className="bg-teal-500 h-full rounded-full transition-all duration-300" style={{ width: `${reportMetrics.overallGradedRate}%` }}></div>
                </div>
                <p className="text-[10px] text-teal-700 font-semibold mt-1.5">{reportMetrics.overallGradedRate}% dari tugas terkumpul</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-outline-variant/30 auth-card-shadow">
                <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">Rata-rata Nilai</p>
                <h3 className="text-2xl font-bold text-secondary mt-1">
                  {reportMetrics.avgOverallScore !== null ? reportMetrics.avgOverallScore : '—'}
                </h3>
                <p className="text-[10px] text-on-surface-variant font-medium mt-1">Skala 0 - 100</p>
              </div>
            </div>

            {/* Main Report Table Card */}
            <div className="bg-white rounded-2xl border border-outline-variant/30 auth-card-shadow overflow-hidden">
              {/* Filter Toolbar */}
              <div className="p-4 border-b border-outline-variant/15 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-gray-50/50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                  <input 
                    className="pl-9 pr-4 py-2 bg-white border border-outline-variant/60 rounded-xl text-xs focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all w-full font-medium text-primary font-sans"
                    placeholder="Cari nama atau NIM mahasiswa..." 
                    type="text"
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                  />
                </div>

                <select
                  className="px-3 py-2 bg-white border border-outline-variant/60 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-primary/10 outline-none text-primary cursor-pointer font-sans"
                  value={reportCourseFilter}
                  onChange={(e) => setReportCourseFilter(e.target.value)}
                >
                  <option value="all">Semua Mata Kuliah</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.code}>{c.name} ({c.code})</option>
                  ))}
                </select>

                <select
                  className="px-3 py-2 bg-white border border-outline-variant/60 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-primary/10 outline-none text-primary cursor-pointer font-sans"
                  value={reportClassFilter}
                  onChange={(e) => setReportClassFilter(e.target.value)}
                >
                  <option value="all">Semua Kelas</option>
                  {uniqueClasses.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <select
                  className="px-3 py-2 bg-white border border-outline-variant/60 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-primary/10 outline-none text-primary cursor-pointer font-sans"
                  value={reportStatusFilter}
                  onChange={(e) => setReportStatusFilter(e.target.value)}
                >
                  <option value="all">Semua Status Pengumpulan</option>
                  <option value="complete">Lengkap (100% Kumpul)</option>
                  <option value="partial">Sebagian (Belum Semua)</option>
                  <option value="none">Belum Mengumpulkan</option>
                </select>
              </div>

              {/* Table Data */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-55/80 border-b border-outline-variant/15 text-primary uppercase tracking-wider font-bold font-sans">
                      <th className="p-4 w-12 text-center">No</th>
                      <th className="p-4">NIM</th>
                      <th className="p-4">Nama Mahasiswa</th>
                      <th className="p-4">Mata Kuliah</th>
                      <th className="p-4">Kelas</th>
                      <th className="p-4 text-center">Target Tugas</th>
                      <th className="p-4 text-center">Dikumpulkan</th>
                      <th className="p-4 text-center">Dinilai</th>
                      <th className="p-4 text-center">Rata-rata Nilai</th>
                      <th className="p-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10 font-sans">
                    {filteredStudentTaskReports.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-12 text-center text-on-surface-variant font-semibold">
                          Tidak ada data mahasiswa yang cocok dengan filter pencarian laporan.
                        </td>
                      </tr>
                    ) : (
                      filteredStudentTaskReports.map((item, idx) => (
                        <tr key={item.enrollmentId} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-4 text-center font-bold text-on-surface-variant/70">{idx + 1}</td>
                          <td className="p-4 font-mono font-bold text-primary">{item.nim}</td>
                          <td className="p-4">
                            <span className="font-bold text-primary block">{item.name}</span>
                          </td>
                          <td className="p-4">
                            <span className="font-bold text-primary block leading-tight">{item.courseName}</span>
                            <span className="text-[10px] text-on-surface-variant font-semibold block mt-0.5">{item.courseCode}</span>
                          </td>
                          <td className="p-4">
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-lg font-bold text-[11px]">
                              {item.className}
                            </span>
                          </td>
                          <td className="p-4 text-center font-bold text-primary">
                            {item.totalAssignments} Tugas
                          </td>
                          <td className="p-4 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                item.totalSubmitted === item.totalAssignments && item.totalAssignments > 0
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : item.totalSubmitted > 0
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-red-50 text-red-600 border border-red-200'
                              }`}>
                                {item.totalSubmitted} / {item.totalAssignments}
                              </span>
                              {item.totalAssignments > 0 && (
                                <div className="w-16 bg-gray-100 h-1.5 rounded-full overflow-hidden mt-1.5">
                                  <div 
                                    className={`h-full rounded-full ${
                                      item.completionRate === 100 ? 'bg-emerald-500' : item.completionRate > 0 ? 'bg-amber-500' : 'bg-red-400'
                                    }`}
                                    style={{ width: `${item.completionRate}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              item.totalGraded === item.totalSubmitted && item.totalSubmitted > 0
                                ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                : item.totalGraded > 0
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-gray-100 text-gray-500 border border-gray-200'
                            }`}>
                              {item.totalGraded} / {item.totalSubmitted}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            {item.averageGrade !== null ? (
                              <span className="font-bold text-teal-700 text-xs bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
                                {item.averageGrade}
                              </span>
                            ) : (
                              <span className="text-on-surface-variant/60 font-semibold">—</span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              item.status === 'complete'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : item.status === 'partial'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}>
                              {item.status === 'complete' ? 'Lengkap' : item.status === 'partial' ? 'Sebagian' : 'Belum Kumpul'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Visual Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Submission Stats Chart */}
              <div className="bg-white p-5 rounded-2xl border border-outline-variant/30 auth-card-shadow">
                <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Grafik Tugas & Pengumpulan per Mata Kuliah</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" stroke="#888888" fontSize={11} tickLine={false} />
                      <YAxis stroke="#888888" fontSize={11} tickLine={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="Tugas" fill="#1e3a8a" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Kumpulan" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Attendance metrics */}
              <div className="bg-white p-5 rounded-2xl border border-outline-variant/30 auth-card-shadow flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Statistik Presensi Terkumpul</h3>
                  <p className="text-xs text-on-surface-variant leading-relaxed">Persentase tingkat kehadiran keseluruhan mahasiswa dari perkuliahan terdaftar.</p>
                </div>
                <div className="py-6 flex items-center justify-center">
                  <div className="w-32 h-32 rounded-full border-8 border-secondary flex items-center justify-center">
                    <span className="text-2xl font-bold text-primary">85.4%</span>
                  </div>
                </div>
                <div className="border-t border-outline-variant/15 pt-3 text-[10px] font-semibold text-on-surface-variant text-center">
                  Dihitung secara realtime berdasarkan {attendance.length} record presensi terdaftar.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: MASTER MAHASISWA */}
        {activeTab === 'master_students' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-primary font-sans">Master Mahasiswa</h1>
                <p className="text-xs text-on-surface-variant font-semibold mt-0.5 font-sans">Kelola data mahasiswa dan pendaftaran (enrollment) kelas mata kuliah.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={openImportExcelModal}
                  className="bg-secondary text-primary px-4 py-2.5 rounded-xl text-xs font-bold hover:opacity-95 transition-all flex items-center gap-1.5 cursor-pointer auth-card-shadow font-sans"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Import Excel
                </button>
                <button 
                  onClick={openAddMasterModal}
                  className="bg-primary text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:opacity-95 transition-all flex items-center gap-1.5 cursor-pointer auth-card-shadow font-sans"
                >
                  <Plus className="w-4 h-4" /> Tambah Mahasiswa
                </button>
              </div>
            </div>

            {/* Filters Row */}
            <div className="bg-white rounded-2xl border border-outline-variant/30 auth-card-shadow overflow-hidden">
              <div className="p-4 border-b border-outline-variant/15 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
                  <input 
                    className="pl-9 pr-4 py-2 bg-gray-50 border border-outline-variant/60 rounded-xl text-xs focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all w-full font-medium text-primary font-sans"
                    placeholder="Cari berdasarkan nama atau NIM..." 
                    type="text"
                    value={masterSearch}
                    onChange={(e) => setMasterSearch(e.target.value)}
                  />
                </div>

                <select
                  className="px-3 py-2 bg-gray-50 border border-outline-variant/60 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-primary/10 outline-none text-primary cursor-pointer font-sans"
                  value={masterCourseFilter}
                  onChange={(e) => setMasterCourseFilter(e.target.value)}
                >
                  <option value="all">Semua Mata Kuliah</option>
                  {courses.map(c => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>

                <select
                  className="px-3 py-2 bg-gray-50 border border-outline-variant/60 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-primary/10 outline-none text-primary cursor-pointer font-sans"
                  value={masterClassFilter}
                  onChange={(e) => setMasterClassFilter(e.target.value)}
                >
                  <option value="all">Semua Kelas</option>
                  {uniqueClasses.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Table Area */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-outline-variant/15 text-primary uppercase tracking-wider font-bold font-sans">
                      <th className="p-4">NIM</th>
                      <th className="p-4">Nama Mahasiswa</th>
                      <th className="p-4">Mata Kuliah</th>
                      <th className="p-4">Kode Kelas</th>
                      <th className="p-4">Ruang</th>
                      <th className="p-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {filteredMasterEnrollments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-on-surface-variant font-semibold font-sans">
                          Tidak ada mahasiswa yang terdaftar pada filter ini.
                        </td>
                      </tr>
                    ) : (
                      filteredMasterEnrollments.map(enrollment => {
                        const student = mockStudents.find(s => s.id === enrollment.studentId);
                        const course = courses.find(c => c.code === enrollment.courseId);
                        return (
                          <tr key={enrollment.id} className="hover:bg-gray-55/50 transition-colors">
                            <td className="p-4 font-mono font-semibold text-primary">{student?.nim}</td>
                            <td className="p-4 font-bold text-primary font-sans">{student?.name}</td>
                            <td className="p-4 font-semibold text-on-surface-variant font-sans">
                              {course ? course.name : enrollment.courseId} ({enrollment.courseId})
                            </td>
                            <td className="p-4">
                              <span className="px-2.5 py-1 bg-primary/5 text-primary text-[10px] font-bold rounded-lg font-sans">
                                {enrollment.className}
                              </span>
                            </td>
                            <td className="p-4 font-semibold text-secondary font-mono">{enrollment.roomName}</td>
                            <td className="p-4 text-right space-x-1 whitespace-nowrap">
                              <button 
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditMasterModal(enrollment);
                                }}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-primary transition-colors cursor-pointer inline-flex items-center"
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button 
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteMasterEnrollment(enrollment.id);
                                }}
                                className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors cursor-pointer inline-flex items-center"
                                title="Hapus Enrollment"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
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

      </main>

      {/* CREATE/EDIT ASSIGNMENT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-outline-variant/10 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-primary mb-4 font-sans">{editingAssignment ? 'Edit Tugas Perkuliahan' : 'Buat Tugas Baru'}</h3>
            
            <form onSubmit={handleAssignmentSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-primary block font-sans" htmlFor="title">Judul Tugas *</label>
                <input 
                  id="title" 
                  type="text" 
                  className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary font-sans"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Contoh: Membangun Aplikasi Android"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-primary block font-sans" htmlFor="course">Mata Kuliah *</label>
                <select
                  id="course"
                  className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary cursor-pointer font-sans"
                  value={formCourse}
                  onChange={(e) => setFormCourse(e.target.value)}
                >
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-primary block font-sans" htmlFor="targetClass">Target Kelas *</label>
                <select
                  id="targetClass"
                  className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary cursor-pointer font-sans"
                  value={formTargetClass}
                  onChange={(e) => setFormTargetClass(e.target.value)}
                >
                  <option value="all">Semua Kelas</option>
                  {targetClasses.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-primary block font-sans" htmlFor="description">Deskripsi Instruksi *</label>
                <textarea 
                  id="description" 
                  className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary h-24 resize-none font-sans"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Deskripsikan instruksi pengerjaan tugas secara rinci..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-primary block font-sans" htmlFor="deadline">Tenggat *</label>
                  <input 
                    id="deadline" 
                    type="datetime-local" 
                    className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary cursor-pointer font-sans"
                    value={formDeadline}
                    onChange={(e) => setFormDeadline(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-primary block font-sans" htmlFor="points">Bobot Poin *</label>
                  <input 
                    id="points" 
                    type="number" 
                    className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary font-sans"
                    value={formPoints}
                    onChange={(e) => setFormPoints(Number(e.target.value))}
                    min={1}
                    max={100}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-primary block font-sans" htmlFor="status">Status Penerbitan *</label>
                <select
                  id="status"
                  className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary cursor-pointer font-sans"
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as any)}
                >
                  <option value="draft">Simpan sebagai Draft</option>
                  <option value="published">Publish (Tersedia untuk Mahasiswa)</option>
                  <option value="closed">Closed (Ditutup)</option>
                </select>
              </div>

              <div className="flex gap-3 pt-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 border border-outline-variant/60 text-on-surface-variant font-bold text-xs rounded-xl hover:bg-slate-50 transition-colors cursor-pointer font-sans"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-primary text-white font-bold text-xs rounded-xl hover:bg-primary/95 transition-all cursor-pointer font-sans"
                >
                  Simpan Tugas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GRADING SUBMISSION MODAL */}
      {isGradingOpen && selectedSubmission && (
        <div className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant/10 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-primary mb-4">Penilaian Tugas Mahasiswa</h3>
            
            <div className="space-y-4 mb-4">
              <div className="text-xs space-y-1 bg-slate-50 p-3 rounded-xl font-semibold border">
                <p className="text-primary">Mahasiswa: <span className="font-bold">{students.find(s => s.uid === selectedSubmission.userUid)?.name || 'Mahasiswa'}</span></p>
                <p className="text-on-surface-variant">Tugas: <span className="font-bold">{assignments.find(a => a.id === selectedSubmission.assignmentId)?.title || 'Tugas'}</span></p>
                {selectedSubmission.submittedFile && <p className="text-on-surface-variant">File: <span className="font-bold underline text-secondary">{selectedSubmission.submittedFile}</span></p>}
                {selectedSubmission.submittedLink && <p className="text-on-surface-variant">Link: <a href={selectedSubmission.submittedLink} target="_blank" rel="noopener noreferrer" className="font-bold underline text-secondary hover:text-primary">{selectedSubmission.submittedLink}</a></p>}
                {selectedSubmission.submittedNote && <p className="text-[11px] text-amber-800 italic bg-amber-50 p-1.5 rounded mt-1 font-normal">"{selectedSubmission.submittedNote}"</p>}
              </div>

              <form onSubmit={handleGradeSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-primary block" htmlFor="grade">Input Nilai Angka (0 - 100)</label>
                  <input 
                    id="grade"
                    type="number"
                    className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-bold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary"
                    value={gradeValue}
                    onChange={(e) => setGradeValue(Number(e.target.value))}
                    min={0}
                    max={100}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-primary block" htmlFor="feedback">Catatan Koreksi / Umpan Balik</label>
                  <textarea 
                    id="feedback"
                    className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary h-20 resize-none"
                    value={feedbackValue}
                    onChange={(e) => setFeedbackValue(e.target.value)}
                    placeholder="Beri masukan singkat atau koreksi konstruktif..."
                  />
                </div>

                <div className="flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => { setIsGradingOpen(false); setSelectedSubmission(null); }}
                    className="flex-grow py-2.5 border border-outline-variant/60 text-on-surface-variant font-bold text-xs rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit"
                    className="flex-grow py-2.5 bg-secondary text-white font-bold text-xs rounded-xl hover:bg-secondary/95 transition-all cursor-pointer"
                  >
                    Kirim Nilai
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT MEETING MODAL */}
      {isMeetingModalOpen && (
        <div className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant/10 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-primary mb-4 font-sans">
              {editingMeeting ? 'Edit Rincian Pertemuan' : `Buat Pertemuan Baru (Ke-${meetingFormNumber})`}
            </h3>
            
            <form onSubmit={handleMeetingSubmit} className="space-y-4">
              {meetingFormError && (
                <div className="p-2.5 bg-red-50 text-red-600 rounded-xl text-[10px] font-bold border border-red-100 font-sans">
                  ⚠️ {meetingFormError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-primary block">Nomor Pertemuan</label>
                <input 
                  type="text"
                  disabled
                  className="w-full border border-outline-variant/40 rounded-xl p-2.5 bg-slate-100 text-xs font-bold text-gray-500 outline-none"
                  value={`Pertemuan Ke-${meetingFormNumber}`}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-primary block" htmlFor="meetTitle">Topik / Judul Pertemuan</label>
                <input 
                  id="meetTitle"
                  type="text"
                  className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary"
                  value={meetingFormTitle}
                  onChange={(e) => setMeetingFormTitle(e.target.value)}
                  placeholder="Contoh: Pengenalan State Management"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-primary block" htmlFor="meetDesc">Deskripsi Rencana Kuliah</label>
                <textarea 
                  id="meetDesc"
                  rows={3}
                  className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary resize-none"
                  value={meetingFormDescription}
                  onChange={(e) => setMeetingFormDescription(e.target.value)}
                  placeholder="Tulis ringkasan rujukan atau apa yang akan dipelajari..."
                />
              </div>

              <div className="flex items-center gap-2 py-1">
                <input
                  id="meetPublished"
                  type="checkbox"
                  checked={meetingFormPublished}
                  onChange={(e) => setMeetingFormPublished(e.target.checked)}
                  className="w-4 h-4 rounded border-outline-variant/60 text-primary focus:ring-primary/10 cursor-pointer"
                />
                <label htmlFor="meetPublished" className="text-xs font-bold text-primary cursor-pointer select-none">
                  Langsung Publikasikan (Dapat dilihat mahasiswa)
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setIsMeetingModalOpen(false)}
                  className="flex-grow py-2.5 border border-outline-variant/60 text-on-surface-variant font-bold text-xs rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={isMeetingSubmitting}
                  className="flex-grow py-2.5 bg-primary text-white font-bold text-xs rounded-xl hover:bg-primary/95 transition-all cursor-pointer flex items-center justify-center gap-1"
                >
                  {isMeetingSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Menyimpan...
                    </>
                  ) : (
                    'Simpan Pertemuan'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MASTER MAHASISWA MODAL (NEW) */}
      {isMasterModalOpen && (
        <div className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-outline-variant/10 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-primary mb-4 font-sans">
              {editingEnrollment ? 'Edit Enrollment Mahasiswa' : 'Tambah Mahasiswa Baru'}
            </h3>

            <form onSubmit={handleMasterSubmit} className="space-y-4">
              {/* Error Alert Banner */}
              {masterFormError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold border border-red-100 font-sans">
                  {masterFormError}
                </div>
              )}

              {/* NIM field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-primary block font-sans" htmlFor="masterNim">NIM</label>
                <input 
                  id="masterNim" 
                  type="text" 
                  className={`w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary ${editingEnrollment ? 'bg-gray-100 cursor-not-allowed opacity-70' : ''}`}
                  value={masterFormNim}
                  onChange={(e) => setMasterFormNim(e.target.value)}
                  placeholder="Contoh: 221011001"
                  required
                  disabled={!!editingEnrollment}
                />
              </div>

              {/* Real-time status / look-up indicators (only when adding new, not editing) */}
              {!editingEnrollment && masterFormNim.trim() && (
                <div className="text-[10px] font-bold font-sans">
                  {foundExistingStudent ? (
                    <div className="text-emerald-600 bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                      🟢 Mahasiswa ditemukan: {foundExistingStudent.name}
                    </div>
                  ) : (
                    <div className="text-blue-600 bg-blue-50 p-2 rounded-lg border border-blue-100">
                      🔵 Mahasiswa baru akan didaftarkan ke sistem
                    </div>
                  )}
                </div>
              )}

              {/* Nama Mahasiswa field (disabled/read-only if student exists) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-primary block font-sans" htmlFor="masterName">Nama Mahasiswa</label>
                <input 
                  id="masterName" 
                  type="text" 
                  className={`w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary ${
                    (!!editingEnrollment || !!foundExistingStudent) ? 'bg-gray-100 cursor-not-allowed opacity-70' : ''
                  }`}
                  value={masterFormName}
                  onChange={(e) => setMasterFormName(e.target.value)}
                  placeholder="Nama Lengkap Mahasiswa"
                  required
                  disabled={!!editingEnrollment || !!foundExistingStudent}
                />
              </div>

              {/* Password field (only visible & required when adding a NEW student) */}
              {!editingEnrollment && !foundExistingStudent && (
                <div className="space-y-1.5 animate-in fade-in duration-200">
                  <label className="text-xs font-bold text-primary block font-sans" htmlFor="masterPassword">Password Awal</label>
                  <input 
                    id="masterPassword" 
                    type="password" 
                    className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary"
                    value={masterFormPassword}
                    onChange={(e) => setMasterFormPassword(e.target.value)}
                    placeholder="Masukkan password untuk login mahasiswa"
                    required
                  />
                </div>
              )}

              {/* Mata Kuliah field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-primary block font-sans" htmlFor="masterCourse">Mata Kuliah</label>
                <select
                  id="masterCourse"
                  className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary cursor-pointer font-sans"
                  value={masterFormCourse}
                  onChange={(e) => setMasterFormCourse(e.target.value)}
                >
                  {courses.map(c => (
                    <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>

              {/* Kelas & Ruang (Grid) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-primary block font-sans" htmlFor="masterClass">Kode Kelas</label>
                  <input 
                    id="masterClass" 
                    type="text" 
                    className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary font-mono"
                    value={masterFormClass}
                    onChange={(e) => setMasterFormClass(e.target.value)}
                    placeholder="Contoh: 04SIFM001"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-primary block font-sans" htmlFor="masterRoom">Ruang Kelas</label>
                  <input 
                    id="masterRoom" 
                    type="text" 
                    className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary font-mono"
                    value={masterFormRoom}
                    onChange={(e) => setMasterFormRoom(e.target.value)}
                    placeholder="Contoh: R301"
                    required
                  />
                </div>
              </div>

              {/* Warning Duplicate Alert Banner */}
              {isAlreadyEnrolled && (
                <div className="bg-red-50 text-red-600 p-2.5 rounded-xl text-[10px] font-bold border border-red-100 font-sans">
                  ⚠️ Mahasiswa sudah terdaftar pada mata kuliah ini.
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3 pt-3">
                <button 
                  type="button" 
                  onClick={() => setIsMasterModalOpen(false)}
                  className="flex-1 py-2.5 border border-outline-variant/60 text-on-surface-variant font-bold text-xs rounded-xl hover:bg-slate-50 transition-colors cursor-pointer font-sans"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={isAlreadyEnrolled}
                  className={`flex-1 py-2.5 text-white font-bold text-xs rounded-xl transition-all cursor-pointer font-sans ${
                    isAlreadyEnrolled 
                      ? 'bg-gray-300 cursor-not-allowed opacity-70' 
                      : 'bg-primary hover:bg-primary/95'
                  }`}
                >
                  {editingEnrollment ? 'Simpan Perubahan' : 'Daftarkan Mahasiswa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE/EDIT COURSE MODAL */}
      {isCourseModalOpen && (
        <div className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant/10 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-primary mb-4">
              {editingCourse ? 'Ubah Mata Kuliah' : 'Tambah Mata Kuliah Baru'}
            </h3>

            <form onSubmit={handleCourseSubmit} className="space-y-4">
              {courseFormError && (
                <div className="p-2.5 bg-red-50 text-red-600 rounded-xl text-[10px] font-bold border border-red-100 font-sans">
                  ⚠️ {courseFormError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-primary block" htmlFor="courseCode">Kode Mata Kuliah</label>
                <input 
                  id="courseCode"
                  type="text"
                  className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary uppercase font-mono"
                  value={courseFormCode}
                  onChange={(e) => setCourseFormCode(e.target.value)}
                  placeholder="Contoh: IF-MOB"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-primary block" htmlFor="courseName">Nama Mata Kuliah</label>
                <input 
                  id="courseName"
                  type="text"
                  className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary font-sans"
                  value={courseFormName}
                  onChange={(e) => setCourseFormName(e.target.value)}
                  placeholder="Contoh: Pemrograman Mobile"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-primary block" htmlFor="courseCredits">Bobot SKS</label>
                <select
                  id="courseCredits"
                  className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary font-sans cursor-pointer"
                  value={courseFormCredits}
                  onChange={(e) => setCourseFormCredits(Number(e.target.value))}
                  required
                >
                  <option value={2}>2 SKS (14 Pertemuan)</option>
                  <option value={3}>3 SKS (21 Pertemuan)</option>
                </select>
              </div>

              <div className="flex gap-3 pt-3">
                <button 
                  type="button" 
                  onClick={() => setIsCourseModalOpen(false)}
                  className="flex-1 py-2.5 border border-outline-variant/60 text-on-surface-variant font-bold text-xs rounded-xl hover:bg-slate-50 transition-colors cursor-pointer font-sans"
                  disabled={isCourseSubmitting}
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-primary hover:bg-primary/95 text-white font-bold text-xs rounded-xl transition-all cursor-pointer font-sans"
                  disabled={isCourseSubmitting}
                >
                  {isCourseSubmitting ? 'Menyimpan...' : (editingCourse ? 'Simpan' : 'Tambah')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION DELETE COURSE DIALOG */}
      {selectedCourseToDelete && (
        <div className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant/10 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-primary mb-2 font-sans">
              Hapus Mata Kuliah?
            </h3>
            <p className="text-xs text-on-surface-variant font-medium mb-4 font-sans leading-relaxed">
              Apakah Anda yakin ingin menghapus mata kuliah <span className="font-bold text-primary">{selectedCourseToDelete.name}</span> ({selectedCourseToDelete.code})?
            </p>

            {courseDeleteError && (
              <div className="p-2.5 bg-red-50 text-red-600 rounded-xl text-[10px] font-bold border border-red-100 font-sans mb-4">
                ⚠️ {courseDeleteError}
              </div>
            )}

            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={() => setSelectedCourseToDelete(null)}
                className="flex-1 py-2.5 border border-outline-variant/60 text-on-surface-variant font-bold text-xs rounded-xl hover:bg-slate-50 transition-colors cursor-pointer font-sans"
                disabled={isCourseDeleting}
              >
                Batal
              </button>
              <button 
                type="button"
                onClick={handleConfirmDeleteCourse}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer font-sans disabled:opacity-50"
                disabled={isCourseDeleting}
              >
                {isCourseDeleting ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DELETE ENROLLMENT DIALOG */}
      {selectedEnrollmentToDelete && (
        <div className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant/10 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-primary mb-2 font-sans">
              Hapus Mahasiswa dari Mata Kuliah?
            </h3>
            <p className="text-xs text-on-surface-variant font-medium mb-2 font-sans leading-relaxed">
              Apakah Anda yakin ingin menghapus <span className="font-bold text-primary">{
                (() => {
                  const s = mockStudents.find(student => student.id === selectedEnrollmentToDelete.studentId);
                  return s ? s.name : 'Mahasiswa';
                })()
              }</span> dari mata kuliah <span className="font-bold text-primary">{
                (() => {
                  const c = courses.find(course => course.code === selectedEnrollmentToDelete.courseId);
                  return c ? c.name : selectedEnrollmentToDelete.courseId;
                })()
              }</span>?
            </p>
            <p className="text-[10px] text-on-surface-variant/85 font-medium mb-4 font-sans leading-relaxed">
              Akun login dan profil mahasiswa tetap tersedia dan hanya akan dihapus dari mata kuliah ini.
            </p>

            {enrollmentDeleteError && (
              <div className="p-2.5 bg-red-50 text-red-600 rounded-xl text-[10px] font-bold border border-red-100 font-sans mb-4">
                ⚠️ {enrollmentDeleteError}
              </div>
            )}

            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={() => setSelectedEnrollmentToDelete(null)}
                className="flex-1 py-2.5 border border-outline-variant/60 text-on-surface-variant font-bold text-xs rounded-xl hover:bg-slate-50 transition-colors cursor-pointer font-sans"
                disabled={isEnrollmentDeleting}
              >
                Batal
              </button>
              <button 
                type="button"
                onClick={handleConfirmDeleteEnrollment}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer font-sans disabled:opacity-50"
                disabled={isEnrollmentDeleting}
              >
                {isEnrollmentDeleting ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT EXCEL MODAL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-outline-variant/10 animate-in fade-in zoom-in-95 duration-200 my-8">
            <div className="flex justify-between items-center mb-4 border-b border-outline-variant/15 pb-3">
              <h3 className="text-base font-bold text-primary font-sans flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-secondary" /> Import Mahasiswa via Excel
              </h3>
              <button 
                type="button" 
                onClick={() => setIsImportModalOpen(false)}
                className="text-on-surface-variant hover:text-primary font-bold text-sm cursor-pointer"
                disabled={isImporting}
              >
                ✕
              </button>
            </div>

            {importResultSummary ? (
              /* RESULT STEP */
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-emerald-800">Proses Import Selesai</h4>
                    <p className="text-[10px] text-emerald-700/90 font-medium">Data mahasiswa berhasil diproses oleh sistem.</p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 bg-gray-50 p-4 rounded-xl border border-outline-variant/20">
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-on-surface-variant">Total Data</p>
                    <p className="text-lg font-bold text-primary mt-1">{importResultSummary.total}</p>
                  </div>
                  <div className="text-center border-l border-outline-variant/15">
                    <p className="text-[10px] font-bold text-emerald-600">Berhasil</p>
                    <p className="text-lg font-bold text-emerald-600 mt-1">{importResultSummary.success}</p>
                  </div>
                  <div className="text-center border-l border-outline-variant/15">
                    <p className="text-[10px] font-bold text-blue-600">Terdaftar</p>
                    <p className="text-lg font-bold text-blue-600 mt-1">{importResultSummary.alreadyEnrolled}</p>
                  </div>
                  <div className="text-center border-l border-outline-variant/15">
                    <p className="text-[10px] font-bold text-red-600">Gagal</p>
                    <p className="text-lg font-bold text-red-600 mt-1">{importResultSummary.failed}</p>
                  </div>
                </div>

                {importResultRows && importResultRows.some(r => r.status === 'error') && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-red-600 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" /> Detail Baris Gagal
                    </h4>
                    <div className="max-h-40 overflow-y-auto border border-red-100 rounded-xl divide-y divide-red-50/50 bg-red-50/10">
                      {importResultRows.filter(r => r.status === 'error').map((row, idx) => (
                        <div key={idx} className="p-2.5 flex justify-between items-center text-[10px] font-semibold">
                          <span className="font-mono text-primary font-bold">NIM: {row.nim}</span>
                          <span className="text-red-600 font-medium">{row.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-outline-variant/15 flex justify-end">
                  <button 
                    type="button"
                    onClick={() => setIsImportModalOpen(false)}
                    className="px-6 py-2 bg-primary text-white font-bold text-xs rounded-xl hover:opacity-95 transition-all cursor-pointer font-sans"
                  >
                    Tutup & Refresh
                  </button>
                </div>
              </div>
            ) : (
              /* FORM STEP */
              <form onSubmit={handleImportExcelSubmit} className="space-y-4">
                {importError && (
                  <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold border border-red-100 font-sans flex items-start gap-2 animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{importError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-primary block font-sans">Mata Kuliah *</label>
                    <select
                      className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary cursor-pointer font-sans"
                      value={importFormCourse}
                      onChange={(e) => setImportFormCourse(e.target.value)}
                      required
                    >
                      <option value="" disabled>Pilih Mata Kuliah</option>
                      {courses.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-primary block font-sans">Kode Kelas *</label>
                    <input 
                      type="text" 
                      className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary font-mono"
                      value={importFormClass}
                      onChange={(e) => setImportFormClass(e.target.value)}
                      placeholder="Contoh: 04SIFM001"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-primary block font-sans">Ruangan *</label>
                    <input 
                      type="text" 
                      className="w-full border border-outline-variant/60 rounded-xl p-2.5 bg-white text-xs font-semibold focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none text-primary font-mono"
                      value={importFormRoom}
                      onChange={(e) => setImportFormRoom(e.target.value)}
                      placeholder="Contoh: R301"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-primary font-sans">Pilih File Excel *</label>
                    <button 
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="text-primary font-bold text-[10px] flex items-center gap-1 hover:underline cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" /> Download Template Excel
                    </button>
                  </div>

                  <div className="border-2 border-dashed border-outline-variant/40 rounded-xl p-4 flex flex-col items-center justify-center bg-slate-50/50 hover:bg-slate-50 transition-colors relative">
                    <input 
                      type="file" 
                      accept=".xlsx, .xls"
                      onChange={handleImportFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <Upload className="w-8 h-8 text-on-surface-variant/60 mb-2" />
                    <p className="text-[10px] font-bold text-primary">
                      {importFile ? importFile.name : "Klik atau seret file Excel di sini"}
                    </p>
                    <p className="text-[9px] text-on-surface-variant/70 font-semibold mt-1">
                      Maksimum 5 MB. Format file: NIM dan NAMA_MAHASISWA
                    </p>
                  </div>
                </div>

                {importStudents.length > 0 && (
                  <div className="space-y-2 animate-in fade-in">
                    <div className="flex justify-between items-center border-b border-outline-variant/10 pb-1.5">
                      <h4 className="text-xs font-bold text-primary font-sans">Preview Data</h4>
                      <div className="flex gap-2">
                        <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full font-bold border border-emerald-100">
                          {importStudents.filter(s => s.status === 'valid').length} Valid
                        </span>
                        {importStudents.filter(s => s.status === 'error').length > 0 && (
                          <span className="text-[10px] px-2 py-0.5 bg-red-50 text-red-600 rounded-full font-bold border border-red-100">
                            {importStudents.filter(s => s.status === 'error').length} Error
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="max-h-52 overflow-y-auto border border-outline-variant/20 rounded-xl divide-y divide-outline-variant/10 bg-white">
                      <table className="w-full text-left text-[10px] border-collapse font-sans">
                        <thead>
                          <tr className="bg-gray-50 border-b border-outline-variant/15 font-bold text-primary">
                            <th className="p-2.5 w-10 text-center">No</th>
                            <th className="p-2.5">NIM</th>
                            <th className="p-2.5">Nama Mahasiswa</th>
                            <th className="p-2.5 w-24">Status</th>
                            <th className="p-2.5">Keterangan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/10">
                          {importStudents.map((s, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="p-2 text-center text-on-surface-variant font-medium">{idx + 1}</td>
                              <td className="p-2 font-mono font-bold text-primary">{s.nim || '-'}</td>
                              <td className="p-2 font-medium text-primary">{s.name || '-'}</td>
                              <td className="p-2">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  s.status === 'valid' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                                }`}>
                                  {s.status === 'valid' ? 'Valid' : 'Error'}
                                </span>
                              </td>
                              <td className={`p-2 font-medium ${s.status === 'error' ? 'text-red-500 font-bold' : 'text-on-surface-variant'}`}>
                                {s.message || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-outline-variant/15 flex gap-3 justify-end">
                  <button 
                    type="button" 
                    onClick={() => setIsImportModalOpen(false)}
                    className="px-4 py-2 border border-outline-variant/60 text-on-surface-variant font-bold text-xs rounded-xl hover:bg-slate-50 transition-colors cursor-pointer font-sans"
                    disabled={isImporting}
                  >
                    Batal
                  </button>
                  <button 
                    type="submit"
                    className="px-6 py-2 bg-primary text-white font-bold text-xs rounded-xl hover:opacity-95 transition-all cursor-pointer font-sans disabled:opacity-50 flex items-center gap-1.5"
                    disabled={isImporting || importStudents.filter(s => s.status === 'valid').length === 0}
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Mengimport...
                      </>
                    ) : (
                      `Import ${importStudents.filter(s => s.status === 'valid').length} Mahasiswa`
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* CONFIRMATION DELETE ASSIGNMENT DIALOG */}
      {selectedAssignmentToDelete && (
        <div className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant/10 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-primary mb-2 font-sans">
              Hapus Tugas Perkuliahan?
            </h3>
            <p className="text-xs text-on-surface-variant font-medium mb-4 font-sans leading-relaxed">
              Apakah Anda yakin ingin menghapus tugas <span className="font-bold text-primary">{selectedAssignmentToDelete.title}</span>? Tindakan ini permanen dan akan menghapus semua jawaban/pengumpulan mahasiswa terkait tugas ini.
            </p>

            {assignmentDeleteError && (
              <div className="p-2.5 bg-red-50 text-red-600 rounded-xl text-[10px] font-bold border border-red-100 font-sans mb-4">
                ⚠️ {assignmentDeleteError}
              </div>
            )}

            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={() => setSelectedAssignmentToDelete(null)}
                className="flex-1 py-2.5 border border-outline-variant/60 text-on-surface-variant font-bold text-xs rounded-xl hover:bg-slate-50 transition-colors cursor-pointer font-sans"
                disabled={isAssignmentDeleting}
              >
                Batal
              </button>
              <button 
                type="button"
                onClick={handleConfirmDeleteAssignment}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer font-sans disabled:opacity-50"
                disabled={isAssignmentDeleting}
              >
                {isAssignmentDeleting ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#EAFBF8] flex items-center justify-center text-[#14B8A6]">
                  <Settings className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">Pengaturan Akun Dosen</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Informasi profil dan preferensi sistem</p>
                </div>
              </div>
              <button 
                onClick={() => setIsSettingsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Nama Lengkap</span>
                  <span className="text-slate-900 font-bold">{user.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Email</span>
                  <span className="text-slate-900 font-semibold font-mono text-[11px]">{user.email || '-'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Role Pengguna</span>
                  <span className="px-2 py-0.5 bg-[#EAFBF8] text-teal-700 font-bold rounded-md text-[10px]">Dosen Pengampu</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
                <span className="text-slate-900 font-bold text-[11px] block">Tentang SiTugas</span>
                <p className="text-[11px] text-slate-500 leading-relaxed font-normal">
                  SiTugas Dosen v1.0.0 — Modern Academic Management SaaS untuk pengelolaan tugas, materi, dan rekapitulasi nilai perkuliahan.
                </p>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HELP MODAL */}
      {isHelpModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#EAFBF8] flex items-center justify-center text-[#14B8A6]">
                  <HelpCircle className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">Pusat Bantuan SiTugas</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Panduan singkat fitur portal dosen</p>
                </div>
              </div>
              <button 
                onClick={() => setIsHelpModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <div className="space-y-3 text-xs max-h-[60vh] overflow-y-auto pr-1">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-teal-600" /> 1. Mata Kuliah & Materi
                </h4>
                <p className="text-slate-600 mt-1 text-[11px] leading-relaxed">
                  Kelola daftar mata kuliah pengampuan beserta bobot SKS (2 atau 3 SKS). Di menu Materi Perkuliahan, buat rincian topik pertemuan dan unggah file modul atau tautan referensi.
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-teal-600" /> 2. Mahasiswa & Data Mahasiswa
                </h4>
                <p className="text-slate-600 mt-1 text-[11px] leading-relaxed">
                  Lihat performa rekapitulasi mahasiswa terdaftar di menu "Mahasiswa", serta lakukan pendaftaran mahasiswa baru atau batch import file Excel di menu "Data Mahasiswa".
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-teal-600" /> 3. Tugas & Penilaian
                </h4>
                <p className="text-slate-600 mt-1 text-[11px] leading-relaxed">
                  Buat tugas perkuliahan dengan instruksi dan tenggat waktu. Klik ikon pengumpulan pada daftar tugas untuk melihat submission mahasiswa dan input nilai secara langsung.
                </p>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsHelpModalOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GRADING SUCCESS POPUP MODAL */}
      {isGradingSuccessModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-3.5 shadow-xs">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-900 leading-tight">Penilaian Berhasil Disimpan</h3>
            {gradedStudentInfo && (
              <p className="text-xs text-slate-500 mt-2 font-medium leading-relaxed">
                Penilaian untuk mahasiswa <strong className="text-slate-900 font-bold">{gradedStudentInfo.name}</strong> berhasil dicatat dengan nilai <strong className="text-teal-600 font-bold">{gradedStudentInfo.grade} / {gradedStudentInfo.maxPoints}</strong>.
              </p>
            )}
            <button 
              type="button"
              onClick={() => setIsGradingSuccessModalOpen(false)}
              className="mt-5 w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
            >
              OK, Lanjutkan
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
