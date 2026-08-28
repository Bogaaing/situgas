import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { db, schema } from "./src/db/index.ts";
import { eq, and } from "drizzle-orm";
import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = supabaseServiceRoleKey ? createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
}) : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Enable JSON request body parsing
  app.use(express.json());

  // --- API ROUTES ---

  // 1. Sync or create user profile on login
  app.post("/api/users/sync", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { email, name, role, avatarUrl, enrolledCourseCode, enrolledClassName, idNumber } = req.body;
      const uid = req.user!.uid;

      const result = await db.insert(schema.users)
        .values({
          uid,
          email: email || req.user!.email || "",
          name: name || req.user!.name || "User",
          role: role || "student",
          avatarUrl: avatarUrl || req.user!.picture || "",
          enrolledCourseCode,
          enrolledClassName,
          idNumber,
        })
        .onConflictDoUpdate({
          target: schema.users.uid,
          set: {
            email: email || req.user!.email || "",
            name: name || req.user!.name || "User",
            role: role || "student",
            avatarUrl: avatarUrl || req.user!.picture || "",
            enrolledCourseCode,
            enrolledClassName,
            idNumber,
          }
        })
        .returning();

      res.json(result[0]);
    } catch (err: any) {
      console.error("Sync user profile failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Admin endpoint: Create lecturer securely
  app.post("/api/admin/create-lecturer", requireAuth, async (req: AuthRequest, res) => {
    try {
      const callerUid = req.user!.uid;
      const authHeader = req.headers.authorization;

      if (!supabaseUrl || !supabaseAnonKey || !authHeader) {
        return res.status(500).json({ error: "Supabase configuration missing" });
      }

      // Initialize scoped user Supabase client with caller's token for RLS
      const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      });

      // Verify caller is admin using scoped userSupabase
      const { data: callerProfile, error: callerErr } = await userSupabase
        .from("profiles")
        .select("*")
        .eq("id", callerUid)
        .maybeSingle();

      if (callerErr || !callerProfile || callerProfile.role !== "admin") {
        console.error("Admin verification failed for uid:", callerUid, "error:", callerErr, "profile:", callerProfile);
        return res.status(403).json({ error: "Forbidden: Hanya Administrator yang dapat mendaftarkan dosen baru." });
      }

      const { name, email, password } = req.body;
      const trimmedName = String(name || "").trim();
      const trimmedEmail = String(email || "").trim().toLowerCase();
      const rawPassword = String(password || "");

      if (!trimmedName || !trimmedEmail || !rawPassword) {
        return res.status(400).json({ error: "Nama, email, dan password wajib diisi." });
      }
      if (rawPassword.length < 6) {
        return res.status(400).json({ error: "Password awal minimal 6 karakter." });
      }

      // Check if user already exists
      const { data: existingUser } = await userSupabase
        .from("profiles")
        .select("id, email, role")
        .eq("email", trimmedEmail)
        .maybeSingle();

      if (existingUser) {
        return res.status(400).json({ error: `Email ${trimmedEmail} sudah terdaftar dengan role ${existingUser.role}.` });
      }

      // Create auth user
      let newUserId: string | null = null;

      if (supabaseAdmin) {
        // Use Supabase Admin API: Bypasses email confirmation & rate limits completely!
        const { data: adminAuthData, error: adminAuthErr } = await supabaseAdmin.auth.admin.createUser({
          email: trimmedEmail,
          password: rawPassword,
          email_confirm: true,
          user_metadata: {
            full_name: trimmedName,
            name: trimmedName,
            role: "lecturer",
          }
        });

        if (adminAuthErr || !adminAuthData.user) {
          return res.status(400).json({ error: adminAuthErr?.message || "Gagal membuat akun auth dosen via Admin API." });
        }
        newUserId = adminAuthData.user.id;
      } else {
        // Fallback to signUp
        const { data: authData, error: authErr } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: rawPassword,
          options: {
            data: {
              full_name: trimmedName,
              name: trimmedName,
              role: "lecturer",
            }
          }
        });

        if (authErr || !authData.user) {
          if (authErr?.message?.toLowerCase().includes("rate limit")) {
            return res.status(429).json({ 
              error: "Email rate limit Supabase terlampaui. Untuk mengatasinya: Buka Supabase Dashboard -> Authentication -> Providers -> Email -> nonaktifkan 'Confirm email' (atau masukkan SUPABASE_SERVICE_ROLE_KEY di .env)." 
            });
          }
          return res.status(400).json({ error: authErr?.message || "Gagal membuat akun auth dosen." });
        }
        newUserId = authData.user.id;
      }

      // Update or insert profile row with role = 'lecturer' (do not modify created_at)
      const { data: checkProf } = await userSupabase
        .from("profiles")
        .select("id")
        .eq("id", newUserId)
        .maybeSingle();

      let profileErr = null;
      if (checkProf) {
        const { error } = await userSupabase
          .from("profiles")
          .update({
            name: trimmedName,
            role: "lecturer",
            updated_at: new Date().toISOString(),
          })
          .eq("id", newUserId);
        profileErr = error;
      } else {
        const { error } = await userSupabase
          .from("profiles")
          .insert({
            id: newUserId,
            email: trimmedEmail,
            name: trimmedName,
            role: "lecturer",
          });
        profileErr = error;
      }

      if (profileErr) {
        console.error("Profile update error in server:", profileErr);
        return res.status(500).json({ error: `Gagal memperbarui profil dosen: ${profileErr.message}` });
      }

      // Insert audit log using userSupabase
      try {
        await userSupabase.from("audit_logs").insert({
          actor_id: callerUid,
          actor_name: callerProfile.name || "Administrator",
          actor_email: callerProfile.email || "",
          action: "CREATE_LECTURER",
          entity_type: "lecturer",
          entity_id: newUserId,
          metadata: { name: trimmedName, email: trimmedEmail },
        });
      } catch (auditErr) {
        console.warn("Audit log insert error:", auditErr);
      }

      return res.json({
        success: true,
        lecturer: {
          id: newUserId,
          name: trimmedName,
          email: trimmedEmail,
          role: "lecturer",
        }
      });
    } catch (err: any) {
      console.error("Create lecturer server endpoint error:", err);
      return res.status(500).json({ error: err.message || "Internal server error" });
    }
  });

  // 2. Fetch current user profile
  app.get("/api/users/me", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await db.select().from(schema.users).where(eq(schema.users.uid, req.user!.uid));
      if (result.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(result[0]);
    } catch (err: any) {
      console.error("Fetch current user failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Fetch courses
  app.get("/api/courses", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await db.select().from(schema.courses);
      res.json(result);
    } catch (err: any) {
      console.error("Fetch courses failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Fetch assignments (with optional course filter)
  app.get("/api/assignments", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { courseCode } = req.query;
      let q = db.select().from(schema.assignments);
      if (courseCode) {
        q = q.where(eq(schema.assignments.courseCode, courseCode as string)) as any;
      }
      const result = await q;
      res.json(result);
    } catch (err: any) {
      console.error("Fetch assignments failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Create assignment (Lecturer)
  app.post("/api/assignments", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { title, courseCode, description, deadline, points, status } = req.body;
      const result = await db.insert(schema.assignments)
        .values({
          title,
          courseCode,
          description,
          deadline,
          points: Number(points) || 100,
          status: status || "draft",
        })
        .returning();
      res.json(result[0]);
    } catch (err: any) {
      console.error("Create assignment failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Update assignment
  app.patch("/api/assignments/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { title, description, deadline, points, status } = req.body;
      const result = await db.update(schema.assignments)
        .set({
          ...(title && { title }),
          ...(description && { description }),
          ...(deadline && { deadline }),
          ...(points && { points: Number(points) }),
          ...(status && { status }),
        })
        .where(eq(schema.assignments.id, Number(id)))
        .returning();
      res.json(result[0]);
    } catch (err: any) {
      console.error("Update assignment failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Delete assignment
  app.delete("/api/assignments/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      await db.delete(schema.assignments).where(eq(schema.assignments.id, Number(id)));
      res.json({ success: true });
    } catch (err: any) {
      console.error("Delete assignment failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 8. Fetch submissions
  app.get("/api/submissions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { assignmentId, userUid } = req.query;
      let q = db.select().from(schema.submissions);
      const conditions = [];
      if (assignmentId) {
        conditions.push(eq(schema.submissions.assignmentId, Number(assignmentId)));
      }
      if (userUid) {
        conditions.push(eq(schema.submissions.userUid, userUid as string));
      }
      if (conditions.length > 0) {
        q = q.where(and(...conditions)) as any;
      }
      const result = await q;
      res.json(result);
    } catch (err: any) {
      console.error("Fetch submissions failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 9. Student submit assignment
  app.post("/api/submissions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { assignmentId, submittedFile, submittedLink, submittedNote } = req.body;
      const userUid = req.user!.uid;
      const authHeader = req.headers.authorization;

      let supabaseResult = null;

      // 1. Check if assignment is closed
      if (supabaseUrl && supabaseAnonKey) {
        try {
          const { data: asgData } = await supabase
            .from('assignments')
            .select('id, title, status')
            .eq('id', assignmentId)
            .single();

          if (asgData && asgData.status === 'closed') {
            return res.status(400).json({
              error: 'assignment_closed',
              title: asgData.title || 'Tugas',
              message: `${asgData.title || 'Tugas'} Closed`,
            });
          }
        } catch (e) {
          console.error("Assignment status check failed:", e);
        }
      }

      // 2. Submit to Supabase directly
      if (supabaseUrl && supabaseAnonKey) {
        try {
          const userSupabase = authHeader
            ? createClient(supabaseUrl, supabaseAnonKey, {
                global: {
                  headers: {
                    Authorization: authHeader,
                  },
                },
              })
            : supabase;

          // Check if submission already exists in Supabase
          const { data: existingSubs, error: checkErr } = await userSupabase
            .from('submissions')
            .select('id')
            .eq('assignment_id', assignmentId)
            .eq('student_id', userUid);

          if (existingSubs && existingSubs.length > 0) {
            const { data: updatedSub, error: updateErr } = await userSupabase
              .from('submissions')
              .update({
                submitted_at: new Date().toISOString(),
                file_path: submittedFile || null,
                submitted_link: submittedLink || null,
                submitted_note: submittedNote || null,
              })
              .eq('id', existingSubs[0].id)
              .select();

            if (updateErr) {
              console.error("Supabase authenticated update error, attempting default client:", updateErr);
              const { data: fallbackUpdated } = await supabase
                .from('submissions')
                .update({
                  submitted_at: new Date().toISOString(),
                  file_path: submittedFile || null,
                  submitted_link: submittedLink || null,
                  submitted_note: submittedNote || null,
                })
                .eq('id', existingSubs[0].id)
                .select();
              supabaseResult = fallbackUpdated?.[0];
            } else {
              supabaseResult = updatedSub?.[0];
            }
          } else {
            const { data: insertedSub, error: insertErr } = await userSupabase
              .from('submissions')
              .insert({
                assignment_id: assignmentId,
                student_id: userUid,
                submitted_at: new Date().toISOString(),
                file_path: submittedFile || null,
                submitted_link: submittedLink || null,
                submitted_note: submittedNote || null,
              })
              .select();

            if (insertErr) {
              console.error("Supabase authenticated insert error, attempting default client:", insertErr);
              const { data: fallbackInserted } = await supabase
                .from('submissions')
                .insert({
                  assignment_id: assignmentId,
                  student_id: userUid,
                  submitted_at: new Date().toISOString(),
                  file_path: submittedFile || null,
                  submitted_link: submittedLink || null,
                  submitted_note: submittedNote || null,
                })
                .select();
              supabaseResult = fallbackInserted?.[0];
            } else {
              supabaseResult = insertedSub?.[0];
            }
          }
        } catch (sErr: any) {
          console.error("Supabase submission proxy error:", sErr);
        }
      }

      // 2. Also save to local DB if assignmentId is numeric
      let localResult = null;
      const numericAssignmentId = Number(assignmentId);
      if (!isNaN(numericAssignmentId)) {
        try {
          const existing = await db.select().from(schema.submissions).where(
            and(
              eq(schema.submissions.assignmentId, numericAssignmentId),
              eq(schema.submissions.userUid, userUid)
            )
          );

          if (existing.length > 0) {
            const updated = await db.update(schema.submissions)
              .set({
                submittedAt: new Date().toISOString(),
                submittedFile,
                submittedLink,
                submittedNote,
              })
              .where(eq(schema.submissions.id, existing[0].id))
              .returning();
            localResult = updated[0];
          } else {
            const inserted = await db.insert(schema.submissions)
              .values({
                assignmentId: numericAssignmentId,
                userUid,
                submittedAt: new Date().toISOString(),
                submittedFile,
                submittedLink,
                submittedNote,
              })
              .returning();
            localResult = inserted[0];
          }
        } catch (dbErr) {
          console.error("Local DB submission error:", dbErr);
        }
      }

      res.json(supabaseResult || localResult || { success: true });
    } catch (err: any) {
      console.error("Submit assignment failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 10. Grade a submission (Lecturer)
  app.patch("/api/submissions/:id/grade", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params; // UUID (Supabase) or Serial ID (local DB)
      const { grade, feedback } = req.body;
      const authHeader = req.headers.authorization;

      let supabaseUpdatedData = null;

      // 1. Always attempt to update Supabase first if configured, passing the user's Auth Header for RLS checks
      if (supabaseUrl && supabaseAnonKey && authHeader) {
        try {
          const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
              headers: {
                Authorization: authHeader,
              },
            },
          });

          const { data, error } = await userSupabase
            .from('submissions')
            .update({
              grade: Number(grade),
              feedback: feedback || null,
              graded_at: new Date().toISOString()
            })
            .eq('id', id)
            .select();

          if (error) {
            console.error("Supabase grading update failed in proxy:", error);
            throw error;
          }
          if (data && data.length > 0) {
            supabaseUpdatedData = data[0];
          }
        } catch (sErr: any) {
          console.error("Supabase update threw error in backend proxy:", sErr);
          return res.status(400).json({ error: sErr.message || "Failed to save grade on Supabase." });
        }
      }

      // 2. Also update local DB if id can be parsed as a number
      let localResult = null;
      const numericId = Number(id);
      if (!isNaN(numericId)) {
        try {
          const result = await db.update(schema.submissions)
            .set({
              grade: Number(grade),
              feedback,
            })
            .where(eq(schema.submissions.id, numericId))
            .returning();
          if (result && result.length > 0) {
            localResult = result[0];
          }
        } catch (dbErr) {
          console.error("Local DB grade update ignored or failed:", dbErr);
        }
      }

      // Return the updated data (preferring Supabase structure if updated)
      res.json(supabaseUpdatedData || localResult || { success: true });
    } catch (err: any) {
      console.error("Grade submission failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 11. Fetch students list with optional class filter
  app.get("/api/students", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { courseCode, className } = req.query;

      // Dynamic sync from Supabase to ensure local Cloud SQL DB is up to date
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
              avatar_url,
              email,
              role
            ),
            course:courses!course_id (
              id,
              code,
              name
            )
          `);

        if (!enrollmentsErr && enrollmentsData) {
          // Keep track of active Supabase student IDs so we can clean up stale student enrollment codes if needed
          const activeStudentUids = new Set<string>();

          for (const rawEnv of enrollmentsData) {
            const env = rawEnv as any;
            const student = Array.isArray(env.student) ? env.student[0] : env.student;
            const course = Array.isArray(env.course) ? env.course[0] : env.course;
            
            if (student && student.role === 'student') {
              activeStudentUids.add(student.id);
              const curCourseCode = course?.code || env.course_id;

              // 1. Ensure course exists in local courses database
              if (curCourseCode) {
                const existingCourse = await db.select().from(schema.courses).where(eq(schema.courses.code, curCourseCode));
                if (existingCourse.length === 0) {
                  try {
                    await db.insert(schema.courses).values({
                      code: curCourseCode,
                      name: course?.name || curCourseCode,
                    });
                  } catch (cErr) {
                    console.error("Failed to insert local course during sync:", cErr);
                  }
                }
              }

              // 2. Upsert user into schema.users
              try {
                await db.insert(schema.users)
                  .values({
                    uid: student.id,
                    email: student.email || `${student.nim || student.id}@students.situgas.local`,
                    name: student.name || 'Mahasiswa',
                    role: 'student',
                    avatarUrl: student.avatar_url || '',
                    idNumber: student.nim || '',
                    enrolledCourseCode: curCourseCode || null,
                    enrolledClassName: env.class_name || null,
                  })
                  .onConflictDoUpdate({
                    target: schema.users.uid,
                    set: {
                      email: student.email || `${student.nim || student.id}@students.situgas.local`,
                      name: student.name || 'Mahasiswa',
                      role: 'student',
                      avatarUrl: student.avatar_url || '',
                      idNumber: student.nim || '',
                      enrolledCourseCode: curCourseCode || null,
                      enrolledClassName: env.class_name || null,
                    }
                  });
              } catch (uErr) {
                console.error("Failed to sync user in db:", uErr);
              }

              // 3. Upsert local enrollment
              if (curCourseCode) {
                try {
                  const existingLocalEnroll = await db.select().from(schema.enrollments).where(
                    and(
                      eq(schema.enrollments.userUid, student.id),
                      eq(schema.enrollments.courseCode, curCourseCode)
                    )
                  );
                  if (existingLocalEnroll.length === 0) {
                    await db.insert(schema.enrollments).values({
                      userUid: student.id,
                      courseCode: curCourseCode,
                      className: env.class_name || '',
                    });
                  }
                } catch (eErr) {
                  console.error("Failed to sync local enrollment in db:", eErr);
                }
              }
            }
          }

          // Clean up stale students in local schema.users if their enrollments were deleted
          const localStudents = await db.select().from(schema.users).where(eq(schema.users.role, "student"));
          for (const localStud of localStudents) {
            if (!activeStudentUids.has(localStud.uid)) {
              await db.update(schema.users)
                .set({
                  enrolledCourseCode: null,
                  enrolledClassName: null,
                })
                .where(eq(schema.users.uid, localStud.uid));
              
              await db.delete(schema.enrollments).where(eq(schema.enrollments.userUid, localStud.uid));
            }
          }
        }
      } catch (syncErr) {
        console.error("Background student synchronization failed:", syncErr);
      }

      const conditions = [eq(schema.users.role, "student")];
      if (courseCode) {
        conditions.push(eq(schema.users.enrolledCourseCode, courseCode as string));
      }
      if (className) {
        conditions.push(eq(schema.users.enrolledClassName, className as string));
      }
      const result = await db.select().from(schema.users).where(and(...conditions));
      res.json(result);
    } catch (err: any) {
      console.error("Fetch students failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 12. Fetch attendance
  app.get("/api/attendance", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { courseCode, className, userUid } = req.query;
      let q = db.select().from(schema.attendance);
      const conditions = [];
      if (courseCode) conditions.push(eq(schema.attendance.courseCode, courseCode as string));
      if (className) conditions.push(eq(schema.attendance.className, className as string));
      if (userUid) conditions.push(eq(schema.attendance.userUid, userUid as string));
      if (conditions.length > 0) {
        q = q.where(and(...conditions)) as any;
      }
      const result = await q;
      res.json(result);
    } catch (err: any) {
      console.error("Fetch attendance failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 13. Submit / Update attendance
  app.post("/api/attendance", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { userUid, courseCode, className, status, date } = req.body;

      const existing = await db.select().from(schema.attendance).where(
        and(
          eq(schema.attendance.userUid, userUid),
          eq(schema.attendance.courseCode, courseCode),
          eq(schema.attendance.date, date)
        )
      );

      if (existing.length > 0) {
        const updated = await db.update(schema.attendance)
          .set({ status })
          .where(eq(schema.attendance.id, existing[0].id))
          .returning();
        res.json(updated[0]);
      } else {
        const inserted = await db.insert(schema.attendance)
          .values({ userUid, courseCode, className, status, date })
          .returning();
        res.json(inserted[0]);
      }
    } catch (err: any) {
      console.error("Submit attendance failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 14. Fetch schedules
  app.get("/api/schedules", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { courseCode, className } = req.query;
      let q = db.select().from(schema.schedules);
      const conditions = [];
      if (courseCode) conditions.push(eq(schema.schedules.courseCode, courseCode as string));
      if (className) conditions.push(eq(schema.schedules.className, className as string));
      if (conditions.length > 0) {
        q = q.where(and(...conditions)) as any;
      }
      const result = await q;
      res.json(result);
    } catch (err: any) {
      console.error("Fetch schedules failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 15. Create schedule
  app.post("/api/schedules", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { courseCode, className, title, description, date, time } = req.body;
      const result = await db.insert(schema.schedules)
        .values({ courseCode, className, title, description, date, time })
        .returning();
      res.json(result[0]);
    } catch (err: any) {
      console.error("Create schedule failed:", err);
      res.status(500).json({ error: err.message });
    }
  });
  // --- VITE DEV OR PRODUCTION STATIC SERVER ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
