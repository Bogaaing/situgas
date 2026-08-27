import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table (covers both students and lecturers)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').$type<'student' | 'lecturer'>().notNull(),
  avatarUrl: text('avatar_url'),
  idNumber: text('id_number'), // student ID number (e.g. #AF-2023-084)
  enrolledCourseCode: text('enrolled_course_code'), // Primary enrolled course for students
  enrolledClassName: text('enrolled_class_name'), // Primary enrolled class for students
  createdAt: timestamp('created_at').defaultNow(),
});

// Courses table
export const courses = pgTable('courses', {
  code: text('code').primaryKey(), // e.g. 'IF-MOB', 'IF-SPK'
  name: text('name').notNull(),
});

// Enrollments table (for tracking students course enrollments)
export const enrollments = pgTable('enrollments', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid').notNull().references(() => users.uid, { onDelete: 'cascade' }),
  courseCode: text('course_code').notNull().references(() => courses.code, { onDelete: 'cascade' }),
  className: text('class_name').notNull(),
});

// Assignments table
export const assignments = pgTable('assignments', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  courseCode: text('course_code').notNull().references(() => courses.code, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  deadline: text('deadline').notNull(), // format 'YYYY-MM-DD'
  points: integer('points').default(100).notNull(),
  status: text('status').$type<'active' | 'late' | 'draft' | 'submitted' | 'not-submitted'>().default('draft').notNull(),
});

// Submissions / Grades table (tracks assignments submissions & grading)
export const submissions = pgTable('submissions', {
  id: serial('id').primaryKey(),
  assignmentId: integer('assignment_id').notNull().references(() => assignments.id, { onDelete: 'cascade' }),
  userUid: text('user_uid').notNull().references(() => users.uid, { onDelete: 'cascade' }),
  submittedAt: text('submitted_at').notNull(), // ISO format
  submittedFile: text('submitted_file'),
  submittedLink: text('submitted_link'),
  submittedNote: text('submitted_note'),
  grade: integer('grade'), // nullable, holds the grade when evaluated
  feedback: text('feedback'), // lecturer feedback
});

// Attendance table
export const attendance = pgTable('attendance', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid').notNull().references(() => users.uid, { onDelete: 'cascade' }),
  courseCode: text('course_code').notNull().references(() => courses.code, { onDelete: 'cascade' }),
  className: text('class_name').notNull(),
  status: text('status').$type<'Hadir' | 'Sakit' | 'Izin' | 'Alpa'>().notNull(),
  date: text('date').notNull(), // format 'YYYY-MM-DD'
});

// Academic schedules table
export const schedules = pgTable('schedules', {
  id: serial('id').primaryKey(),
  courseCode: text('course_code').notNull().references(() => courses.code, { onDelete: 'cascade' }),
  className: text('class_name').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  date: text('date').notNull(), // format 'YYYY-MM-DD'
  time: text('time').notNull(), // e.g. '08:00 - 10:00'
});

// Relations definitions
export const usersRelations = relations(users, ({ many }) => ({
  submissions: many(submissions),
  enrollments: many(enrollments),
  attendance: many(attendance),
}));

export const coursesRelations = relations(courses, ({ many }) => ({
  assignments: many(assignments),
  enrollments: many(enrollments),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  user: one(users, { fields: [enrollments.userUid], references: [users.uid] }),
  course: one(courses, { fields: [enrollments.courseCode], references: [courses.code] }),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  course: one(courses, { fields: [assignments.courseCode], references: [courses.code] }),
  submissions: many(submissions),
}));

export const submissionsRelations = relations(submissions, ({ one }) => ({
  assignment: one(assignments, { fields: [submissions.assignmentId], references: [assignments.id] }),
  user: one(users, { fields: [submissions.userUid], references: [users.uid] }),
}));
