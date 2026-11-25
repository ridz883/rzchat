'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users, Loader2, ArrowRight, AlertCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../lib/useTheme';
import Avatar from '../../../components/Avatar';

function JoinGroupContent() {
  const params = useParams();
  const router = useRouter();
  const code = String(params?.code || '').trim();
  const { isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [groupInfo, setGroupInfo] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      const { data, error } = await supabase.rpc('get_group_by_invite', {
        p_invite_code: code,
      });
      if (!active) return;
      if (error || !data) {
        setErrorMsg('Tautan undangan grup tidak valid atau sudah diganti admin.');
      } else {
        setGroupInfo(data);
      }
      setLoading(false);
    };
    if (code) load();
    else {
      setErrorMsg('Kode undangan tidak ditemukan.');
      setLoading(false);
    }
    return () => {
      active = false;
    };
  }, [code, router]);

  const handleJoin = async () => {
    if (joining || !groupInfo) return;
    if (groupInfo.already_joined) {
      router.replace(`/chat/${groupInfo.id}`);
      return;
    }
    setJoining(true);
    try {
      const { data: roomId, error } = await supabase.rpc('join_group_by_invite', {
        p_invite_code: code,
      });
      if (error) throw error;
      router.replace(`/chat/${roomId}`);
    } catch (err) {
      setErrorMsg(err.message || 'Gagal bergabung ke grup.');
      setJoining(false);
    }
  };

  return (
    <div
      className={`min-h-[100dvh] flex items-center justify-center p-4 ${
        isDark ? 'bg-[#09090B] text-zinc-100' : 'bg-zinc-50 text-zinc-900'
      }`}
    >
      <div
        className={`w-full max-w-sm rounded-3xl p-6 border shadow-xl text-center space-y-4 ${
          isDark ? 'bg-[#121215] border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
          </div>
        ) : errorMsg ? (
          <>
            <div className="w-14 h-14 rounded-2xl bg-red-500/15 text-red-500 mx-auto flex items-center justify-center">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h1 className="text-base font-bold">Undangan Tidak Berlaku</h1>
            <p className="text-xs text-zinc-400">{errorMsg}</p>
            <button
              type="button"
              onClick={() => router.replace('/')}
              className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold"
            >
              Kembali ke Beranda
            </button>
          </>
        ) : (
          <>
            <div className="flex justify-center">
              <Avatar src={groupInfo.avatar_url} name={groupInfo.name} size="xl" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-600/15 text-blue-500 text-[11px] font-semibold mb-1.5">
                <Users className="w-3 h-3" /> Undangan Grup · {groupInfo.member_count} anggota
              </span>
              <h1 className="text-lg font-bold">{groupInfo.name}</h1>
              {groupInfo.description && (
                <p className="text-xs text-zinc-400 mt-1 line-clamp-3">{groupInfo.description}</p>
              )}
            </div>

            <button
              type="button"
              disabled={joining}
              onClick={handleJoin}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2"
            >
              {joining ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>{groupInfo.already_joined ? 'Buka Grup' : 'Gabung ke Grup'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function JoinGroupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] bg-[#09090B] flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
        </div>
      }
    >
      <JoinGroupContent />
    </Suspense>
  );
}
