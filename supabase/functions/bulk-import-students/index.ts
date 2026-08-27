// supabase/functions/bulk-import-students/index.ts
import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // 1. Handle CORS preflight request instantly
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace(/^Bearer\s+/i, '')

    // Retrieve environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Configuration Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set on the server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Initialize admin Supabase client
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    })

    // Get calling user details from Auth
    const { data: { user: callerUser }, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !callerUser) {
      console.error('[Edge Function] Auth verification error:', userError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token or session expired' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate calling user's profile to ensure they are a lecturer
    const { data: lecturerProfile, error: lecturerError } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', callerUser.id)
      .single()

    if (lecturerError || !lecturerProfile || lecturerProfile.role !== 'lecturer') {
      console.error('[Edge Function] Lecturer validation error:', lecturerError, lecturerProfile)
      return new Response(
        JSON.stringify({ error: 'Forbidden: Hanya dosen yang dapat mengakses layanan import ini' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Parse and validate request body
    const body = await req.json()
    const { courseId, className, roomName, students } = body

    const trimmedClassName = String(className || '').trim()
    const trimmedRoomName = String(roomName || '').trim()

    if (!courseId || !trimmedClassName || !trimmedRoomName || !Array.isArray(students)) {
      return new Response(
        JSON.stringify({ error: 'Field Mata Kuliah, Kode Kelas, Ruangan, dan Daftar Mahasiswa wajib diisi' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (students.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Maksimum 100 mahasiswa per proses import.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate course ownership
    const { data: courseData, error: courseError } = await adminClient
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .eq('lecturer_id', lecturerProfile.id)
      .single()

    if (courseError || !courseData) {
      console.error('[Edge Function] Course validation error:', courseError)
      return new Response(
        JSON.stringify({ error: 'Mata kuliah tidak ditemukan atau bukan milik Anda' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Process each student sequentially
    const results = []
    const summary = {
      total: students.length,
      success: 0,
      alreadyEnrolled: 0,
      failed: 0,
    }

    for (const student of students) {
      const trimmedNim = String(student.nim || '').trim()
      const trimmedName = String(student.name || '').trim()

      if (!trimmedNim || !trimmedName) {
        summary.failed++
        results.push({
          nim: trimmedNim || 'UNKNOWN',
          status: 'error',
          message: 'NIM dan Nama Mahasiswa tidak boleh kosong'
        })
        continue
      }

      try {
        // Find existing student profile by NIM
        let { data: existingStudentProfile, error: studentProfileError } = await adminClient
          .from('profiles')
          .select('*')
          .eq('nim', trimmedNim)
          .maybeSingle()

        if (studentProfileError) {
          console.error(`[Edge Function] Error querying student by NIM (${trimmedNim}):`, studentProfileError)
        }

        const syntheticEmail = `${trimmedNim}@students.situgas.local`

        if (!existingStudentProfile) {
          const { data: profileByEmail, error: emailProfileError } = await adminClient
            .from('profiles')
            .select('*')
            .eq('email', syntheticEmail)
            .maybeSingle()
          
          if (emailProfileError) {
            console.error(`[Edge Function] Error querying student by email (${syntheticEmail}):`, emailProfileError)
          } else if (profileByEmail) {
            existingStudentProfile = profileByEmail
          }
        }

        let studentId = ''
        let isNewStudent = false
        let createdAuthUserId = ''

        if (existingStudentProfile) {
          if (existingStudentProfile.role !== 'student') {
            summary.failed++
            results.push({
              nim: trimmedNim,
              status: 'error',
              message: 'NIM tersebut terdaftar sebagai role non-mahasiswa'
            })
            continue
          }
          studentId = existingStudentProfile.id
        } else {
          // Create new student flow
          isNewStudent = true
          console.log(`[Edge Function] Creating auth user: ${syntheticEmail}`)
          
          const { data: authData, error: authCreateError } = await adminClient.auth.admin.createUser({
            email: syntheticEmail,
            password: trimmedNim, // initial password is NIM
            email_confirm: true,
            user_metadata: {
              nim: trimmedNim,
              full_name: trimmedName,
              name: trimmedName,
            }
          })

          let authUser = authData?.user
          let isExistingAuthUser = false

          if (authCreateError) {
            const errorMsg = authCreateError.message || ''
            if (errorMsg.includes('already exists') || errorMsg.toLowerCase().includes('conflict') || errorMsg.toLowerCase().includes('duplicate') || errorMsg.toLowerCase().includes('identitas')) {
              console.log(`[Edge Function] Auth user already exists in auth.users, searching...`)
              const { data: listData, error: listError } = await adminClient.auth.admin.listUsers()
              if (!listError && listData?.users) {
                const matched = listData.users.find(u => u.email === syntheticEmail)
                if (matched) {
                  authUser = matched
                  isExistingAuthUser = true
                  console.log(`[Edge Function] Matched existing auth user: ${matched.id}`)
                }
              }
            }
          }

          if (!authUser) {
            console.error(`[Edge Function] Error creating auth user for NIM ${trimmedNim}:`, authCreateError)
            summary.failed++
            results.push({
              nim: trimmedNim,
              status: 'error',
              message: `Gagal membuat akun Auth: ${authCreateError?.message || 'Unknown error'}`
            })
            continue
          }

          createdAuthUserId = isExistingAuthUser ? '' : authUser.id
          studentId = authUser.id

          // Ensure profile exists
          const { data: profileCheck, error: profileCheckError } = await adminClient
            .from('profiles')
            .select('*')
            .eq('id', studentId)
            .maybeSingle()

          if (!profileCheck) {
            console.log(`[Edge Function] Profile missing for auth user ${studentId}, inserting manually...`)
            const { error: profileInsertError } = await adminClient
              .from('profiles')
              .insert({
                id: studentId,
                email: syntheticEmail,
                name: trimmedName,
                role: 'student',
                nim: trimmedNim,
              })

            if (profileInsertError) {
              console.error(`[Edge Function] Error creating profile for student ${studentId}:`, profileInsertError)
              if (createdAuthUserId) {
                await adminClient.auth.admin.deleteUser(createdAuthUserId)
              }
              summary.failed++
              results.push({
                nim: trimmedNim,
                status: 'error',
                message: `Gagal membuat profil database: ${profileInsertError.message}`
              })
              continue
            }
          }
        }

        // Check if student is already enrolled in this course
        const { data: existingEnrollment, error: checkEnrollmentError } = await adminClient
          .from('enrollments')
          .select('*')
          .eq('course_id', courseId)
          .eq('student_id', studentId)
          .maybeSingle()

        if (existingEnrollment) {
          // If we created a new Auth user but they are already enrolled somehow, rollback is not necessary as enrollment existed
          summary.alreadyEnrolled++
          results.push({
            nim: trimmedNim,
            status: 'already_enrolled',
            message: 'Mahasiswa sudah terdaftar pada mata kuliah ini'
          })
          continue
        }

        // Create enrollment
        console.log(`[Edge Function] Enrolling student ${studentId} in course ${courseId}`)
        const { error: enrollError } = await adminClient
          .from('enrollments')
          .insert({
            course_id: courseId,
            student_id: studentId,
            class_name: trimmedClassName,
            room_name: trimmedRoomName,
          })

        if (enrollError) {
          console.error(`[Edge Function] Error inserting enrollment for student ${studentId}:`, enrollError)
          if (isNewStudent && createdAuthUserId) {
            console.log(`[Edge Function] Rolling back created auth user ${createdAuthUserId} due to enrollment failure`)
            try {
              await adminClient.auth.admin.deleteUser(createdAuthUserId)
            } catch (cleanupErr) {
              console.error('[Edge Function] Cleanup error during rollback:', cleanupErr)
            }
          }
          summary.failed++
          results.push({
            nim: trimmedNim,
            status: 'error',
            message: 'Gagal mendaftarkan mahasiswa ke mata kuliah'
          })
          continue
        }

        summary.success++
        results.push({
          nim: trimmedNim,
          status: 'success',
          message: 'Berhasil diimport.'
        })

      } catch (rowErr: any) {
        console.error(`[Edge Function] Unexpected error for row NIM ${trimmedNim}:`, rowErr)
        summary.failed++
        results.push({
          nim: trimmedNim,
          status: 'error',
          message: rowErr.message || 'Error tidak diketahui'
        })
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('[Edge Function] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal Server Error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
