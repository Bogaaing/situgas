import React, { useState, startTransition } from 'react';
import { User as UserIcon, Presentation, ArrowRight, GraduationCap, Eye, EyeOff, AlertCircle, Mail, Lock } from 'lucide-react';
import { User } from '../types';
import { supabase } from '../lib/supabase';
import { INITIAL_STUDENTS } from '../data';

interface LoginPageProps {
  onLogin: (user: User) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [role, setRole] = useState<'student' | 'lecturer'>('student');
  const [nim, setNim] = useState('');
  const [email, setEmail] = useState('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    setDevMessage('');

    if (role === 'lecturer') {
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password
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
          setErrorMessage('Akun ini terdaftar sebagai Mahasiswa. Silakan masuk melalui menu Mahasiswa.');
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
          password
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
          setErrorMessage('Akun ini tidak memiliki akses sebagai mahasiswa.');
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
    <div className="bg-[#F2F4F7] min-h-screen flex items-center justify-center p-4 font-sans select-none">
      <div className="w-full max-w-[400px] animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="bg-white px-8 py-10 rounded-[32px] shadow-2xl shadow-slate-200/80 border border-slate-100 flex flex-col">
          
          {/* Circular Badge with GraduationCap */}
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-[#0B2147] rounded-full flex items-center justify-center shadow-lg shadow-[#0B2147]/10">
              <GraduationCap className="text-white w-10 h-10" />
            </div>
          </div>

          {/* App Title */}
          <h2 className="text-2xl font-bold text-center text-[#0B2147] tracking-tight mb-6">
            SITugas
          </h2>

          {/* Role Switcher as Segmented Control */}
          <div className="flex justify-center mb-6">
            <div className="bg-[#EBF0F6] p-1 rounded-full flex gap-1 w-full max-w-[280px]">
              <button
                type="button"
                id="role-student"
                onClick={() => selectRole('student')}
                disabled={isLoading}
                className={`flex-1 py-2 px-5 text-xs font-bold rounded-full transition-all duration-300 cursor-pointer text-center ${
                  role === 'student'
                    ? 'bg-[#0B2147] text-white shadow-md shadow-[#0B2147]/15'
                    : 'text-slate-500 hover:text-[#0B2147]'
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
                    ? 'bg-[#0B2147] text-white shadow-md shadow-[#0B2147]/15'
                    : 'text-slate-500 hover:text-[#0B2147]'
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
                  <label className="text-xs font-bold text-slate-800 block" htmlFor="nim">
                    NIM
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <UserIcon className="text-slate-400 w-4 h-4" />
                    </div>
                    <input
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-slate-100 focus:border-[#0B2147] outline-none transition-all placeholder:text-slate-400"
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
                  <label className="text-xs font-bold text-slate-800 block" htmlFor="password">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock className="text-slate-400 w-4 h-4" />
                    </div>
                    <input
                      className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-slate-100 focus:border-[#0B2147] outline-none transition-all placeholder:text-slate-400"
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
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
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
                  <label className="text-xs font-bold text-slate-800 block" htmlFor="email">
                    Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Mail className="text-slate-400 w-4 h-4" />
                    </div>
                    <input
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-slate-100 focus:border-[#0B2147] outline-none transition-all placeholder:text-slate-400"
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
                  <label className="text-xs font-bold text-slate-800 block" htmlFor="password-lecturer">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock className="text-slate-400 w-4 h-4" />
                    </div>
                    <input
                      className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-slate-100 focus:border-[#0B2147] outline-none transition-all placeholder:text-slate-400"
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
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
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
              className="w-full py-3 bg-[#0B2147] text-white rounded-xl font-bold text-xs hover:bg-[#0B2147]/95 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer mt-6 shadow-md shadow-[#0B2147]/10 disabled:opacity-50"
            >
              {isLoading ? 'Memproses...' : (
                <>
                  Masuk <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-[11px] text-slate-400 font-medium">
              Sistem Informasi Manajemen Tugas SITugas
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
