'use client';

import { useState } from 'react';
import { X, BarChart3, Plus, Trash2, Loader2 } from 'lucide-react';

export default function PollCreateModal({ isDark, onClose, onSubmitPoll }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const updateOpt = (idx, val) => {
    setOptions((prev) => prev.map((o, i) => (i === idx ? val : o)));
  };

  const addOpt = () => {
    if (options.length < 8) setOptions((prev) => [...prev, '']);
  };

  const removeOpt = (idx) => {
    if (options.length > 2) setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const q = question.trim();
    const cleanOpts = options.map((o) => o.trim()).filter(Boolean);
    if (!q || cleanOpts.length < 2 || submitting) return;
    setSubmitting(true);
    try {
      await onSubmitPoll?.({ question: q, options: cleanOpts, allowMultiple });
      onClose?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl space-y-3.5 ${
          isDark ? 'bg-[#121215] text-zinc-100 border border-zinc-800' : 'bg-white text-zinc-900'
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-600" /> Buat Polling / Voting
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-zinc-400 block mb-1">Pertanyaan</label>
          <input
            type="text"
            required
            maxLength={160}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ajukan pertanyaan polling..."
            className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none ${
              isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-zinc-50 border-zinc-300 text-zinc-900'
            }`}
          />
        </div>

        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          <label className="text-[11px] font-semibold text-zinc-400 block">Pilihan Jawaban</label>
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <input
                type="text"
                required={idx < 2}
                maxLength={80}
                value={opt}
                onChange={(e) => updateOpt(idx, e.target.value)}
                placeholder={`Pilihan ${idx + 1}`}
                className={`flex-1 px-3 py-2 rounded-xl text-xs border focus:outline-none ${
                  isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-zinc-50 border-zinc-300 text-zinc-900'
                }`}
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOpt(idx)}
                  className="p-2 text-zinc-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          {options.length < 8 && (
            <button
              type="button"
              onClick={addOpt}
              className="text-xs font-semibold text-blue-500 flex items-center gap-1 pt-1"
            >
              <Plus className="w-3.5 h-3.5" /> Tambah Pilihan
            </button>
          )}
        </div>

        <label className="flex items-center justify-between text-xs cursor-pointer py-1">
          <span>Izinkan memilih lebih dari satu jawaban</span>
          <input
            type="checkbox"
            checked={allowMultiple}
            onChange={(e) => setAllowMultiple(e.target.checked)}
            className="w-4 h-4 accent-blue-600"
          />
        </label>

        <button
          type="submit"
          disabled={submitting || !question.trim() || options.filter((o) => o.trim()).length < 2}
          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Kirim Polling
        </button>
      </form>
    </div>
  );
}
