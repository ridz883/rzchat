'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare,
  User,
  Mail,
  Lock,
  Sun,
  Moon,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/useTheme';

export default function LoginPage() {
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();

  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState('idle');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [infoMsg, setInfoMsg] = useState('');
  const [error, setError] = useState('');

  const routeAfterAuth = async (userId) => {
    const { data: prof } = await supabase
      .from('profiles')
      .select('username, onboarding_completed')
      .eq('id', userId)
      .maybeSingle();

    if (!prof || !prof.username || !prof.onboarding_completed) {
      router.replace('/onboarding');
    } else {
      router.replace('/');
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) {
        routeAfterAuth(data.session.user.id);
      }
    });
  }, []);

  useEffect(() => {
    if (step !== 'register') return;
    const clean = username.trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (clean.length < 3) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('check_username_available', { p_username: clean });
      setUsernameStatus(data ? 'available' : 'taken');
    }, 300);
    return () => clearTimeout(timer);
  }, [username, step]);

  // Login 1-klik pilih akun Gmail di HP
  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/onboarding`,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    if (oauthErr) {
      setError(oauthErr.message || 'Gagal menghubungkan ke Google.');
      setGoogleLoading(false);
    }
  };

  const handleCheckEmail = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Masukkan alamat email yang valid.');
      return;
    }

    setLoading(true);
    setError('');
    setInfoMsg('');

    try {
      const { data: exists, error: rpcErr } = await supabase.rpc('check_email_exists', {
        p_email: cleanEmail,
      });
      if (rpcErr) throw rpcErr;

      setEmail(cleanEmail);
      if (exists) {
        setStep('login');
      } else {
        setDisplayName(cleanEmail.split('@')[0]);
        setStep('register');
      }
    } catch (err) {
      setError(err.message || 'Gagal memeriksa email.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInErr) throw signInErr;
      await routeAfterAuth(data.user.id);
    } catch (err) {
      setError(
        err.message === 'Invalid login credentials'
          ? 'Password salah. Coba lagi.'
          : err.message || 'Gagal masuk.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const cleanName = displayName.trim();
      const cleanUser = username
        .trim()
        .replace(/^@+/, '')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');

      if (!cleanName) throw new Error('Nama tampilan wajib diisi.');
      if (cleanUser.length < 3) throw new Error('Username minimal 3 karakter (huruf/angka/_).');

      const { data: available } = await supabase.rpc('check_username_available', {
        p_username: cleanUser,
      });
      if (!available) throw new Error('Username sudah dipakai orang lain.');

      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            username: cleanUser,
            display_name: cleanName,
          },
        },
      });
      if (signUpErr) throw signUpErr;

      if (data?.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          username: cleanUser,
          display_name: cleanName,
          onboarding_completed: true,
        });
      }

      if (data?.session) {
        router.replace('/');
      } else {
        const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (loginErr) {
          setInfoMsg('Akun dibuat! Silakan masuk.');
          setStep('login');
        } else {
          await routeAfterAuth(loginData.user.id);
        }
      }
    } catch (err) {
      setError(err.message || 'Gagal mendaftar.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = isDark
    ? 'w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-400 text-sm focus:outline-none focus:border-blue-500'
    : 'w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-blue-600';

  return (
    <div
      className={`min-h-[100dvh] w-full flex items-center justify-center p-4 transition-colors ${
        isDark ? 'bg-[#09090B] text-zinc-100' : 'bg-zinc-100 text-zinc-900'
      }`}
    >
      <div
        className={`w-full max-w-sm rounded-2xl border p-6 shadow-sm ${
          isDark ? 'bg-[#121215] border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">rzchat</h1>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Pilih akun email untuk langsung masuk
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className={`p-2 rounded-xl border transition ${
              isDark
                ? 'bg-zinc-900 border-zinc-700 text-amber-400'
                : 'bg-zinc-100 border-zinc-200 text-zinc-700'
            }`}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
            {error}
          </div>
        )}

        {infoMsg && (
          <div className="mb-4 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-600 text-xs">
            {infoMsg}
          </div>
        )}

        {step === 'email' && (
          <div className="space-y-4">
            {/* Tombol Utama: Klik Akun Google Langsung Masuk */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2.5 shadow-sm transition"
            >
              {googleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
                  <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"/>
                  <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"/>
                  <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>
                </svg>
              )}
              Masuk dengan Google
            </button>

            <div className="relative flex items-center py-1">
              <div className={`flex-grow border-t ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`} />
              <span className="px-3 text-[11px] text-zinc-400">atau pakai email manual</span>
              <div className={`flex-grow border-t ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`} />
            </div>

            <form onSubmit={handleCheckEmail} className="space-y-3">
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@gmail.com"
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-2.5 rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 transition ${
                  isDark
                    ? 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-zinc-100'
                    : 'bg-zinc-100 border-zinc-200 hover:bg-zinc-200 text-zinc-800'
                }`}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Lanjutkan <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {step === 'login' && (
          <form onSubmit={handlePasswordLogin} className="space-y-3.5">
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setPassword('');
                setError('');
              }}
              className="flex items-center gap-1.5 text-xs text-blue-600 font-medium mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Ganti email ({email})
            </button>

            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                Password Akun
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password kamu"
                  className={inputClass}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Masuk
            </button>
          </form>
        )}

        {step === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3.5">
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setError('');
              }}
              className="flex items-center gap-1.5 text-xs text-blue-600 font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Ganti email ({email})
            </button>

            <div className={`p-3 rounded-xl text-xs ${isDark ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
              Email belum terdaftar. Buat <b>username</b> dan password dulu untuk mulai chat.
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                Username Unik
              </label>
              <div className="relative">
                <span className="text-zinc-400 text-sm font-semibold absolute left-3.5 top-2.5">@</span>
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="minimal 3 huruf/angka"
                  className={inputClass}
                />
                {usernameStatus === 'available' && <Check className="w-4 h-4 text-emerald-500 absolute right-3 top-3" />}
                {usernameStatus === 'taken' && <X className="w-4 h-4 text-red-500 absolute right-3 top-3" />}
              </div>
              {usernameStatus === 'available' && <p className="text-[11px] text-emerald-500 mt-1">Username tersedia!</p>}
              {usernameStatus === 'taken' && <p className="text-[11px] text-red-500 mt-1">Username sudah dipakai.</p>}
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                Nama Tampilan
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Nama panggilan kamu"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                Buat Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className={inputClass}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || usernameStatus === 'taken'}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Buat Akun & Masuk
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
