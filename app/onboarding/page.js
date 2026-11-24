'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, Check, X, Loader2, MessageSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/useTheme';

export default function OnboardingPage() {
  const router = useRouter();
  const { isDark } = useTheme();
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState('idle');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      const authUser = session.user;
      setUser(authUser);

      const { data: prof } = await supabase
        .from('profiles')
        .select('username, display_name, onboarding_completed')
        .eq('id', authUser.id)
        .maybeSingle();

      if (prof?.username && prof?.onboarding_completed) {
        router.replace('/');
        return;
      }

      setDisplayName(
        prof?.display_name ||
          authUser.user_metadata?.full_name ||
          authUser.email?.split('@')[0] ||
          ''
      );
      setLoading(false);
    };
    init();
  }, [router]);

  useEffect(() => {
    const clean = username.trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (clean.length < 3) {
      setStatus('idle');
      return;
    }
    setStatus('checking');
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('check_username_available', { p_username: clean });
      setStatus(data ? 'available' : 'taken');
    }, 300);
    return () => clearTimeout(t);
  }, [username]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user) return;
    setError('');
    setSaving(true);

    try {
      const cleanName = displayName.trim();
      const cleanUser = username
        .trim()
        .replace(/^@+/, '')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');

      if (!cleanName) throw new Error('Nama tampilan wajib diisi.');
      if (cleanUser.length < 3) throw new Error('Username minimal 3 karakter.');

      const { data: available } = await supabase.rpc('check_username_available', {
        p_username: cleanUser,
      });
      if (!available) throw new Error('Username sudah digunakan orang lain.');

      const { error: upErr } = await supabase.from('profiles').upsert({
        id: user.id,
        username: cleanUser,
        display_name: cleanName,
        onboarding_completed: true,
      });
      if (upErr) throw upErr;

      router.replace('/');
    } catch (err) {
      setError(err.message || 'Gagal menyimpan username.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        className={`min-h-[100dvh] flex items-center justify-center ${
          isDark ? 'bg-[#09090B]' : 'bg-white'
        }`}
      >
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  const inputClass = isDark
    ? 'w-full pl-10 pr-9 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-400 text-sm focus:outline-none focus:border-blue-500'
    : 'w-full pl-10 pr-9 py-2.5 rounded-xl bg-zinc-50 border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-blue-600';

  return (
    <div
      className={`min-h-[100dvh] w-full flex items-center justify-center p-4 ${
        isDark ? 'bg-[#09090B] text-zinc-100' : 'bg-zinc-100 text-zinc-900'
      }`}
    >
      <div
        className={`w-full max-w-sm rounded-2xl border p-6 shadow-sm ${
          isDark ? 'bg-[#121215] border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-base">Buat Username Dulu</h1>
            <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Agar temanmu bisa menemukan akunmu
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
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
                placeholder="ridho123"
                className={inputClass}
              />
              {status === 'available' && (
                <Check className="w-4 h-4 text-emerald-500 absolute right-3 top-3" />
              )}
              {status === 'taken' && <X className="w-4 h-4 text-red-500 absolute right-3 top-3" />}
            </div>
            {status === 'available' && (
              <p className="text-[11px] text-emerald-500 mt-1">Username tersedia!</p>
            )}
            {status === 'taken' && (
              <p className="text-[11px] text-red-500 mt-1">Username sudah dipakai.</p>
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
                placeholder="Nama kamu"
                className={inputClass}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || status === 'taken'}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Simpan & Mulai Chat
          </button>
        </form>
      </div>
    </div>
  );
}
