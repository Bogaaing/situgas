// supabase/functions/create-student/index.ts
import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // 1. Handle CORS preflight request instantly before anything else
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

    // Retrieve environment variables available in hosted Supabase Edge Functions
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Configuration Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set on the server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Initialize admin Supabase client with service role for elevated actions and user verification
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    })

    // Get calling user details from Auth using the provided JWT
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
        JSON.stringify({ error: 'Forbidden: Hanya dosen yang dapat mendaftarkan mahasiswa baru' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Parse and validate request body
    const body = await req.json()
    const { nim, name, initialPassword, courseId, className, roomName } = body

    const trimmedNim = String(nim || '').trim()
    const trimmedName = String(name || '').trim()
    const trimmedClassName = String(className || '').trim()
    const trimmedRoomName = String(roomName || '').trim()

    if (!trimmedNim || !courseId || !trimmedClassName || !trimmedRoomName) {
      return new Response(
        JSON.stringify({ error: 'Field NIM, Mata Kuliah, Kelas, dan Ruangan wajib diisi' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate course ownership (the course must belong to the logged-in lecturer)
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

    // 4. Check if student already exists by NIM or Email in profiles
    let { data: existingStudentProfile, error: studentProfileError } = await adminClient
      .from('profiles')
      .select('*')
      .eq('nim', trimmedNim)
      .maybeSingle()

    if (studentProfileError) {
      console.error('[Edge Function] Error querying student profile by NIM:', studentProfileError)
    }

    const syntheticEmail = `${trimmedNim}@students.situgas.local`

    if (!existingStudentProfile) {
      const { data: profileByEmail, error: emailProfileError } = await adminClient
        .from('profiles')
        .select('*')
        .eq('email', syntheticEmail)
        .maybeSingle()
      
      if (emailProfileError) {
        console.error('[Edge Function] Error querying student profile by email:', emailProfileError)
      } else if (profileByEmail) {
        existingStudentProfile = profileByEmail
      }
    }

    let studentId = ''
    let studentName = trimmedName
    let isNewStudent = false
    let createdAuthUserId = ''

    if (existingStudentProfile) {
      if (existingStudentProfile.role !== 'student') {
        return new Response(
          JSON.stringify({ error: 'NIM tersebut terdaftar sebagai role non-mahasiswa' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      studentId = existingStudentProfile.id
      studentName = existingStudentProfile.name

      // If name is different and trimmedName was provided, update the name in profiles safely
      if (trimmedName && existingStudentProfile.name !== trimmedName) {
        console.log(`[Edge Function] Updating name for existing student in profiles...`)
        const { error: nameUpdateError } = await adminClient
          .from('profiles')
          .update({ name: trimmedName })
          .eq('id', studentId)
        if (nameUpdateError) {
          console.error('[Edge Function] Error updating profile name:', nameUpdateError)
        } else {
          studentName = trimmedName
        }
      }
    } else {
      // New student flow
      isNewStudent = true
      if (!trimmedName) {
        return new Response(
          JSON.stringify({ error: 'Nama Mahasiswa wajib diisi untuk mahasiswa baru' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!initialPassword || initialPassword.length < 6) {
        return new Response(
          JSON.stringify({ error: 'Password Awal wajib diisi dan minimal 6 karakter' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`[Edge Function] Creating auth user: ${syntheticEmail}`)
      const { data: authData, error: authCreateError } = await adminClient.auth.admin.createUser({
        email: syntheticEmail,
        password: initialPassword,
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
        console.error('[Edge Function] Error creating auth user:', authCreateError)
        return new Response(
          JSON.stringify({ error: `Gagal membuat akun Auth mahasiswa: ${authCreateError?.message || 'Unknown error'}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      createdAuthUserId = isExistingAuthUser ? '' : authUser.id
      studentId = authUser.id

      // Double check that profile exists in profiles table
      const { data: profileCheck, error: profileCheckError } = await adminClient
        .from('profiles')
        .select('id, name')
        .eq('id', studentId)
        .maybeSingle()

      if (!profileCheck) {
        console.log(`[Edge Function] Profile missing for existing auth user, creating it manually...`)
        const { error: profileInsertError } = await adminClient
          .from('profiles')
          .insert({
            id: studentId,
            email: syntheticEmail,
            name: trimmedName || 'Mahasiswa Baru',
            role: 'student',
            nim: trimmedNim,
          })
        if (profileInsertError) {
          console.error('[Edge Function] Error creating missing profile:', profileInsertError)
          if (createdAuthUserId) {
            await adminClient.auth.admin.deleteUser(createdAuthUserId)
          }
          return new Response(
            JSON.stringify({ error: `Gagal membuat profil database mahasiswa: ${profileInsertError.message}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      } else if (trimmedName && profileCheck.name !== trimmedName) {
        console.log(`[Edge Function] Profile exists, updating name safely...`)
        const { error: profileUpdateError } = await adminClient
          .from('profiles')
          .update({ name: trimmedName })
          .eq('id', studentId)
        if (profileUpdateError) {
          console.error('[Edge Function] Error updating profile name:', profileUpdateError)
        }
      }
    }

    // 5. Check for duplicate enrollment in the database
    const { data: existingEnrollment, error: checkEnrollmentError } = await adminClient
      .from('enrollments')
      .select('*')
      .eq('course_id', courseId)
      .eq('student_id', studentId)
      .maybeSingle()

    if (existingEnrollment) {
      if (isNewStudent && createdAuthUserId) {
        console.log(`[Edge Function] Rolling back created auth user ${createdAuthUserId} due to pre-existing enrollment`)
        await adminClient.auth.admin.deleteUser(createdAuthUserId)
      }
      return new Response(
        JSON.stringify({ error: 'Mahasiswa sudah terdaftar pada mata kuliah ini' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 6. Create enrollment entry
    console.log(`[Edge Function] Enrolling student ${studentId} in course ${courseId}`)
    const { data: enrollmentData, error: enrollError } = await adminClient
      .from('enrollments')
      .insert({
        course_id: courseId,
        student_id: studentId,
        class_name: trimmedClassName,
        room_name: trimmedRoomName,
      })
      .select('*')
      .single()

    if (enrollError) {
      console.error('[Edge Function] Error inserting enrollment:', enrollError)
      if (isNewStudent && createdAuthUserId) {
        console.log(`[Edge Function] Rolling back created auth user ${createdAuthUserId} due to enrollment insertion failure`)
        try {
          await adminClient.auth.admin.deleteUser(createdAuthUserId)
        } catch (cleanupErr) {
          console.error('[Edge Function] Cleanup error during rollback:', cleanupErr)
        }
      }
      return new Response(
        JSON.stringify({ error: 'Gagal mendaftarkan mahasiswa ke mata kuliah.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        student: {
          id: studentId,
          nim: trimmedNim,
          name: studentName,
        },
        enrollment: {
          id: enrollmentData.id,
          courseId: enrollmentData.course_id,
          className: enrollmentData.class_name,
          roomName: enrollmentData.room_name,
        }
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
