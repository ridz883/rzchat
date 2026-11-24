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

  // step: 'email' | 'login' | 'register' | 'otp'
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState('idle'); // idle | checking | available | taken
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
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

  // Cek ketersediaan username live saat mendaftar
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

  // Langkah 1: Cek apakah email sudah punya akun
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

  // Masuk untuk email yang sudah punya akun
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

  // Buat akun + username untuk email baru
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
          setInfoMsg('Akun dibuat! Cek kotak masuk email kamu untuk konfirmasi lalu login.');
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

  // Opsi login lewat Kode/Link Email (Passwordless)
  const handleSendEmailOtp = async () => {
    setLoading(true);
    setError('');
    setInfoMsg('');
    try {
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/onboarding`,
        },
      });
      if (otpErr) throw otpErr;
      setInfoMsg('Link login / kode verifikasi telah dikirim ke email kamu.');
      setStep('otp');
    } catch (err) {
      setError(err.message || 'Gagal mengirim email verifikasi.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data, error: verifyErr } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otpCode.trim(),
        type: 'email',
      });
      if (verifyErr) throw verifyErr;
      await routeAfterAuth(data.user.id);
    } catch (err) {
      setError('Kode OTP tidak valid atau kedaluwarsa.');
    } finally {
      setLoading(false);
    }
  };

  // Opsi Login Google (Otomatis arahkan buat username jika belum punya akun)
  const handleGoogleLogin = async () => {
    setError('');
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/onboarding`,
      },
    });
    if (oauthErr) setError(oauthErr.message);
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
                Masuk cepat menggunakan email
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

        {/* STEP 1: INPUT EMAIL */}
        {step === 'email' && (
          <div className="space-y-4">
            <form onSubmit={handleCheckEmail} className="space-y-3.5">
              <div>
                <label
                  className={`block text-xs font-medium mb-1.5 ${
                    isDark ? 'text-zinc-300' : 'text-zinc-700'
                  }`}
                >
                  Alamat Email
                </label>
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
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition"
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

            <div className="relative flex items-center py-1">
              <div className={`flex-grow border-t ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`} />
              <span className="px-3 text-[11px] text-zinc-400">atau</span>
              <div className={`flex-grow border-t ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`} />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className={`w-full py-2.5 rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 transition ${
                isDark
                  ? 'bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-zinc-100'
                  : 'bg-white border-zinc-300 hover:bg-zinc-50 text-zinc-800'
              }`}
            >
              Lanjutkan dengan Google
            </button>
          </div>
        )}

        {/* STEP 2A: EMAIL SUDAH TERDAFTAR -> MASUK */}
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
              <label
                className={`block text-xs font-medium mb-1.5 ${
                  isDark ? 'text-zinc-300' : 'text-zinc-700'
                }`}
              >
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

            <button
              type="button"
              onClick={handleSendEmailOtp}
              disabled={loading}
              className={`w-full py-2 rounded-xl text-xs font-medium transition ${
                isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Lupa password? Masuk pakai Link / Kode Email
            </button>
          </form>
        )}

        {/* STEP 2B: EMAIL BELUM TERDAFTAR -> WAJIB BUAT USERNAME DULU */}
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

            <div
              className={`p-3 rounded-xl text-xs ${
                isDark ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-700'
              }`}
            >
              Email ini belum memiliki akun. Buat <b>username</b> dan password dulu untuk mulai
              mengobrol.
            </div>

            <div>
              <label
                className={`block text-xs font-medium mb-1.5 ${
                  isDark ? 'text-zinc-300' : 'text-zinc-700'
                }`}
              >
                Username Unik
              </label>
              <div className="relative">
                <span className="text-zinc-400 text-sm font-semibold absolute left-3.5 top-2.5">
                  @
                </span>
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) =>
                    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                  }
                  placeholder="minimal 3 huruf/angka"
                  className={inputClass}
                />
                {usernameStatus === 'available' && (
                  <Check className="w-4 h-4 text-emerald-500 absolute right-3 top-3" />
                )}
                {usernameStatus === 'taken' && (
                  <X className="w-4 h-4 text-red-500 absolute right-3 top-3" />
                )}
              </div>
              {usernameStatus === 'available' && (
                <p className="text-[11px] text-emerald-500 mt-1">Username tersedia!</p>
              )}
              {usernameStatus === 'taken' && (
                <p className="text-[11px] text-red-500 mt-1">Username sudah dipakai orang lain.</p>
              )}
            </div>

            <div>
              <label
                className={`block text-xs font-medium mb-1.5 ${
                  isDark ? 'text-zinc-300' : 'text-zinc-700'
                }`}
              >
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
              <label
                className={`block text-xs font-medium mb-1.5 ${
                  isDark ? 'text-zinc-300' : 'text-zinc-700'
                }`}
              >
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

        {/* STEP 3: VERIFIKASI OTP EMAIL */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-3.5">
            <button
              type="button"
              onClick={() => setStep('login')}
              className="flex items-center gap-1.5 text-xs text-blue-600 font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Kembali
            </button>
            <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Klik link login yang masuk ke <b>{email}</b>, atau masukkan kode OTP jika tersedia:
            </p>
            <input
              type="text"
              required
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              placeholder="Masukkan kode OTP"
              className={`w-full px-3.5 py-2.5 rounded-xl border text-center tracking-widest font-bold text-sm focus:outline-none ${
                isDark
                  ? 'bg-zinc-900 border-zinc-700 text-white'
                  : 'bg-zinc-50 border-zinc-300 text-zinc-900'
              }`}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Verifikasi Kode
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
