import React, { useState, useEffect, startTransition, useMemo } from 'react';
import { 
  Bell, CheckCircle, ArrowRight, ArrowLeft, CloudUpload, FileText, 
  Link as LinkIcon, History, User as UserIcon, Calendar, Compass, FileCheck2, ClipboardList,
  BookOpen, Loader2, Download, ExternalLink, FileSpreadsheet, Link2
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
  const [submissionLink, setSubmissionLink] = useState('');
  const [submissionNote, setSubmissionNote] = useState('');
  const [integrityChecked, setIntegrityChecked] = useState(false);

  // Simulated upload state
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

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
      setSimulatedFileName(assignment.submittedFile || '');
      setSubmissionLink(assignment.submittedLink || '');
      setSubmissionNote(assignment.submittedNote || '');
      setUploadProgress(assignment.status === 'submitted' ? 100 : 0);
      setIsUploading(false);
      setIntegrityChecked(assignment.status === 'submitted');
    });
  };

  // Simulates loading a dummy document
  const handleLoadDummyFile = () => {
    setSimulatedFileName('comprehensive_analysis_routing_v3.pdf');
    setIsUploading(true);
    setUploadProgress(0);
    let current = 0;
    const interval = setInterval(() => {
      current += 25;
      setUploadProgress(current);
      if (current >= 100) {
        clearInterval(interval);
        setIsUploading(false);
      }
    }, 120);
  };

  const handleRemoveFile = () => {
    setSimulatedFileName('');
    setUploadProgress(0);
  };

  // Handle Complete Submission
  const handleSubmitSubmission = async () => {
    if (!integrityChecked) {
      alert('Konfirmasikan kejujuran akademik dengan mencentang kotak verifikasi.');
      return;
    }
    if (activeSubmitTab === 'file' && !simulatedFileName) {
      alert('Silakan unggah dokumen atau beralih ke kumpul link.');
      return;
    }
    if (activeSubmitTab === 'link' && !submissionLink.trim()) {
      alert('Silakan masukkan URL link pengumpulan yang valid.');
      return;
    }

    if (selectedAssignment) {
      try {
        setIsUploading(true);
        const uid = user.uid;

        // Check if there is already a submission for this assignment by this student
        const { data: existing, error: checkError } = await supabase
          .from('submissions')
          .select('id')
          .eq('assignment_id', selectedAssignment.id)
          .eq('student_id', uid);

        if (checkError) throw checkError;

        if (existing && existing.length > 0) {
          // Update existing submission
          const { error: updateError } = await supabase
            .from('submissions')
            .update({
              submitted_at: new Date().toISOString(),
              file_path: activeSubmitTab === 'file' ? simulatedFileName : null,
              submitted_link: activeSubmitTab === 'link' ? submissionLink : null,
              submitted_note: submissionNote || null,
            })
            .eq('id', existing[0].id);

          if (updateError) throw updateError;
        } else {
          // Insert new submission
          const { error: insertError } = await supabase
            .from('submissions')
            .insert({
              assignment_id: selectedAssignment.id,
              student_id: uid,
              submitted_at: new Date().toISOString(),
              file_path: activeSubmitTab === 'file' ? simulatedFileName : null,
              submitted_link: activeSubmitTab === 'link' ? submissionLink : null,
              submitted_note: submissionNote || null,
            });

          if (insertError) throw insertError;
        }

        // Refresh database state
        await fetchData();
        setShowSuccessOverlay(true);
      } catch (err: any) {
        alert('Gagal mengirimkan tugas: ' + err.message);
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
    <div className="bg-background min-h-screen text-on-background flex flex-col">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white/90 backdrop-blur-md shadow-sm border-b border-outline-variant/10 z-40 px-4 md:px-8 flex justify-between items-center select-none">
        <div className="flex items-center gap-3">
          {selectedAssignment && (
            <button 
              className="p-1.5 hover:bg-gray-100 rounded-lg text-on-surface-variant cursor-pointer transition-colors mr-1"
              onClick={() => setSelectedAssignment(null)}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-lg md:text-xl font-bold text-primary tracking-tight">SITugas</h1>
          {!selectedAssignment && activeCourseName && (
            <span className="hidden sm:inline-block px-2.5 py-0.5 bg-secondary-container/30 text-on-secondary-container text-[11px] font-bold rounded-full border border-secondary-container/20">
              {activeCourseName} - Kelas {activeClassName}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-on-surface-variant cursor-pointer p-1.5 hover:bg-gray-50 rounded-full transition-colors relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </span>
          <div className="flex items-center gap-3 border-l border-outline-variant/20 pl-4">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant select-none">
              <img 
                className="w-full h-full object-cover" 
                src={user.avatarUrl || undefined} 
                alt="Student profile"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="hidden sm:block text-left select-none">
              <p className="text-xs font-bold text-primary">{user.name}</p>
              {activeClassName && (
                <p className="text-[10px] text-on-surface-variant font-medium">Kelas {activeClassName}</p>
              )}
            </div>
            <button 
              className="text-xs font-bold text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
              onClick={onLogout}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow pt-20 px-4 md:px-8 pb-28 max-w-lg sm:max-w-xl md:max-w-4xl mx-auto w-full space-y-6">
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
              <div className="flex items-center justify-between mb-3">
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  selectedAssignment.status === 'submitted'
                    ? 'bg-secondary-container/40 text-on-secondary-container border-secondary-container/20'
                    : 'bg-red-50 text-red-600 border-red-100'
                }`}>
                  {selectedAssignment.status === 'submitted' ? 'Sudah Dikumpulkan' : 'Belum Dikumpulkan'}
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
                    {!simulatedFileName ? (
                      <div 
                        className="flex flex-col items-center justify-center border-2 border-dashed border-outline-variant/60 rounded-xl p-8 cursor-pointer hover:bg-gray-50 hover:border-primary/40 transition-all group active:scale-[0.98]"
                        onClick={handleLoadDummyFile}
                      >
                        <CloudUpload className="text-primary w-10 h-10 mb-3 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-bold text-primary mb-1">Klik untuk mensimulasikan unggah PDF</span>
                        <span className="text-[10px] text-on-surface-variant text-center font-medium">
                          Maksimal ukuran file: 25MB
                        </span>
                      </div>
                    ) : (
                      <div className="p-4 bg-gray-50 rounded-xl flex items-center justify-between border border-outline-variant/30 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="text-secondary w-5 h-5 shrink-0" />
                          <span className="text-xs font-semibold text-primary truncate max-w-[240px]">
                            {simulatedFileName}
                          </span>
                        </div>
                        <button 
                          className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                          onClick={handleRemoveFile}
                        >
                          ✕ Hapus
                        </button>
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

            {/* Guidelines checkbox */}
            <div className="mt-6 p-4 bg-gray-50 border border-outline-variant/20 rounded-xl flex items-start gap-3 select-none">
              <input 
                className="mt-0.5 rounded border-outline-variant text-secondary focus:ring-secondary shrink-0 cursor-pointer" 
                id="confirmCheck" 
                type="checkbox"
                checked={integrityChecked}
                onChange={(e) => setIntegrityChecked(e.target.checked)}
              />
              <label className="text-xs font-medium text-on-surface-variant cursor-pointer leading-relaxed" htmlFor="confirmCheck">
                Saya menyatakan bahwa ini adalah karya asli saya dan mengikuti pedoman integritas akademik yang berlaku.
              </label>
            </div>

            {/* Submit Button */}
            <button 
              className="w-full bg-primary hover:bg-primary/95 text-white py-3.5 rounded-full font-bold text-xs mt-6 transition-all flex items-center justify-center gap-2 cursor-pointer auth-card-shadow"
              onClick={handleSubmitSubmission}
              disabled={isUploading}
            >
              {isUploading ? 'Sedang mengunggah...' : 'Kumpulkan Tugas Sekarang'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* MAIN TASKS DASHBOARD */
          <div className="space-y-6">
            {/* MAIN TASKS TAB CONTENT */}
            {activeTab === 'tasks' && (
              <div className="space-y-6">
                {/* Welcome Banner */}
                <div className="bg-white p-5 rounded-2xl border border-outline-variant/30 auth-card-shadow flex flex-col md:flex-row md:items-center justify-between gap-4 select-none">
                  <div>
                    <h2 className="text-base font-bold text-primary">Selamat Datang, {user.name}!</h2>
                    <p className="text-xs text-on-surface-variant font-semibold mt-0.5">NIM: {user.idNumber}</p>
                  </div>
                  <div className="text-xs text-on-surface-variant font-semibold bg-slate-50 px-3 py-1.5 rounded-xl border border-outline-variant/10">
                    Sesi Mahasiswa Aktif
                  </div>
                </div>

                {enrollments.length === 0 ? (
                  <div className="bg-white p-8 rounded-2xl border border-outline-variant/30 auth-card-shadow text-center space-y-4">
                    <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-on-surface-variant">
                      <ClipboardList className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-primary">Belum ada mata kuliah yang terdaftar.</h3>
                      <p className="text-xs text-on-surface-variant mt-1 font-medium">Silakan hubungi dosen atau admin akademik untuk pendaftaran mata kuliah.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Enrolled Courses list */}
                    <section className="space-y-3">
                      <h3 className="text-xs font-bold text-primary uppercase tracking-wider px-1">Mata Kuliah Terdaftar</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {enrollments.map((env) => {
                          const isSelected = selectedEnrollment?.id === env.id;
                          return (
                            <div
                              key={env.id}
                              onClick={() => setSelectedEnrollment(env)}
                              className={`p-4 rounded-xl border transition-all cursor-pointer select-none relative overflow-hidden flex flex-col justify-between h-36 ${
                                isSelected
                                  ? 'bg-white border-primary ring-2 ring-primary/15 shadow-md shadow-primary/5'
                                  : 'bg-white border-outline-variant/30 hover:border-primary/20 shadow-sm hover:shadow-md'
                              }`}
                            >
                              {isSelected && (
                                <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-full flex items-center justify-center pl-4 pb-4">
                                  <span className="text-primary text-[10px] font-bold">Aktif</span>
                                </div>
                              )}
                              <div>
                                <h4 className="text-xs md:text-sm font-bold text-primary line-clamp-2 pr-10 leading-snug">
                                  {env.courseName}
                                </h4>
                                <p className="text-[10px] text-on-surface-variant font-semibold mt-1">Kode MK: {env.courseCode}</p>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/10 text-[10px] font-semibold text-on-surface-variant">
                                <div>
                                  <span className="block text-[8px] text-on-surface-variant/70 uppercase">Kode Kelas</span>
                                  <span className="text-primary font-bold">{env.className}</span>
                                </div>
                                <div>
                                  <span className="block text-[8px] text-on-surface-variant/70 uppercase">Ruangan</span>
                                  <span className="text-secondary font-bold">{env.roomName || '—'}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    {/* Hero Stats Section */}
                    <section className="grid grid-cols-1 gap-4">
                      <div className="bg-white p-5 rounded-2xl border border-outline-variant/30 auth-card-shadow relative overflow-hidden group select-none">
                        <div className="absolute -right-12 -top-12 w-32 h-32 bg-secondary/10 rounded-full blur-3xl group-hover:opacity-20 transition-opacity"></div>
                        <h2 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-3">
                          Momentum Akademik ({activeCourseName})
                        </h2>
                        <div className="flex items-end justify-between">
                          <div>
                            <div className="flex items-baseline gap-1">
                              <span className="text-3xl font-bold text-primary">{momentumStats.completed}</span>
                              <span className="text-xs text-on-surface-variant font-medium">/ {momentumStats.total}</span>
                            </div>
                            <p className="text-[11px] text-on-surface-variant font-semibold mt-1">Tugas Selesai</p>
                          </div>
                          
                          {/* circular Progress Ring */}
                          <div className="w-16 h-16 flex items-center justify-center relative">
                            <svg className="w-full h-full transform -rotate-90">
                              <circle 
                                className="text-gray-100" 
                                cx="32" cy="32" fill="transparent" r="26" 
                                stroke="currentColor" strokeWidth="5"
                              ></circle>
                              <circle 
                                className="text-secondary" 
                                cx="32" cy="32" fill="transparent" r="26" 
                                stroke="currentColor" strokeWidth="5"
                                strokeDasharray="163.3"
                                strokeDashoffset={163.3 - (163.3 * momentumStats.percentage) / 100}
                              ></circle>
                            </svg>
                            <span className="absolute text-secondary font-bold text-xs">
                              {momentumStats.percentage}%
                            </span>
                          </div>
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-outline-variant/15 pt-4">
                          <div className="flex flex-col">
                            <span className="text-lg font-bold text-secondary">{momentumStats.pending}</span>
                            <span className="text-[10px] font-semibold text-on-surface-variant uppercase">Sisa Tugas</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-lg font-bold text-primary">{courseMeetings.length}</span>
                            <span className="text-[10px] font-semibold text-on-surface-variant uppercase">Pertemuan Kuliah</span>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Active Assignments List */}
                    <section className="space-y-4">
                      <div className="flex justify-between items-center px-1 select-none">
                        <h3 className="text-base font-bold text-primary">Daftar Tugas Aktif ({activeCourseName})</h3>
                      </div>

                      <div className="space-y-3">
                        {studentTasks.length === 0 ? (
                          <p className="text-xs text-on-surface-variant font-medium text-center py-6 bg-white rounded-xl border border-dashed border-outline-variant">
                            Belum ada tugas yang tersedia untuk mata kuliah ini.
                          </p>
                        ) : (
                          studentTasks.map((assignment) => {
                            const isSubmitted = assignment.status === 'submitted';
                            return (
                              <div 
                                key={assignment.id} 
                                className="bg-white p-4 rounded-xl border border-outline-variant/30 auth-card-shadow flex gap-4 items-start active:scale-[0.99] transition-all hover:border-primary/20 cursor-pointer"
                                onClick={() => handleSelectAssignment(assignment)}
                              >
                                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 text-primary">
                                  {assignment.courseCode === 'IF-MOB' && <ClipboardList className="w-5 h-5" />}
                                  {assignment.courseCode === 'IF-SPK' && <Compass className="w-5 h-5" />}
                                  {assignment.courseCode === 'IF-DMBD' && <FileCheck2 className="w-5 h-5" />}
                                  {!['IF-MOB', 'IF-SPK', 'IF-DMBD'].includes(assignment.courseCode) && <FileText className="w-5 h-5" />}
                                </div>
                                
                                <div className="flex-grow min-w-0">
                                  <div className="flex justify-between items-start gap-2">
                                    <h4 className="text-xs md:text-sm font-bold text-primary truncate leading-tight">
                                      {assignment.title}
                                    </h4>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase shrink-0 ${
                                      isSubmitted 
                                        ? 'bg-secondary/15 text-secondary border border-secondary/10' 
                                        : 'bg-red-50 text-red-600 border border-red-100'
                                    }`}>
                                      {isSubmitted ? 'Selesai' : 'Belum Kumpul'}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-on-surface-variant font-medium mt-1 truncate">
                                    {assignment.description}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-3 text-on-surface-variant font-semibold text-[10px]">
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span>Tenggat: {new Date(assignment.deadline).toLocaleDateString('id-ID', {
                                      day: '2-digit', month: 'short', year: 'numeric'
                                    })}</span>
                                  </div>
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
                  <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary mx-auto">
                    <img className="w-full h-full object-cover" src={user.avatarUrl || undefined} alt="Profile" />
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
            <h3 className="text-lg font-bold text-primary mb-2">Tugas Berhasil Dikumpulkan</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed mb-6 font-semibold">
              Tugas Anda telah berhasil dicatat ke dalam database. Anda dapat meninjau nilai atau riwayat tugas di tab Riwayat.
            </p>
            <button 
              className="w-full bg-secondary hover:bg-secondary/95 text-white py-3 rounded-full font-bold text-xs transition-colors cursor-pointer auth-card-shadow"
              onClick={handleCloseSuccess}
            >
              Kembali ke Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Floating Action Button (FAB) (Only on Tasks Main screen) */}
      {!selectedAssignment && activeTab === 'tasks' && (
        <button 
          className="fixed right-6 bottom-24 w-14 h-14 bg-primary hover:bg-primary/95 text-white rounded-2xl shadow-xl flex items-center justify-center active:scale-90 transition-all z-40 border border-outline-variant/10 cursor-pointer"
          title="Kumpul Tugas"
          onClick={() => {
            const firstUnsubmitted = studentTasks.find(t => t.status !== 'submitted');
            if (firstUnsubmitted) {
              handleSelectAssignment(firstUnsubmitted);
            } else {
              alert('Semua tugas untuk mata kuliah ini sudah dikumpulkan! Luar biasa.');
            }
          }}
        >
          <CloudUpload className="w-6 h-6 animate-bounce" />
        </button>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-outline-variant/20 flex justify-around items-center px-4 z-40 select-none auth-card-shadow rounded-t-2xl font-sans">
        <button 
          className={`flex flex-col items-center justify-center px-4 py-2 transition-transform duration-150 cursor-pointer ${
            activeTab === 'tasks' && !selectedAssignment
              ? 'text-secondary font-bold' 
              : 'text-on-surface-variant hover:text-primary'
          }`}
          onClick={() => startTransition(() => { setActiveTab('tasks'); setSelectedAssignment(null); })}
        >
          <ClipboardList className="w-5 h-5" />
          <span className="text-[10px] font-bold mt-1">Daftar Tugas</span>
        </button>
        <button 
          className={`flex flex-col items-center justify-center px-4 py-2 transition-transform duration-150 cursor-pointer ${
            activeTab === 'materials' 
              ? 'text-secondary font-bold' 
              : 'text-on-surface-variant hover:text-primary'
          }`}
          onClick={() => startTransition(() => { setActiveTab('materials'); setSelectedAssignment(null); })}
        >
          <BookOpen className="w-5 h-5" />
          <span className="text-[10px] font-bold mt-1">Materi Kuliah</span>
        </button>
        <button 
          className={`flex flex-col items-center justify-center px-4 py-2 transition-transform duration-150 cursor-pointer ${
            activeTab === 'history' 
              ? 'text-secondary font-bold' 
              : 'text-on-surface-variant hover:text-primary'
          }`}
          onClick={() => startTransition(() => { setActiveTab('history'); setSelectedAssignment(null); })}
        >
          <History className="w-5 h-5" />
          <span className="text-[10px] font-bold mt-1">Riwayat & Nilai</span>
        </button>
        <button 
          className={`flex flex-col items-center justify-center px-4 py-2 transition-transform duration-150 cursor-pointer ${
            activeTab === 'profile' 
              ? 'text-secondary font-bold' 
              : 'text-on-surface-variant hover:text-primary'
          }`}
          onClick={() => startTransition(() => { setActiveTab('profile'); setSelectedAssignment(null); })}
        >
          <UserIcon className="w-5 h-5" />
          <span className="text-[10px] font-bold mt-1">Profil</span>
        </button>
      </nav>
    </div>
  );
}
