'use client';

import { useState } from 'react';
import { BarChart3, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function PollCard({ poll, votes = [], currentUserId, isMine, isDark, onVoted }) {
  const [votingIdx, setVotingIdx] = useState(null);

  if (!poll) return null;
  const options = Array.isArray(poll.options) ? poll.options : [];
  const totalVoters = new Set(votes.map((v) => v.user_id)).size;
  const myVotes = new Set(votes.filter((v) => v.user_id === currentUserId).map((v) => v.option_index));

  const handleVote = async (idx) => {
    if (!currentUserId || votingIdx !== null || poll.is_closed) return;
    setVotingIdx(idx);
    try {
      const already = myVotes.has(idx);
      if (already) {
        await supabase
          .from('poll_votes')
          .delete()
          .eq('poll_id', poll.id)
          .eq('user_id', currentUserId)
          .eq('option_index', idx);
      } else {
        if (!poll.allow_multiple) {
          await supabase
            .from('poll_votes')
            .delete()
            .eq('poll_id', poll.id)
            .eq('user_id', currentUserId);
        }
        await supabase.from('poll_votes').insert({
          poll_id: poll.id,
          user_id: currentUserId,
          option_index: idx,
        });
      }
      onVoted?.();
    } finally {
      setVotingIdx(null);
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`min-w-[235px] max-w-[280px] p-3 rounded-xl border space-y-2.5 mb-1 ${
        isMine
          ? 'bg-black/15 border-white/20 text-white'
          : isDark
            ? 'bg-zinc-900/90 border-zinc-700 text-zinc-100'
            : 'bg-zinc-50 border-zinc-200 text-zinc-900'
      }`}
    >
      <div className="flex items-start gap-2">
        <BarChart3 className="w-4 h-4 shrink-0 mt-0.5 opacity-85" />
        <div className="min-w-0">
          <p className="text-xs font-bold leading-snug">{poll.question}</p>
          <p className={`text-[10px] ${isMine ? 'text-blue-100/80' : 'text-zinc-400'}`}>
            {poll.allow_multiple ? 'Pilih satu atau lebih' : 'Pilih satu'} · {totalVoters} suara
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        {options.map((optText, idx) => {
          const count = votes.filter((v) => v.option_index === idx).length;
          const pct = totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0;
          const picked = myVotes.has(idx);
          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleVote(idx)}
              className={`relative w-full overflow-hidden rounded-lg border px-2.5 py-2 text-left transition ${
                picked
                  ? isMine
                    ? 'border-white bg-white/20'
                    : 'border-blue-500 bg-blue-600/15'
                  : isMine
                    ? 'border-white/20 hover:bg-white/10'
                    : isDark
                      ? 'border-zinc-700 hover:bg-zinc-800'
                      : 'border-zinc-300 hover:bg-zinc-100'
              }`}
            >
              <div
                style={{ width: `${pct}%` }}
                className={`absolute inset-y-0 left-0 transition-all duration-300 ${
                  isMine ? 'bg-white/20' : 'bg-blue-500/20'
                }`}
              />
              <div className="relative flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 font-medium truncate">
                  {picked && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                  <span className="truncate">{optText}</span>
                </span>
                <span className="text-[11px] font-bold tabular-nums shrink-0">{pct}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
