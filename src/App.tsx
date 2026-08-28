import { useState, useEffect, useTransition } from 'react';
import { User } from './types';
import LoginPage from './components/LoginPage';
import LecturerPortal from './components/LecturerPortal';
import StudentPortal from './components/StudentPortal';
import AdminPortal from './components/AdminPortal';
import { supabase } from './lib/supabase';
import { setIdToken } from './lib/api';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Load and listen to user auth session from Supabase
  useEffect(() => {
    let active = true;
    setIsLoadingAuth(true);

    const handleSession = async (session: any) => {
      if (!active) return;
      if (session?.user) {
        try {
          const token = session.access_token;
          setIdToken(token);

          // Get database user from profiles table
          const { data: dbUser, error: dbError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (dbError) throw dbError;

          if (dbUser) {
            if (dbUser.role === 'admin') {
              setCurrentUser({
                uid: dbUser.id,
                role: 'admin',
                email: dbUser.email || session.user.email || '',
                name: dbUser.name || 'Administrator',
                avatarUrl: dbUser.avatar_url || '',
                idNumber: dbUser.nim || undefined,
              });
            } else if (dbUser.role === 'lecturer') {
              setCurrentUser({
                uid: dbUser.id,
                role: 'lecturer',
                email: dbUser.email || session.user.email || '',
                name: dbUser.name || 'Dosen',
                avatarUrl: dbUser.avatar_url || '',
                idNumber: dbUser.nim || undefined,
              });
            } else if (dbUser.role === 'student') {
              setCurrentUser({
                uid: dbUser.id,
                role: 'student',
                email: dbUser.email || `${dbUser.nim || dbUser.id}@students.situgas.local`,
                name: dbUser.name || 'Mahasiswa',
                avatarUrl: dbUser.avatar_url || '',
                idNumber: dbUser.nim || undefined,
              });
            } else {
              // Sign out if role is unknown or not permitted
              await supabase.auth.signOut();
              setCurrentUser(null);
            }
          } else {
            console.log('User logged in to Supabase but no profile found.');
            await supabase.auth.signOut();
            setCurrentUser(null);
          }
        } catch (e) {
          console.error('Error loading Supabase user profile:', e);
          setCurrentUser(null);
        }
      } else {
        setIdToken(null);
        setCurrentUser(null);
      }
      setIsLoadingAuth(false);
    };

    // Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    // Event listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      handleSession(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = (user: User) => {
    startTransition(() => {
      setCurrentUser(user);
    });
  };

  const handleLogout = async () => {
    setIsLoadingAuth(true);
    try {
      await supabase.auth.signOut();
      setIdToken(null);
      setCurrentUser(null);
    } catch (e) {
      console.error('Error signing out:', e);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0B2147]"></div>
        <p className="mt-4 text-xs font-semibold text-[#0B2147]">Memuat SITugas...</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen font-sans antialiased text-gray-900 bg-background selection:bg-secondary selection:text-white">
      {!currentUser ? (
        <LoginPage onLogin={handleLogin} />
      ) : currentUser.role === 'admin' ? (
        <AdminPortal
          user={currentUser}
          onLogout={handleLogout}
        />
      ) : currentUser.role === 'lecturer' ? (
        <LecturerPortal
          user={currentUser}
          onLogout={handleLogout}
        />
      ) : (
        <StudentPortal
          user={currentUser}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}
