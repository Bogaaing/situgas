import { Assignment, Student, Deadline } from './types';

export const COURSES = [
  { code: 'IF-MOB', name: 'Mobile Programming', classes: ['IF-4A', 'IF-4B'] },
  { code: 'IF-SPK', name: 'Sistem Penunjang Keputusan', classes: ['IF-5A', 'IF-5B'] },
  { code: 'IF-DMBD', name: 'Data Mining dan Big Data', classes: ['IF-6A', 'IF-6B'] }
];

export const INITIAL_ASSIGNMENTS: any[] = [
  {
    id: '1',
    title: 'Membangun Aplikasi Android dengan Jetpack Compose',
    courseCode: 'IF-MOB',
    description: 'Tugas membuat aplikasi daftar film sederhana menggunakan Jetpack Compose, state management (remember/rememberSaveable), dan lazy layout.',
    deadline: '2026-07-25',
    status: 'active',
    submissionsCount: 15,
    totalStudents: 22,
    points: 100,
  },
  {
    id: '2',
    title: 'State Management & Navigation di Mobile App',
    courseCode: 'IF-MOB',
    description: 'Implementasi navigation component, passing arguments antar screen, dan pemakaian ViewModel untuk state management global.',
    deadline: '2026-07-18',
    status: 'late',
    submissionsCount: 20,
    totalStudents: 22,
    points: 100,
  },
  {
    id: '3',
    title: 'Analisis Matriks Keputusan Menggunakan Metode AHP',
    courseCode: 'IF-SPK',
    description: 'Menghitung nilai konsistensi matriks perbandingan berpasangan kriteria dan alternatif keputusan dengan Analytical Hierarchy Process (AHP).',
    deadline: '2026-07-28',
    status: 'draft',
    submissionsCount: 0,
    totalStudents: 18,
    points: 100,
  },
  {
    id: '4',
    title: 'Simulasi Fuzzy Logic Controller',
    courseCode: 'IF-SPK',
    description: 'Tugas pemodelan himpunan fuzzy (fuzzifikasi, inferensi rule Mamdani, dan defuzzifikasi centroid) untuk studi kasus pengatur suhu ruangan.',
    deadline: '2026-07-14',
    status: 'not-submitted',
    submissionsCount: 12,
    totalStudents: 18,
    points: 100,
  },
  {
    id: '5',
    title: 'Implementasi Hadoop MapReduce & Spark DataFrame',
    courseCode: 'IF-DMBD',
    description: 'Melakukan pemrosesan file log berukuran besar menggunakan Spark SQL untuk agregasi traffic dan pendeteksian anomali.',
    deadline: '2026-07-30',
    status: 'not-submitted',
    submissionsCount: 8,
    totalStudents: 25,
    points: 100,
  },
  {
    id: '6',
    title: 'Prediksi Harga Rumah dengan Regresi Linear Spark ML',
    courseCode: 'IF-DMBD',
    description: 'Membangun pipeline machine learning dengan Spark MLlib: feature assembler, scaling, model training regresi, dan evaluasi matriks RMSE.',
    deadline: '2026-07-20',
    status: 'submitted',
    submissionsCount: 25,
    totalStudents: 25,
    points: 100,
    submittedAt: '2026-07-19T14:32:00Z',
    submittedFile: 'big_data_spark_ml_prediction.pdf',
    submittedNote: 'Saya menggunakan dataset housing_prices dengan 3 feature utama. Evaluasi model menghasilkan RMSE yang cukup stabil.'
  },
  {
    id: '7',
    title: 'Eksplorasi Association Rules dengan Algoritma Apriori',
    courseCode: 'IF-DMBD',
    description: 'Analisis pola pembelian keranjang belanja (market basket analysis) menggunakan data transaksi retail untuk mendapatkan support, confidence, dan lift ratio.',
    deadline: '2026-07-28',
    status: 'not-submitted',
    submissionsCount: 9,
    totalStudents: 25,
    points: 100,
  }
];

export const INITIAL_STUDENTS: Student[] = [
  // Mobile Programming - Kelas IF-4A
  {
    id: 's1',
    name: 'Elena Dragusin',
    idNumber: '#AF-2023-084',
    submittedCount: 2,
    progress: 100,
    status: 'Excellent',
    initials: 'ED',
    courseCode: 'IF-MOB',
    classGroup: 'IF-4A',
  },
  {
    id: 's6',
    name: 'Aditya Pratama',
    idNumber: '#AF-2023-001',
    submittedCount: 2,
    progress: 90,
    status: 'Consistent',
    initials: 'AP',
    courseCode: 'IF-MOB',
    classGroup: 'IF-4A',
  },
  // Mobile Programming - Kelas IF-4B
  {
    id: 's2',
    name: 'Julian Marek',
    idNumber: '#AF-2023-112',
    submittedCount: 1,
    progress: 50,
    status: 'Consistent',
    initials: 'JM',
    courseCode: 'IF-MOB',
    classGroup: 'IF-4B',
  },
  {
    id: 's10',
    name: 'Eka Putri',
    idNumber: '#AF-2023-110',
    submittedCount: 1,
    progress: 50,
    status: 'Improving',
    initials: 'EP',
    courseCode: 'IF-MOB',
    classGroup: 'IF-4B',
  },

  // Sistem Penunjang Keputusan - Kelas IF-5A
  {
    id: 's3',
    name: 'Sienna Lopez',
    idNumber: '#AF-2023-045',
    submittedCount: 2,
    progress: 100,
    status: 'Excellent',
    initials: 'SL',
    courseCode: 'IF-SPK',
    classGroup: 'IF-5A',
  },
  // Sistem Penunjang Keputusan - Kelas IF-5B
  {
    id: 's4',
    name: 'Kai Bennett',
    idNumber: '#AF-2023-201',
    submittedCount: 1,
    progress: 50,
    status: 'Needs Attention',
    initials: 'KB',
    courseCode: 'IF-SPK',
    classGroup: 'IF-5B',
  },
  {
    id: 's7',
    name: 'Budi Santoso',
    idNumber: '#AF-2023-007',
    submittedCount: 2,
    progress: 85,
    status: 'Consistent',
    initials: 'BS',
    courseCode: 'IF-SPK',
    classGroup: 'IF-5B',
  },

  // Data Mining dan Big Data - Kelas IF-6A
  {
    id: 's5',
    name: 'Oliver Wright',
    idNumber: '#AF-2023-019',
    submittedCount: 3,
    progress: 100,
    status: 'Excellent',
    initials: 'OW',
    courseCode: 'IF-DMBD',
    classGroup: 'IF-6A',
  },
  {
    id: 's8',
    name: 'Citra Lestari',
    idNumber: '#AF-2023-008',
    submittedCount: 3,
    progress: 95,
    status: 'Consistent',
    initials: 'CL',
    courseCode: 'IF-DMBD',
    classGroup: 'IF-6A',
  },
  // Data Mining dan Big Data - Kelas IF-6B
  {
    id: 's9',
    name: 'Dedi Wijaya',
    idNumber: '#AF-2023-009',
    submittedCount: 1,
    progress: 33,
    status: 'Needs Attention',
    initials: 'DW',
    courseCode: 'IF-DMBD',
    classGroup: 'IF-6B',
  }
];

export const INITIAL_DEADLINES: Deadline[] = [
  {
    id: 'd1',
    month: 'Jul',
    day: '25',
    title: 'Kumpul Project Jetpack Compose',
    subtitle: 'Mobile Programming - Kelas IF-4A/IF-4B',
  },
  {
    id: 'd2',
    month: 'Jul',
    day: '28',
    title: 'AHP Decision Matrix Assignment',
    subtitle: 'Sistem Penunjang Keputusan - Kelas IF-5A/IF-5B',
  }
];
