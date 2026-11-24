'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  SwitchCamera,
  PhoneIncoming,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sendPushNotification } from '../lib/pushClient';
import Avatar from './Avatar';

const CallContext = createContext(null);

export function useCall() {
  return useContext(CallContext);
}

const formatCallTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
};

export default function CallProvider({ children }) {
  const [authUser, setAuthUser] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  // State Panggilan WebRTC
  // idle | calling | ringing | connecting | connected
  const [callState, setCallState] = useState('idle');
  const [callInfo, setCallInfo] = useState(null);
  const [callStatusText, setCallStatusText] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const incomingOfferRef = useRef(null);
  const pendingIceRef = useRef([]);
  const callStateRef = useRef('idle');
  const callInfoRef = useRef(null);
  const outgoingChannelsRef = useRef(new Map());
  const ringTimerRef = useRef(null);
  const callTimerRef = useRef(null);
  const timeoutRef = useRef(null);
  const audioCtxRef = useRef(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    callInfoRef.current = callInfo;
  }, [callInfo]);

  // Lampirkan stream video & audio setiap kali elemen mount atau stream berubah
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream, callState, isCamOff]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [remoteStream, callState]);

  // Nada dering / nada panggil sintetis (Web Audio API, tanpa butuh file mp3)
  const stopTone = useCallback(() => {
    if (ringTimerRef.current) {
      clearInterval(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  const playTone = useCallback(
    (mode) => {
      stopTone();
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;

        const beep = () => {
          if (ctx.state === 'suspended') ctx.resume().catch(() => {});
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = mode === 'ringing' ? 660 : 440;
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.55);
        };

        beep();
        ringTimerRef.current = setInterval(beep, mode === 'ringing' ? 1400 : 2200);
      } catch {
        // Browser memblokir autoplay audio sebelum interaksi
      }
    },
    [stopTone]
  );

  // Kirim sinyal ke inbox lawan bicara via Supabase Realtime Broadcast
  const sendSignal = useCallback(async (targetUserId, payload) => {
    if (!targetUserId) return;
    let entry = outgoingChannelsRef.current.get(targetUserId);

    if (!entry) {
      const ch = supabase.channel(`call-inbox-${targetUserId}`, {
        config: { broadcast: { self: false } },
      });
      const ready = new Promise((resolve) => {
        const timer = setTimeout(() => resolve(ch), 5000);
        ch.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timer);
            resolve(ch);
          }
        });
      });
      entry = { ch, ready };
      outgoingChannelsRef.current.set(targetUserId, entry);
    }

    const channel = await entry.ready;
    await channel.send({
      type: 'broadcast',
      event: 'signal',
      payload,
    });
  }, []);

  const cleanupCall = useCallback(() => {
    stopTone();
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    outgoingChannelsRef.current.forEach(({ ch }) => {
      supabase.removeChannel(ch);
    });
    outgoingChannelsRef.current.clear();

    incomingOfferRef.current = null;
    pendingIceRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setCallState('idle');
    setCallInfo(null);
    setCallStatusText('');
    setCallDuration(0);
    setIsMuted(false);
    setIsCamOff(false);
    setFacingMode('user');
  }, [stopTone]);

  const fetchIceServers = async () => {
    try {
      const res = await fetch('/api/turn');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          return data.iceServers;
        }
      }
    } catch {}
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ];
  };

  const createPeerConnection = useCallback(
    async (targetUserId, callId) => {
      const iceServers = await fetchIceServers();
      const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 6 });

      const remoteMedia = new MediaStream();
      setRemoteStream(remoteMedia);

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          event.streams[0].getTracks().forEach((track) => {
            if (!remoteMedia.getTracks().some((t) => t.id === track.id)) {
              remoteMedia.addTrack(track);
            }
          });
        } else if (event.track) {
          remoteMedia.addTrack(event.track);
        }
        const nextStream = new MediaStream(remoteMedia.getTracks());
        setRemoteStream(nextStream);
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = nextStream;
          remoteAudioRef.current.muted = false;
          remoteAudioRef.current.volume = 1.0;
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && authUser) {
          sendSignal(targetUserId, {
            type: 'ice',
            callId,
            fromId: authUser.id,
            candidate: event.candidate.toJSON(),
          }).catch(() => {});
        }
      };

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'connected') {
          stopTone();
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          const hasDtls =
            Boolean(pc.localDescription?.sdp?.includes('a=fingerprint:')) &&
            Boolean(pc.remoteDescription?.sdp?.includes('a=fingerprint:'));
          setCallState('connected');
          setCallStatusText(hasDtls ? 'Terhubung · DTLS-SRTP' : 'Terhubung');
          if (remoteAudioRef.current) {
            remoteAudioRef.current.muted = false;
            remoteAudioRef.current.volume = 1.0;
            remoteAudioRef.current.play().catch(() => {});
          }
          if (!callTimerRef.current) {
            callTimerRef.current = setInterval(() => {
              setCallDuration((d) => d + 1);
            }, 1000);
          }
        } else if (st === 'failed') {
          setCallStatusText('Koneksi terputus');
          setTimeout(() => cleanupCall(), 1500);
        } else if (st === 'disconnected') {
          setCallStatusText('Menyambungkan ulang...');
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [authUser, sendSignal, stopTone, cleanupCall]
  );

  // Mulai panggilan keluar (Telepon Suara / Video Call)
  const startCall = useCallback(
    async ({ roomId, targetUser, callType = 'audio' }) => {
      if (!authUser || !targetUser?.id) return;
      if (callStateRef.current !== 'idle') {
        alert('Sedang dalam panggilan lain.');
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Browser tidak mendukung panggilan suara/video.');
        return;
      }

      try {
        const { data: allowed } = await supabase.rpc('can_signal_call', {
          p_room_id: String(roomId),
          p_target_id: targetUser.id,
        });
        if (!allowed) {
          alert('Panggilan ditolak: pastikan kamu anggota ruang chat ini dan tidak sedang diblokir.');
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true },
            channelCount: { ideal: 1 },
            sampleRate: { ideal: 48000 },
          },
          video:
            callType === 'video'
              ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
              : false,
        });

        const callId = `${authUser.id}-${Date.now()}`;
        localStreamRef.current = stream;
        setLocalStream(stream);
        setCallInfo({ callId, roomId, callType, peer: targetUser, isCaller: true });
        setCallState('calling');
        setCallStatusText('Memanggil...');
        playTone('calling');

        const pc = await createPeerConnection(targetUser.id, callId);
        stream.getTracks().forEach((track) => {
          const sender = pc.addTrack(track, stream);
          if (track.kind === 'audio' && sender?.getParameters) {
            try {
              const params = sender.getParameters();
              if (!params.encodings) params.encodings = [{}];
              params.encodings[0].maxBitrate = 64000;
              sender.setParameters(params).catch(() => {});
            } catch {}
          }
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await sendSignal(targetUser.id, {
          type: 'offer',
          callId,
          roomId,
          callType,
          offer: pc.localDescription.toJSON(),
          caller: {
            id: authUser.id,
            username: myProfile?.username || 'user',
            display_name: myProfile?.display_name || myProfile?.username || 'Pengguna',
            avatar_url: myProfile?.avatar_url || '',
          },
        });

        // Kirim juga True Web Push agar HP lawan bicara berdering walau minimize
        sendPushNotification({
          roomId,
          title:
            callType === 'video'
              ? `📹 Video Call dari ${myProfile?.display_name || myProfile?.username}`
              : `📞 Telepon dari ${myProfile?.display_name || myProfile?.username}`,
          body: 'Ketuk untuk membuka aplikasi dan mengangkat panggilan',
          url: `/chat/${roomId}`,
          tag: `call-${callId}`,
        });

        // Timeout 45 detik jika tidak diangkat
        timeoutRef.current = setTimeout(() => {
          if (callStateRef.current === 'calling') {
            sendSignal(targetUser.id, {
              type: 'end',
              callId,
              fromId: authUser.id,
              reason: 'Tidak dijawab',
            }).catch(() => {});
            cleanupCall();
          }
        }, 45000);
      } catch (err) {
        cleanupCall();
        alert('Gagal memulai panggilan: pastikan izin mikrofon/kamera diaktifkan.');
      }
    },
    [authUser, myProfile, createPeerConnection, sendSignal, playTone, cleanupCall]
  );

  // Angkat panggilan masuk
  const acceptCall = useCallback(async () => {
    const info = callInfoRef.current;
    const offer = incomingOfferRef.current;
    if (!authUser || !info || !offer) return;

    stopTone();
    setCallState('connecting');
    setCallStatusText('Menyambungkan...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 },
        },
        video:
          info.callType === 'video'
            ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
            : false,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = await createPeerConnection(info.peer.id, info.callId);
      stream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, stream);
        if (track.kind === 'audio' && sender?.getParameters) {
          try {
            const params = sender.getParameters();
            if (!params.encodings) params.encodings = [{}];
            params.encodings[0].maxBitrate = 64000;
            sender.setParameters(params).catch(() => {});
          } catch {}
        }
      });

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Flush seluruh ICE candidate yang sempat datang duluan saat masih berdering
      for (const cand of pendingIceRef.current) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch {}
      }
      pendingIceRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await sendSignal(info.peer.id, {
        type: 'answer',
        callId: info.callId,
        fromId: authUser.id,
        answer: pc.localDescription.toJSON(),
      });
    } catch (err) {
      if (info?.peer?.id && authUser) {
        sendSignal(info.peer.id, { type: 'reject', callId: info.callId, fromId: authUser.id }).catch(
          () => {}
        );
      }
      cleanupCall();
      alert('Gagal mengangkat panggilan: pastikan izin mikrofon/kamera aktif.');
    }
  }, [authUser, stopTone, createPeerConnection, sendSignal, cleanupCall]);

  // Tolak atau akhiri panggilan
  const endCall = useCallback(() => {
    const info = callInfoRef.current;
    if (info?.peer?.id && authUser) {
      const sigType = callStateRef.current === 'ringing' ? 'reject' : 'end';
      sendSignal(info.peer.id, {
        type: sigType,
        callId: info.callId,
        fromId: authUser.id,
      }).catch(() => {});
    }
    cleanupCall();
  }, [authUser, sendSignal, cleanupCall]);

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const next = !isMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setIsMuted(next);
  };

  const toggleCamera = () => {
    if (!localStreamRef.current) return;
    const next = !isCamOff;
    localStreamRef.current.getVideoTracks().forEach((t) => {
      t.enabled = !next;
    });
    setIsCamOff(next);
  };

  const switchCamera = async () => {
    if (!localStreamRef.current || !pcRef.current) return;
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    try {
      const newVideoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextMode, width: { ideal: 640 }, height: { ideal: 480 } },
      });
      const newTrack = newVideoStream.getVideoTracks()[0];
      const oldTrack = localStreamRef.current.getVideoTracks()[0];

      const sender = pcRef.current
        .getSenders()
        .find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        await sender.replaceTrack(newTrack);
      }

      if (oldTrack) {
        localStreamRef.current.removeTrack(oldTrack);
        oldTrack.stop();
      }
      localStreamRef.current.addTrack(newTrack);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      setFacingMode(nextMode);
      setIsCamOff(false);
    } catch {
      alert('Gagal mengganti kamera.');
    }
  };

  // Sinkronisasi sesi Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthUser(data?.session?.user || null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user || null);
      if (!session?.user) {
        cleanupCall();
        setOnlineUsers(new Set());
      }
    });

    return () => listener?.subscription?.unsubscribe();
  }, [cleanupCall]);

  // Presence Online Global + Inbox Panggilan Masuk
  useEffect(() => {
    if (!authUser) return;

    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('id', authUser.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setMyProfile(data);
      });

    const updateLastSeen = () => {
      supabase
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', authUser.id)
        .then(() => {});
    };

    updateLastSeen();
    const lastSeenTimer = setInterval(updateLastSeen, 60000);
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') updateLastSeen();
    };
    document.addEventListener('visibilitychange', onVisChange);

    // 1. Presence Online
    const presenceChannel = supabase.channel('rzchat-online-presence', {
      config: { presence: { key: authUser.id } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        setOnlineUsers(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: authUser.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    // 2. Inbox Sinyal Panggilan WebRTC
    const inboxChannel = supabase
      .channel(`call-inbox-${authUser.id}`, {
        config: { broadcast: { self: false } },
      })
      .on('broadcast', { event: 'signal' }, async ({ payload }) => {
        if (!payload) return;

        if (payload.type === 'offer') {
          if (!payload.roomId || !payload.caller?.id) return;
          const { data: allowed } = await supabase.rpc('can_signal_call', {
            p_room_id: String(payload.roomId),
            p_target_id: payload.caller.id,
          });
          if (!allowed) return;
          if (callStateRef.current !== 'idle') {
            sendSignal(payload.caller.id, {
              type: 'busy',
              callId: payload.callId,
              fromId: authUser.id,
            }).catch(() => {});
            return;
          }
          incomingOfferRef.current = payload.offer;
          pendingIceRef.current = [];
          setCallInfo({
            callId: payload.callId,
            roomId: payload.roomId,
            callType: payload.callType,
            peer: payload.caller,
            isCaller: false,
          });
          setCallState('ringing');
          setCallStatusText(
            payload.callType === 'video' ? 'Panggilan Video Masuk...' : 'Panggilan Suara Masuk...'
          );
          playTone('ringing');
        } else if (payload.type === 'answer') {
          if (
            pcRef.current &&
            callInfoRef.current &&
            payload.callId === callInfoRef.current.callId &&
            payload.fromId === callInfoRef.current.peer?.id
          ) {
            stopTone();
            setCallState('connecting');
            setCallStatusText('Menyambungkan...');
            try {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
              for (const cand of pendingIceRef.current) {
                try {
                  await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
                } catch {}
              }
              pendingIceRef.current = [];
            } catch {}
          }
        } else if (payload.type === 'ice') {
          if (
            callInfoRef.current &&
            payload.callId === callInfoRef.current.callId &&
            payload.fromId === callInfoRef.current.peer?.id
          ) {
            if (pcRef.current && pcRef.current.remoteDescription) {
              try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
              } catch {}
            } else {
              pendingIceRef.current.push(payload.candidate);
            }
          }
        } else if (payload.type === 'end' || payload.type === 'reject' || payload.type === 'busy') {
          if (
            callInfoRef.current &&
            payload.callId === callInfoRef.current.callId &&
            (!payload.fromId || payload.fromId === callInfoRef.current.peer?.id)
          ) {
            stopTone();
            setCallStatusText(
              payload.type === 'busy'
                ? 'Pengguna sedang sibuk'
                : payload.type === 'reject'
                  ? 'Panggilan ditolak'
                  : 'Panggilan berakhir'
            );
            setTimeout(() => cleanupCall(), 1000);
          }
        }
      })
      .subscribe();

    return () => {
      clearInterval(lastSeenTimer);
      document.removeEventListener('visibilitychange', onVisChange);
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(inboxChannel);
    };
  }, [authUser, sendSignal, playTone, stopTone, cleanupCall]);

  return (
    <CallContext.Provider value={{ onlineUsers, startCall, callState }}>
      {children}

      {/* Elemen audio tersembunyi untuk output suara panggilan */}
      {callState !== 'idle' && <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />}

      {/* Overlay Layar Penuh Panggilan Suara & Video Call */}
      {callState !== 'idle' && callInfo && (
        <div className="fixed inset-0 z-[100] bg-zinc-950 text-white flex flex-col justify-between overflow-hidden">
          {/* Video Remote (Fullscreen jika Video Call & sudah terhubung) */}
          {callInfo.callType === 'video' && (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover ${
                callState === 'connected' ? 'opacity-100' : 'opacity-25'
              }`}
            />
          )}

          {/* Video Lokal (Picture-in-Picture di pojok kanan atas) */}
          {callInfo.callType === 'video' && localStream && !isCamOff && (
            <div className="absolute top-14 right-4 z-20 w-28 h-40 rounded-2xl overflow-hidden border-2 border-white/30 shadow-2xl bg-black">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
              />
            </div>
          )}

          {/* Info Lawan Bicara */}
          <div className="relative z-10 pt-14 px-6 flex flex-col items-center text-center bg-gradient-to-b from-black/75 via-black/30 to-transparent pb-10">
            {(callInfo.callType === 'audio' || callState !== 'connected') && (
              <div className="mb-4 relative">
                <Avatar
                  src={callInfo.peer?.avatar_url}
                  name={callInfo.peer?.display_name || callInfo.peer?.username}
                  size="xl"
                  className="ring-4 ring-blue-500/40"
                />
                {callState === 'ringing' && (
                  <span className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-emerald-500 text-white animate-bounce">
                    <PhoneIncoming className="w-4 h-4" />
                  </span>
                )}
              </div>
            )}
            <h2 className="text-xl font-bold drop-shadow">
              {callInfo.peer?.display_name || callInfo.peer?.username}
            </h2>
            <p className="text-sm text-zinc-300 mt-1 drop-shadow">
              {callState === 'connected' ? formatCallTime(callDuration) : callStatusText}
            </p>
          </div>

          {/* Kontrol Panggilan Bawah */}
          <div className="relative z-10 pb-12 pt-8 px-6 bg-gradient-to-t from-black/85 via-black/40 to-transparent">
            {callState === 'ringing' ? (
              <div className="flex items-center justify-center gap-12">
                <button
                  onClick={endCall}
                  className="flex flex-col items-center gap-2"
                >
                  <span className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-lg">
                    <PhoneOff className="w-7 h-7" />
                  </span>
                  <span className="text-xs font-medium text-zinc-200">Tolak</span>
                </button>

                <button
                  onClick={acceptCall}
                  className="flex flex-col items-center gap-2"
                >
                  <span className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center shadow-lg animate-pulse">
                    {callInfo.callType === 'video' ? (
                      <Video className="w-7 h-7" />
                    ) : (
                      <Phone className="w-7 h-7" />
                    )}
                  </span>
                  <span className="text-xs font-medium text-zinc-200">Angkat</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={toggleMute}
                  className={`w-13 h-13 rounded-full flex items-center justify-center transition ${
                    isMuted ? 'bg-white text-zinc-900' : 'bg-white/15 text-white'
                  }`}
                  title={isMuted ? 'Nyalakan Mic' : 'Bisukan Mic'}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                {callInfo.callType === 'video' && (
                  <>
                    <button
                      onClick={toggleCamera}
                      className={`w-13 h-13 rounded-full flex items-center justify-center transition ${
                        isCamOff ? 'bg-white text-zinc-900' : 'bg-white/15 text-white'
                      }`}
                      title={isCamOff ? 'Nyalakan Kamera' : 'Matikan Kamera'}
                    >
                      {isCamOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                    </button>

                    <button
                      onClick={switchCamera}
                      className="w-13 h-13 rounded-full bg-white/15 text-white flex items-center justify-center transition"
                      title="Ganti Kamera Depan/Belakang"
                    >
                      <SwitchCamera className="w-5 h-5" />
                    </button>
                  </>
                )}

                <button
                  onClick={endCall}
                  className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg"
                  title="Akhiri Panggilan"
                >
                  <PhoneOff className="w-6 h-6" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
}
