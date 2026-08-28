// supabase/functions/create-lecturer/index.ts
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

    // Retrieve server environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Configuration Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set on the server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Initialize admin client with service role
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    })

    // 3. Verify calling user's JWT
    const { data: { user: callerUser }, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !callerUser) {
      console.error('[Edge Function create-lecturer] Auth verification error:', userError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token or session expired' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Validate that caller has 'admin' role in database
    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', callerUser.id)
      .single()

    if (profileError || !callerProfile || callerProfile.role !== 'admin') {
      console.error('[Edge Function create-lecturer] Forbidden access attempt by:', callerUser.id, callerProfile)
      return new Response(
        JSON.stringify({ error: 'Forbidden: Hanya Administrator yang memiliki hak akses untuk mendaftarkan dosen baru' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Parse and validate request payload
    const body = await req.json()
    const { name, email, initialPassword } = body

    const trimmedName = String(name || '').trim()
    const trimmedEmail = String(email || '').trim().toLowerCase()
    const rawPassword = String(initialPassword || '')

    if (!trimmedName || !trimmedEmail || !rawPassword) {
      return new Response(
        JSON.stringify({ error: 'Nama Lengkap, Email, dan Password Awal wajib diisi' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      return new Response(
        JSON.stringify({ error: 'Format email tidak valid' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (rawPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Password awal minimal 6 karakter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 6. Check if email already registered in profiles
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('id, email, role')
      .eq('email', trimmedEmail)
      .maybeSingle()

    if (existingProfile) {
      return new Response(
        JSON.stringify({ error: `Email ${trimmedEmail} sudah terdaftar dengan role ${existingProfile.role}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 7. Create Supabase Auth user
    console.log(`[Edge Function create-lecturer] Creating auth user for lecturer: ${trimmedEmail}`)
    const { data: authData, error: authCreateError } = await adminClient.auth.admin.createUser({
      email: trimmedEmail,
      password: rawPassword,
      email_confirm: true,
      user_metadata: {
        full_name: trimmedName,
        name: trimmedName,
        role: 'lecturer',
      }
    })

    if (authCreateError || !authData?.user) {
      console.error('[Edge Function create-lecturer] Error creating auth user:', authCreateError)
      return new Response(
        JSON.stringify({ error: `Gagal membuat akun Auth Dosen: ${authCreateError?.message || 'Error tidak diketahui'}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const newLecturerId = authData.user.id

    // 8. Upsert profile in profiles table
    const { error: insertProfileError } = await adminClient
      .from('profiles')
      .upsert({
        id: newLecturerId,
        email: trimmedEmail,
        name: trimmedName,
        role: 'lecturer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    if (insertProfileError) {
      console.error('[Edge Function create-lecturer] Error inserting profile:', insertProfileError)
      // Rollback auth user
      try {
        await adminClient.auth.admin.deleteUser(newLecturerId)
      } catch (rollbackErr) {
        console.error('[Edge Function create-lecturer] Rollback error:', rollbackErr)
      }
      return new Response(
        JSON.stringify({ error: `Gagal membuat profil database dosen: ${insertProfileError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 9. Record in audit_logs
    try {
      await adminClient
        .from('audit_logs')
        .insert({
          actor_id: callerUser.id,
          actor_name: callerProfile.name || 'Administrator',
          actor_email: callerProfile.email || '',
          action: 'CREATE_LECTURER',
          entity_type: 'lecturer',
          entity_id: newLecturerId,
          metadata: {
            lecturer_name: trimmedName,
            lecturer_email: trimmedEmail,
          },
          created_at: new Date().toISOString(),
        })
    } catch (auditErr) {
      console.warn('[Edge Function create-lecturer] Non-blocking audit log error:', auditErr)
    }

    // 10. Return sanitized response (never return sensitive credentials)
    return new Response(
      JSON.stringify({
        success: true,
        lecturer: {
          id: newLecturerId,
          name: trimmedName,
          email: trimmedEmail,
          role: 'lecturer',
          created_at: new Date().toISOString(),
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('[Edge Function create-lecturer] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'Internal Server Error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
