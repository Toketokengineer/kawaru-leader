import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

// ── Constants ─────────────────────────────────────────────────
const DAYS_JP     = ["月","火","水","木","金"];
const PROFILE_KEY = "__profile__";

// ── Utilities ─────────────────────────────────────────────────
function getMondayOf(weekOffset = 0) {
  const now = new Date(), day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function getWeekDates(weekOffset = 0) {
  const mon = getMondayOf(weekOffset);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtMD(d) { return `${d.getMonth()+1}/${d.getDate()}`; }

function weekOffsetFromKey(weekKey) {
  const mon0 = getMondayOf(0);
  const [y, m, day] = weekKey.split('-').map(Number);
  const monK = new Date(y, m - 1, day);
  return Math.round((monK - mon0) / (7 * 24 * 3600 * 1000));
}

// Normalize old status values ('done'→'o', 'skip'→'x', 'half'→'n')
function normalizeStatus(s) {
  if (!s) return null;
  if (s === 'done') return 'o';
  if (s === 'skip') return 'x';
  if (s === 'half') return 'n';
  return s;
}

function normalizeWeekData(wd) {
  if (!wd) return { goal: "", days: {}, reflection: "" };
  const days = {};
  Object.entries(wd.days || {}).forEach(([k, v]) => {
    days[k] = { ...v, status: normalizeStatus(v.status) };
  });
  const reflection =
    typeof wd.reflection === "string"
      ? wd.reflection
      : (wd.reflection?.good || "");
  return { ...wd, days, reflection };
}

// ── Components ─────────────────────────────────────────────────

function LogoSVG() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="7" r="4" fill="#f5c400"/>
      <path d="M7 28c0-7 14-7 14 0" fill="#f5c400"/>
      <path d="M4 18c2-4 18-4 20 0" stroke="#f5c400" strokeWidth="1.5" fill="none"/>
    </svg>
  );
}

function SectionTitle({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <div style={{ width: 3, height: 18, background: "#f5c400", borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontFamily: "'Noto Sans JP',sans-serif", fontSize: 13, fontWeight: 600, color: "#111" }}>
        {label && <span style={{ color: "#888", marginRight: 4 }}>{label}</span>}
        {children}
      </span>
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e8e5e0",
      borderRadius: 12, padding: "20px 16px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)", ...style,
    }}>
      {children}
    </div>
  );
}

function StatusBtn({ type, selected, onClick }) {
  const cfg = {
    o: { label: "○", selBg: "#f5c400", selColor: "#111" },
    x: { label: "×", selBg: "#e63329", selColor: "#fff" },
    n: { label: "—", selBg: "#bbbbbb", selColor: "#fff" },
  }[type];
  const isSel = selected === type;
  return (
    <button
      onClick={onClick}
      style={{
        width: 38, height: 38, borderRadius: "50%",
        border: `1.5px solid ${isSel ? cfg.selBg : "#d5d0c8"}`,
        background: isSel ? cfg.selBg : "#fff",
        color: isSel ? cfg.selColor : "#aaa",
        fontSize: type === "n" ? 16 : 18,
        fontWeight: 600, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s ease", flexShrink: 0,
        fontFamily: "'Noto Sans JP',sans-serif", lineHeight: 1,
      }}
    >
      {cfg.label}
    </button>
  );
}

function ProgressBar({ rate, animated = false }) {
  const [width, setWidth] = useState(animated ? 0 : rate);
  useEffect(() => {
    if (animated) {
      const t = setTimeout(() => setWidth(rate), 80);
      return () => clearTimeout(t);
    } else {
      setWidth(rate);
    }
  }, [rate, animated]);
  return (
    <div style={{ width: "100%", height: 8, background: "#ede9e0", borderRadius: 100, overflow: "hidden" }}>
      <div style={{
        height: "100%", width: `${width}%`,
        background: "#f5c400", borderRadius: 100,
        transition: "width 0.9s cubic-bezier(0.4,0,0.2,1)",
      }} />
    </div>
  );
}

function SaveIndicator({ status }) {
  if (status === "idle") return null;
  return (
    <div style={{
      fontSize: 11, textAlign: "right", marginTop: 6,
      color: status === "saved" ? "#2ea84a" : "#aaa",
    }}>
      {status === "saving" ? "保存中..." : "✓ 保存済"}
    </div>
  );
}

function ProfileModal({ userName, userId, onClose, onSave }) {
  const [val, setVal] = useState(userName);
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}?uid=${userId}`;

  function handleSave() {
    if (val.trim()) { onSave(val.trim()); }
    onClose();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200, animation: "overlayIn 0.2s ease",
        padding: "0 20px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400,
          padding: 24, animation: "modalIn 0.25s cubic-bezier(0.34,1.56,0.64,1)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontFamily: "'Noto Serif JP',serif", fontSize: 16, fontWeight: 700, color: "#111" }}>プロフィール</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: "#888", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: "#555", fontWeight: 500, display: "block", marginBottom: 6 }}>お名前</label>
          <input
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.nativeEvent.isComposing && handleSave()}
            placeholder="名前を入力..."
            style={{
              width: "100%", padding: "10px 12px",
              border: "1.5px solid #e0ddd6", borderRadius: 8,
              fontSize: 14, fontFamily: "'Noto Sans JP',sans-serif",
              color: "#111", background: "#faf9f6", outline: "none",
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: "#555", fontWeight: 500, display: "block", marginBottom: 6 }}>共有URL</label>
          <div style={{
            padding: "10px 12px", background: "#f0ede6", borderRadius: 8,
            fontSize: 12, color: "#888", wordBreak: "break-all", fontFamily: "monospace",
          }}>
            {url}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            style={{
              marginTop: 8, width: "100%", padding: "8px",
              background: copied ? "#2ea84a" : "#f5f3ee",
              color: copied ? "#fff" : "#555",
              border: "none", borderRadius: 6, fontSize: 12,
              cursor: "pointer", fontFamily: "'Noto Sans JP',sans-serif",
              transition: "all 0.2s",
            }}
          >
            {copied ? "✓ コピー済み" : "URLをコピー"}
          </button>
        </div>

        <button
          onClick={handleSave}
          style={{
            width: "100%", padding: "12px",
            background: "#111", color: "#fff",
            border: "none", borderRadius: 8,
            fontSize: 14, fontWeight: 600,
            fontFamily: "'Noto Sans JP',sans-serif", cursor: "pointer",
          }}
        >
          保存する
        </button>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]                   = useState("記録");
  const [data, setData]                 = useState({});
  const [userId]                        = useState(() => {
    const params  = new URLSearchParams(window.location.search);
    const urlUid  = params.get("uid");
    if (urlUid) { localStorage.setItem("kawaru_user_id", urlUid); return urlUid; }
    const stored  = localStorage.getItem("kawaru_user_id");
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem("kawaru_user_id", id);
    return id;
  });
  const [userName, setUserName]         = useState(() => localStorage.getItem("kawaru_user_name") || "");
  const [nameInput, setNameInput]       = useState("");
  const [loading, setLoading]           = useState(true);
  const [weekOffset, setWeekOffset]     = useState(0);
  const [editingGoal, setEditingGoal]   = useState(false);
  const [goalDraft, setGoalDraft]       = useState("");
  const [saveStatus, setSaveStatus]     = useState("idle");
  const [showProfile, setShowProfile]   = useState(false);
  const saveTimer     = useRef(null);
  const latestWeekRef = useRef({});
  const scrollRef     = useRef(null);

  const weekDates = getWeekDates(weekOffset);
  const weekKey   = dateKey(weekDates[0]);
  const isCurrent = weekOffset === 0;
  const weekData  = normalizeWeekData(data[weekKey]);

  useEffect(() => {
    localStorage.setItem("kawaru_user_id", userId);
    const params = new URLSearchParams(window.location.search);
    if (params.get("uid") !== userId) {
      window.history.replaceState(null, "", `?uid=${userId}`);
    }
    loadAllData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAllData() {
    setLoading(true);
    const { data: rows } = await supabase.from("entries").select("*").eq("user_id", userId);
    if (rows) {
      const obj = {};
      rows.forEach(r => { obj[r.week_key] = normalizeWeekData(r.data); });
      setData(obj);
      const profile = obj[PROFILE_KEY];
      if (profile?.name && !localStorage.getItem("kawaru_user_name")) {
        setUserName(profile.name);
        localStorage.setItem("kawaru_user_name", profile.name);
      }
    }
    setLoading(false);
  }

  async function saveWeekData(key, weekDataToSave) {
    await supabase.from("entries").upsert(
      { user_id: userId, week_key: key, data: weekDataToSave, updated_at: new Date().toISOString() },
      { onConflict: "user_id,week_key" }
    );
  }

  function updateWeek(patch) {
    const base    = data[weekKey] || { goal: "", days: {}, reflection: "" };
    const updated = { ...base, ...patch };
    const key     = weekKey;
    setData(prev => ({ ...prev, [key]: updated }));
    latestWeekRef.current[key] = updated;
    setSaveStatus("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await saveWeekData(key, latestWeekRef.current[key]);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }, 700);
  }

  function toggleStatus(dk, value) {
    const days = { ...weekData.days };
    if (days[dk]?.status === value) days[dk] = { ...days[dk], status: null };
    else days[dk] = { ...(days[dk] || {}), status: value };
    updateWeek({ days });
  }

  function setComment(dk, text) {
    const days = { ...weekData.days };
    days[dk] = { ...(days[dk] || {}), comment: text };
    updateWeek({ days });
  }

  async function handleNameSubmit() {
    if (!nameInput.trim()) return;
    const name = nameInput.trim();
    setUserName(name);
    localStorage.setItem("kawaru_user_name", name);
    const updated = { ...(data[PROFILE_KEY] || {}), name };
    setData(prev => ({ ...prev, [PROFILE_KEY]: updated }));
    await saveWeekData(PROFILE_KEY, updated);
  }

  async function handleNameSave(name) {
    if (!name) return;
    setUserName(name);
    localStorage.setItem("kawaru_user_name", name);
    const updated = { ...(data[PROFILE_KEY] || {}), name };
    setData(prev => ({ ...prev, [PROFILE_KEY]: updated }));
    await saveWeekData(PROFILE_KEY, updated);
  }

  // Derived stats
  const doneCount  = weekDates.filter(d => weekData.days[dateKey(d)]?.status === "o").length;
  const rate       = Math.round(doneCount / 5 * 100);

  const allWeeks      = Object.entries(data).filter(([k]) => k !== PROFILE_KEY).sort((a, b) => b[0].localeCompare(a[0]));
  const totalDone     = allWeeks.reduce((s, [, wd]) => s + Object.values(wd.days || {}).filter(d => d.status === "o").length, 0);
  const totalPossible = allWeeks.length * 5;
  const overallRate   = totalPossible > 0 ? Math.round(totalDone / totalPossible * 100) : 0;

  // ── Name input screen ─────────────────────────────────────
  if (!userName) {
    return (
      <div style={{
        fontFamily: "'Noto Sans JP',sans-serif",
        background: "#111", minHeight: "100vh",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: 24,
      }}>
        <div style={{ maxWidth: 400, width: "100%" }}>
          <div style={{
            background: "white", borderRadius: 20,
            padding: "32px 28px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
          }}>
            {/* Logo + title */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              marginBottom: 28, paddingBottom: 20,
              borderBottom: "1px solid #e8e5e0",
            }}>
              <LogoSVG />
              <div>
                <h1 style={{
                  fontFamily: "'Noto Serif JP',serif",
                  fontSize: 20, fontWeight: 700, color: "#111",
                  letterSpacing: "0.04em", margin: 0, lineHeight: 1.2,
                }}>変わるリーダー</h1>
                <div style={{ fontSize: 9, color: "#888", letterSpacing: "0.14em", marginTop: 3, fontWeight: 500 }}>
                  LEADERSHIP PROGRAM
                </div>
              </div>
            </div>

            <div style={{ fontSize: 14, color: "#111", marginBottom: 16, lineHeight: 1.8 }}>
              氏名を入力してください
            </div>
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.nativeEvent.isComposing && handleNameSubmit()}
              placeholder="例：山田 太郎"
              autoFocus
              style={{
                width: "100%", padding: "12px 14px",
                background: "#f5f3ee",
                border: `1.5px solid ${nameInput.trim() ? "#f5c400" : "#e0ddd6"}`,
                borderRadius: 8, color: "#111", fontSize: 15,
                fontFamily: "'Noto Sans JP',sans-serif",
                outline: "none", boxSizing: "border-box",
                marginBottom: 12, transition: "border-color 0.2s",
              }}
            />
            <button
              onClick={handleNameSubmit}
              disabled={!nameInput.trim()}
              style={{
                width: "100%", padding: "13px",
                background: nameInput.trim() ? "#111" : "#ddd",
                color: nameInput.trim() ? "#fff" : "#aaa",
                border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: nameInput.trim() ? "pointer" : "not-allowed",
                fontFamily: "'Noto Sans JP',sans-serif",
                letterSpacing: "0.08em", transition: "all 0.2s",
              }}
            >
              はじめる →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main screen ───────────────────────────────────────────
  return (
    <div style={{
      fontFamily: "'Noto Sans JP',sans-serif",
      background: "#faf9f6", color: "#111",
      minHeight: "100vh", maxWidth: 480,
      margin: "0 auto", display: "flex", flexDirection: "column",
    }}>
      {loading && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(255,255,255,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 999, fontSize: 14, color: "#555",
        }}>
          読み込み中...
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "#111", flexShrink: 0 }}>
        <div style={{ padding: "12px 16px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <LogoSVG />
              <div>
                <div style={{
                  fontFamily: "'Noto Serif JP',serif",
                  fontSize: 18, fontWeight: 700, color: "#fff",
                  letterSpacing: "0.02em", lineHeight: 1.2,
                }}>変わるリーダー</div>
                <div style={{ fontSize: 9, color: "#888", letterSpacing: "0.12em", fontWeight: 500, marginTop: 1 }}>
                  LEADERSHIP PROGRAM
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowProfile(true)}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff", borderRadius: 20, padding: "6px 14px",
                fontSize: 12, fontFamily: "'Noto Sans JP',sans-serif",
                fontWeight: 500, cursor: "pointer",
                letterSpacing: "0.02em", transition: "background 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.18)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
            >
              {userName
                ? userName.slice(0, 6) + (userName.length > 6 ? "…" : "")
                : "プロフィール"}
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderTop: "1px solid #222" }}>
          {["記録", "サマリー"].map(t => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                if (scrollRef.current) scrollRef.current.scrollTop = 0;
              }}
              style={{
                flex: 1, padding: "12px 0",
                background: "none", border: "none",
                color: tab === t ? "#f5c400" : "#888",
                fontSize: 14, fontFamily: "'Noto Sans JP',sans-serif",
                fontWeight: tab === t ? 600 : 400,
                cursor: "pointer", position: "relative",
                letterSpacing: "0.04em", transition: "color 0.15s",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {t}
              {tab === t && (
                <div style={{
                  position: "absolute", bottom: 0,
                  left: "20%", right: "20%",
                  height: 2, background: "#f5c400", borderRadius: 2,
                }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", paddingBottom: 32 }}>

        {/* ── 記録 tab ── */}
        {tab === "記録" && (
          <div key={`record-${weekOffset}`} className="fade-in">

            {/* Week navigation */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px 10px", background: "#faf9f6",
            }}>
              <button
                onClick={() => { setWeekOffset(o => o - 1); setEditingGoal(false); }}
                style={{
                  background: "none", border: "none",
                  color: "#888", fontSize: 20,
                  cursor: "pointer", padding: "0 6px", lineHeight: 1,
                }}
              >‹</button>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#111", fontFamily: "'Noto Sans JP',sans-serif" }}>
                  {fmtMD(weekDates[0])} 〜 {fmtMD(weekDates[4])}
                </div>
                {isCurrent
                  ? <div style={{ fontSize: 11, color: "#f5c400", fontWeight: 600, marginTop: 2, letterSpacing: "0.06em" }}>今週</div>
                  : <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{weekOffset < 0 ? `${Math.abs(weekOffset)}週前` : `${weekOffset}週後`}</div>
                }
              </div>
              <button
                onClick={() => { if (weekOffset < 0) { setWeekOffset(o => o + 1); setEditingGoal(false); } }}
                disabled={weekOffset >= 0}
                style={{
                  background: "none", border: "none",
                  color: weekOffset >= 0 ? "#ddd" : "#888",
                  fontSize: 20,
                  cursor: weekOffset >= 0 ? "default" : "pointer",
                  padding: "0 6px", lineHeight: 1,
                }}
              >›</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 12px" }}>

              {/* ① 今週のベンジャミン */}
              <Card>
                <SectionTitle label="①">{isCurrent ? "今週" : "この週"}のベンジャミン</SectionTitle>
                {editingGoal ? (
                  <div>
                    <input
                      value={goalDraft}
                      onChange={e => setGoalDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                          updateWeek({ goal: goalDraft });
                          setEditingGoal(false);
                        }
                      }}
                      autoFocus
                      placeholder="今週の目標を入力..."
                      style={{
                        width: "100%", padding: "10px 12px",
                        border: "1.5px solid #f5c400",
                        borderRadius: 8, fontSize: 15,
                        fontFamily: "'Noto Sans JP',sans-serif",
                        color: "#111", background: "#fffef5",
                        outline: "none", marginBottom: 10, boxSizing: "border-box",
                      }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => { updateWeek({ goal: goalDraft }); setEditingGoal(false); }}
                        style={{
                          flex: 1, padding: 9, background: "#111", color: "#fff",
                          border: "none", borderRadius: 8, fontSize: 13,
                          fontFamily: "'Noto Sans JP',sans-serif", fontWeight: 600, cursor: "pointer",
                        }}
                      >保存</button>
                      <button
                        onClick={() => setEditingGoal(false)}
                        style={{
                          flex: 1, padding: 9, background: "#f0ede6", color: "#555",
                          border: "none", borderRadius: 8, fontSize: 13,
                          fontFamily: "'Noto Sans JP',sans-serif", cursor: "pointer",
                        }}
                      >キャンセル</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <span style={{
                      fontSize: 15, color: weekData.goal ? "#111" : "#aaa",
                      fontFamily: "'Noto Sans JP',sans-serif",
                      lineHeight: 1.5, flex: 1,
                    }}>
                      {weekData.goal || "目標を設定しましょう..."}
                    </span>
                    <button
                      onClick={() => { setGoalDraft(weekData.goal || ""); setEditingGoal(true); }}
                      style={{
                        padding: "6px 14px", border: "1px solid #e0ddd6",
                        borderRadius: 8, background: "#fff", fontSize: 12,
                        color: "#555", cursor: "pointer",
                        fontFamily: "'Noto Sans JP',sans-serif",
                        flexShrink: 0, transition: "background 0.15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#f5f3ee"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
                    >
                      編集
                    </button>
                  </div>
                )}
              </Card>

              {/* ② 実践状況 */}
              <Card>
                <SectionTitle label="②">実践状況</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {weekDates.map((d, i) => {
                    const dk  = dateKey(d);
                    const day = weekData.days[dk] || {};
                    return (
                      <div key={dk}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                          <span style={{
                            fontSize: 13, fontWeight: 600, color: "#555",
                            width: 16, textAlign: "center",
                            fontFamily: "'Noto Sans JP',sans-serif",
                          }}>{DAYS_JP[i]}</span>
                          <span style={{
                            fontSize: 12, color: "#aaa", width: 36,
                            fontFamily: "'Noto Sans JP',sans-serif",
                          }}>{fmtMD(d)}</span>
                          <div style={{ flex: 1 }} />
                          <div style={{ display: "flex", gap: 6 }}>
                            {["o", "x", "n"].map(type => (
                              <StatusBtn
                                key={type} type={type} selected={day.status}
                                onClick={() => toggleStatus(dk, type)}
                              />
                            ))}
                          </div>
                        </div>
                        <input
                          value={day.comment || ""}
                          onChange={e => setComment(dk, e.target.value)}
                          placeholder={`${DAYS_JP[i]}曜のコメント...`}
                          style={{
                            width: "100%", padding: "8px 10px",
                            border: "none", borderRadius: 6, fontSize: 12,
                            fontFamily: "'Noto Sans JP',sans-serif",
                            color: "#555", background: "#f5f3ee",
                            outline: "none", marginBottom: 4, boxSizing: "border-box",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <SaveIndicator status={saveStatus} />
              </Card>

              {/* ③ 今週の実行率 */}
              <Card key={`rate-${weekOffset}-${rate}`}>
                <SectionTitle label="③">{isCurrent ? "今週" : "この週"}の実行率</SectionTitle>
                <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
                  <div
                    className="count-up"
                    style={{
                      fontFamily: "'Noto Serif JP',serif",
                      fontSize: 64, fontWeight: 700,
                      color: "#f5c400", lineHeight: 1, letterSpacing: "-0.02em",
                    }}
                  >
                    {rate}<span style={{ fontSize: 28, fontWeight: 400, marginLeft: 2 }}>%</span>
                  </div>
                  <div style={{
                    fontSize: 13, color: "#888",
                    marginTop: 6, marginBottom: 16,
                    fontFamily: "'Noto Sans JP',sans-serif",
                  }}>
                    5日中 {doneCount}日 実行
                  </div>
                  <ProgressBar rate={rate} animated={true} />
                </div>
              </Card>

              {/* ④ 気づき・学び */}
              <Card>
                <SectionTitle label="④">気づき・学び</SectionTitle>
                <textarea
                  value={weekData.reflection || ""}
                  onChange={e => updateWeek({ reflection: e.target.value })}
                  placeholder="今週の気づき・学びを自由に書いてください..."
                  rows={4}
                  style={{
                    width: "100%", padding: "10px 12px",
                    border: "1px solid #e8e5e0", borderRadius: 8,
                    fontSize: 13, fontFamily: "'Noto Sans JP',sans-serif",
                    color: "#333", background: "#f5f3ee",
                    outline: "none", resize: "none",
                    lineHeight: 1.7, boxSizing: "border-box",
                  }}
                  onFocus={e => { e.target.style.borderColor = "#f5c400"; e.target.style.background = "#fffef7"; }}
                  onBlur={e  => { e.target.style.borderColor = "#e8e5e0"; e.target.style.background = "#f5f3ee"; }}
                />
                <SaveIndicator status={saveStatus} />
              </Card>

            </div>
          </div>
        )}

        {/* ── サマリー tab ── */}
        {tab === "サマリー" && (
          <div style={{ padding: "16px 12px", display: "flex", flexDirection: "column", gap: 12 }} className="fade-in">

            {/* 総合サマリー */}
            <Card>
              <SectionTitle>総合サマリー</SectionTitle>
              <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
                <div style={{
                  width: 140, height: 140, borderRadius: 16,
                  background: "#f5f3ee",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                }}>
                  <div
                    className="count-up"
                    style={{
                      fontFamily: "'Noto Serif JP',serif",
                      fontSize: 52, fontWeight: 700,
                      color: "#f5c400", lineHeight: 1,
                    }}
                  >
                    {overallRate}<span style={{ fontSize: 22 }}>%</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 6, fontFamily: "'Noto Sans JP',sans-serif" }}>
                    総合達成率
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <ProgressBar rate={overallRate} animated={true} />
                <div style={{ fontSize: 11, color: "#aaa", marginTop: 6, textAlign: "center", fontFamily: "'Noto Sans JP',sans-serif" }}>
                  {allWeeks.length}週 · {totalDone}日 / {totalPossible}日 実行
                </div>
              </div>
            </Card>

            {/* 週別サマリー */}
            <Card>
              <SectionTitle>週別サマリー</SectionTitle>
              {allWeeks.length === 0 ? (
                <div style={{ color: "#aaa", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
                  まだ履歴がありません
                </div>
              ) : (
                allWeeks.map(([k, wd], i) => {
                  const done  = Object.values(wd.days || {}).filter(d => d.status === "o").length;
                  const wrate = Math.round(done / 5 * 100);
                  const isThisWeek = k === weekKey;
                  const offset     = weekOffsetFromKey(k);
                  return (
                    <div
                      key={k}
                      onClick={() => {
                        setWeekOffset(offset);
                        setTab("記録");
                        if (scrollRef.current) scrollRef.current.scrollTop = 0;
                      }}
                      style={{
                        display: "flex", alignItems: "center",
                        justifyContent: "space-between",
                        padding: "14px 0",
                        borderBottom: i < allWeeks.length - 1 ? "1px solid #f0ede6" : "none",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 14, color: "#111", fontWeight: 500,
                          fontFamily: "'Noto Sans JP',sans-serif",
                          marginBottom: 3,
                        }}>
                          {wd.goal || <span style={{ color: "#ccc" }}>目標未設定</span>}
                        </div>
                        <div style={{
                          fontSize: 11, color: "#aaa",
                          fontFamily: "'Noto Sans JP',sans-serif",
                          display: "flex", alignItems: "center", gap: 6,
                        }}>
                          {k} 週〜
                          {isThisWeek && (
                            <span style={{ color: "#f5c400", fontWeight: 600, fontSize: 10 }}>今週</span>
                          )}
                        </div>
                      </div>
                      <div style={{
                        fontFamily: "'Noto Serif JP',serif",
                        fontSize: 22, fontWeight: 700,
                        color: "#f5c400", flexShrink: 0, marginLeft: 12,
                      }}>
                        {wrate}%
                      </div>
                    </div>
                  );
                })
              )}
            </Card>

          </div>
        )}
      </div>

      {/* Profile modal */}
      {showProfile && (
        <ProfileModal
          userName={userName}
          userId={userId}
          onClose={() => setShowProfile(false)}
          onSave={handleNameSave}
        />
      )}
    </div>
  );
}
