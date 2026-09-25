import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquareHeart,
  Send,
  Trash2,
  Sparkles,
  Bot,
  User as UserIcon,
  Smile,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '../api';

const QUICK_PROMPTS = [
  'What is the capital of India?',
  'Explain how to perform a squat correctly',
  'Give me a vegetarian post-workout meal',
  'I feel sore and exhausted today — should I train heavy or take an active recovery day?',
  'My bench press and shoulder press have plateaued for 3 weeks. How do I break through?',
];

export default function GymBuddyTab() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState(null);
  const [geminiError, setGeminiError] = useState(null);
  const [lastMeta, setLastMeta] = useState({
    sentiment: 'positive',
    mood_tag: 'Ready',
    provider: 'Google Gemini (google-genai SDK)',
  });
  const bottomRef = useRef(null);

  const loadHistory = async () => {
    try {
      const [data, statusData] = await Promise.all([
        apiFetch('/api/chat/history'),
        apiFetch('/api/gemini/status').catch(() => null),
      ]);
      if (statusData) {
        setGeminiStatus(statusData);
        if (!statusData.api_key_configured && statusData.status_message) {
          setGeminiError(statusData.status_message);
        } else if (statusData.api_key_configured) {
          setGeminiError(null);
        }
      }
      const cleanMsgs = (data.messages || []).filter(
        (m) =>
          !(m.provider || '').startsWith('local_fallback') &&
          !(m.content || '').startsWith('### Coach Response for ')
      );
      setMessages(cleanMsgs);
      const lastBot = [...cleanMsgs].reverse().find((m) => m.role === 'assistant');
      if (lastBot) {
        setLastMeta({
          sentiment: lastBot.sentiment || 'positive',
          mood_tag: lastBot.mood_tag || 'Ready',
          provider: lastBot.provider || 'Google Gemini (google-genai SDK)',
        });
      }
    } catch (err) {
      setGeminiError(err.message || 'Unable to load chat history.');
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const sendMessage = async (textToSend) => {
    const q = (textToSend ?? input).trim();
    if (!q || sending) return;
    setSending(true);
    setGeminiError(null);
    setInput('');

    // Build relevant multi-turn conversation history to send to backend
    const historyPayload = messages
      .filter(
        (m) =>
          !m.isError &&
          m.provider !== 'system' &&
          !(m.provider || '').startsWith('local_fallback') &&
          (m.role === 'user' || m.role === 'assistant')
      )
      .slice(-12)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    const userMsgId = Date.now();
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Append user's exact message immediately
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: q, created_at: nowTime },
    ]);

    try {
      const res = await apiFetch('/api/chat/message', {
        method: 'POST',
        body: JSON.stringify({
          message: q,
          question: q,
          history: historyPayload,
        }),
      });

      const replyText = res.answer || res.reply;
      if (!replyText) {
        throw new Error(res.gemini_error || 'Gemini returned an empty response.');
      }

      setLastMeta({
        sentiment: res.sentiment || 'positive',
        mood_tag: res.mood_tag || 'Focused & Curious',
        provider: res.provider || 'google-genai',
      });
      setGeminiError(null);

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: replyText,
          sentiment: res.sentiment,
          mood_tag: res.mood_tag,
          provider: res.provider,
          created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      const errMsg =
        err.message ||
        'Failed to generate a response from Google Gemini. Please check GEMINI_API_KEY in backend/.env.';
      setGeminiError(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: `Gemini AI Error: ${errMsg}`,
          isError: true,
          sentiment: 'neutral',
          mood_tag: 'Error',
          provider: 'google-genai (error)',
          created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    try {
      await apiFetch('/api/chat/history', { method: 'DELETE' });
      setGeminiError(null);
      await loadHistory();
    } catch (err) {
      setGeminiError(err.message || 'Could not clear conversation history.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Sentiment/Provider Bar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-pink-400">
            Conversational AI &amp; Sentiment Coach
          </span>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2 mt-0.5">
            <MessageSquareHeart className="w-5 h-5 text-pink-400" /> Virtual Gym Buddy Chatbot (Google Gemini)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Powered by the official <code className="text-emerald-300">google-genai</code> SDK (
            <code className="text-emerald-300">{geminiStatus?.model || 'gemini-2.5-flash'}</code> via{' '}
            <code className="text-emerald-300">backend/.env</code>) with multi-turn conversation memory.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="rounded-xl border border-pink-500/30 bg-pink-500/10 px-3 py-1.5 text-xs">
            <span className="text-slate-400">Detected Mood: </span>
            <span className="font-bold text-pink-300 inline-flex items-center gap-1">
              <Smile className="w-3.5 h-3.5" /> {lastMeta.mood_tag} ({lastMeta.sentiment})
            </span>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs">
            <span className="text-slate-400">Engine: </span>
            <span className="font-mono font-bold text-emerald-400">{lastMeta.provider}</span>
          </div>
          <button
            onClick={handleClear}
            disabled={sending}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 px-3 py-1.5 text-xs text-slate-300 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" /> Clear Chat
          </button>
        </div>
      </div>

      {geminiError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200 flex items-center justify-between gap-3"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong className="text-rose-300">Gemini API Error:</strong> {geminiError}
            </span>
          </span>
          <button
            onClick={() => setGeminiError(null)}
            className="text-rose-300 hover:text-white text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Quick Prompt Chips */}
      <div className="flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((p, idx) => (
          <button
            key={idx}
            onClick={() => sendMessage(p)}
            disabled={sending}
            className="rounded-xl border border-slate-800 bg-slate-900/90 hover:border-pink-500/40 hover:bg-slate-800 disabled:opacity-50 px-3 py-1.5 text-xs text-slate-300 transition cursor-pointer text-left"
          >
            <Sparkles className="w-3 h-3 text-pink-400 inline mr-1.5" />
            {p}
          </button>
        ))}
      </div>

      {/* Chat Conversation Feed */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 shadow-lg flex flex-col h-[500px]">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((m) => {
            const isUser = m.role === 'user';
            const isErr = Boolean(m.isError);
            return (
              <div
                key={m.id}
                className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div
                    className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 border ${
                      isErr
                        ? 'bg-rose-500/20 border-rose-500/40'
                        : 'bg-pink-500/20 border-pink-500/40'
                    }`}
                  >
                    {isErr ? (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Bot className="w-4 h-4 text-pink-400" />
                    )}
                  </div>
                )}

                <div
                  className={`max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-emerald-500 text-slate-950 font-medium'
                      : isErr
                      ? 'border border-rose-500/40 bg-rose-950/40 text-rose-200'
                      : 'border border-slate-800 bg-slate-950/90 text-slate-100'
                  }`}
                >
                  <div className="whitespace-pre-line">{m.content}</div>
                  <div
                    className={`mt-1.5 flex items-center gap-2 text-[10px] ${
                      isUser ? 'text-slate-900/80' : isErr ? 'text-rose-300/80' : 'text-slate-400'
                    }`}
                  >
                    <span>{m.created_at || 'Just now'}</span>
                    {!isUser && m.mood_tag && !isErr && (
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-pink-300">
                        Mood: {m.mood_tag}
                      </span>
                    )}
                    {!isUser && m.provider && !isErr && m.provider !== 'system' && (
                      <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 text-emerald-300 font-mono">
                        {m.provider}
                      </span>
                    )}
                  </div>
                </div>

                {isUser && (
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4 text-emerald-400" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Loading Indicator while Gemini is generating a response */}
          {sending && (
            <div className="flex items-start gap-3 justify-start" data-testid="gemini-loading">
              <div className="h-8 w-8 rounded-xl bg-pink-500/20 border border-pink-500/40 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-pink-400 animate-pulse" />
              </div>
              <div className="max-w-2xl rounded-2xl px-4 py-3 text-sm border border-pink-500/30 bg-slate-950/90 text-slate-200 flex items-center gap-2.5">
                <Loader2 className="w-4 h-4 text-pink-400 animate-spin shrink-0" />
                <span>Gemini is generating a response...</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Message Input Box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="border-t border-slate-800 p-3.5 flex items-center gap-3 bg-slate-950/60 rounded-b-2xl"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending}
            placeholder="Ask Virtual Gym Buddy anything (workouts, squat form, vegetarian meals, or general questions)..."
            className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-pink-500 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-pink-500 hover:bg-pink-400 disabled:opacity-50 text-slate-950 font-bold px-5 py-2.5 text-xs transition cursor-pointer"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Generating...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Send
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

