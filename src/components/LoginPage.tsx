import React, { useState, startTransition } from 'react';
import { User as UserIcon, ArrowRight, GraduationCap, Eye, EyeOff, AlertCircle, Mail, Lock, Shield, ArrowLeft, ShieldCheck } from 'lucide-react';
import { User } from '../types';
import { supabase } from '../lib/supabase';

interface LoginPageProps {
  onLogin: (user: User) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [role, setRole] = useState<'student' | 'lecturer'>('student');
  const [nim, setNim] = useState('');
  const [email, setEmail] = useState('');
  const [adminIdentifier, setAdminIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [devMessage, setDevMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const selectRole = (selectedRole: 'student' | 'lecturer') => {
    startTransition(() => {
      setRole(selectedRole);
      setDevMessage('');
      setErrorMessage('');
    });
  };

  const switchToAdmin = () => {
    startTransition(() => {
      setIsAdminMode(true);
      setErrorMessage('');
      setDevMessage('');
      setPassword('');
    });
  };

  const switchToMain = () => {
    startTransition(() => {
      setIsAdminMode(false);
      setErrorMessage('');
      setDevMessage('');
      setPassword('');
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    setDevMessage('');

    if (isAdminMode) {
      // Admin Login
      try {
        const identifier = adminIdentifier.trim();
        if (!identifier) {
          setErrorMessage('Email atau username wajib diisi.');
          setIsLoading(false);
          return;
        }
        if (!password) {
          setErrorMessage('Password wajib diisi.');
          setIsLoading(false);
          return;
        }

        // Use email for Supabase Authentication
        const loginEmail = identifier.includes('@') ? identifier : `${identifier}@situgas.id`;

        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password,
        });

        if (authError) {
          console.error('Supabase admin auth error:', authError);
          if (authError.message === 'Invalid login credentials' || authError.status === 400) {
            setErrorMessage('Email/username atau password salah.');
          } else {
            setErrorMessage('Terjadi kesalahan saat masuk. Silakan coba kembali.');
          }
          setIsLoading(false);
          return;
        }

        const user = authData?.user;
        if (!user) {
          setErrorMessage('Terjadi kesalahan saat masuk. Silakan coba kembali.');
          setIsLoading(false);
          return;
        }

        // Query profile from profiles table to check role
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          console.error('Profile query error for admin:', profileError);
          await supabase.auth.signOut();
          setErrorMessage('Terjadi kesalahan saat masuk. Silakan coba kembali.');
          setIsLoading(false);
          return;
        }

        if (!profile) {
          await supabase.auth.signOut();
          setErrorMessage('Profil pengguna tidak ditemukan.');
          setIsLoading(false);
          return;
        }

        // Validate admin role
        if (profile.role !== 'admin') {
          await supabase.auth.signOut();
          setErrorMessage('Akun ini tidak memiliki akses Administrator.');
          setIsLoading(false);
          return;
        }

        // Successfully authenticated admin
        const adminUser: User = {
          uid: profile.id,
          role: 'admin',
          email: profile.email || user.email || '',
          name: profile.name || 'Administrator',
          avatarUrl: profile.avatar_url || '',
          idNumber: profile.nim || undefined,
        };

        onLogin(adminUser);
      } catch (err) {
        console.error('Unexpected admin login error:', err);
        setErrorMessage('Terjadi kesalahan saat masuk. Silakan coba kembali.');
      } finally {
        setIsLoading(false);
      }
    } else if (role === 'lecturer') {
      // Lecturer Login
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) {
          console.error('Supabase auth error:', authError);
          if (authError.message === 'Invalid login credentials' || authError.status === 400) {
            setErrorMessage('Email atau password salah.');
          } else {
            setErrorMessage('Terjadi kesalahan saat masuk. Silakan coba kembali.');
          }
          setIsLoading(false);
          return;
        }

        const user = authData?.user;
        if (!user) {
          setErrorMessage('Terjadi kesalahan saat masuk. Silakan coba kembali.');
          setIsLoading(false);
          return;
        }

        // Query profile from profiles table
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          console.error('Profile query error:', profileError);
          await supabase.auth.signOut();
          setErrorMessage('Terjadi kesalahan saat masuk. Silakan coba kembali.');
          setIsLoading(false);
          return;
        }

        if (!profile) {
          await supabase.auth.signOut();
          setErrorMessage('Profil pengguna tidak ditemukan.');
          setIsLoading(false);
          return;
        }

        if (profile.role !== 'lecturer') {
          await supabase.auth.signOut();
          setErrorMessage('Tipe akun tidak sesuai. Silakan gunakan login yang sesuai.');
          setIsLoading(false);
          return;
        }

        // Successfully authenticated lecturer
        const userData: User = {
          uid: profile.id,
          role: 'lecturer',
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.avatar_url || '',
          idNumber: profile.nim || undefined,
        };

        onLogin(userData);
      } catch (err) {
        console.error('Unexpected login error:', err);
        setErrorMessage('Terjadi kesalahan saat masuk. Silakan coba kembali.');
      } finally {
        setIsLoading(false);
      }
    } else {
      // Student login: Supabase authentication
      try {
        const normalizedNim = nim.trim();
        if (!normalizedNim) {
          setErrorMessage('NIM wajib diisi.');
          setIsLoading(false);
          return;
        }
        if (!password) {
          setErrorMessage('Password wajib diisi.');
          setIsLoading(false);
          return;
        }

        const syntheticEmail = `${normalizedNim}@students.situgas.local`;

        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: syntheticEmail,
          password,
        });

        if (authError) {
          console.error('Supabase auth error for student:', authError.message);
          setErrorMessage('NIM atau password salah.');
          setIsLoading(false);
          return;
        }

        const user = authData?.user;
        if (!user) {
          setErrorMessage('NIM atau password salah.');
          setIsLoading(false);
          return;
        }

        // Query profile from profiles table
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          console.error('Profile query error for student:', profileError);
          await supabase.auth.signOut();
          setErrorMessage('Terjadi kesalahan saat masuk. Silakan coba kembali.');
          setIsLoading(false);
          return;
        }

        if (!profile) {
          await supabase.auth.signOut();
          setErrorMessage('Profil mahasiswa tidak ditemukan. Hubungi dosen.');
          setIsLoading(false);
          return;
        }

        if (profile.role !== 'student') {
          await supabase.auth.signOut();
          setErrorMessage('Tipe akun tidak sesuai. Silakan gunakan login yang sesuai.');
          setIsLoading(false);
          return;
        }

        // Successfully authenticated student
        const studentUser: User = {
          uid: profile.id,
          role: 'student',
          email: profile.email || `${profile.nim || profile.id}@students.situgas.local`,
          name: profile.name,
          avatarUrl: profile.avatar_url || '',
          idNumber: profile.nim || undefined,
        };

        onLogin(studentUser);
      } catch (err) {
        console.error('Unexpected student login error:', err);
        setErrorMessage('Terjadi kesalahan saat masuk. Silakan coba kembali.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-[#F8FAFC] via-[#EEF4FB] to-[#E2E8F0] flex items-center justify-center p-4 md:p-6 lg:p-10 font-sans select-none">
      
      {/* ======================================================== */}
      {/* RIGHT BACKGROUND VISUAL: GEDUNG UNPAM (CLEAR & SMOOTH BLEND) */}
      {/* ======================================================== */}
      <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-[55%] xl:w-[62%] 2xl:w-[66%] h-full pointer-events-none z-0 overflow-hidden">
        {/* UNPAM Campus Photo with clear visibility and subtle depth blur */}
        <img
          src="/gedung-unpam.jpg"
          alt="Gedung Kampus UNPAM"
          className="w-full h-full object-cover object-center transform scale-102 blur-[0.8px] opacity-70 xl:opacity-80 transition-all duration-700 select-none"
        />

        {/* Smooth Horizontal Gradient Fade (Left-to-Right blend) */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#F8FAFC] via-[#F8FAFC]/80 via-15% via-[#EEF4FB]/25 via-45% to-transparent" />
        
        {/* Soft Vertical Ambient Gradient Fade */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#F8FAFC]/40 via-transparent via-50% to-[#F8FAFC]/50" />
      </div>

      {/* ======================================================== */}
      {/* MINIMALIST ABSTRACT BACKGROUND DECORATIONS */}
      {/* ======================================================== */}

      {/* 1. TOP-LEFT: Subtle Dot Matrix & Gold Accent */}
      <div className="absolute top-8 left-8 md:top-14 md:left-14 pointer-events-none z-0">
        <div className="grid grid-cols-6 gap-2.5 opacity-40">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#94A3B8]" />
          ))}
        </div>
        <div className="absolute -bottom-3 -right-6 w-3 h-3 rounded-full bg-[#F59E0B] shadow-sm shadow-[#F59E0B]/30 animate-pulse" />
      </div>

      {/* 2. TOP-LEFT: Thin Curved Accent Line */}
      <div className="absolute left-6 md:left-14 top-1/3 -translate-y-12 w-14 h-14 border-t-2 border-l-2 border-[#F59E0B]/30 rounded-tl-full pointer-events-none z-0" />

      {/* 3. BOTTOM-LEFT: Clean Geometric Rings & Subtle Dots */}
      <div className="absolute bottom-10 left-8 md:bottom-16 md:left-16 pointer-events-none z-0 flex items-center gap-6">
        <div className="w-28 h-28 md:w-36 md:h-36 rounded-full border border-[#CBD5E1]/60 bg-white/20 backdrop-blur-xs flex items-center justify-center">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full border border-[#CBD5E1]/40" />
        </div>
        <div className="hidden sm:grid grid-cols-4 gap-2 opacity-30">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#94A3B8]" />
          ))}
        </div>
      </div>

      {/* 4. BOTTOM-RIGHT: Subtle Geometric Ring & Dot Grid */}
      <div className="absolute bottom-10 right-8 md:bottom-16 md:right-20 pointer-events-none z-0">
        <div className="w-8 h-8 rounded-full border-2 border-[#3B82F6]/25 mb-6 ml-auto" />
        <div className="grid grid-cols-6 gap-2.5 opacity-40">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#94A3B8]" />
          ))}
        </div>
      </div>

      {/* ======================================================== */}
      {/* MAIN CONTENT AREA: Centered SaaS Login Card Container */}
      {/* ======================================================== */}
      <div className="w-full flex items-center justify-center relative z-20">
        
        {/* Card Container */}
        <div className="w-full max-w-[420px] bg-white px-7 sm:px-9 py-9 sm:py-10 rounded-[32px] shadow-[0_20px_60px_rgba(15,35,65,0.14)] border border-slate-100/90 flex flex-col transition-all duration-300 backdrop-blur-md">
          
          {/* ======================================================== */}
          {/* ADMIN LOGIN STATE */}
          {/* ======================================================== */}
          {isAdminMode ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Circular Badge with Shield */}
              <div className="flex justify-center mb-3">
                <div className="w-16 h-16 bg-[#0B1E3B] rounded-full flex items-center justify-center shadow-lg shadow-[#0B1E3B]/15">
                  <ShieldCheck className="text-white w-8 h-8" />
                </div>
              </div>

              {/* Portal Title & Subtitle */}
              <h2 className="text-2xl font-bold text-center text-[#0B1E3B] tracking-tight mb-1">
                Admin Portal
              </h2>
              <p className="text-xs text-[#5B738E] text-center font-normal mb-6">
                Masuk ke panel administrasi sistem
              </p>

              {errorMessage && (
                <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl font-medium flex gap-2 animate-in fade-in duration-200" id="admin-login-error-message">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-bold text-[#0B1E3B] block" htmlFor="admin-identifier">
                    Email / Username
                  </label>
                  <div className="relative flex items-center bg-[#EEF4FA] border border-[#D8E3F0] rounded-xl px-3.5 py-3 transition-all focus-within:bg-white focus-within:border-[#0B1E3B] focus-within:ring-2 focus-within:ring-[#0B1E3B]/10">
                    <Mail className="text-[#64748B] w-4 h-4 mr-2.5 shrink-0" />
                    <input
                      className="w-full bg-transparent text-xs font-semibold text-[#0B1E3B] placeholder:text-[#94A3B8] outline-none"
                      id="admin-identifier"
                      placeholder="email@situgas.web.id"
                      type="text"
                      value={adminIdentifier}
                      onChange={(e) => setAdminIdentifier(e.target.value)}
                      disabled={isLoading}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-bold text-[#0B1E3B] block" htmlFor="admin-password">
                    Password
                  </label>
                  <div className="relative flex items-center bg-[#EEF4FA] border border-[#D8E3F0] rounded-xl px-3.5 py-3 transition-all focus-within:bg-white focus-within:border-[#0B1E3B] focus-within:ring-2 focus-within:ring-[#0B1E3B]/10">
                    <Lock className="text-[#64748B] w-4 h-4 mr-2.5 shrink-0" />
                    <input
                      className="w-full bg-transparent text-xs font-semibold text-[#0B1E3B] placeholder:text-[#94A3B8] outline-none pr-7"
                      id="admin-password"
                      placeholder="Masukkan password admin"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 flex items-center text-[#64748B] hover:text-[#0B1E3B] transition-colors cursor-pointer"
                      title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 bg-[#0B1E3B] hover:bg-[#07162C] active:scale-[0.99] text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer mt-6 shadow-md shadow-[#0B1E3B]/20 transition-all disabled:opacity-50"
                >
                  {isLoading ? 'Memproses...' : (
                    <>
                      Masuk <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Return to Main Login Link */}
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={switchToMain}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 text-xs text-[#5B738E] hover:text-[#0B1E3B] transition-colors font-medium cursor-pointer py-1 px-2.5 rounded-lg hover:bg-slate-50"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Kembali ke Login SITugas</span>
                </button>
              </div>
            </div>
          ) : (
            /* ======================================================== */
            /* MAIN LOGIN STATE (MAHASISWA / DOSEN) */
            /* ======================================================== */
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              {/* Circular Badge with GraduationCap */}
              <div className="flex justify-center mb-3">
                <div className="w-16 h-16 bg-[#0B1E3B] rounded-full flex items-center justify-center shadow-lg shadow-[#0B1E3B]/15">
                  <GraduationCap className="text-white w-8 h-8" />
                </div>
              </div>

              {/* App Title */}
              <h2 className="text-2xl font-bold text-center text-[#0B1E3B] tracking-tight mb-5">
                SITugas
              </h2>

              {/* Role Switcher as Segmented Control */}
              <div className="flex justify-center mb-6">
                <div className="bg-[#EEF4FB] p-1 rounded-full flex gap-1 w-full max-w-[280px]">
                  <button
                    type="button"
                    id="role-student"
                    onClick={() => selectRole('student')}
                    disabled={isLoading}
                    className={`flex-1 py-2 px-5 text-xs font-bold rounded-full transition-all duration-300 cursor-pointer text-center ${
                      role === 'student'
                        ? 'bg-[#0B1E3B] text-white shadow-md shadow-[#0B1E3B]/15'
                        : 'text-[#5B738E] hover:text-[#0B1E3B]'
                    }`}
                  >
                    Mahasiswa
                  </button>
                  <button
                    type="button"
                    id="role-lecturer"
                    onClick={() => selectRole('lecturer')}
                    disabled={isLoading}
                    className={`flex-1 py-2 px-5 text-xs font-bold rounded-full transition-all duration-300 cursor-pointer text-center ${
                      role === 'lecturer'
                        ? 'bg-[#0B1E3B] text-white shadow-md shadow-[#0B1E3B]/15'
                        : 'text-[#5B738E] hover:text-[#0B1E3B]'
                    }`}
                  >
                    Dosen
                  </button>
                </div>
              </div>

              {devMessage && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-100 text-blue-700 text-xs rounded-xl font-medium flex gap-2 animate-in fade-in duration-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                  <span>{devMessage}</span>
                </div>
              )}

              {errorMessage && (
                <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl font-medium flex gap-2 animate-in fade-in duration-200" id="login-error-message">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Form Mahasiswa */}
                {role === 'student' && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="space-y-1.5 text-left">
                      <label className="text-xs font-bold text-[#0B1E3B] block" htmlFor="nim">
                        NIM
                      </label>
                      <div className="relative flex items-center bg-[#EEF4FA] border border-[#D8E3F0] rounded-xl px-3.5 py-3 transition-all focus-within:bg-white focus-within:border-[#0B1E3B] focus-within:ring-2 focus-within:ring-[#0B1E3B]/10">
                        <UserIcon className="text-[#64748B] w-4 h-4 mr-2.5 shrink-0" />
                        <input
                          className="w-full bg-transparent text-xs font-semibold text-[#0B1E3B] placeholder:text-[#94A3B8] outline-none"
                          id="nim"
                          placeholder="Masukkan NIM"
                          type="text"
                          value={nim}
                          onChange={(e) => setNim(e.target.value)}
                          disabled={isLoading}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5 text-left">
                      <label className="text-xs font-bold text-[#0B1E3B] block" htmlFor="password">
                        Password
                      </label>
                      <div className="relative flex items-center bg-[#EEF4FA] border border-[#D8E3F0] rounded-xl px-3.5 py-3 transition-all focus-within:bg-white focus-within:border-[#0B1E3B] focus-within:ring-2 focus-within:ring-[#0B1E3B]/10">
                        <Lock className="text-[#64748B] w-4 h-4 mr-2.5 shrink-0" />
                        <input
                          className="w-full bg-transparent text-xs font-semibold text-[#0B1E3B] placeholder:text-[#94A3B8] outline-none pr-7"
                          id="password"
                          placeholder="Masukkan password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={isLoading}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 flex items-center text-[#64748B] hover:text-[#0B1E3B] transition-colors cursor-pointer"
                          title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Form Dosen */}
                {role === 'lecturer' && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="space-y-1.5 text-left">
                      <label className="text-xs font-bold text-[#0B1E3B] block" htmlFor="email">
                        Email
                      </label>
                      <div className="relative flex items-center bg-[#EEF4FA] border border-[#D8E3F0] rounded-xl px-3.5 py-3 transition-all focus-within:bg-white focus-within:border-[#0B1E3B] focus-within:ring-2 focus-within:ring-[#0B1E3B]/10">
                        <Mail className="text-[#64748B] w-4 h-4 mr-2.5 shrink-0" />
                        <input
                          className="w-full bg-transparent text-xs font-semibold text-[#0B1E3B] placeholder:text-[#94A3B8] outline-none"
                          id="email"
                          placeholder="Masukkan email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          disabled={isLoading}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5 text-left">
                      <label className="text-xs font-bold text-[#0B1E3B] block" htmlFor="password-lecturer">
                        Password
                      </label>
                      <div className="relative flex items-center bg-[#EEF4FA] border border-[#D8E3F0] rounded-xl px-3.5 py-3 transition-all focus-within:bg-white focus-within:border-[#0B1E3B] focus-within:ring-2 focus-within:ring-[#0B1E3B]/10">
                        <Lock className="text-[#64748B] w-4 h-4 mr-2.5 shrink-0" />
                        <input
                          className="w-full bg-transparent text-xs font-semibold text-[#0B1E3B] placeholder:text-[#94A3B8] outline-none pr-7"
                          id="password-lecturer"
                          placeholder="Masukkan password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={isLoading}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 flex items-center text-[#64748B] hover:text-[#0B1E3B] transition-colors cursor-pointer"
                          title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 bg-[#0B1E3B] hover:bg-[#07162C] active:scale-[0.99] text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer mt-6 shadow-md shadow-[#0B1E3B]/20 transition-all disabled:opacity-50"
                >
                  {isLoading ? 'Memproses...' : (
                    <>
                      Masuk <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Footer text */}
              <div className="mt-7 text-center">
                <p className="text-[11px] text-[#5B738E] font-semibold">
                  Sistem Informasi Manajemen Tugas SITugas
                </p>
              </div>

              {/* Subtle Administrator Link */}
              <div className="mt-4 pt-4 border-t border-[#EEF2F6] flex justify-center">
                <button
                  type="button"
                  onClick={switchToAdmin}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 text-xs text-[#5B738E] hover:text-[#0B1E3B] transition-colors font-semibold cursor-pointer group py-1 px-2.5 rounded-lg hover:bg-slate-50"
                >
                  <Shield className="w-3.5 h-3.5 text-[#5B738E] group-hover:text-[#0B1E3B] transition-colors" />
                  <span>Masuk sebagai Administrator</span>
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
