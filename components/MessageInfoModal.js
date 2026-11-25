'use client';

import { useEffect, useState } from 'react';
import { X, CheckCheck, Clock, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Avatar from './Avatar';

export default function MessageInfoModal({ message, members = [], isDark, onClose }) {
  const [reads, setReads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!message?.id) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('message_reads')
        .select('user_id, read_at')
        .eq('message_id', message.id);
      if (active) {
        setReads(data || []);
        setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [message?.id]);

  if (!message) return null;

  const readMap = {};
  reads.forEach((r) => {
    readMap[r.user_id] = r.read_at;
  });

  const recipients = members.filter((m) => m.user_id !== message.sender_id);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl space-y-4 ${
          isDark ? 'bg-[#121215] text-zinc-100 border border-zinc-800' : 'bg-white text-zinc-900'
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <CheckCheck className="w-4 h-4 text-emerald-500" /> Info Pesan
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className={`p-3 rounded-xl border text-xs ${
            isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
          }`}
        >
          <p className="line-clamp-3 font-medium">
            {message.content || `Media (${message.media_type || 'pesan'})`}
          </p>
          <p className="text-[10px] text-zinc-400 mt-1">
            Dikirim:{' '}
            {new Date(message.created_at).toLocaleString('id-ID', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>

        {loading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {recipients.map((m) => {
              const p = m.profile || {};
              const readAt = readMap[m.user_id] || (recipients.length === 1 ? message.read_at : null);
              return (
                <div
                  key={m.user_id}
                  className={`p-2.5 rounded-xl flex items-center justify-between gap-2 ${
                    isDark ? 'bg-zinc-900/70' : 'bg-zinc-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar src={p.avatar_url} name={p.display_name || p.username} size="xs" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{p.display_name || p.username}</p>
                      <p className="text-[10px] text-zinc-400 truncate">@{p.username}</p>
                    </div>
                  </div>
                  {readAt ? (
                    <span className="text-[11px] font-semibold text-emerald-500 flex items-center gap-1 shrink-0">
                      <CheckCheck className="w-3.5 h-3.5" />
                      {new Date(readAt).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  ) : (
                    <span className="text-[11px] text-zinc-400 flex items-center gap-1 shrink-0">
                      <Clock className="w-3.5 h-3.5" /> Terkirim
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
