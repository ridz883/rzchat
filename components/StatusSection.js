'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, CircleDot, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Avatar from './Avatar';
import StatusCreator from './StatusCreator';
import StatusViewer from './StatusViewer';

export default function StatusSection({ currentUser, profile, isDark, onUnseenChange }) {
  const [loading, setLoading] = useState(true);
  const [myStatuses, setMyStatuses] = useState([]);
  const [friendGroups, setFriendGroups] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [showCreator, setShowCreator] = useState(false);
  const [viewingGroup, setViewingGroup] = useState(null);

  const loadStatuses = useCallback(async () => {
    if (!currentUser?.id) return;
    const nowIso = new Date().toISOString();
    const { data: rows } = await supabase
      .from('statuses')
      .select('id, user_id, media_type, media_url, caption, bg_style, privacy_mode, created_at, expires_at')
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: true });

    const list = rows || [];
    const userIds = [...new Set(list.map((s) => s.user_id))];

    const [{ data: profs }, { data: myViews }] = await Promise.all([
      userIds.length > 0
        ? supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', userIds)
        : Promise.resolve({ data: [] }),
      list.length > 0
        ? supabase
            .from('status_views')
            .select('status_id')
            .eq('viewer_id', currentUser.id)
            .in(
              'status_id',
              list.map((s) => s.id)
            )
        : Promise.resolve({ data: [] }),
    ]);

    const pMap = {};
    (profs || []).forEach((p) => {
      pMap[p.id] = p;
    });
    const seenSet = new Set((myViews || []).map((v) => v.status_id));

    const mine = list.filter((s) => s.user_id === currentUser.id);
    setMyStatuses(mine);

    const byFriend = {};
    list
      .filter((s) => s.user_id !== currentUser.id)
      .forEach((s) => {
        if (!byFriend[s.user_id]) {
          byFriend[s.user_id] = {
            user: pMap[s.user_id] || { id: s.user_id, username: 'pengguna', display_name: 'Pengguna' },
            items: [],
            hasUnseen: false,
          };
        }
        byFriend[s.user_id].items.push(s);
        if (!seenSet.has(s.id)) byFriend[s.user_id].hasUnseen = true;
      });

    const groups = Object.values(byFriend).sort((a, b) => Number(b.hasUnseen) - Number(a.hasUnseen));
    setFriendGroups(groups);
    onUnseenChange?.(groups.some((g) => g.hasUnseen));
    setLoading(false);
  }, [currentUser?.id, onUnseenChange]);

  useEffect(() => {
    loadStatuses();
    if (!currentUser?.id) return;
    supabase
      .from('profiles')
      .select('id, username, display_name')
      .neq('id', currentUser.id)
      .limit(50)
      .then(({ data }) => setContacts(data || []));
  }, [currentUser?.id, loadStatuses]);

  return (
    <main className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
      {/* Status Saya */}
      <div
        className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
          isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
        }`}
      >
        <button
          type="button"
          onClick={() => {
            if (myStatuses.length > 0) {
              setViewingGroup({ user: profile, items: myStatuses });
            } else {
              setShowCreator(true);
            }
          }}
          className="flex items-center gap-3 min-w-0 text-left flex-1"
        >
          <div className="relative shrink-0">
            <div
              className={`p-0.5 rounded-full ${
                myStatuses.length > 0 ? 'ring-2 ring-blue-500' : ''
              }`}
            >
              <Avatar
                src={profile?.avatar_url}
                name={profile?.display_name || profile?.username}
                size="md"
              />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center ring-2 ring-black">
              <Plus className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold">Status Saya</p>
            <p className="text-xs text-zinc-400 truncate">
              {myStatuses.length > 0
                ? `${myStatuses.length} status aktif (ketuk untuk lihat penonton)`
                : 'Ketuk untuk bagikan foto, video HD, atau teks 24 jam'}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setShowCreator(true)}
          className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold shrink-0"
        >
          + Buat
        </button>
      </div>

      {/* Pembaruan Status Teman */}
      <div className="space-y-2.5">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
          Pembaruan Terbaru ({friendGroups.length})
        </p>

        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : friendGroups.length === 0 ? (
          <div className="py-12 text-center space-y-1.5">
            <CircleDot className="w-9 h-9 mx-auto text-zinc-500 opacity-50" />
            <p className="text-sm font-medium">Belum ada status teman dalam 24 jam terakhir</p>
            <p className="text-xs text-zinc-400">Status yang dibagikan teman akan muncul otomatis di sini.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {friendGroups.map((g) => {
              const latest = g.items[g.items.length - 1];
              return (
                <button
                  key={g.user.id}
                  type="button"
                  onClick={() => setViewingGroup(g)}
                  className={`w-full p-3 rounded-2xl border flex items-center gap-3 text-left transition ${
                    isDark
                      ? 'bg-zinc-900/70 border-zinc-800 hover:border-blue-500'
                      : 'bg-white border-zinc-200 hover:border-blue-500'
                  }`}
                >
                  <div
                    className={`p-0.5 rounded-full shrink-0 ${
                      g.hasUnseen ? 'ring-2 ring-emerald-500' : 'ring-2 ring-zinc-500/40'
                    }`}
                  >
                    <Avatar
                      src={g.user.avatar_url}
                      name={g.user.display_name || g.user.username}
                      size="md"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">
                      {g.user.display_name || g.user.username}
                    </p>
                    <p className="text-xs text-zinc-400 truncate">
                      {g.items.length} pembaruan ·{' '}
                      {new Date(latest.created_at).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {showCreator && (
        <StatusCreator
          currentUser={currentUser}
          contacts={contacts}
          isDark={isDark}
          onClose={() => setShowCreator(false)}
          onPublished={loadStatuses}
        />
      )}

      {viewingGroup && (
        <StatusViewer
          group={viewingGroup}
          currentUser={currentUser}
          onClose={() => setViewingGroup(null)}
          onDeleted={loadStatuses}
          onViewed={loadStatuses}
        />
      )}
    </main>
  );
}
