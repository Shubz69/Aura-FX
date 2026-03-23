import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import ReactMarkdown from 'react-markdown';
import '../styles/PremiumAI.css';

/* ── Icons ──────────────────────────────────────────────── */
const SendIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);
const MicIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);
const ImgIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);
const StopIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2"/>
  </svg>
);
const CopyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const SpeakerIcon = ({ muted }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    {!muted && <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>}
    {muted && <><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></>}
  </svg>
);
const ChevronIcon = ({ up }) => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: up ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

/* ── Quick actions ───────────────────────────────────────── */
const CHIPS = [
  { glyph: '📈', label: 'Gold drivers',    prompt: 'What are the main drivers for gold (XAUUSD) today? Include key levels and market sentiment.' },
  { glyph: '📊', label: 'Analyse chart',   prompt: 'Please analyse this chart and provide key observations, support/resistance levels, and potential trade setups.' },
  { glyph: '💰', label: 'Position sizing', prompt: 'Help me calculate proper position size for a trade. I need to know the risk/reward.' },
  { glyph: '📰', label: 'News impact',     prompt: 'What major news or economic events are affecting markets today? How should I position?' },
  { glyph: '🎯', label: 'Entry / Exit',    prompt: 'What are the key entry and exit levels I should watch for?' },
  { glyph: '✨', label: 'Quick overview',  prompt: 'Give me a quick market overview with actionable insights.' },
];

/* ── Capability cards data ───────────────────────────────── */
const CAPS = [
  { icon: '📈', label: 'Market Analysis',  desc: 'Real-time insights on any instrument' },
  { icon: '📊', label: 'Trade Setups',      desc: 'Entry, exit and risk levels' },
  { icon: '🖼️', label: 'Chart Analysis',    desc: 'Upload charts for instant review' },
  { icon: '⚖️', label: 'Risk Management',   desc: 'Position sizing & R:R calculations' },
];

/** Remove markdown asterisks from assistant text (server also strips; this cleans streaming + legacy). */
const stripAssistantAsterisks = (s) => (s == null ? '' : String(s).replace(/\*/g, ''));

/* ── Shared markdown component map ──────────────────────── */
const MD = {
  p:          ({ children }) => <p className="md-p">{children}</p>,
  strong:     ({ children }) => <strong className="md-bold">{children}</strong>,
  ul:         ({ children }) => <ul className="md-list">{children}</ul>,
  ol:         ({ children }) => <ol className="md-list md-ol">{children}</ol>,
  li:         ({ children }) => <li className="md-li">{children}</li>,
  h1:         ({ children }) => <h3 className="md-heading">{children}</h3>,
  h2:         ({ children }) => <h4 className="md-heading">{children}</h4>,
  h3:         ({ children }) => <h5 className="md-heading">{children}</h5>,
  code:       ({ inline, children }) =>
    inline ? <code className="md-code">{children}</code>
           : <pre className="md-pre"><code>{children}</code></pre>,
  blockquote: ({ children }) => <blockquote className="md-quote">{children}</blockquote>,
};

/* ── Welcome screen — defined OUTSIDE component ─────────── */
const WelcomeScreen = ({ onChipClick, disabled }) => (
  <div className="pai-welcome">
    <div className="pai-welcome-icon" aria-hidden>✦</div>
    <h2>AURA AI</h2>
    <p className="pai-welcome-sub">Premium Trading Intelligence</p>
    <div className="pai-caps">
      {CAPS.map(({ icon, label, desc }) => (
        <div className="pai-cap" key={label}>
          <span className="pai-cap-icon">{icon}</span>
          <div><strong>{label}</strong><span>{desc}</span></div>
        </div>
      ))}
    </div>
    <div className="pai-chips">
      {CHIPS.map((c, i) => (
        <button key={i} className="pai-chip" disabled={disabled}
          onClick={() => onChipClick(c.prompt)}>
          <span className="pai-chip-glyph" aria-hidden>{c.glyph}</span>
          {c.label}
        </button>
      ))}
    </div>
    <p className="pai-hint">Type a question or pick an action above</p>
  </div>
);

/* ── Single message — defined OUTSIDE component ──────────── */
const ChatMessage = ({ msg, copiedId, speakId, spRate, showSrc, onCopy, onSpeak, onSpeedChange, onToggleSrc }) => {
  const isUser = msg.role === 'user';
  return (
    <div className={`pai-msg ${isUser ? 'user' : 'assistant'}${msg.isError ? ' error' : ''}`}>
      <div className={`pai-avatar ${isUser ? 'user' : 'ai'}`}>{isUser ? '👤' : '✨'}</div>
      <div className="pai-bubble-wrap">

        {/* Uploaded images */}
        {msg.images?.length > 0 && (
          <div className="pai-msg-images">
            {msg.images.map((src, i) => (
              <img key={i} src={src} alt="" className="pai-msg-image" loading="lazy"
                onClick={() => window.open(src, '_blank')} />
            ))}
          </div>
        )}

        {/* Text bubble */}
        {msg.content && (
          <div className="pai-bubble">
            {isUser
              ? <p>{msg.content}</p>
              : <ReactMarkdown components={MD}>{stripAssistantAsterisks(msg.content)}</ReactMarkdown>
            }
          </div>
        )}

        {/* Action bar — copy & voice */}
        {!isUser && msg.content && (
          <div className="pai-actions">
            <button
              className={`pai-action-btn copy${copiedId === msg.id ? ' copied' : ''}`}
              onClick={() => onCopy(msg.id, msg.content)}
              title={copiedId === msg.id ? 'Copied!' : 'Copy'}>
              {copiedId === msg.id ? <CheckIcon /> : <CopyIcon />}
            </button>
            <button
              className={`pai-action-btn${speakId === msg.id ? ' active' : ''}`}
              onClick={() => onSpeak(msg.id, msg.content)}
              title={speakId === msg.id ? 'Stop' : 'Read aloud'}>
              <SpeakerIcon muted={speakId === msg.id} />
            </button>
            {speakId === msg.id && (
              <select className="pai-speed" value={spRate}
                onChange={e => onSpeedChange(parseFloat(e.target.value))}>
                {[0.75, 1, 1.25, 1.5, 2].map(v => (
                  <option key={v} value={v}>{v}x</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Sources */}
        {!isUser && msg.sources?.length > 0 && (
          <div className="pai-sources">
            <button className="pai-sources-btn" onClick={onToggleSrc}>
              <span>📊 Sources ({msg.sources.length})</span>
              <ChevronIcon up={showSrc} />
            </button>
            {showSrc && (
              <div className="pai-sources-list">
                {msg.sources.map((s, i) => (
                  <div key={i} className="pai-source-item">
                    {s.type === 'market' && `📈 ${s.symbol} market data`}
                    {s.type === 'news' && '📰 Market news'}
                    {s.cached && <span className="pai-cached">cached</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
const PremiumAI = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [messages,       setMessages]       = useState([]);
  const [input,          setInput]          = useState('');
  const [isLoading,      setIsLoading]      = useState(false);
  const [isStreaming,    setIsStreaming]     = useState(false);
  const [streamContent,  setStreamContent]  = useState('');
  const [sources,        setSources]        = useState([]);
  const [selImages,      setSelImages]      = useState([]);
  const [previews,       setPreviews]       = useState([]);
  const [showSrc,        setShowSrc]        = useState(false);
  const [isRec,          setIsRec]          = useState(false);
  const [spRate,         setSpRate]         = useState(1.0);
  const [speakId,        setSpeakId]        = useState(null);
  const [copiedId,       setCopiedId]       = useState(null);

  const endRef   = useRef(null);
  const fileRef  = useRef(null);
  const taRef    = useRef(null);
  const recRef   = useRef(null);
  const abortRef = useRef(null);
  const sendRef  = useRef(null);

  /* load saved conversation */
  useEffect(() => {
    try {
      const s = localStorage.getItem('aura_ai_conversation_v2');
      if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length) setMessages(p); }
    } catch {}
  }, []);

  /* auth guard */
  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    const { role = 'free', subscription_status: ss = 'inactive', subscription_plan: sp, email = '' } = user || {};
    const ok = email.toLowerCase() === 'shubzfx@gmail.com'
      || ['premium','a7fx','elite','admin','super_admin','SUPER_ADMIN'].includes(role)
      || (ss === 'active' && ['aura','a7fx'].includes(sp));
    if (!ok) { toast.error('Premium subscription required'); navigate('/subscription'); }
  }, [isAuthenticated, user, navigate]);

  /* persist messages */
  useEffect(() => {
    if (!messages.length) return;
    try { localStorage.setItem('aura_ai_conversation_v2', JSON.stringify(messages.slice(-50))); } catch {}
  }, [messages]);

  /* auto-scroll */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamContent]);

  /* body lock + hide site footer */
  useEffect(() => {
    document.body.classList.add('pai-active');
    const footers = document.querySelectorAll('footer, #footer, [class*="site-footer"], [class*="SiteFooter"]');
    footers.forEach(f => { f._paiDisplay = f.style.display; f.style.display = 'none'; });
    return () => {
      document.body.classList.remove('pai-active');
      footers.forEach(f => { f.style.display = f._paiDisplay || ''; });
    };
  }, []);

  /* textarea auto-resize */
  const resize = useCallback(() => {
    const ta = taRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 150) + 'px'; }
  }, []);
  useEffect(() => { resize(); }, [input, resize]);

  /* speech recognition */
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = false; r.interimResults = true; r.lang = 'en-US';
    r.onresult = e => {
      let t = '';
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
      setInput(t);
      if (e.results[e.results.length - 1].isFinal)
        setTimeout(() => { setIsRec(false); if (t.trim() && sendRef.current) sendRef.current(null, t.trim()); }, 500);
    };
    r.onerror = e => { setIsRec(false); if (!['no-speech','aborted'].includes(e.error)) toast.error('Voice input error.'); };
    r.onend = () => setIsRec(false);
    recRef.current = r;
    return () => { try { r.stop(); } catch {} };
  }, []);

  /* image select */
  const onImgSelect = async e => {
    const files = Array.from(e.target.files || [])
      .filter(f => {
        if (!f.type.startsWith('image/')) { toast.error(`${f.name} is not an image`); return false; }
        if (f.size > 20 * 1024 * 1024) { toast.error(`${f.name} exceeds 20 MB`); return false; }
        return true;
      }).slice(0, 4 - selImages.length);
    if (!files.length) return;
    try {
      const b64 = await Promise.all(files.map(f => new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f);
      })));
      setSelImages(p => [...p, ...b64]);
      setPreviews(p => [...p, ...files.map(f => URL.createObjectURL(f))]);
    } catch { toast.error('Failed to process images'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const rmImg = i => {
    setSelImages(p => p.filter((_, x) => x !== i));
    setPreviews(p => { URL.revokeObjectURL(p[i]); return p.filter((_, x) => x !== i); });
  };

  /* paste: support pasting images and text into the message box */
  const onPaste = async e => {
    const dt = e.clipboardData;
    if (!dt) return;
    const items = Array.from(dt.items).filter(item => item.type.startsWith('image/'));
    if (!items.length) return; // text-only paste: let default behavior run
    e.preventDefault();
    // If clipboard also has text (e.g. copy image from web), append it to input
    if (dt.types.includes('text/plain')) {
      const text = dt.getData('text/plain');
      if (text && text.trim()) setInput(prev => (prev ? prev + '\n' + text : text));
    }
    const slotsLeft = 4 - selImages.length;
    if (slotsLeft <= 0) {
      toast.error('Maximum 4 images. Remove one to add more.');
      return;
    }
    const files = items.slice(0, slotsLeft).map(item => item.getAsFile()).filter(Boolean);
    for (const f of files) {
      if (!f.type.startsWith('image/')) { toast.error(`${f.name || 'File'} is not an image`); continue; }
      if (f.size > 20 * 1024 * 1024) { toast.error(`${f.name || 'Image'} exceeds 20 MB`); continue; }
    }
    if (!files.length) return;
    try {
      const b64 = await Promise.all(files.map(f => new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f);
      })));
      setSelImages(p => [...p, ...b64]);
      setPreviews(p => [...p, ...files.map(f => URL.createObjectURL(f))]);
      toast.info('Image(s) added. You can type a message and send.');
    } catch { toast.error('Failed to process pasted image(s)'); }
  };

  /* voice toggle */
  const toggleRec = () => {
    if (!recRef.current) { toast.error('Voice not supported in this browser'); return; }
    if (isRec) { recRef.current.stop(); setIsRec(false); }
    else { try { recRef.current.start(); setIsRec(true); } catch { toast.error('Could not start voice input'); } }
  };

  /* TTS */
  const speak = (id, text) => {
    if (!text) return;
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      if (speakId === id) { setSpeakId(null); return; }
    }
    const u = new SpeechSynthesisUtterance(stripAssistantAsterisks(text).replace(/[#_`]/g, ''));
    u.rate = spRate; u.lang = 'en-US';
    u.onend = () => setSpeakId(null); u.onerror = () => setSpeakId(null);
    setSpeakId(id); window.speechSynthesis.speak(u);
  };

  /* copy */
  const copy = async (id, text) => {
    if (!text) return;
    const toCopy = stripAssistantAsterisks(text);
    try { await navigator.clipboard.writeText(toCopy); }
    catch {
      const ta = Object.assign(document.createElement('textarea'), { value: toCopy, style: 'position:fixed;opacity:0' });
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { toast.error('Failed to copy'); }
      document.body.removeChild(ta);
    }
    setCopiedId(id); setTimeout(() => setCopiedId(null), 2000);
  };

  /* send message */
  const send = async (e, override = null) => {
    if (e) e.preventDefault();
    const text = override || input.trim();
    if (!text && !selImages.length) return;
    if (isLoading || isStreaming) return;

    const userMsg = {
      id: Date.now(), role: 'user', content: text,
      images: selImages.length ? [...selImages] : undefined,
      timestamp: new Date().toISOString(),
    };
    setMessages(p => [...p, userMsg]);
    setInput('');
    setSelImages([]);
    setPreviews(p => { p.forEach(u => URL.revokeObjectURL(u)); return []; });
    setIsLoading(true); setSources([]);
    await new Promise(r => setTimeout(r, 50));

    try {
      const token = localStorage.getItem('token');
      const API = process.env.REACT_APP_API_URL || window.location.origin;
      abortRef.current = new AbortController();

      const res = await fetch(`${API}/api/ai/premium-chat-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: text,
          images: userMsg.images,
          conversationHistory: messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || `Error ${res.status}`); }

      setIsLoading(false); setIsStreaming(true); setStreamContent('');
      const reader = res.body.getReader();
      const dec = new TextDecoder();

      // Declared outside the loop so inner callbacks close over a stable reference
      let fullContent = '';
      let streamSources = [];

      let reading = true;
      while (reading) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = dec.decode(value, { stream: true }).split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
          let d;
          try { d = JSON.parse(line.slice(6)); } catch { continue; }

          if (d.type === 'token') {
            fullContent += d.content;
            setStreamContent(fullContent);
          } else if (d.type === 'sources') {
            streamSources = d.sources || [];
            setSources(streamSources);
          } else if (d.type === 'done') {
            const finalContent = d.content || fullContent;
            const finalSources = streamSources;
            setMessages(p => [...p, {
              id: Date.now(), role: 'assistant',
              content: finalContent,
              sources: finalSources,
              timing: d.timing,
              timestamp: new Date().toISOString(),
            }]);
            setStreamContent('');
            setIsStreaming(false);
            reading = false;
          } else if (d.type === 'error') {
            throw new Error(d.message);
          }
        }
      }
    } catch (err) {
      setIsLoading(false); setIsStreaming(false); setStreamContent('');
      if (err.name !== 'AbortError') {
        const msg = err.message?.includes('timeout') ? 'Request timed out.' : err.message || 'An error occurred.';
        setMessages(p => [...p, { id: Date.now(), role: 'assistant', content: msg, isError: true, timestamp: new Date().toISOString() }]);
        toast.error(msg);
      }
    }
    taRef.current?.focus();
  };
  sendRef.current = send;

  /* stop streaming */
  const stopStream = () => {
    abortRef.current?.abort(); setIsStreaming(false);
    if (streamContent) {
      setMessages(p => [...p, {
        id: Date.now(), role: 'assistant',
        content: streamContent + '\n\n[Response stopped]',
        sources, timestamp: new Date().toISOString(),
      }]);
      setStreamContent('');
    }
  };

  /* clear conversation */
  const clearAll = () => {
    if (!window.confirm('Clear all messages?')) return;
    localStorage.removeItem('aura_ai_conversation_v2');
    setMessages([]); setSources([]);
  };

  /* chip click handler */
  const onChipClick = (prompt) => {
    setInput(prompt);
    taRef.current?.focus();
  };

  const onKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  const isEmpty = !messages.length && !isLoading && !isStreaming;
  const badge   = ['a7fx', 'elite'].includes(user?.role) ? 'Elite' : 'Premium';

  /* ─────────────── RENDER ─────────────── */
  return (
    <div className="pai">

      {/* ROW 1 — Header */}
      <header className="pai-header">
        <div className="pai-header-left">
          <div className="pai-logo-wrap">
            <span className="pai-logo-icon">✨</span>
            <h1 className="pai-title">AURA AI</h1>
          </div>
          <span className="pai-badge">{badge}</span>
        </div>
        <button className="pai-clear" onClick={clearAll} title="Clear conversation">
          <TrashIcon />
        </button>
      </header>

      {/* ROW 2 — Scrollable chat body */}
      <main className={`pai-body${isEmpty ? ' pai-body--welcome' : ''}`}>
        <div className="pai-messages">

          {isEmpty && (
            <WelcomeScreen onChipClick={onChipClick} disabled={isLoading || isStreaming} />
          )}

          {messages.map((m, i) => (
            <ChatMessage
              key={m.id || i}
              msg={m}
              copiedId={copiedId}
              speakId={speakId}
              spRate={spRate}
              showSrc={showSrc}
              onCopy={copy}
              onSpeak={speak}
              onSpeedChange={setSpRate}
              onToggleSrc={() => setShowSrc(s => !s)}
            />
          ))}

          {/* Streaming bubble */}
          {isStreaming && streamContent && (
            <div className="pai-msg assistant">
              <div className="pai-avatar ai">✨</div>
              <div className="pai-bubble-wrap">
                <div className="pai-bubble">
                  <ReactMarkdown components={MD}>{stripAssistantAsterisks(streamContent)}</ReactMarkdown>
                </div>
                <div className="pai-streaming">
                  <span className="pai-pulse" />Generating…
                </div>
              </div>
            </div>
          )}

          {/* Loading dots */}
          {isLoading && !isStreaming && (
            <div className="pai-msg assistant">
              <div className="pai-avatar ai">✨</div>
              <div className="pai-bubble-wrap">
                <div className="pai-bubble">
                  <div className="pai-dots"><span /><span /><span /></div>
                </div>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </main>

      {/* ROW 3 — Composer */}
      <footer className="pai-composer">

        {/* Image preview strip */}
        {previews.length > 0 && (
          <div className="pai-img-strip">
            {previews.map((src, i) => (
              <div key={i} className="pai-thumb">
                <img src={src} alt="" loading="lazy" />
                <button className="pai-thumb-rm" onClick={() => rmImg(i)}>×</button>
              </div>
            ))}
          </div>
        )}

        <div className="pai-compose-row">
          <input ref={fileRef} type="file" accept="image/*" multiple
            onChange={onImgSelect} style={{ display: 'none' }} />

          <button className="pai-icon-btn"
            onClick={() => fileRef.current?.click()}
            disabled={isLoading || isStreaming || selImages.length >= 4}
            title="Upload image">
            <ImgIcon />
          </button>

          <button className={`pai-icon-btn${isRec ? ' recording' : ''}`}
            onClick={toggleRec}
            disabled={isLoading || isStreaming}
            title={isRec ? 'Stop recording' : 'Voice input'}>
            <MicIcon />
          </button>

          <div className="pai-input-wrap">
            <textarea
              ref={taRef}
              value={input}
              rows={1}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              onPaste={onPaste}
              placeholder={isRec ? 'Listening…' : 'Ask AURA anything about trading…'}
              disabled={isLoading}
              className={isRec ? 'recording' : ''}
            />
          </div>

          {isStreaming
            ? <button className="pai-icon-btn stop" onClick={stopStream} title="Stop">
                <StopIcon />
              </button>
            : <button className="pai-send" onClick={send}
                disabled={isLoading || (!input.trim() && !selImages.length)}
                title="Send">
                <SendIcon />
              </button>
          }
        </div>

        <p className="pai-hint-text">Enter to send · Shift + Enter for new line</p>
      </footer>

    </div>
  );
};

export default PremiumAI;