export interface User {
  uid: string;
  role: 'student' | 'lecturer';
  email: string;
  name: string;
  avatarUrl: string;
  enrolledCourse?: string; // e.g. 'IF-MOB' | 'IF-SPK' | 'IF-DMBD'
  enrolledClass?: string;  // e.g. 'IF-4A' | 'IF-4B' | 'IF-5A' | 'IF-5B' | 'IF-6A' | 'IF-6B'
  idNumber?: string;       // Student's ID/NIM
}

export interface Assignment {
  id: string;
  course_id: string;
  class_name: string | null;
  title: string;
  description: string;
  deadline: string;
  max_points: number;
  status: 'draft' | 'published' | 'closed';
  created_at: string;
  updated_at: string;
  course?: {
    id: string;
    code: string;
    name: string;
  };
}

export interface Student {
  id: string;
  name: string;
  idNumber: string;
  submittedCount: number;
  progress: number; // 0-100
  status: 'Excellent' | 'Consistent' | 'Improving' | 'Needs Attention';
  initials: string;
  courseCode: string; // e.g. 'IF-MOB' | 'IF-SPK' | 'IF-DMBD'
  classGroup: string; // e.g. 'IF-4A' | 'IF-4B' | 'IF-5A' | 'IF-5B' | 'IF-6A' | 'IF-6B'
}

export interface Deadline {
  id: string;
  month: string;
  day: string;
  title: string;
  subtitle: string;
}
