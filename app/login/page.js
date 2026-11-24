'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, User, Mail, Lock, Sun, Moon, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/useTheme';

export default function LoginPage() {
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const [isRegister, setIsRegister] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/');
    });
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        const cleanUsername = username.trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '');
        const cleanName = displayName.trim();

        if (!cleanName) throw new Error('Nama tampilan wajib diisi.');
        if (cleanUsername.length < 3) throw new Error('Username minimal 3 karakter (huruf/angka/underscore).');

        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .ilike('username', cleanUsername)
          .maybeSingle();

        if (existing) throw new Error('Username sudah dipakai orang lain.');

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              username: cleanUsername,
              display_name: cleanName,
            },
          },
        });

        if (signUpError) throw signUpError;

        if (data?.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            username: cleanUsername,
            display_name: cleanName,
          });
        }

        if (data?.session) {
          router.replace('/');
        } else {
          const { error: loginErr } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (loginErr) throw new Error('Akun dibuat, silakan coba Masuk.');
          router.replace('/');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        router.replace('/');
      }
    } catch (err) {
      setError(err.message || 'Terjadi kesalahan.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = isDark
    ? 'w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-400 text-sm focus:outline-none focus:border-blue-500'
    : 'w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-blue-600';

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-colors ${isDark ? 'bg-[#09090B] text-zinc-100' : 'bg-zinc-100 text-zinc-900'}`}>
      <div className={`w-full max-w-sm rounded-2xl border p-6 shadow-sm ${isDark ? 'bg-[#121215] border-zinc-800' : 'bg-white border-zinc-200'}`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">rzchat</h1>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>Ngobrol realtime tanpa ribet</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            title="Ganti Tema"
            className={`p-2 rounded-xl border transition ${isDark ? 'bg-zinc-900 border-zinc-700 text-amber-400' : 'bg-zinc-100 border-zinc-200 text-zinc-700'}`}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <div className={`grid grid-cols-2 gap-1 p-1 rounded-xl mb-5 ${isDark ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
          <button
            type="button"
            onClick={() => { setIsRegister(false); setError(''); }}
            className={`py-2 rounded-lg text-sm font-medium transition ${!isRegister ? 'bg-blue-600 text-white shadow-sm' : isDark ? 'text-zinc-400' : 'text-zinc-600'}`}
          >
            Masuk
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setError(''); }}
            className={`py-2 rounded-lg text-sm font-medium transition ${isRegister ? 'bg-blue-600 text-white shadow-sm' : isDark ? 'text-zinc-400' : 'text-zinc-600'}`}
          >
            Daftar Baru
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {isRegister && (
            <>
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
                    placeholder="Contoh: Ridho"
                    className={inputClass}
                  />
                </div>
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
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
                    placeholder="ridho123"
                    className={inputClass}
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
              Email
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

          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
              Password
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
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition mt-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {isRegister ? 'Buat Akun' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  );
}
