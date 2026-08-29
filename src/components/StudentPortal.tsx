import React, { useState, useEffect, startTransition, useMemo } from 'react';
import { 
  Bell, CheckCircle, ArrowRight, ArrowLeft, CloudUpload, FileText, 
  Link as LinkIcon, History, User as UserIcon, Calendar, Compass, FileCheck2, ClipboardList,
  BookOpen, Loader2, Download, ExternalLink, FileSpreadsheet, Link2, AlertTriangle,
  GraduationCap, Users, MapPin, ChevronRight, Plus, X, CheckCircle2
} from 'lucide-react';
import { User, Assignment } from '../types';
import { COURSES } from '../data';
import { apiRequest } from '../lib/api';
import { supabase } from '../lib/supabase';

interface StudentPortalProps {
  user: User;
  onLogout: () => void;
}

export interface CourseMaterial {
  id: string;
  meeting_id: string;
  title: string;
  material_type: 'file' | 'link';
  file_path: string | null;
  external_url: string | null;
  created_at: string;
}

export default function StudentPortal({ user, onLogout }: StudentPortalProps) {
  // Mobile Tab State
  const [activeTab, setActiveTab] = useState<'tasks' | 'materials' | 'history' | 'profile'>('tasks');
  
  // Real data state
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Meetings and materials states for student
  const [courseMeetings, setCourseMeetings] = useState<any[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<any | null>(null);
  const [meetingMaterials, setMeetingMaterials] = useState<CourseMaterial[]>([]);
  const [isMeetingsLoading, setIsMeetingsLoading] = useState(false);
  const [isMaterialsLoading, setIsMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState<string | null>(null);

  // Submission View state
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [activeSubmitTab, setActiveSubmitTab] = useState<'file' | 'link'>('file');

  // Interactive Form Inputs
  const [simulatedFileName, setSimulatedFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [submissionLink, setSubmissionLink] = useState('');
  const [submissionNote, setSubmissionNote] = useState('');

  // Simulated upload state
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [showClosedModal, setShowClosedModal] = useState(false);
  const [closedModalTaskTitle, setClosedModalTaskTitle] = useState('');
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);

  // Get initials for student avatar (e.g. "Ahmad Asep" -> "AA", "Sarah Fauzi Wibawa" -> "SF")
  const getInitials = (name: string) => {
    if (!name) return 'MH';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    if (parts.length === 1) {
      return parts[0].length >= 2 
        ? parts[0].substring(0, 2).toUpperCase() 
        : parts[0][0].toUpperCase();
    }
    return 'MH';
  };

  // Enrollments state
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [selectedEnrollment, setSelectedEnrollment] = useState<any | null>(null);
  const [isEnrollmentsLoading, setIsEnrollmentsLoading] = useState(true);
  const [enrollmentsError, setEnrollmentsError] = useState<string | null>(null);

  const fetchEnrollments = async () => {
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
          course:courses!course_id (
            id,
            code,
            name
          )
        `)
        .eq('student_id', user.uid);

      if (enrollmentsErr) throw enrollmentsErr;

      const formatted = (enrollmentsData || []).map((env: any) => ({
        id: env.id,
        courseId: env.course_id,
        courseCode: env.course?.code || env.course_id,
        courseName: env.course?.name || env.course_id,
        className: env.class_name,
        roomName: env.room_name,
      }));

      setEnrollments(formatted);
      if (formatted.length > 0) {
        setSelectedEnrollment(formatted[0]);
      } else {
        setSelectedEnrollment(null);
      }
    } catch (err: any) {
      console.error('Failed to load student enrollments:', err);
      setEnrollmentsError('Gagal memuat data mata kuliah.');
    } finally {
      setIsEnrollmentsLoading(false);
    }
  };

  useEffect(() => {
    fetchEnrollments();
  }, [user.uid]);

  const activeCourseCode = selectedEnrollment?.courseCode || '';
  const activeClassName = selectedEnrollment?.className || '';
  const activeRoomName = selectedEnrollment?.roomName || '';
  const activeCourseName = selectedEnrollment?.courseName || '';

  // Get current active course
  const activeCourse = useMemo(() => {
    if (!activeCourseCode) return null;
    return { code: activeCourseCode, name: activeCourseName };
  }, [activeCourseCode, activeCourseName]);

  // Fetch real data directly from Supabase and Cloud SQL
  const fetchData = async () => {
    if (!activeCourseCode) {
      setAssignments([]);
      setSubmissions([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const uid = user.uid;

      // 1. Fetch assignments directly from Supabase public.assignments table
      let fetchedAssignments: any[] = [];
      if (selectedEnrollment && selectedEnrollment.courseId) {
        const { data: assData, error: assError } = await supabase
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
          .eq('course_id', selectedEnrollment.courseId)
          .or(`class_name.is.null,class_name.eq.${activeClassName}`);

        if (assError) {
          console.error('Error loading student assignments from Supabase:', assError);
        } else {
          fetchedAssignments = (assData || []).map(ass => {
            const courseObj = Array.isArray(ass.course) ? ass.course[0] : ass.course;
            return {
              id: ass.id,
              title: ass.title,
              courseCode: courseObj?.code || activeCourseCode,
              description: ass.description,
              deadline: ass.deadline,
              points: ass.max_points,
              status: ass.status,
              course_id: ass.course_id,
              class_name: ass.class_name,
              max_points: ass.max_points,
              created_at: ass.created_at,
              updated_at: ass.updated_at
            };
          });
        }
      }

      // 2. Fetch submissions directly from Supabase public.submissions table
      let fetchedSubmissions: any[] = [];
      const { data: subsData, error: subsError } = await supabase
        .from('submissions')
        .select('*')
        .eq('student_id', uid);

      if (subsError) {
        console.error('Error loading student submissions from Supabase:', subsError);
      } else {
        fetchedSubmissions = (subsData || []).map(s => ({
          id: s.id,
          assignmentId: s.assignment_id,
          userUid: s.student_id,
          submittedAt: s.submitted_at,
          submittedFile: s.file_path,
          submittedLink: s.submitted_link,
          submittedNote: s.submitted_note,
          grade: s.grade,
          feedback: s.feedback
        }));
      }

      // Set state
      setAssignments(fetchedAssignments);
      setSubmissions(fetchedSubmissions);
    } catch (e) {
      console.error('Error loading student portal data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeCourseCode, activeClassName]);

  // Load course meetings and materials
  const loadStudentMeetings = async (courseId: string) => {
    if (!courseId) return;
    setIsMeetingsLoading(true);
    setMaterialsError(null);
    try {
      // Students should ONLY see published meetings
      const { data, error } = await supabase
        .from('course_meetings')
        .select('*')
        .eq('course_id', courseId)
        .eq('is_published', true)
        .order('meeting_number', { ascending: true });

      if (error) throw error;
      setCourseMeetings(data || []);
    } catch (err: any) {
      console.error('Error fetching student course meetings:', err);
      setMaterialsError('Gagal memuat rincian pertemuan kuliah.');
    } finally {
      setIsMeetingsLoading(false);
    }
  };

  const loadStudentMaterials = async (meetingId: string) => {
    if (!meetingId) return;
    setIsMaterialsLoading(true);
    try {
      const { data, error } = await supabase
        .from('course_materials')
        .select('id, meeting_id, title, material_type, file_path, external_url, created_at')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMeetingMaterials((data || []) as CourseMaterial[]);
    } catch (err: any) {
      console.error('Error fetching student materials:', err);
      setMaterialsError('Gagal memuat materi kuliah.');
    } finally {
      setIsMaterialsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEnrollment && selectedEnrollment.courseId) {
      loadStudentMeetings(selectedEnrollment.courseId);
      setSelectedMeeting(null);
    } else {
      setCourseMeetings([]);
      setSelectedMeeting(null);
    }
  }, [selectedEnrollment]);

  useEffect(() => {
    if (selectedMeeting) {
      loadStudentMaterials(selectedMeeting.id);
    } else {
      setMeetingMaterials([]);
    }
  }, [selectedMeeting]);

  const handleDownloadMaterialFile = async (filePath: string | null, title: string) => {
    if (!filePath || filePath.trim() === '') {
      alert('File materi tidak tersedia.');
      return;
    }
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
      alert('Gagal mengunduh berkas materi.');
    }
  };

  const handleOpenExternalLink = (url: string | null) => {
    if (!url || url.trim() === '') {
      alert('Tautan materi tidak tersedia.');
      return;
    }
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        window.open(parsedUrl.href, '_blank', 'noopener,noreferrer');
      } else {
        alert('Tautan materi tidak tersedia.');
      }
    } catch (err) {
      try {
        const parsedUrlWithProto = new URL(`https://${url}`);
        if (parsedUrlWithProto.protocol === 'http:' || parsedUrlWithProto.protocol === 'https:') {
          window.open(parsedUrlWithProto.href, '_blank', 'noopener,noreferrer');
          return;
        }
      } catch (innerErr) {
        // Ignored
      }
      alert('Tautan materi tidak tersedia.');
    }
  };

  // Map submissions to assignments for student tasks view
  const studentTasks = useMemo(() => {
    return assignments.map(asm => {
      const sub = submissions.find(s => s.assignmentId === asm.id);
      return {
        ...asm,
        assignmentStatus: asm.status,
        status: sub ? 'submitted' : 'not-submitted',
        submittedAt: sub ? sub.submittedAt : undefined,
        submittedFile: sub ? sub.submittedFile : undefined,
        submittedLink: sub ? sub.submittedLink : undefined,
        submittedNote: sub ? sub.submittedNote : undefined,
        grade: sub ? sub.grade : undefined,
        feedback: sub ? sub.feedback : undefined,
      } as any;
    });
  }, [assignments, submissions]);

  // Compute Momentum Statistics
  const momentumStats = useMemo(() => {
    const total = studentTasks.length;
    const completedCount = studentTasks.filter(t => t.status === 'submitted').length;
    const pendingCount = total - completedCount;
    const percentage = total > 0 ? Math.round((completedCount / total) * 100) : 0;

    return {
      total,
      completed: completedCount,
      pending: pendingCount,
      percentage
    };
  }, [studentTasks]);

  // Handle clicking an active assignment to enter submission flow
  const handleSelectAssignment = (assignment: any) => {
    startTransition(() => {
      setSelectedAssignment(assignment);
      setSelectedFile(null);
      setSimulatedFileName(assignment.submittedFile || '');
      setSubmissionLink(assignment.submittedLink || '');
      setSubmissionNote(assignment.submittedNote || '');
      setUploadProgress(assignment.status === 'submitted' ? 100 : 0);
      setIsUploading(false);
    });
  };

  const handleFilePicked = (file: File) => {
    // Validate file size: 25MB max
    const maxSizeBytes = 25 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      alert('Ukuran berkas melebihi batas maksimal 25MB.');
      return;
    }
    setSelectedFile(file);
    setSimulatedFileName(file.name);
    setUploadProgress(100);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFilePicked(e.target.files[0]);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setSimulatedFileName('');
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownloadSubmittedFile = async (filePath: string) => {
    if (!filePath) return;
    try {
      const { data, error } = await supabase.storage
        .from('assignment-submissions')
        .download(filePath);

      if (error) {
        console.error('Storage download error:', error);
        alert('Berkas tidak dapat diunduh dari server atau file tidak ditemukan.');
        return;
      }

      const blobUrl = window.URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = blobUrl;
      const baseName = filePath.split('/').pop() || 'tugas.pdf';
      const cleanName = baseName.replace(/^\d+-/, '');
      link.download = cleanName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      console.error('Error downloading file:', err);
      alert('Gagal mengunduh berkas tugas.');
    }
  };

  // Handle Complete Submission
  const handleSubmitSubmission = async () => {
    if (activeSubmitTab === 'file' && !simulatedFileName && !selectedFile) {
      alert('Silakan pilih berkas dokumen (PDF/Doc) untuk diunggah.');
      return;
    }
    if (activeSubmitTab === 'link' && !submissionLink.trim()) {
      alert('Silakan masukkan URL link pengumpulan yang valid.');
      return;
    }

    if (selectedAssignment) {
      if (selectedAssignment.assignmentStatus === 'closed' || selectedAssignment.status === 'closed') {
        setClosedModalTaskTitle(selectedAssignment.title || 'Tugas');
        setShowClosedModal(true);
        return;
      }

      try {
        setIsUploading(true);
        const uid = user.uid;
        let finalFilePath: string | null = null;

        if (activeSubmitTab === 'file') {
          if (selectedFile) {
            // Upload real file to Supabase storage 'assignment-submissions'
            const cleanFileName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const storagePath = `${selectedAssignment.id}/${uid}/${Date.now()}-${cleanFileName}`;

            const { error: uploadErr } = await supabase.storage
              .from('assignment-submissions')
              .upload(storagePath, selectedFile, { upsert: true });

            if (uploadErr) {
              console.error('Storage upload error:', uploadErr);
              throw new Error(`Gagal mengunggah file ke penyimpanan: ${uploadErr.message}`);
            }
            finalFilePath = storagePath;
          } else {
            // Retain previously stored file path
            finalFilePath = simulatedFileName || null;
          }
        }

        // 1. Verify if assignment is closed in Supabase
        const { data: asgData } = await supabase
          .from('assignments')
          .select('id, title, status')
          .eq('id', selectedAssignment.id)
          .maybeSingle();

        if (asgData && asgData.status === 'closed') {
          setClosedModalTaskTitle(asgData.title || selectedAssignment.title || 'Tugas');
          setShowClosedModal(true);
          return;
        }

        // 2. Check if submission already exists in Supabase
        const { data: existingSub } = await supabase
          .from('submissions')
          .select('id')
          .eq('assignment_id', selectedAssignment.id)
          .eq('student_id', uid)
          .maybeSingle();

        let supabaseErr = null;
        if (existingSub) {
          const { error: updateErr } = await supabase
            .from('submissions')
            .update({
              submitted_at: new Date().toISOString(),
              file_path: finalFilePath,
              submitted_link: activeSubmitTab === 'link' ? submissionLink : null,
              submitted_note: submissionNote || null,
            })
            .eq('id', existingSub.id);
          supabaseErr = updateErr;
        } else {
          const { error: insertErr } = await supabase
            .from('submissions')
            .insert({
              assignment_id: selectedAssignment.id,
              student_id: uid,
              submitted_at: new Date().toISOString(),
              file_path: finalFilePath,
              submitted_link: activeSubmitTab === 'link' ? submissionLink : null,
              submitted_note: submissionNote || null,
            });
          supabaseErr = insertErr;
        }

        if (supabaseErr) {
          console.error('Supabase direct submission failed:', supabaseErr);
          throw new Error(supabaseErr.message || 'Gagal mengirimkan tugas ke database.');
        } else {
          // Also sync to local backend if running in dev environment (ignore error on static web hosting)
          apiRequest<any>('/api/submissions', {
            method: 'POST',
            body: JSON.stringify({
              assignmentId: selectedAssignment.id,
              submittedFile: finalFilePath,
              submittedLink: activeSubmitTab === 'link' ? submissionLink : null,
              submittedNote: submissionNote || null,
            }),
          }).catch(() => {});
        }

        // Refresh database state
        await fetchData();
        setShowSuccessOverlay(true);
      } catch (err: any) {
        const errorMsg = err.message || '';
        if (errorMsg.toLowerCase().includes('closed') || errorMsg.includes('assignment_closed')) {
          setClosedModalTaskTitle(selectedAssignment.title || 'Tugas');
          setShowClosedModal(true);
        } else {
          alert('Gagal mengirimkan tugas: ' + (errorMsg || 'Error tidak diketahui'));
        }
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleCloseSuccess = () => {
    setShowSuccessOverlay(false);
    setSelectedAssignment(null);
  };

  if (isEnrollmentsLoading || isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="mt-4 text-xs font-semibold text-primary">Memuat dashboard mahasiswa...</p>
      </div>
    );
  }

  if (enrollmentsError) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 text-center">
        <div className="p-4 bg-white border border-red-200 text-red-700 text-xs rounded-2xl font-medium max-w-sm flex flex-col items-center gap-3 shadow-lg">
          <p className="font-bold text-sm text-red-600">{enrollmentsError}</p>
          <button 
            onClick={fetchEnrollments}
            className="w-full py-2 bg-primary text-white font-bold text-xs rounded-xl hover:bg-primary/95 transition-colors cursor-pointer"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#F7F9FC] min-h-screen text-[#0F172A] flex flex-col font-sans selection:bg-[#008F7A] selection:text-white">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-md border-b border-[#E5EAF1] z-40 px-4 sm:px-6 md:px-8 flex justify-between items-center select-none shadow-xs">
        <div className="flex items-center gap-2.5">
          {selectedAssignment && (
            <button 
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer transition-colors mr-0.5"
              onClick={() => setSelectedAssignment(null)}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-8 h-8 rounded-xl bg-[#0F2747] text-white flex items-center justify-center shadow-xs select-none shrink-0">
            <GraduationCap className="w-4 h-4" />
          </div>
          <h1 className="text-lg md:text-xl font-extrabold text-[#0F2747] tracking-tight select-none">
            SITugas
          </h1>
        </div>
        
        <div className="flex items-center gap-3 sm:gap-4">
          <button 
            type="button" 
            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-full transition-colors relative cursor-pointer"
            title="Notifikasi"
          >
            
          </button>

          <div className="w-8 h-8 rounded-full overflow-hidden bg-[#0F2747] text-white flex items-center justify-center font-bold text-xs select-none shadow-xs">
            {user.avatarUrl ? (
              <img 
                className="w-full h-full object-cover" 
                src={user.avatarUrl} 
                alt={user.name}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <span>{getInitials(user.name)}</span>
            )}
          </div>

          <button 
            className="text-xs font-bold text-red-600 hover:text-red-700 px-1.5 py-1 rounded-lg transition-colors cursor-pointer"
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow pt-20 px-4 sm:px-5 pb-28 max-w-md sm:max-w-lg md:max-w-xl mx-auto w-full space-y-6 font-sans">
        {/* SUBMISSION FLOW COMPONENT SCREEN */}
        {selectedAssignment ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-200">
            {/* Back indicator */}
            <button 
              className="inline-flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-primary mb-4 transition-colors cursor-pointer"
              onClick={() => setSelectedAssignment(null)}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Daftar Tugas
            </button>

            {/* Task Summary Section */}
            <section className="mb-6">
              {selectedAssignment.assignmentStatus === 'closed' && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-2.5 text-amber-800 text-xs font-bold font-sans animate-in fade-in duration-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Pengumpulan untuk tugas ini telah ditutup oleh dosen ({selectedAssignment.title} Closed).</span>
                </div>
              )}
              <div className="flex items-center justify-between mb-3">
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  selectedAssignment.status === 'submitted'
                    ? 'bg-secondary-container/40 text-on-secondary-container border-secondary-container/20'
                    : selectedAssignment.assignmentStatus === 'closed'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-red-50 text-red-600 border-red-100'
                }`}>
                  {selectedAssignment.status === 'submitted' 
                    ? 'Sudah Dikumpulkan' 
                    : selectedAssignment.assignmentStatus === 'closed' 
                    ? 'Tugas Ditutup' 
                    : 'Belum Dikumpulkan'}
                </span>
                <span className="text-on-surface-variant font-semibold text-xs uppercase tracking-wide">
                  Poin Maksimal: {selectedAssignment.points}
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-primary tracking-tight leading-tight">
                {selectedAssignment.title}
              </h2>
              <p className="text-sm text-on-surface-variant font-medium mt-2 leading-relaxed">
                {selectedAssignment.description}
              </p>
            </section>

            {/* Submission Status Indicator */}
            <div className="bg-white border border-outline-variant/40 rounded-2xl p-4 mb-6 auth-card-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-on-surface-variant">Status Pengunggahan</span>
                <span className="text-xs font-bold text-secondary">
                  {uploadProgress}% selesai
                </span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="progress-bar h-full bg-secondary transition-all duration-300" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>

            {/* Tabbed Upload Interface */}
            <div className="bg-white border border-outline-variant/40 rounded-2xl overflow-hidden auth-card-shadow">
              <div className="flex border-b border-outline-variant/20 bg-gray-50/50">
                <button 
                  className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    activeSubmitTab === 'file'
                      ? 'border-primary text-primary bg-white'
                      : 'border-transparent text-on-surface-variant hover:bg-gray-100/50'
                  }`}
                  onClick={() => setActiveSubmitTab('file')}
                >
                  Unggah Dokumen (PDF/Doc)
                </button>
                <button 
                  className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    activeSubmitTab === 'link'
                      ? 'border-primary text-primary bg-white'
                      : 'border-transparent text-on-surface-variant hover:bg-gray-100/50'
                  }`}
                  onClick={() => setActiveSubmitTab('link')}
                >
                  Kumpul Link External
                </button>
              </div>

              <div className="p-6">
                {/* File Upload Section */}
                {activeSubmitTab === 'file' && (
                  <div>
                    {/* Hidden Native File Input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.zip,.rar,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      onChange={handleFileInputChange}
                    />

                    {!simulatedFileName && !selectedFile ? (
                      <div 
                        className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-8 cursor-pointer transition-all group select-none ${
                          isDragOver 
                            ? 'border-primary bg-primary/5 scale-[1.01]' 
                            : 'border-outline-variant/60 hover:bg-slate-50 hover:border-primary/40'
                        }`}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDragOver(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          setIsDragOver(false);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDragOver(false);
                          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                            handleFilePicked(e.dataTransfer.files[0]);
                          }
                        }}
                      >
                        <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-600 mb-3 group-hover:scale-110 transition-transform">
                          <CloudUpload className="w-7 h-7" />
                        </div>
                        <span className="text-xs font-bold text-slate-900 mb-1">
                          Klik untuk memilih file PDF atau seret berkas ke sini
                        </span>
                        <span className="text-[10px] text-slate-500 text-center font-medium">
                          Mendukung format PDF, DOC, DOCX, ZIP (Maksimal 25MB)
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                          className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer shadow-xs"
                        >
                          Pilih Berkas PDF
                        </button>
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-50 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-slate-200/80 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-500 shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-900 truncate block">
                              {selectedFile ? selectedFile.name : (simulatedFileName.split('/').pop()?.replace(/^\d+-/, '') || simulatedFileName)}
                            </span>
                            <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                              {selectedFile 
                                ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Siap diunggah` 
                                : 'Berkas tersimpan di sistem'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {simulatedFileName && !selectedFile && (
                            <button
                              type="button"
                              onClick={() => handleDownloadSubmittedFile(simulatedFileName)}
                              className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
                              title="Unduh Berkas"
                            >
                              <Download className="w-3.5 h-3.5" /> Unduh
                            </button>
                          )}
                          <button 
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                          >
                            Ganti File
                          </button>
                          <button 
                            type="button"
                            className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            onClick={handleRemoveFile}
                          >
                            ✕ Hapus
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Link Submission Section */}
                {activeSubmitTab === 'link' && (
                  <div className="space-y-3">
                    <div className="group">
                      <label className="block text-xs font-semibold text-on-surface-variant mb-2">
                        Link Tugas (Google Drive / GitHub)
                      </label>
                      <div className="flex items-center border border-outline-variant/60 rounded-xl p-3 bg-gray-50 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                        <LinkIcon className="text-on-surface-variant w-4 h-4 mr-2 shrink-0" />
                        <input 
                          className="w-full bg-transparent border-none focus:ring-0 p-0 text-xs font-medium placeholder:text-gray-400 outline-none text-primary" 
                          placeholder="https://github.com/username/project" 
                          type="url"
                          value={submissionLink}
                          onChange={(e) => setSubmissionLink(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Additional Notes */}
            <div className="mt-4 space-y-1">
              <label className="block text-xs font-semibold text-on-surface-variant">Catatan Tambahan (Opsional)</label>
              <textarea 
                className="w-full border border-outline-variant/60 rounded-xl p-3 bg-white focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all text-xs font-medium h-24 resize-none outline-none text-primary" 
                placeholder="Tulis pesan atau catatan singkat untuk dosen di sini..."
                value={submissionNote}
                onChange={(e) => setSubmissionNote(e.target.value)}
              />
            </div>

            {/* Submit Button */}
            <button 
              className={`w-full py-3.5 rounded-full font-bold text-xs mt-6 transition-all flex items-center justify-center gap-2 cursor-pointer auth-card-shadow ${
                selectedAssignment.assignmentStatus === 'closed'
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-primary hover:bg-primary/95 text-white'
              }`}
              onClick={handleSubmitSubmission}
              disabled={isUploading}
            >
              {isUploading 
                ? 'Sedang mengunggah...' 
                : selectedAssignment.assignmentStatus === 'closed'
                ? `Kumpulkan (${selectedAssignment.title} Closed)`
                : 'Kumpulkan Tugas Sekarang'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* MAIN TASKS DASHBOARD */
          <div className="space-y-6">
            {/* MAIN TASKS TAB CONTENT */}
            {activeTab === 'tasks' && (
              <div className="space-y-6">
                {/* Welcome Section (Compact Greeting) */}
                <div className="space-y-0.5 select-none pt-1">
                  <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-1.5">
                    Selamat datang, {user.name}! <span className="inline-block"></span>
                  </h1>
                  <p className="text-xs sm:text-sm font-semibold text-[#64748B]">
                    NIM: {user.idNumber || '-'}
                  </p>
                </div>

                {enrollments.length === 0 ? (
                  <div className="bg-white p-8 rounded-[18px] border border-[#E5EAF1] shadow-xs text-center space-y-3">
                    <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                      <ClipboardList className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A]">Belum ada mata kuliah yang terdaftar.</h3>
                      <p className="text-xs text-[#64748B] mt-1 font-medium">Silakan hubungi dosen atau admin akademik untuk pendaftaran mata kuliah.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 1. CARD MATA KULIAH AKTIF */}
                    <section className="space-y-2.5">
                      <div className="flex items-center justify-between px-0.5 select-none">
                        <h2 className="text-xs sm:text-sm font-bold text-[#0F2747] tracking-wider uppercase">
                          MATA KULIAH AKTIF
                        </h2>
                        {enrollments.length > 1 && (
                          <button
                            onClick={() => setIsCourseModalOpen(true)}
                            className="text-xs font-semibold text-[#008F7A] hover:underline flex items-center gap-0.5 cursor-pointer transition-colors"
                          >
                            Lihat semua <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* 2-Part Card (Navy Header + White 3-Column Body) */}
                      <div className="bg-white rounded-[18px] border border-[#E5EAF1] shadow-xs overflow-hidden">
                        {/* Top: Navy Solid */}
                        <div className="bg-[#0F2747] p-4 sm:p-5 text-white flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white shrink-0">
                              <BookOpen className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm sm:text-base font-bold text-white uppercase tracking-tight truncate leading-tight">
                                {activeCourseName || 'Tidak Ada Mata Kuliah'}
                              </h3>
                              <p className="text-xs text-slate-300 font-medium mt-0.5 truncate">
                                {activeCourseCode} · 2 SKS
                              </p>
                            </div>
                          </div>

                          {/* Aktif Badge */}
                          <div className="px-3 py-1 bg-white text-[#008F7A] rounded-full text-xs font-bold flex items-center gap-1.5 shadow-sm shrink-0">
                            <span className="w-2 h-2 rounded-full bg-[#008F7A]"></span>
                            Aktif
                          </div>
                        </div>

                        {/* Bottom: 3-Column Info in White */}
                        <div className="grid grid-cols-3 divide-x divide-[#E5EAF1] p-3.5 sm:p-4 text-center bg-white">
                          <div className="flex flex-col items-center justify-center px-1">
                            <GraduationCap className="w-4 h-4 text-[#008F7A] mb-1" />
                            <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider">KODE MK</span>
                            <span className="text-xs sm:text-sm font-bold text-[#0F172A] mt-0.5 truncate max-w-full">
                              {activeCourseCode || '-'}
                            </span>
                          </div>
                          <div className="flex flex-col items-center justify-center px-1">
                            <Users className="w-4 h-4 text-[#008F7A] mb-1" />
                            <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider">KODE KELAS</span>
                            <span className="text-xs sm:text-sm font-bold text-[#0F172A] mt-0.5 truncate max-w-full">
                              {activeClassName || '-'}
                            </span>
                          </div>
                          <div className="flex flex-col items-center justify-center px-1">
                            <MapPin className="w-4 h-4 text-[#008F7A] mb-1" />
                            <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider">RUANGAN</span>
                            <span className="text-xs sm:text-sm font-bold text-[#0F172A] mt-0.5 truncate max-w-full">
                              {activeRoomName || '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* 2. CARD PROGRES PERKULIAHAN */}
                    <section className="space-y-2.5">
                      <h2 className="text-xs sm:text-sm font-bold text-[#0F2747] tracking-wider uppercase px-0.5 select-none">
                        PROGRES PERKULIAHAN
                      </h2>

                      <div className="bg-white rounded-[18px] border border-[#E5EAF1] shadow-xs p-4 sm:p-5 space-y-4">
                        {/* Top: Left Stats & Right Circular Progress Ring */}
                        <div className="flex items-center justify-between gap-4">
                          {/* Left: Tugas selesai */}
                          <div className="space-y-1">
                            <span className="text-xs font-semibold text-[#64748B] block">Tugas selesai</span>
                            <div className="flex items-baseline gap-1">
                              <span className="text-3xl font-bold text-[#008F7A] leading-none">
                                {momentumStats.completed}
                              </span>
                              <span className="text-xl font-bold text-slate-300">
                                / {momentumStats.total}
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-[#0F172A] pt-1">
                              {momentumStats.completed === momentumStats.total && momentumStats.total > 0
                                ? 'Semua tugas telah selesai! 🎉'
                                : momentumStats.total === 0
                                ? 'Belum ada tugas aktif'
                                : `${momentumStats.pending} tugas belum dikerjakan`}
                            </p>
                          </div>

                          {/* Right: Circular Progress Ring */}
                          <div className="w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center relative shrink-0">
                            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                              <circle
                                cx="50"
                                cy="50"
                                r="38"
                                fill="transparent"
                                stroke="#E5EAF1"
                                strokeWidth="8"
                              />
                              <circle
                                cx="50"
                                cy="50"
                                r="38"
                                fill="transparent"
                                stroke="#008F7A"
                                strokeWidth="8"
                                strokeLinecap="round"
                                strokeDasharray="238.76"
                                strokeDashoffset={238.76 - (238.76 * momentumStats.percentage) / 100}
                                className="transition-all duration-700 ease-out"
                              />
                            </svg>
                            <div className="absolute flex flex-col items-center justify-center text-center">
                              <span className="text-lg sm:text-xl font-bold text-[#0F172A] leading-tight">
                                {momentumStats.percentage}%
                              </span>
                              <span className="text-[10px] text-[#64748B] font-medium leading-none">
                                Selesai
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Bottom: 2 Compact Stat Boxes */}
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          {/* Box 1: Sisa Tugas */}
                          <div className="bg-[#F0FDF9] border border-[#CCFBF1] rounded-2xl p-3 sm:p-3.5 flex items-center gap-2.5 sm:gap-3">
                            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-[#008F7A] shadow-xs shrink-0">
                              <ClipboardList className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <span className="text-lg sm:text-xl font-bold text-[#0F172A] leading-tight block">
                                {momentumStats.pending}
                              </span>
                              <span className="text-xs font-bold text-[#0F172A] block leading-tight truncate">
                                Sisa Tugas
                              </span>
                              <span className="text-[10px] text-[#64748B] font-medium block truncate">
                                Tugas belum dikerjakan
                              </span>
                            </div>
                          </div>

                          {/* Box 2: Pertemuan Kuliah */}
                          <div className="bg-[#FAF5FF] border border-[#F3E8FF] rounded-2xl p-3 sm:p-3.5 flex items-center gap-2.5 sm:gap-3">
                            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-[#8B5CF6] shadow-xs shrink-0">
                              <Calendar className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <span className="text-lg sm:text-xl font-bold text-[#0F172A] leading-tight block">
                                {courseMeetings.length}
                              </span>
                              <span className="text-xs font-bold text-[#0F172A] block leading-tight truncate">
                                Pertemuan Kuliah
                              </span>
                              <span className="text-[10px] text-[#64748B] font-medium block truncate">
                                Pertemuan minggu ini
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* 3. TUGAS ANDA */}
                    <section className="space-y-2.5">
                      <div className="flex items-center justify-between px-0.5 select-none">
                        <h2 className="text-xs sm:text-sm font-bold text-[#0F2747] tracking-wider uppercase">
                          TUGAS ANDA
                        </h2>
                        <span className="text-xs font-semibold text-[#008F7A] flex items-center gap-0.5">
                          {studentTasks.length} tugas <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>

                      <div className="space-y-3">
                        {studentTasks.length === 0 ? (
                          <div className="bg-white rounded-[18px] border border-dashed border-[#E5EAF1] p-8 text-center space-y-2">
                            <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                              <ClipboardList className="w-6 h-6" />
                            </div>
                            <p className="text-xs font-bold text-[#0F172A]">Belum ada tugas yang tersedia</p>
                            <p className="text-[11px] text-[#64748B]">Tugas untuk mata kuliah ini akan muncul di sini.</p>
                          </div>
                        ) : (
                          studentTasks.map((assignment, idx) => {
                            const isSubmitted = assignment.status === 'submitted';
                            const isClosed = assignment.assignmentStatus === 'closed';

                            return (
                              <div
                                key={assignment.id}
                                onClick={() => handleSelectAssignment(assignment)}
                                className="bg-white rounded-[18px] border border-[#E5EAF1] shadow-xs p-4 space-y-3 hover:border-[#008F7A]/30 transition-all cursor-pointer select-none active:scale-[0.99]"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-3 min-w-0">
                                    <div className="w-11 h-11 rounded-xl bg-blue-50/80 text-[#0F2747] flex items-center justify-center shrink-0">
                                      <FileText className="w-5 h-5 text-[#0F2747]" />
                                    </div>
                                    <div className="min-w-0">
                                      <h3 className="text-sm font-bold text-[#0F172A] leading-snug truncate">
                                        {assignment.title}
                                      </h3>
                                      <p className="text-xs text-[#64748B] font-medium mt-0.5">
                                        Pertemuan ke-{idx + 1}
                                      </p>
                                      <div className="flex items-center gap-1.5 mt-2 text-xs font-medium text-[#64748B]">
                                        <Calendar className="w-3.5 h-3.5 text-[#64748B]" />
                                        <span>
                                          Batas:{' '}
                                          <strong className="text-[#008F7A] font-bold">
                                            {new Date(assignment.deadline).toLocaleDateString('id-ID', {
                                              day: 'numeric',
                                              month: 'long',
                                              year: 'numeric',
                                            })}{' '}
                                            {new Date(assignment.deadline).toLocaleTimeString('id-ID', {
                                              hour: '2-digit',
                                              minute: '2-digit',
                                            })}
                                          </strong>
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Status Badge */}
                                  <div className="flex flex-col items-end gap-2 shrink-0">
                                    {isSubmitted ? (
                                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[#E6F7F5] text-[#008F7A] border border-[#CCFBF1]">
                                        SELESAI
                                      </span>
                                    ) : isClosed ? (
                                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                                        DITUTUP
                                      </span>
                                    ) : (
                                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                                        BELUM DIKUMPULKAN
                                      </span>
                                    )}

                                    {isSubmitted && (
                                      <div className="w-6 h-6 rounded-full bg-[#E6F7F5] text-[#008F7A] flex items-center justify-center">
                                        <CheckCircle className="w-4 h-4" />
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Bottom Row Link */}
                                <div className="border-t border-[#E5EAF1] pt-2.5 flex items-center justify-between text-xs font-bold text-[#0F2747]">
                                  <span className="flex items-center gap-1.5 text-[#0F2747]">
                                    <ClipboardList className="w-4 h-4 text-[#008F7A]" /> Lihat Detail
                                  </span>
                                  <ChevronRight className="w-4 h-4 text-[#64748B]" />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </section>
                  </>
                )}
              </div>
            )}

            {/* HISTORY TAB CONTENT */}
            {activeTab === 'history' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <h2 className="text-lg font-bold text-primary">Riwayat Tugas & Nilai</h2>
                <p className="text-xs text-on-surface-variant font-medium">Tinjau semua tugas yang sudah Anda kumpulkan serta hasil penilaian dosen.</p>
                
                <div className="space-y-3">
                  {studentTasks.filter(t => t.status === 'submitted').length === 0 ? (
                    <p className="text-xs text-on-surface-variant font-medium text-center py-8 bg-white rounded-xl border border-dashed border-outline-variant">
                      Belum ada tugas yang dikumpulkan.
                    </p>
                  ) : (
                    studentTasks.filter(t => t.status === 'submitted').map(task => (
                      <div key={task.id} className="p-4 bg-white rounded-xl border border-outline-variant/30 auth-card-shadow space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-xs font-bold text-primary">{task.title}</h4>
                            <p className="text-[10px] text-on-surface-variant font-semibold mt-0.5">{task.courseCode}</p>
                          </div>
                          <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase ${
                            task.grade !== undefined && task.grade !== null
                              ? 'bg-secondary/10 text-secondary border border-secondary/20'
                              : 'bg-yellow-50 text-yellow-600 border border-yellow-100'
                          }`}>
                            {task.grade !== undefined && task.grade !== null ? 'Sudah Dinilai' : 'Belum Dinilai'}
                          </span>
                        </div>
                        
                        {task.submittedFile && (
                          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg text-[10px] font-semibold text-primary">
                            <FileText className="w-4 h-4 text-secondary" />
                            <span>File: {task.submittedFile}</span>
                          </div>
                        )}

                        {task.submittedLink && (
                          <a href={task.submittedLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg text-[10px] font-semibold text-secondary hover:underline">
                            <LinkIcon className="w-4 h-4 text-primary" />
                            <span>Link: {task.submittedLink}</span>
                          </a>
                        )}

                        {task.feedback && (
                          <div className="bg-amber-50/50 border border-amber-100 p-2.5 rounded-lg text-[10px] text-amber-800 leading-relaxed font-semibold">
                            <strong className="block text-[11px] mb-0.5 text-amber-900">Catatan Dosen:</strong>
                            "{task.feedback}"
                          </div>
                        )}

                        <div className="border-t border-outline-variant/10 pt-2.5 flex items-center justify-between text-[11px] font-semibold text-on-surface-variant">
                          <span>Nilai: <strong className="text-primary text-xs">{task.grade !== undefined && task.grade !== null ? `${task.grade} / ${task.points}` : '—'}</strong></span>
                          <span>Kumpul: {new Date(task.submittedAt || '').toLocaleDateString('id-ID')}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* MATERIALS TAB CONTENT */}
            {activeTab === 'materials' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {selectedMeeting === null ? (
                  <>
                    <div>
                      <h2 className="text-lg font-bold text-primary">Materi Perkuliahan</h2>
                      <p className="text-xs text-on-surface-variant font-medium mt-0.5">Akses berkas materi, rekaman, dan rujukan perkuliahan yang dipublikasikan oleh dosen.</p>
                    </div>

                    {isMeetingsLoading ? (
                      <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant gap-2 bg-white rounded-2xl border border-outline-variant/30 auth-card-shadow">
                        <Loader2 className="w-6 h-6 animate-spin text-secondary" />
                        <span className="text-xs font-bold font-sans">Memuat daftar pertemuan...</span>
                      </div>
                    ) : courseMeetings.length === 0 ? (
                      <div className="bg-white p-8 rounded-2xl border border-outline-variant/30 auth-card-shadow text-center space-y-3">
                        <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-on-surface-variant">
                          <BookOpen className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-primary">Belum ada pertemuan dipublikasikan</h3>
                          <p className="text-xs text-on-surface-variant mt-1 font-medium">Dosen pengampu belum memublikasikan materi kuliah untuk kelas ini.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 font-sans">
                        {courseMeetings.map((meet) => (
                          <div 
                            key={meet.id}
                            onClick={() => setSelectedMeeting(meet)}
                            className="bg-white p-5 rounded-2xl border border-outline-variant/30 auth-card-shadow hover:border-primary/20 cursor-pointer transition-all active:scale-[0.99] flex flex-col justify-between"
                          >
                            <div className="space-y-1.5">
                              <div className="flex justify-between items-center">
                                <span className="px-2.5 py-0.5 text-[9px] font-bold rounded-full bg-secondary/10 text-secondary border border-secondary/20 tracking-wider">
                                  PERTEMUAN {meet.meeting_number}
                                </span>
                                <span className="text-[10px] text-on-surface-variant font-semibold">
                                  {new Date(meet.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                                </span>
                              </div>
                              <h3 className="text-sm font-bold text-primary">{meet.title}</h3>
                              <p className="text-xs text-on-surface-variant font-medium line-clamp-2">
                                {meet.description || 'Tidak ada deskripsi rujukan tambahan.'}
                              </p>
                            </div>
                            <div className="border-t border-outline-variant/10 pt-3 mt-4 flex items-center justify-between text-xs font-bold text-secondary">
                              <span>Lihat Materi & Tautan</span>
                              <ArrowRight className="w-4 h-4" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setSelectedMeeting(null)}
                        className="p-2 bg-white rounded-xl border border-outline-variant/30 hover:bg-slate-50 text-primary transition-all cursor-pointer shadow-sm"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <div>
                        <span className="text-[10px] font-semibold text-secondary tracking-wider uppercase">Materi Pertemuan {selectedMeeting.meeting_number}</span>
                        <h2 className="text-base font-bold text-primary leading-tight">{selectedMeeting.title}</h2>
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-outline-variant/30 auth-card-shadow space-y-3 font-sans">
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider border-b border-outline-variant/15 pb-2">Deskripsi Rujukan</h4>
                      <p className="text-xs text-on-surface-variant font-medium leading-relaxed whitespace-pre-wrap">
                        {selectedMeeting.description || 'Tidak ada deskripsi rujukan tambahan untuk pertemuan ini.'}
                      </p>
                    </div>

                    <div className="space-y-3 font-sans">
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider px-1">Materi & Tautan Pembelajaran</h4>

                      {isMaterialsLoading ? (
                        <div className="flex flex-col items-center justify-center py-8 text-on-surface-variant gap-2 bg-white rounded-2xl border border-outline-variant/30 auth-card-shadow">
                          <Loader2 className="w-5 h-5 animate-spin text-secondary" />
                          <span className="text-[11px] font-bold">Memuat berkas materi...</span>
                        </div>
                      ) : meetingMaterials.length === 0 ? (
                        <p className="text-xs text-on-surface-variant font-medium text-center py-8 bg-white rounded-2xl border border-dashed border-outline-variant">
                          Belum ada berkas atau tautan rujukan yang ditambahkan untuk pertemuan ini.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 gap-3">
                          {meetingMaterials.map((mat) => {
                            if (mat.material_type === 'file') {
                              return (
                                <div 
                                  key={mat.id}
                                  className="bg-white p-4 rounded-xl border border-outline-variant/30 auth-card-shadow flex items-center justify-between gap-4"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-primary shrink-0">
                                      {mat.file_path?.endsWith('.pdf') ? (
                                        <FileText className="w-5 h-5 text-red-500" />
                                      ) : (
                                        <FileSpreadsheet className="w-5 h-5 text-green-600" />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <h4 className="text-xs font-bold text-primary truncate max-w-[200px] sm:max-w-md">{mat.title}</h4>
                                      <p className="text-[9px] text-on-surface-variant font-semibold mt-0.5 capitalize">
                                        Berkas Unduhan
                                      </p>
                                    </div>
                                  </div>

                                  <button
                                    onClick={() => handleDownloadMaterialFile(mat.file_path, mat.title)}
                                    className="p-2 text-secondary bg-secondary/10 border border-secondary/20 rounded-xl hover:bg-secondary/15 transition-all cursor-pointer shrink-0"
                                    title="Unduh Berkas"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                </div>
                              );
                            } else if (mat.material_type === 'link') {
                              return (
                                <div 
                                  key={mat.id}
                                  className="bg-white p-4 rounded-xl border border-outline-variant/30 auth-card-shadow flex items-center justify-between gap-4"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-primary shrink-0">
                                      <Link2 className="w-5 h-5 text-primary" />
                                    </div>
                                    <div className="min-w-0">
                                      <h4 className="text-xs font-bold text-primary truncate max-w-[200px] sm:max-w-md">{mat.title}</h4>
                                      <p className="text-[9px] text-on-surface-variant font-semibold mt-0.5 capitalize">
                                        Tautan Eksternal
                                      </p>
                                    </div>
                                  </div>

                                  <button
                                    onClick={() => handleOpenExternalLink(mat.external_url)}
                                    className="p-2 text-secondary bg-secondary/10 border border-secondary/20 rounded-xl hover:bg-secondary/15 transition-all cursor-pointer shrink-0"
                                    title="Buka Tautan"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </button>
                                </div>
                              );
                            } else {
                              return (
                                <div 
                                  key={mat.id}
                                  className="bg-white p-4 rounded-xl border border-dashed border-red-200 bg-red-50/10 flex items-center justify-between gap-4"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-500 shrink-0">
                                      <FileText className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                      <h4 className="text-xs font-bold text-primary truncate max-w-[200px] sm:max-w-md">{mat.title}</h4>
                                      <p className="text-[9px] text-red-500 font-semibold mt-0.5 capitalize">
                                        Jenis materi tidak didukung.
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* PROFILE TAB CONTENT */}
            {activeTab === 'profile' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="bg-white p-6 rounded-2xl border border-outline-variant/30 auth-card-shadow text-center space-y-4">
                  <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-[#0B2147] to-[#1E3A8A] text-white mx-auto flex items-center justify-center font-bold text-2xl shadow-md select-none tracking-wider">
                    {user.avatarUrl ? (
                      <img 
                        className="w-full h-full object-cover" 
                        src={user.avatarUrl} 
                        alt={user.name} 
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span>{getInitials(user.name)}</span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-primary">{user.name}</h3>
                    <p className="text-xs text-on-surface-variant font-semibold mt-0.5">{user.email}</p>
                  </div>
                  
                  <div className="border-t border-outline-variant/15 pt-4 text-left space-y-3">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-on-surface-variant">NIM Mahasiswa</span>
                      <span className="text-primary font-bold">{user.idNumber}</span>
                    </div>
                    {activeCourseName && (
                      <>
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-on-surface-variant">Mata Kuliah Aktif</span>
                          <span className="text-primary font-bold">{activeCourseName}</span>
                        </div>
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-on-surface-variant">Kelas</span>
                          <span className="text-primary font-bold">Kelas {activeClassName}</span>
                        </div>
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-on-surface-variant">Total Pertemuan</span>
                          <span className="text-secondary font-bold">{courseMeetings.length} Pertemuan</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-outline-variant/30 auth-card-shadow">
                  <button 
                    className="w-full py-2.5 border border-red-200 text-red-500 hover:bg-red-50 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    onClick={onLogout}
                  >
                    Logout Sesi Mahasiswa
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* SUCCESS POPUP OVERLAY */}
      {showSuccessOverlay && (
        <div className="fixed inset-0 bg-primary/30 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm flex flex-col items-center text-center auth-card-shadow animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-secondary/10 text-secondary rounded-full flex items-center justify-center mb-4 select-none">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-bold text-primary mb-6">Tugas Berhasil Dikumpulkan</h3>
            <button 
              className="w-full bg-secondary hover:bg-secondary/95 text-white py-3 rounded-full font-bold text-xs transition-colors cursor-pointer auth-card-shadow"
              onClick={handleCloseSuccess}
            >
              Kembali ke Dashboard
            </button>
          </div>
        </div>
      )}

      {/* CLOSED TASK WARNING POPUP MODAL */}
      {showClosedModal && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm flex flex-col items-center text-center auth-card-shadow animate-in fade-in zoom-in-95 duration-200 border border-amber-200">
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mb-4 select-none border border-amber-100">
              <AlertTriangle className="w-9 h-9" />
            </div>
            <h3 className="text-lg font-bold text-primary mb-2">
              {closedModalTaskTitle} Closed
            </h3>
            <p className="text-xs text-on-surface-variant font-medium leading-relaxed mb-6">
              Pengumpulan untuk tugas ini telah ditutup oleh dosen pengampu. Anda tidak dapat lagi mengirimkan tugas ini.
            </p>
            <button 
              className="w-full bg-primary hover:bg-primary/95 text-white py-3 rounded-full font-bold text-xs transition-colors cursor-pointer auth-card-shadow"
              onClick={() => {
                setShowClosedModal(false);
                setSelectedAssignment(null);
              }}
            >
              Tutup & Kembali ke Daftar Tugas
            </button>
          </div>
        </div>
      )}

      {/* Floating Action Button (FAB) (Only on Tasks Main screen) */}
      {!selectedAssignment && activeTab === 'tasks' && (
        <button 
          className="fixed right-5 bottom-20 w-13 h-13 bg-[#0F2747] hover:bg-[#091B33] text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all z-30 cursor-pointer"
          title="Kumpul Tugas"
          onClick={() => {
            const firstUnsubmitted = studentTasks.find(t => t.status !== 'submitted');
            if (firstUnsubmitted) {
              handleSelectAssignment(firstUnsubmitted);
            } else if (studentTasks.length > 0) {
              handleSelectAssignment(studentTasks[0]);
            } else {
              alert('Semua tugas untuk mata kuliah ini sudah dikumpulkan! Luar biasa.');
            }
          }}
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </button>
      )}

      {/* Course Selection Modal */}
      {isCourseModalOpen && (
        <div className="fixed inset-0 bg-[#0F2747]/40 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-md rounded-t-[24px] sm:rounded-[20px] p-5 space-y-4 max-h-[80vh] overflow-y-auto shadow-2xl border border-[#E5EAF1]">
            <div className="flex items-center justify-between border-b border-[#E5EAF1] pb-3 select-none">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#008F7A]" />
                <h3 className="text-sm font-bold text-[#0F2747]">Pilih Mata Kuliah</h3>
              </div>
              <button
                onClick={() => setIsCourseModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {enrollments.map((env) => {
                const isSelected = selectedEnrollment?.id === env.id;
                return (
                  <div
                    key={env.id}
                    onClick={() => {
                      setSelectedEnrollment(env);
                      setIsCourseModalOpen(false);
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-[#F0FDF9] border-[#008F7A] ring-1 ring-[#008F7A]'
                        : 'bg-white border-[#E5EAF1] hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <h4 className="text-xs font-bold text-[#0F172A]">{env.courseName}</h4>
                      <p className="text-[11px] text-[#64748B] mt-0.5">
                        {env.courseCode} · Kelas {env.className} · Ruang {env.roomName || '-'}
                      </p>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="w-5 h-5 text-[#008F7A] shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-[#E5EAF1] flex justify-around items-center px-4 z-40 select-none shadow-lg rounded-t-[18px] font-sans">
        <button 
          className={`flex flex-col items-center justify-center px-3 py-1 transition-all cursor-pointer relative ${
            activeTab === 'tasks' && !selectedAssignment
              ? 'text-[#008F7A] font-bold' 
              : 'text-[#64748B] hover:text-[#0F2747]'
          }`}
          onClick={() => startTransition(() => { setActiveTab('tasks'); setSelectedAssignment(null); })}
        >
          {activeTab === 'tasks' && !selectedAssignment && (
            <span className="absolute top-0 w-8 h-1 bg-[#008F7A] rounded-full"></span>
          )}
          <ClipboardList className="w-5 h-5" />
          <span className="text-[10px] font-bold mt-1">Daftar Tugas</span>
        </button>
        <button 
          className={`flex flex-col items-center justify-center px-3 py-1 transition-all cursor-pointer relative ${
            activeTab === 'materials' 
              ? 'text-[#008F7A] font-bold' 
              : 'text-[#64748B] hover:text-[#0F2747]'
          }`}
          onClick={() => startTransition(() => { setActiveTab('materials'); setSelectedAssignment(null); })}
        >
          {activeTab === 'materials' && (
            <span className="absolute top-0 w-8 h-1 bg-[#008F7A] rounded-full"></span>
          )}
          <BookOpen className="w-5 h-5" />
          <span className="text-[10px] font-bold mt-1">Materi Kuliah</span>
        </button>
        <button 
          className={`flex flex-col items-center justify-center px-3 py-1 transition-all cursor-pointer relative ${
            activeTab === 'history' 
              ? 'text-[#008F7A] font-bold' 
              : 'text-[#64748B] hover:text-[#0F2747]'
          }`}
          onClick={() => startTransition(() => { setActiveTab('history'); setSelectedAssignment(null); })}
        >
          {activeTab === 'history' && (
            <span className="absolute top-0 w-8 h-1 bg-[#008F7A] rounded-full"></span>
          )}
          <History className="w-5 h-5" />
          <span className="text-[10px] font-bold mt-1">Riwayat & Nilai</span>
        </button>
        <button 
          className={`flex flex-col items-center justify-center px-3 py-1 transition-all cursor-pointer relative ${
            activeTab === 'profile' 
              ? 'text-[#008F7A] font-bold' 
              : 'text-[#64748B] hover:text-[#0F2747]'
          }`}
          onClick={() => startTransition(() => { setActiveTab('profile'); setSelectedAssignment(null); })}
        >
          {activeTab === 'profile' && (
            <span className="absolute top-0 w-8 h-1 bg-[#008F7A] rounded-full"></span>
          )}
          <UserIcon className="w-5 h-5" />
          <span className="text-[10px] font-bold mt-1">Profil</span>
        </button>
      </nav>
    </div>
  );
}
