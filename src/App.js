import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const DAYS_JP = ["月","火","水","木","金"];
const PROFILE_KEY = "__profile__";

// ── カラー定数 ────────────────────────────────────────────────
const INK      = "#111";
const INK_LT   = "#555";
const PAPER    = "#faf9f6";
const PAPER_DK = "#f0ede6";
const ACCENT   = "#e63329";
const ACCENT_LT= "#ff6b61";
const SUCCESS  = "#2ea84a";
const YELLOW   = "#f5c400";
const BORDER   = "#ddd";
const SHADOW   = "0 2px 20px rgba(0,0,0,0.08)";

// ── ユーティリティ ────────────────────────────────────────────
function getWeekDates(weekOffset=0){
  const now=new Date(), day=now.getDay(), mon=new Date(now);
  mon.setDate(now.getDate()-(day===0?6:day-1)+weekOffset*7);
  return Array.from({length:5},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return d; });
}
function isSameDay(a,b){ return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function dateKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

// ── 共通スタイル ──────────────────────────────────────────────
const taStyle={
  width:"100%", fontFamily:"'Noto Sans JP',sans-serif", fontSize:12,
  padding:"8px 10px", border:`1px solid ${BORDER}`, borderRadius:6,
  background:PAPER_DK, color:INK, resize:"none", outline:"none",
  lineHeight:1.7, boxSizing:"border-box",
};

// ── 共通コンポーネント（App外で定義 → 再マウントなし）─────────
function Card({children,style={}}){
  return <div style={{background:"white",borderRadius:12,padding:20,marginBottom:16,boxShadow:SHADOW,border:`1px solid ${BORDER}`,...style}}>{children}</div>;
}
function CardTitle({children}){
  return(
    <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:13,color:INK_LT,letterSpacing:"0.1em",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
      <span style={{width:3,height:16,background:ACCENT,borderRadius:2,display:"block",flexShrink:0}}/>{children}
    </div>
  );
}
function Btn({children,onClick,disabled,secondary,style={}}){
  return(
    <button onClick={onClick} disabled={disabled}
      style={{width:"100%",padding:13,background:disabled?"#ddd":secondary?INK:ACCENT,color:"white",border:"none",borderRadius:8,fontFamily:"'Noto Sans JP',sans-serif",fontSize:13,cursor:disabled?"not-allowed":"pointer",letterSpacing:"0.1em",marginTop:8,...style}}>
      {children}
    </button>
  );
}
function CheckBtns({dk,day,onToggle,isFuture=false}){
  return(
    <div style={{display:"flex",gap:5}}>
      {[{value:"done",label:"○",activeBg:SUCCESS},{value:"skip",label:"✕",activeBg:ACCENT},{value:"half",label:"ー",activeBg:"#888"}].map(({value,label,activeBg})=>(
        <button key={value} onClick={()=>!isFuture&&onToggle(dk,value)} disabled={isFuture}
          style={{width:34,height:34,borderRadius:"50%",border:`1.5px solid ${day.status===value?activeBg:BORDER}`,background:day.status===value?activeBg:"white",cursor:isFuture?"default":"pointer",fontSize:13,fontWeight:"bold",color:day.status===value?"white":INK,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s"}}>
          {label}
        </button>
      ))}
    </div>
  );
}

function ProgressRing({pct,size=100,stroke=8,color=ACCENT}){
  const r=(size-stroke)/2, circ=2*Math.PI*r, offset=circ-(pct/100)*circ;
  return(
    <div style={{position:"relative",width:size,height:size}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#ede9e3" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{transition:"stroke-dashoffset 0.6s ease"}}/>
      </svg>
      <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center"}}>
        <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:size>100?26:22,color:INK}}>{pct}<span style={{fontSize:12}}>%</span></div>
        <div style={{fontSize:9,color:INK_LT,letterSpacing:"0.1em"}}>達成率</div>
      </div>
    </div>
  );
}

function WeekNav({weekOffset,setWeekOffset,weekDates}){
  const isCurrentWeek=weekOffset===0;
  const fmt=d=>`${d.getMonth()+1}/${d.getDate()}`;
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"white",borderRadius:10,padding:"10px 16px",marginBottom:16,border:`1px solid ${BORDER}`,boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}>
      <button onClick={()=>setWeekOffset(o=>o-1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22,color:"#888",padding:"0 8px",lineHeight:1}}>‹</button>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:12,fontFamily:"'Noto Serif JP',serif",color:INK}}>{fmt(weekDates[0])} 〜 {fmt(weekDates[4])}</div>
        <div style={{fontSize:10,color:isCurrentWeek?ACCENT:"#999",marginTop:2,letterSpacing:"0.08em"}}>{isCurrentWeek?"今週":`${Math.abs(weekOffset)}週前`}</div>
      </div>
      <button onClick={()=>setWeekOffset(o=>Math.min(0,o+1))} style={{background:"none",border:"none",cursor:isCurrentWeek?"default":"pointer",fontSize:22,color:isCurrentWeek?"#ddd":"#888",padding:"0 8px",lineHeight:1}}>›</button>
    </div>
  );
}

// ── AI Advice ─────────────────────────────────────────────────
async function fetchAdvice(goal,comments,achieveRate,reflection,profile){
  const commentText=comments.filter(Boolean).join("\n");
  const reflectionText=reflection?`\n週間振り返り：${reflection}`:"";
  let surveyText="";
  if(profile?.survey){
    const s=profile.survey, parts=[];
    if(s.good)        parts.push(`良い点：${s.good}`);
    if(s.improve)     parts.push(`改善点：${s.improve}`);
    if(s.continueBeh) parts.push(`継続すべき行動：${s.continueBeh}`);
    if(s.stop)        parts.push(`やめるべき行動：${s.stop}`);
    if(s.start)       parts.push(`始めるべき行動：${s.start}`);
    if(parts.length>0) surveyText=`\n\n【360度サーベイ結果】\n${parts.join("\n")}`;
  }
  let sessionsText="";
  if(profile?.sessions){
    const s=profile.sessions, parts=[];
    if(s.s1) parts.push(`セッション1：${s.s1}`);
    if(s.s2) parts.push(`セッション2：${s.s2}`);
    if(s.s3) parts.push(`セッション3：${s.s3}`);
    if(parts.length>0) sessionsText=`\n\n【研修セッションでの気づき】\n${parts.join("\n")}`;
  }
  const prompt=`あなたはリーダーシップ研修のコーチです。受講者の情報を踏まえ、以下を300字以内で日本語でアドバイスしてください。①今週の取り組みへの具体的なフィードバック②来週の目標への提案\n\n目標：${goal}\n達成率：${achieveRate}%\n日々のコメント：\n${commentText||"（コメントなし）"}${reflectionText}${surveyText}${sessionsText}`;
  const res=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:500,messages:[{role:"user",content:prompt}]})
  });
  const data=await res.json();
  return data.content?.map(b=>b.text).join("")||"アドバイスを取得できませんでした。";
}

// ── メインアプリ ──────────────────────────────────────────────
export default function App(){
  const [tab,setTab]=useState("today");
  const [data,setData]=useState({});
  const [userId]=useState(()=>localStorage.getItem("kawaru_user_id")||crypto.randomUUID());
  const [userName,setUserName]=useState(()=>localStorage.getItem("kawaru_user_name")||"");
  const [nameInput,setNameInput]=useState("");
  const [loading,setLoading]=useState(true);
  const [editGoal,setEditGoal]=useState(false);
  const [goalDraft,setGoalDraft]=useState("");
  const [advice,setAdvice]=useState(null);
  const [reflectionSaved,setReflectionSaved]=useState(false);
  const [adviceLoading,setAdviceLoading]=useState(false);
  const [weekOffset,setWeekOffset]=useState(0);

  useEffect(()=>{
    localStorage.setItem("kawaru_user_id", userId);
    loadAllData();
  },[]);

  async function loadAllData(){
    setLoading(true);
    const {data:rows}=await supabase.from("entries").select("*").eq("user_id", userId);
    if(rows){
      const obj={};
      rows.forEach(r=>{ obj[r.week_key]=r.data; });
      setData(obj);
      const profile=obj[PROFILE_KEY];
      if(profile?.name&&!localStorage.getItem("kawaru_user_name")){
        setUserName(profile.name);
        localStorage.setItem("kawaru_user_name", profile.name);
      }
    }
    setLoading(false);
  }

  async function saveWeekData(weekKey, weekData){
    await supabase.from("entries").upsert({
      user_id: userId, week_key: weekKey, data: weekData,
      updated_at: new Date().toISOString()
    },{onConflict:"user_id,week_key"});
  }

  const today=new Date();
  const weekDates=getWeekDates(weekOffset);
  const weekKey=dateKey(weekDates[0]);
  const weekData=data[weekKey]||{goal:"",days:{}};
  const isCurrentWeek=weekOffset===0;
  const profileData=data[PROFILE_KEY]||{};

  function updateWeek(patch){
    const updated={...(data[weekKey]||{goal:"",days:{}}),...patch};
    setData(prev=>({...prev,[weekKey]:updated}));
    saveWeekData(weekKey, updated);
  }
  function updateProfile(patch){
    const updated={...(data[PROFILE_KEY]||{}),...patch};
    setData(prev=>({...prev,[PROFILE_KEY]:updated}));
    saveWeekData(PROFILE_KEY, updated);
  }
  function updateSurvey(patch){
    updateProfile({survey:{...(profileData.survey||{}),...patch}});
  }
  function updateSessions(patch){
    updateProfile({sessions:{...(profileData.sessions||{}),...patch}});
  }
  async function handleNameSubmit(){
    if(!nameInput.trim()) return;
    const name=nameInput.trim();
    setUserName(name);
    localStorage.setItem("kawaru_user_name", name);
    const updated={...(data[PROFILE_KEY]||{}),name};
    setData(prev=>({...prev,[PROFILE_KEY]:updated}));
    await saveWeekData(PROFILE_KEY, updated);
  }
  function toggleCheck(dk,value){
    const days={...weekData.days};
    if(days[dk]?.status===value) days[dk]={...days[dk],status:null};
    else days[dk]={...(days[dk]||{}),status:value};
    updateWeek({days});
  }
  function setComment(dk,text){
    const days={...weekData.days};
    days[dk]={...(days[dk]||{}),comment:text};
    updateWeek({days});
  }
  function saveReflection(text){
    updateWeek({reflection:text});
    setReflectionSaved(true);
    setTimeout(()=>setReflectionSaved(false),2000);
  }

  const checkedDays=weekDates.filter(d=>weekData.days[dateKey(d)]?.status==="done").length;
  const totalSoFar=isCurrentWeek
    ?weekDates.filter(d=>d<=today).length
    :weekDates.filter(d=>["done","skip"].includes(weekData.days[dateKey(d)]?.status)).length;
  const pct=totalSoFar>0?Math.round((checkedDays/totalSoFar)*100):0;

  const allWeeks=Object.entries(data).filter(([k])=>k!==PROFILE_KEY).sort((a,b)=>b[0].localeCompare(a[0]));
  const totalDone=allWeeks.reduce((s,[,wd])=>s+Object.values(wd.days||{}).filter(d=>d.status==="done").length,0);
  const totalChecked=allWeeks.reduce((s,[,wd])=>s+Object.values(wd.days||{}).filter(d=>["done","skip"].includes(d.status)).length,0);
  const overallPct=totalChecked>0?Math.round(totalDone/totalChecked*100):0;

  async function handleAdvice(){
    if(!weekData.goal) return;
    setAdviceLoading(true); setAdvice(null);
    const comments=weekDates.map(d=>weekData.days[dateKey(d)]?.comment||"");
    const text=await fetchAdvice(weekData.goal,comments,pct,weekData.reflection||"",profileData);
    setAdvice(text); setAdviceLoading(false);
  }

  const navSet=o=>{setWeekOffset(o);setEditGoal(false);setAdvice(null);};
  const TABS=[
    {id:"today",label:"今日",icon:"⏱"},
    {id:"week", label:"今週",icon:"📅"},
    {id:"stats",label:"実績",icon:"📊"},
    {id:"ai",   label:"AI",  icon:"✦"},
    {id:"profile",label:"自分",icon:"👤"},
  ];

  // ── 名前入力画面 ────────────────────────────────────────────
  if(!userName){
    return(
      <div style={{fontFamily:"'Noto Sans JP',sans-serif",background:"#111",color:"white",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
        <div style={{maxWidth:400,width:"100%",textAlign:"center"}}>
          <div style={{marginBottom:36}}>
            <h1 style={{fontFamily:"'Noto Serif JP',serif",fontSize:30,color:"white",letterSpacing:"0.08em",margin:0,marginBottom:8}}>変わるリーダー</h1>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",letterSpacing:"0.18em"}}>CHANGING LEADER PROGRAM</div>
          </div>
          <div style={{background:"rgba(255,255,255,0.05)",borderRadius:16,padding:32,border:"1px solid rgba(255,255,255,0.1)"}}>
            <div style={{width:48,height:48,borderRadius:"50%",background:ACCENT,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:22}}>👤</div>
            <div style={{fontSize:14,color:"rgba(255,255,255,0.75)",marginBottom:8,lineHeight:1.8}}>はじめに、お名前を入力してください</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.35)",marginBottom:24}}>記録の識別に使用されます</div>
            <input type="text" value={nameInput} onChange={e=>setNameInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleNameSubmit()} placeholder="例：山田 太郎" autoFocus
              style={{width:"100%",padding:"14px 16px",background:"rgba(255,255,255,0.08)",border:`1.5px solid ${nameInput.trim()?"rgba(230,51,41,0.6)":"rgba(255,255,255,0.15)"}`,borderRadius:8,color:"white",fontSize:16,fontFamily:"'Noto Sans JP',sans-serif",outline:"none",boxSizing:"border-box",marginBottom:16,transition:"border-color 0.2s"}}
            />
            <button onClick={handleNameSubmit} disabled={!nameInput.trim()}
              style={{width:"100%",padding:14,background:nameInput.trim()?ACCENT:"rgba(255,255,255,0.1)",color:nameInput.trim()?"white":"rgba(255,255,255,0.3)",border:"none",borderRadius:8,fontSize:14,cursor:nameInput.trim()?"pointer":"not-allowed",fontFamily:"'Noto Sans JP',sans-serif",letterSpacing:"0.12em",transition:"all 0.2s"}}>
              はじめる →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── メイン画面 ──────────────────────────────────────────────
  return(
    <div style={{fontFamily:"'Noto Sans JP',sans-serif",background:PAPER,color:INK,minHeight:"100vh",maxWidth:480,margin:"0 auto"}}>
      {loading&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(255,255,255,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,fontSize:14,color:INK_LT}}>読み込み中...</div>}

      {/* Header */}
      <div style={{background:"#111",padding:"18px 20px 0",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
          <h1 style={{fontFamily:"'Noto Serif JP',serif",fontSize:17,color:"white",letterSpacing:"0.08em",margin:0}}>変わるリーダー</h1>
          <span style={{background:"rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.8)",fontSize:11,padding:"3px 10px",borderRadius:12}}>{userName}</span>
        </div>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",letterSpacing:"0.14em",marginBottom:10}}>CHANGING LEADER PROGRAM</div>
        <div style={{display:"flex",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{flex:1,padding:"8px 2px",background:"none",border:"none",color:tab===t.id?ACCENT_LT:"rgba(255,255,255,0.38)",fontFamily:"'Noto Sans JP',sans-serif",fontSize:9,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,letterSpacing:"0.04em",transition:"color 0.15s"}}>
              <span style={{fontSize:13}}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:"20px 20px 100px"}}>

        {/* ── TODAY ───────────────────────────────────── */}
        {tab==="today"&&(
          <>
            <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:20,color:INK,marginBottom:6}}>{isCurrentWeek?"今日の行動":"過去の記録"}</div>
            <div style={{fontSize:12,color:INK_LT,marginBottom:16}}>
              {isCurrentWeek
                ?`${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日（${DAYS_JP[today.getDay()===0?4:today.getDay()-1]||""}）`
                :`${weekDates[0].getMonth()+1}/${weekDates[0].getDate()} 〜 ${weekDates[4].getMonth()+1}/${weekDates[4].getDate()} の週`
              }
            </div>
            <WeekNav weekOffset={weekOffset} setWeekOffset={navSet} weekDates={weekDates}/>
            {!isCurrentWeek&&(
              <div style={{background:PAPER_DK,border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:INK_LT,display:"flex",alignItems:"center",gap:8}}>
                <span>📋</span><span>過去の週を表示中です。目標・チェックを入力・修正できます。</span>
              </div>
            )}
            <Card style={isCurrentWeek?{background:"linear-gradient(135deg,#fff8f6,#fff3ee)",border:`1.5px solid rgba(230,51,41,0.25)`}:{}}>
              <CardTitle>{isCurrentWeek?"今週の目標":"この週の目標"}</CardTitle>
              {editGoal?(
                <>
                  <textarea value={goalDraft} onChange={e=>setGoalDraft(e.target.value)} rows={3} placeholder="この週の目標を入力..."
                    style={{...taStyle,fontSize:14,padding:12,border:`1.5px solid ${BORDER}`}}/>
                  <Btn onClick={()=>{updateWeek({goal:goalDraft});setEditGoal(false);}}>保存する</Btn>
                  <Btn secondary style={{marginTop:8}} onClick={()=>setEditGoal(false)}>キャンセル</Btn>
                </>
              ):(
                <>
                  <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:15,lineHeight:1.7,padding:12,background:PAPER_DK,borderRadius:8,minHeight:56}}>
                    {weekData.goal||<span style={{color:"#aaa",fontSize:13}}>目標を設定してください</span>}
                  </div>
                  <Btn secondary style={{marginTop:12}} onClick={()=>{setGoalDraft(weekData.goal);setEditGoal(true);}}>✏️ {weekData.goal?"目標を変更":"目標を設定"}</Btn>
                </>
              )}
            </Card>

            {isCurrentWeek&&weekData.goal&&today.getDay()>=1&&today.getDay()<=5&&(()=>{
              const dk=dateKey(today); const day=weekData.days[dk]||{};
              return(
                <Card>
                  <CardTitle>今日の達成チェック <span style={{background:ACCENT,color:"white",fontSize:10,padding:"2px 8px",borderRadius:10,marginLeft:4}}>TODAY</span></CardTitle>
                  <div style={{display:"flex",gap:8,marginBottom:12}}>
                    {[{value:"done",label:"○",activeBg:SUCCESS},{value:"skip",label:"✕",activeBg:ACCENT},{value:"half",label:"ー",activeBg:"#888"}].map(({value,label,activeBg})=>(
                      <button key={value} onClick={()=>toggleCheck(dk,value)}
                        style={{flex:1,height:52,borderRadius:8,fontSize:22,fontWeight:"bold",border:`1.5px solid ${day.status===value?activeBg:BORDER}`,background:day.status===value?activeBg:"white",color:day.status===value?"white":INK,cursor:"pointer",transition:"all 0.15s"}}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <textarea rows={3} value={day.comment||""} onChange={e=>setComment(dk,e.target.value)}
                    placeholder="今日の気づき・コメントを入力（AIアドバイスに活用されます）" style={taStyle}/>
                </Card>
              );
            })()}

            {!isCurrentWeek&&(
              <Card>
                <CardTitle>日別チェック（修正・入力）</CardTitle>
                {weekDates.map((d,i)=>{
                  const dk=dateKey(d); const day=weekData.days[dk]||{};
                  return(
                    <div key={dk}>
                      <div style={{display:"flex",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${PAPER_DK}`,gap:10}}>
                        <div style={{width:30,fontSize:12,color:INK_LT}}>{DAYS_JP[i]}</div>
                        <div style={{flex:1,fontSize:11,color:INK_LT}}>{d.getMonth()+1}/{d.getDate()}
                          {day.status==="done"&&<span style={{background:SUCCESS,color:"white",fontSize:10,padding:"2px 6px",borderRadius:10,marginLeft:4}}>達成</span>}
                        </div>
                        <CheckBtns dk={dk} day={day} onToggle={toggleCheck}/>
                      </div>
                      <textarea rows={2} value={day.comment||""} onChange={e=>setComment(dk,e.target.value)}
                        placeholder={`${DAYS_JP[i]}曜のコメント...`} style={{...taStyle,marginTop:6}}/>
                    </div>
                  );
                })}
              </Card>
            )}

            <Card>
              <CardTitle>{isCurrentWeek?"今週の進捗":"この週の進捗"}</CardTitle>
              <div style={{display:"flex",alignItems:"center",gap:16}}>
                <ProgressRing pct={pct}/>
                <div>
                  <div style={{fontSize:13,marginBottom:4}}><span style={{fontSize:22,fontFamily:"'Noto Serif JP',serif"}}>{checkedDays}</span><span style={{color:"#aaa"}}> / {isCurrentWeek?weekDates.filter(d=>d<=today).length:5} 日</span></div>
                  {isCurrentWeek&&<div style={{fontSize:11,color:"#aaa"}}>残り {5-weekDates.filter(d=>d<=today).length} 日</div>}
                </div>
              </div>
            </Card>
          </>
        )}

        {/* ── WEEK ────────────────────────────────────── */}
        {tab==="week"&&(
          <>
            <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:20,color:INK,marginBottom:6}}>週間チェック</div>
            <div style={{fontSize:12,color:INK_LT,marginBottom:16}}>5日間の取り組みを記録する</div>
            <WeekNav weekOffset={weekOffset} setWeekOffset={navSet} weekDates={weekDates}/>
            {!isCurrentWeek&&(
              <div style={{background:PAPER_DK,border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:INK_LT,display:"flex",alignItems:"center",gap:8}}>
                <span>📋</span><span>過去の週を表示中です。内容を修正できます。</span>
              </div>
            )}
            <Card>
              <CardTitle>この週の目標</CardTitle>
              <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:15,lineHeight:1.7,padding:12,background:PAPER_DK,borderRadius:8,minHeight:56}}>
                {weekData.goal||<span style={{color:"#aaa",fontSize:13}}>目標未設定</span>}
              </div>
            </Card>
            <Card>
              <CardTitle>日別チェック</CardTitle>
              {weekDates.map((d,i)=>{
                const dk=dateKey(d); const day=weekData.days[dk]||{};
                const isToday=isSameDay(d,today), isFuture=isCurrentWeek&&d>today;
                return(
                  <div key={dk} style={{opacity:isFuture?0.35:1}}>
                    <div style={{display:"flex",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${PAPER_DK}`,gap:10}}>
                      <div style={{width:30,fontSize:12,color:INK_LT}}>{DAYS_JP[i]}</div>
                      <div style={{flex:1,fontSize:11,color:INK_LT}}>
                        {d.getMonth()+1}/{d.getDate()}
                        {isToday&&<span style={{background:ACCENT,color:"white",fontSize:10,padding:"2px 6px",borderRadius:10,marginLeft:4}}>今日</span>}
                        {day.status==="done"&&!isToday&&<span style={{background:SUCCESS,color:"white",fontSize:10,padding:"2px 6px",borderRadius:10,marginLeft:4}}>達成</span>}
                      </div>
                      <CheckBtns dk={dk} day={day} onToggle={toggleCheck} isFuture={isFuture}/>
                    </div>
                    {!isFuture&&<textarea rows={2} value={day.comment||""} onChange={e=>setComment(dk,e.target.value)}
                      placeholder={`${DAYS_JP[i]}曜のコメント...`} style={{...taStyle,marginTop:6}}/>}
                  </div>
                );
              })}
            </Card>
            <Card>
              <CardTitle>週間振り返り</CardTitle>
              <div style={{background:"linear-gradient(135deg,#fff8f5,#fff0ea)",border:`1.5px solid rgba(230,51,41,0.2)`,borderRadius:12,padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:22}}>📝</span>
                <div style={{fontSize:12,color:INK_LT,lineHeight:1.6}}>週の終わりに<strong style={{color:ACCENT}}>今週の学び</strong>を振り返りましょう。</div>
              </div>
              <div style={{fontSize:12,color:INK_LT,marginBottom:8}}>うまくいったこと・いかなかったこと・気づきは？</div>
              <textarea rows={6} value={weekData.reflection||""} onChange={e=>updateWeek({reflection:e.target.value})}
                placeholder="今週の取り組みを自由に振り返ってみましょう..."
                style={{...taStyle,fontSize:13,padding:"10px 12px",border:`1.5px solid ${BORDER}`}}/>
              <Btn onClick={()=>saveReflection(weekData.reflection||"")}>振り返りを保存する</Btn>
              <div style={{fontSize:11,color:SUCCESS,textAlign:"right",marginTop:4,height:16}}>{reflectionSaved?"✓ 保存しました":""}</div>
            </Card>
          </>
        )}

        {/* ── STATS ───────────────────────────────────── */}
        {tab==="stats"&&(
          <>
            <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:20,color:INK,marginBottom:6}}>実績レポート</div>
            <div style={{fontSize:12,color:INK_LT,marginBottom:20}}>あなたの成長の記録</div>
            <Card>
              <CardTitle>累計サマリー</CardTitle>
              <div style={{display:"flex",justifyContent:"center",margin:"12px 0"}}>
                <ProgressRing pct={overallPct} size={120} stroke={10} color={overallPct>=70?SUCCESS:ACCENT}/>
              </div>
              <div style={{display:"flex",gap:12}}>
                {[{num:totalDone,unit:"日",label:"累計達成"},{num:overallPct,unit:"%",label:"総合達成率"},{num:allWeeks.length,unit:"週",label:"取組み週数"}].map(({num,unit,label})=>(
                  <div key={label} style={{flex:1,background:PAPER_DK,borderRadius:10,padding:"14px 10px",textAlign:"center"}}>
                    <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:26,color:INK,lineHeight:1}}>{num}<span style={{fontSize:13}}>{unit}</span></div>
                    <div style={{fontSize:10,color:INK_LT,marginTop:4,letterSpacing:"0.08em"}}>{label}</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <CardTitle>週別履歴</CardTitle>
              {allWeeks.length===0
                ?<div style={{color:"#aaa",fontSize:13,textAlign:"center",padding:"20px 0"}}>まだ履歴がありません</div>
                :allWeeks.map(([k,wd])=>{
                  const done=Object.values(wd.days||{}).filter(d=>d.status==="done").length;
                  const total=Object.values(wd.days||{}).filter(d=>["done","skip"].includes(d.status)).length;
                  const p=total>0?Math.round(done/total*100):0;
                  return(
                    <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:`1px solid ${PAPER_DK}`}}>
                      <div style={{flex:1,marginRight:10}}>
                        <div style={{fontSize:13,color:INK}}>{wd.goal||"（目標未設定）"}</div>
                        <div style={{fontSize:11,color:"#aaa",marginTop:2,display:"flex",gap:6,flexWrap:"wrap"}}>
                          <span>{k.replace(/-/g,"/")} 週〜</span>
                          {k===weekKey&&<span style={{color:ACCENT}}>今週</span>}
                          {wd.reflection&&<span style={{color:SUCCESS}}>📝 振り返り済</span>}
                        </div>
                      </div>
                      <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:18,color:p>=70?SUCCESS:ACCENT,minWidth:44,textAlign:"right"}}>{p}%</div>
                    </div>
                  );
                })
              }
            </Card>
          </>
        )}

        {/* ── AI ──────────────────────────────────────── */}
        {tab==="ai"&&(
          <>
            <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:20,color:INK,marginBottom:6}}>AIアドバイス</div>
            <div style={{fontSize:12,color:INK_LT,marginBottom:16}}>今週の取り組みを踏まえたコーチングを受ける</div>
            <WeekNav weekOffset={weekOffset} setWeekOffset={o=>{setWeekOffset(o);setAdvice(null);}} weekDates={weekDates}/>
            {(profileData.survey&&Object.values(profileData.survey).some(Boolean))||(profileData.sessions&&Object.values(profileData.sessions).some(Boolean))?(
              <div style={{background:"linear-gradient(135deg,#f0fff4,#e8fff0)",border:`1px solid rgba(46,168,74,0.3)`,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:SUCCESS,display:"flex",alignItems:"center",gap:8}}>
                <span>✓</span><span>360度サーベイ・セッション気づきがAIアドバイスに反映されます</span>
              </div>
            ):(
              <div style={{background:"#f8f7f4",border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:INK_LT,display:"flex",alignItems:"center",gap:8}}>
                <span>💡</span><span>「自分」タブから360度サーベイを入力するとアドバイスの精度が上がります</span>
              </div>
            )}
            <Card>
              <CardTitle>{isCurrentWeek?"今週のまとめ":"この週のまとめ"}</CardTitle>
              <div style={{fontSize:13,color:"#666",marginBottom:6}}>目標：{weekData.goal||"未設定"}</div>
              <div style={{fontSize:13}}>達成率：<strong>{pct}%</strong>（{checkedDays}/{isCurrentWeek?weekDates.filter(d=>d<=today).length:5}日）</div>
              <Btn disabled={!weekData.goal||adviceLoading} onClick={handleAdvice}>{adviceLoading?"生成中...":"✦ AIアドバイスを取得"}</Btn>
            </Card>
            {(advice||adviceLoading)&&(
              <div style={{background:"linear-gradient(135deg,#111,#1e1e2e)",borderRadius:12,padding:20,marginBottom:16,color:"white"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <span style={{fontSize:18}}>✦</span>
                  <span style={{fontSize:11,color:"rgba(255,255,255,0.5)",letterSpacing:"0.1em"}}>LEADERSHIP COACH AI</span>
                </div>
                {adviceLoading
                  ?<div style={{color:"rgba(255,255,255,0.4)",fontSize:12}}>分析中...</div>
                  :<div style={{fontSize:13,lineHeight:1.9,color:"rgba(255,255,255,0.9)"}}>{advice}</div>
                }
              </div>
            )}
          </>
        )}

        {/* ── PROFILE ─────────────────────────────────── */}
        {tab==="profile"&&(
          <>
            <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:20,color:INK,marginBottom:6}}>プロフィール</div>
            <div style={{fontSize:12,color:INK_LT,marginBottom:20}}>360度サーベイとセッションの気づき</div>

            <Card>
              <CardTitle>受講者情報</CardTitle>
              <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:PAPER_DK,borderRadius:8}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:"#111",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:16,flexShrink:0}}>👤</div>
                <div>
                  <div style={{fontSize:15,fontFamily:"'Noto Serif JP',serif",color:INK}}>{userName}</div>
                  <div style={{fontSize:11,color:INK_LT,marginTop:2}}>変わるリーダー 受講者</div>
                </div>
              </div>
            </Card>

            <Card>
              <CardTitle>360度サーベイ</CardTitle>
              <div style={{background:"linear-gradient(135deg,#fff8f5,#fff3ee)",border:`1.5px solid rgba(230,51,41,0.2)`,borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:12,color:INK_LT,lineHeight:1.7}}>
                周囲からのフィードバックを入力してください。<br/>
                <span style={{color:ACCENT,fontWeight:"bold"}}>AIアドバイスに自動で反映されます。</span>
              </div>
              {[
                {key:"good",       label:"良い点",         color:SUCCESS, placeholder:"周囲から評価されている強みや良い点..."},
                {key:"improve",    label:"改善点",         color:ACCENT,  placeholder:"周囲から指摘された改善すべき点..."},
                {key:"continueBeh",label:"継続すべき行動", color:SUCCESS, placeholder:"これからも続けてほしい行動..."},
                {key:"stop",       label:"やめるべき行動", color:ACCENT,  placeholder:"やめた方がよい行動や習慣..."},
                {key:"start",      label:"始めるべき行動", color:YELLOW,  placeholder:"新たに始めてほしい行動..."},
              ].map(({key,label,color,placeholder})=>(
                <div key={key} style={{marginBottom:14}}>
                  <div style={{fontSize:12,color:INK,marginBottom:5,display:"flex",alignItems:"center",gap:6}}>
                    <span style={{width:8,height:8,borderRadius:2,background:color,display:"inline-block",flexShrink:0}}/>
                    <span style={{fontWeight:"bold"}}>{label}</span>
                  </div>
                  <textarea rows={3} value={profileData.survey?.[key]||""}
                    onChange={e=>updateSurvey({[key]:e.target.value})}
                    placeholder={placeholder} style={taStyle}/>
                </div>
              ))}
            </Card>

            <Card>
              <CardTitle>セッションの気づき</CardTitle>
              <div style={{background:"linear-gradient(135deg,#fffef0,#fffde8)",border:`1.5px solid rgba(245,196,0,0.3)`,borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:12,color:INK_LT,lineHeight:1.7}}>
                各セッション後に気づきを記録してください。<br/>
                <span style={{color:"#b8920a",fontWeight:"bold"}}>AIアドバイスに自動で反映されます。</span>
              </div>
              {[
                {key:"s1",label:"セッション 1",placeholder:"セッション1での気づき・学び・印象に残ったこと..."},
                {key:"s2",label:"セッション 2",placeholder:"セッション2での気づき・学び・印象に残ったこと..."},
                {key:"s3",label:"セッション 3",placeholder:"セッション3での気づき・学び・印象に残ったこと..."},
              ].map(({key,label,placeholder})=>(
                <div key={key} style={{marginBottom:14}}>
                  <div style={{fontSize:12,color:INK,marginBottom:5,display:"flex",alignItems:"center",gap:6}}>
                    <span style={{width:8,height:8,borderRadius:2,background:YELLOW,display:"inline-block",flexShrink:0}}/>
                    <span style={{fontWeight:"bold"}}>{label}</span>
                  </div>
                  <textarea rows={4} value={profileData.sessions?.[key]||""}
                    onChange={e=>updateSessions({[key]:e.target.value})}
                    placeholder={placeholder} style={taStyle}/>
                </div>
              ))}
            </Card>
          </>
        )}

      </div>
    </div>
  );
}
