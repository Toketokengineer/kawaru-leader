import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const DAYS_JP  = ["月","火","水","木","金"];
const PROFILE_KEY = "__profile__";

// ── カラー ──────────────────────────────────────────────────
const INK       = "#111";
const INK_LT    = "#555";
const PAPER     = "#faf9f6";
const PAPER_DK  = "#f0ede6";
const ACCENT    = "#e63329";
const ACCENT_LT = "#ff6b61";
const SUCCESS   = "#2ea84a";
const YELLOW    = "#f5c400";
const BORDER    = "#E8E6E0";
const SHADOW    = "0 1px 3px rgba(0,0,0,0.06)";

// ── ユーティリティ ───────────────────────────────────────────
function getWeekDates(weekOffset=0){
  const now=new Date(), day=now.getDay(), mon=new Date(now);
  mon.setDate(now.getDate()-(day===0?6:day-1)+weekOffset*7);
  return Array.from({length:5},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return d; });
}
function isSameDay(a,b){ return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function dateKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

// ── 共通スタイル ─────────────────────────────────────────────
const taStyle={
  width:"100%",fontFamily:"'Noto Sans JP',sans-serif",fontSize:12,
  padding:"8px 10px",border:`1px solid ${BORDER}`,borderRadius:6,
  background:PAPER_DK,color:INK,resize:"none",outline:"none",
  lineHeight:1.7,boxSizing:"border-box",
};

// ── 共通コンポーネント（App外定義） ──────────────────────────
function Card({children,style={}}){
  return <div style={{background:"white",borderRadius:12,padding:20,marginBottom:16,boxShadow:SHADOW,border:`1px solid ${BORDER}`,...style}}>{children}</div>;
}
function CardTitle({children}){
  return(
    <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:12,color:INK_LT,letterSpacing:"0.12em",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
      <span style={{width:3,height:16,background:YELLOW,borderRadius:2,display:"block",flexShrink:0}}/>{children}
    </div>
  );
}
function Btn({children,onClick,disabled,secondary,small,style={}}){
  const base=disabled
    ?{background:"#ddd",color:"#aaa",border:"none"}
    :secondary
      ?{background:"transparent",color:INK,border:"1px solid #ddd"}
      :{background:YELLOW,color:INK,border:"none"};
  return(
    <button onClick={onClick} disabled={disabled}
      style={{width:"100%",padding:small?9:13,...base,borderRadius:8,fontFamily:"'Noto Sans JP',sans-serif",fontSize:small?12:13,cursor:disabled?"not-allowed":"pointer",letterSpacing:"0.08em",marginTop:8,...style}}>
      {children}
    </button>
  );
}
function CheckBtns({dk,day,onToggle,isFuture=false}){
  return(
    <div style={{display:"flex",gap:5}}>
      {[{value:"done",label:"○",bg:SUCCESS},{value:"skip",label:"✕",bg:ACCENT},{value:"half",label:"ー",bg:"#888"}].map(({value,label,bg})=>(
        <button key={value} onClick={()=>!isFuture&&onToggle(dk,value)} disabled={isFuture}
          style={{width:36,height:36,borderRadius:"50%",border:`1.5px solid ${day.status===value?bg:BORDER}`,background:day.status===value?bg:"white",cursor:isFuture?"default":"pointer",fontSize:14,fontWeight:"bold",color:day.status===value?"white":INK,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",flexShrink:0}}>
          {label}
        </button>
      ))}
    </div>
  );
}
function ProgressRing({pct,size=100,stroke=8,color=YELLOW}){
  const r=(size-stroke)/2,circ=2*Math.PI*r,offset=circ-(pct/100)*circ;
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
  const isCurrent=weekOffset===0;
  const fmt=d=>`${d.getMonth()+1}/${d.getDate()}`;
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"white",borderRadius:10,padding:"10px 16px",marginBottom:16,border:`1px solid ${BORDER}`,boxShadow:"0 1px 6px rgba(0,0,0,0.06)"}}>
      <button onClick={()=>setWeekOffset(o=>o-1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:24,color:"#888",padding:"4px 10px",lineHeight:1}}>‹</button>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:12,fontFamily:"'Noto Serif JP',serif",color:INK}}>{fmt(weekDates[0])} 〜 {fmt(weekDates[4])}</div>
        <div style={{fontSize:10,color:isCurrent?YELLOW:"#999",marginTop:2,letterSpacing:"0.08em"}}>{isCurrent?"今週":`${Math.abs(weekOffset)}週前`}</div>
      </div>
      <button onClick={()=>setWeekOffset(o=>Math.min(0,o+1))} style={{background:"none",border:"none",cursor:isCurrent?"default":"pointer",fontSize:24,color:isCurrent?"#ddd":"#888",padding:"4px 10px",lineHeight:1}}>›</button>
    </div>
  );
}
function TA({rows,value,onChange,placeholder,style={}}){
  const [focused,setFocused]=useState(false);
  return(
    <textarea rows={rows} value={value} onChange={onChange} placeholder={placeholder}
      onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
      style={{...taStyle,border:`1px solid ${focused?YELLOW:BORDER}`,...style}}/>
  );
}
function SaveIndicator({status}){
  if(status==="idle") return <div style={{height:18}}/>;
  return(
    <div style={{height:18,fontSize:11,textAlign:"right",marginTop:4,transition:"all 0.2s",
      color:status==="saved"?SUCCESS:INK_LT}}>
      {status==="saving"?"保存中...":"✓ 自動保存済"}
    </div>
  );
}

// ── API helpers ──────────────────────────────────────────────
async function callClaude(prompt,maxTokens=500){
  const res=await fetch("/api/claude",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:maxTokens,messages:[{role:"user",content:prompt}]})
  });
  const data=await res.json();
  return data.content?.map(b=>b.text).join("")||"";
}

function buildSurveyText(survey){
  if(!survey) return "";
  const parts=[];
  if(survey.good)        parts.push(`良い点：${survey.good}`);
  if(survey.improve)     parts.push(`改善点：${survey.improve}`);
  if(survey.continueBeh) parts.push(`継続すべき行動：${survey.continueBeh}`);
  if(survey.stop)        parts.push(`やめるべき行動：${survey.stop}`);
  if(survey.start)       parts.push(`始めるべき行動：${survey.start}`);
  return parts.length?`【360度サーベイ】\n${parts.join("\n")}`:"";
}

function buildSessionsText(sessions){
  if(!sessions) return "";
  const parts=[];
  if(sessions.s1) parts.push(`セッション1：${sessions.s1}`);
  if(sessions.s2) parts.push(`セッション2：${sessions.s2}`);
  if(sessions.s3) parts.push(`セッション3：${sessions.s3}`);
  return parts.length?`【セッションの気づき】\n${parts.join("\n")}`:"";
}

const GOAL_LIST=[
  "メンバーに自分から声をかける",
  "1日1回以上、全メンバーとコミュニケーションを取る",
  "仕事以外の話（雑談・プライベート）をする",
  "他部署・他チームと関係構築する",
  "チームイベント・対話の場を設計する",
  "1on1を定期的に実施する",
  "1on1でメンバーに7割話してもらう",
  "自分の意見の前に相手の意見を聞く",
  "メンバーの話を最後まで聞く",
  "メンバーのキャリアについて対話する",
  "メンバーの強み・期待を言語化して伝える",
  "小さな成果・良い行動を即時に認める",
  "感謝・称賛を日常的に伝える",
  "ミスを責めず「次どうするか」を考えさせる",
  "答えではなく問いで返す",
  "自分がやらなくていい仕事を委譲する",
  "仕事を振る際に「WHY（意図）」を伝える",
  "メンバーの自主性を引き出す環境をつくる",
  "完璧主義をやめ「基準」を明確にする",
  "週1つ、自分の仕事を手放す",
  "チームのビジョンを自分の言葉で語る",
  "優先順位を明確に伝える",
  "決定事項の背景・意図を説明する",
  "中長期目標を考える時間を持つ",
  "仕事の社会的意義・意味を伝える",
  "会議で全員の発言を引き出す",
  "参加者の発言後に自分の意見を述べる",
  "反対意見を受け止めてから議論する",
  "役割・期待値を事前に明確にする",
  "曖昧にせずその場で結論を出す",
  "メール・チャットに感謝の一言を添える",
  "チャットのトーンを柔らかくする",
  "長いやり取りは別手段に切り替える",
  "わかりやすく伝え、理解を確認する",
  "返信を迅速に行う",
  "外部情報を取り入れて共有する",
  "ナレッジを発信する（背中を見せる）",
  "週1回は専門知識をインプットする",
  "日々の活動を言語化する（例：今日やった3つ）",
  "自分の判断基準を明確に持つ",
  "上司・他者に対しても自分の意見を述べる",
  "判断前に必要な情報を確認する",
  "判断を先送りしない",
  "自分の失敗・弱さを開示する",
  "フェアな態度で接する",
  "否定的・攻撃的な発言を避ける",
  "意見が出やすい空気をつくる",
  "週1回、自分のリーダーシップを振り返る",
  "感情的になる前に一呼吸おく",
  "相談時間をあらかじめスケジュールに確保する",
];

async function fetchGoalSuggestions(profile,pastWeeks){
  const surveyText=buildSurveyText(profile?.survey);
  const sessionsText=buildSessionsText(profile?.sessions);
  const histText=pastWeeks.slice(0,3).map(([k,wd])=>{
    const done=Object.values(wd.days||{}).filter(d=>d.status==="done").length;
    const total=Object.values(wd.days||{}).filter(d=>["done","skip"].includes(d.status)).length;
    const p=total>0?Math.round(done/total*100):0;
    return `${k}週〜 目標:「${wd.goal||"未設定"}」達成率:${p}%`;
  }).join("\n");
  const listText=GOAL_LIST.map((g,i)=>`${i+1}. ${g}`).join("\n");
  const prompt=`あなたはリーダーシップ研修のコーチです。以下の目標候補リストから、この受講者に最適な3つを選んでください。\n\n【目標候補リスト】\n${listText}\n\n【受講者の情報】\n${surveyText||"（360度サーベイ未入力）"}\n${sessionsText||""}\n\n【過去3週の目標と達成率】\n${histText||"（履歴なし）"}\n\n以下のJSON形式のみで返答してください（他の文章は一切不要）:\n{"goals":["目標1","目標2","目標3"]}`;
  const text=await callClaude(prompt,200);
  try{
    const match=text.match(/\{[\s\S]*\}/);
    const json=JSON.parse(match?.[0]||text);
    return (json.goals||[]).slice(0,3);
  }catch{
    return text.split("\n").filter(l=>/^\d+[.．]/.test(l.trim())).map(l=>l.replace(/^\d+[.．]\s*/,"").trim()).filter(Boolean).slice(0,3);
  }
}

// ── AI Advice ────────────────────────────────────────────────
async function fetchAdvice(goal,comments,achieveRate,reflection,profile){
  const commentText=comments.filter(Boolean).join("\n");
  const reflectionText=reflection?`\n週間振り返り：${reflection}`:"";
  const surveyText=buildSurveyText(profile?.survey);
  const sessionsText=buildSessionsText(profile?.sessions);
  const surveyBlock=surveyText?`\n\n${surveyText}`:"";
  const sessionsBlock=sessionsText?`\n\n${sessionsText}`:"";
  const prompt=`あなたはリーダーシップ研修のコーチです。受講者の情報を踏まえ、以下を300字以内で日本語でアドバイスしてください。①今週の取り組みへの具体的なフィードバック②来週の目標への提案\n\n目標：${goal}\n達成率：${achieveRate}%\n日々のコメント：\n${commentText||"（コメントなし）"}${reflectionText}${surveyBlock}${sessionsBlock}`;
  return (await callClaude(prompt))||"アドバイスを取得できませんでした。";
}

// ── メインアプリ ─────────────────────────────────────────────
export default function App(){
  const [tab,setTab]             = useState("week");
  const [data,setData]           = useState({});
  const [userId]                 = useState(()=>{
    const params=new URLSearchParams(window.location.search);
    const urlUid=params.get("uid");
    if(urlUid){ localStorage.setItem("kawaru_user_id",urlUid); return urlUid; }
    return localStorage.getItem("kawaru_user_id")||crypto.randomUUID();
  });
  const [userName,setUserName]   = useState(()=>localStorage.getItem("kawaru_user_name")||"");
  const [nameInput,setNameInput] = useState("");
  const [loading,setLoading]     = useState(true);
  const [editGoal,setEditGoal]   = useState(false);
  const [goalDraft,setGoalDraft] = useState("");
  const [editName,setEditName]   = useState(false);
  const [nameDraft,setNameDraft] = useState("");
  const [urlCopied,setUrlCopied] = useState(false);
  const [advice,setAdvice]                   = useState(null);
  const [adviceLoading,setAdviceLoading]     = useState(false);
  const [goalSuggestions,setGoalSuggestions] = useState([]);
  const [suggestionLoading,setSuggestionLoading] = useState(false);
  const [weekOffset,setWeekOffset] = useState(0);

  // 自動保存ステータス
  const [weekSaveStatus,setWeekSaveStatus]       = useState("idle"); // idle|saving|saved
  const [profileSaveStatus,setProfileSaveStatus] = useState("idle");
  const weekSaveTimer    = useRef(null);
  const profileSaveTimer = useRef(null);
  const latestWeekRef    = useRef({});
  const latestProfileRef = useRef(null);

  useEffect(()=>{
    localStorage.setItem("kawaru_user_id",userId);
    // URLにuidを反映（ブックマーク・共有用）
    const params=new URLSearchParams(window.location.search);
    if(params.get("uid")!==userId){
      window.history.replaceState(null,"",`?uid=${userId}`);
    }
    loadAllData();
  },[]);

  async function loadAllData(){
    setLoading(true);
    const {data:rows}=await supabase.from("entries").select("*").eq("user_id",userId);
    if(rows){
      const obj={};
      rows.forEach(r=>{ obj[r.week_key]=r.data; });
      setData(obj);
      const profile=obj[PROFILE_KEY];
      if(profile?.name&&!localStorage.getItem("kawaru_user_name")){
        setUserName(profile.name);
        localStorage.setItem("kawaru_user_name",profile.name);
      }
    }
    setLoading(false);
  }

  async function saveWeekData(weekKey,weekData){
    await supabase.from("entries").upsert(
      {user_id:userId,week_key:weekKey,data:weekData,updated_at:new Date().toISOString()},
      {onConflict:"user_id,week_key"}
    );
  }

  const today     = new Date();
  const weekDates = getWeekDates(weekOffset);
  const weekKey   = dateKey(weekDates[0]);
  const weekData  = data[weekKey]||{goal:"",days:{}};
  const isCurrent = weekOffset===0;
  const profileData = data[PROFILE_KEY]||{};

  // デバウンス付き週データ更新
  function updateWeek(patch){
    const base    = data[weekKey]||{goal:"",days:{}};
    const updated = {...base,...patch};
    setData(prev=>({...prev,[weekKey]:updated}));
    latestWeekRef.current[weekKey]=updated;
    setWeekSaveStatus("saving");
    clearTimeout(weekSaveTimer.current);
    weekSaveTimer.current=setTimeout(async()=>{
      await saveWeekData(weekKey,latestWeekRef.current[weekKey]);
      setWeekSaveStatus("saved");
      setTimeout(()=>setWeekSaveStatus("idle"),2000);
    },700);
  }

  // デバウンス付きプロフィール更新
  function updateProfile(patch){
    const updated={...(data[PROFILE_KEY]||{}),...patch};
    setData(prev=>({...prev,[PROFILE_KEY]:updated}));
    latestProfileRef.current=updated;
    setProfileSaveStatus("saving");
    clearTimeout(profileSaveTimer.current);
    profileSaveTimer.current=setTimeout(async()=>{
      await saveWeekData(PROFILE_KEY,latestProfileRef.current);
      setProfileSaveStatus("saved");
      setTimeout(()=>setProfileSaveStatus("idle"),2000);
    },700);
  }

  function updateSurvey(patch){
    updateProfile({survey:{...(profileData.survey||{}),...patch}});
  }
  function updateSessions(patch){
    updateProfile({sessions:{...(profileData.sessions||{}),...patch}});
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

  // 名前登録（初回）
  async function handleNameSubmit(){
    if(!nameInput.trim()) return;
    const name=nameInput.trim();
    setUserName(name);
    localStorage.setItem("kawaru_user_name",name);
    const updated={...(data[PROFILE_KEY]||{}),name};
    setData(prev=>({...prev,[PROFILE_KEY]:updated}));
    await saveWeekData(PROFILE_KEY,updated);
  }
  // 名前変更
  async function handleNameChange(){
    if(!nameDraft.trim()) return;
    const name=nameDraft.trim();
    setUserName(name);
    localStorage.setItem("kawaru_user_name",name);
    setEditName(false);
    const updated={...(data[PROFILE_KEY]||{}),name};
    setData(prev=>({...prev,[PROFILE_KEY]:updated}));
    await saveWeekData(PROFILE_KEY,updated);
  }

  const checkedDays=weekDates.filter(d=>weekData.days[dateKey(d)]?.status==="done").length;
  const totalSoFar=isCurrent
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

  async function handleSuggestGoals(){
    setSuggestionLoading(true); setGoalSuggestions([]);
    const suggestions=await fetchGoalSuggestions(profileData,allWeeks);
    setGoalSuggestions(suggestions); setSuggestionLoading(false);
  }

  const navSet=o=>{setWeekOffset(o);setEditGoal(false);setAdvice(null);};

  const TABS=[
    {id:"week",    label:"今週", icon:"📅"},
    {id:"stats",   label:"実績", icon:"📊"},
    {id:"ai",      label:"AI",   icon:"✦"},
    {id:"profile", label:"自分", icon:"👤"},
  ];

  // ── 名前入力画面 ──────────────────────────────────────────
  if(!userName){
    return(
      <div style={{fontFamily:"'Noto Sans JP',sans-serif",background:"#111",color:"white",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
        <div style={{maxWidth:400,width:"100%",textAlign:"center"}}>
          <div style={{marginBottom:36}}>
            <h1 style={{fontFamily:"'Noto Serif JP',serif",fontSize:30,color:"white",letterSpacing:"0.08em",margin:0,marginBottom:8}}>変わるリーダー</h1>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",letterSpacing:"0.18em"}}>CHANGING LEADER PROGRAM</div>
          </div>
          <div style={{background:"rgba(255,255,255,0.05)",borderRadius:16,padding:32,border:"1px solid rgba(255,255,255,0.1)"}}>
            <div style={{width:48,height:48,borderRadius:"50%",background:YELLOW,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:22}}>👤</div>
            <div style={{fontSize:14,color:"rgba(255,255,255,0.75)",marginBottom:8,lineHeight:1.8}}>はじめに、お名前を入力してください</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.35)",marginBottom:24}}>記録の識別に使用されます</div>
            <input type="text" value={nameInput} onChange={e=>setNameInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleNameSubmit()} placeholder="例：山田 太郎" autoFocus
              style={{width:"100%",padding:"14px 16px",background:"rgba(255,255,255,0.08)",border:`1.5px solid ${nameInput.trim()?"rgba(245,196,0,0.6)":"rgba(255,255,255,0.15)"}`,borderRadius:8,color:"white",fontSize:16,fontFamily:"'Noto Sans JP',sans-serif",outline:"none",boxSizing:"border-box",marginBottom:16,transition:"border-color 0.2s"}}/>
            <button onClick={handleNameSubmit} disabled={!nameInput.trim()}
              style={{width:"100%",padding:14,background:nameInput.trim()?YELLOW:"rgba(255,255,255,0.1)",color:nameInput.trim()?INK:"rgba(255,255,255,0.3)",border:"none",borderRadius:8,fontSize:14,cursor:nameInput.trim()?"pointer":"not-allowed",fontFamily:"'Noto Sans JP',sans-serif",letterSpacing:"0.12em",transition:"all 0.2s"}}>
              はじめる →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── メイン画面 ────────────────────────────────────────────
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
              style={{flex:1,padding:"12px 4px",background:"none",border:"none",
                color:tab===t.id?YELLOW:"rgba(255,255,255,0.38)",
                fontFamily:"'Noto Sans JP',sans-serif",fontSize:10,cursor:"pointer",
                display:"flex",flexDirection:"column",alignItems:"center",gap:3,
                letterSpacing:"0.04em",transition:"color 0.15s",WebkitTapHighlightColor:"transparent"}}>
              <span style={{fontSize:16}}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:"20px 20px 100px"}}>

        {/* ── 今週 ──────────────────────────────────────── */}
        {tab==="week"&&(
          <>
            <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:20,color:INK,marginBottom:4}}>
              {isCurrent?"今週の記録":"過去の記録"}
            </div>
            <div style={{fontSize:12,color:INK_LT,marginBottom:16}}>
              目標・チェック・振り返りをまとめて入力できます
            </div>
            <WeekNav weekOffset={weekOffset} setWeekOffset={navSet} weekDates={weekDates}/>
            {!isCurrent&&(
              <div style={{background:PAPER_DK,border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:INK_LT,display:"flex",alignItems:"center",gap:8}}>
                <span>📋</span><span>過去の週を表示中です。内容を修正できます。</span>
              </div>
            )}

            {/* 目標カード */}
            <Card style={isCurrent?{background:"linear-gradient(135deg,#fffef0,#fffff0)",border:`1.5px solid rgba(245,196,0,0.3)`}:{}}>
              <CardTitle>{isCurrent?"今週の目標":"この週の目標"}</CardTitle>
              {editGoal?(
                <>
                  <TA value={goalDraft} onChange={e=>setGoalDraft(e.target.value)} rows={3}
                    placeholder="この週の目標を入力..."
                    style={{fontSize:14,padding:12}}/>
                  <div style={{display:"flex",gap:8}}>
                    <Btn onClick={()=>{updateWeek({goal:goalDraft});setEditGoal(false);}}>保存する</Btn>
                    <Btn secondary style={{marginTop:8}} onClick={()=>setEditGoal(false)}>キャンセル</Btn>
                  </div>
                </>
              ):(
                <>
                  <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:15,lineHeight:1.7,padding:12,background:PAPER_DK,borderRadius:8,minHeight:56,color:weekData.goal?INK:"#aaa"}}>
                    {weekData.goal||"目標を設定してください"}
                  </div>
                  <Btn secondary style={{marginTop:12}} onClick={()=>{setGoalDraft(weekData.goal||"");setEditGoal(true);}}>
                    ✏️ {weekData.goal?"目標を変更":"目標を設定"}
                  </Btn>
                  <Btn onClick={handleSuggestGoals} disabled={suggestionLoading}
                    style={{marginTop:8,background:suggestionLoading?"#ddd":"#1a4a7a"}}>
                    {suggestionLoading?"候補を選定中...":"💡 目標の候補を見る"}
                  </Btn>
                  {goalSuggestions.length>0&&(
                    <div style={{marginTop:14}}>
                      <div style={{fontSize:11,color:INK_LT,marginBottom:8,textAlign:"center"}}>
                        タップすると目標として設定されます
                      </div>
                      {goalSuggestions.map((s,i)=>(
                        <div key={i} onClick={()=>{updateWeek({goal:s});setGoalSuggestions([]);}}
                          style={{padding:"12px 14px",background:"linear-gradient(135deg,#f0f4ff,#e8eeff)",border:"1px solid rgba(80,100,230,0.25)",borderRadius:10,marginBottom:8,cursor:"pointer",fontSize:13,lineHeight:1.7,display:"flex",gap:10,alignItems:"flex-start",transition:"opacity 0.15s"}}
                          onMouseEnter={e=>e.currentTarget.style.opacity="0.75"}
                          onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                          <span style={{color:"#3355cc",fontWeight:"bold",flexShrink:0,fontSize:15}}>
                            {["①","②","③"][i]}
                          </span>
                          <span>{s}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </Card>

            {/* 日別チェックカード（目標未設定でも常に表示） */}
            <Card>
              <CardTitle>
                日別チェック
                <span style={{fontSize:10,color:INK_LT,fontWeight:"normal",letterSpacing:0,marginLeft:4}}>○達成　✕未実施　ー部分的</span>
              </CardTitle>
              {!weekData.goal&&(
                <div style={{background:"rgba(230,51,41,0.05)",border:`1px solid rgba(230,51,41,0.15)`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:ACCENT,display:"flex",alignItems:"center",gap:6}}>
                  <span>💡</span><span>目標を設定するとAIアドバイスの精度が上がります</span>
                </div>
              )}
              {weekDates.map((d,i)=>{
                const dk=dateKey(d);
                const day=weekData.days[dk]||{};
                const isToday=isSameDay(d,today);
                const isFuture=isCurrent&&d>today;
                return(
                  <div key={dk} style={{marginBottom:14,opacity:isFuture?0.4:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:isFuture?0:6,padding:"6px 0",borderBottom:`1px solid ${PAPER_DK}`}}>
                      <div style={{width:14,fontSize:12,color:INK_LT,fontWeight:"bold"}}>{DAYS_JP[i]}</div>
                      <div style={{flex:1,fontSize:12,color:INK_LT}}>
                        {d.getMonth()+1}/{d.getDate()}
                        {isToday&&(
                          <span style={{background:YELLOW,color:INK,fontSize:10,padding:"1px 7px",borderRadius:10,marginLeft:6,fontWeight:"bold"}}>TODAY</span>
                        )}
                        {day.status==="done"&&!isToday&&(
                          <span style={{background:SUCCESS,color:"white",fontSize:10,padding:"1px 7px",borderRadius:10,marginLeft:6}}>達成</span>
                        )}
                        {day.status==="skip"&&(
                          <span style={{background:"#e0e0e0",color:INK_LT,fontSize:10,padding:"1px 7px",borderRadius:10,marginLeft:6}}>未実施</span>
                        )}
                      </div>
                      <CheckBtns dk={dk} day={day} onToggle={toggleCheck} isFuture={isFuture}/>
                    </div>
                    {!isFuture&&(
                      <TA rows={2} value={day.comment||""} onChange={e=>setComment(dk,e.target.value)}
                        placeholder={`${DAYS_JP[i]}曜の気づき・コメント...`}/>
                    )}
                  </div>
                );
              })}
              <SaveIndicator status={weekSaveStatus}/>
            </Card>

            {/* 進捗 */}
            <Card>
              <CardTitle>{isCurrent?"今週の進捗":"この週の進捗"}</CardTitle>
              <div style={{display:"flex",alignItems:"center",gap:20}}>
                <ProgressRing pct={pct}/>
                <div>
                  <div style={{fontSize:13,marginBottom:6}}>
                    <span style={{fontSize:26,fontFamily:"'Noto Serif JP',serif",color:pct>=70?SUCCESS:YELLOW}}>{checkedDays}</span>
                    <span style={{color:"#aaa",fontSize:13}}> / {isCurrent?weekDates.filter(d=>d<=today).length:5} 日達成</span>
                  </div>
                  {isCurrent&&<div style={{fontSize:11,color:INK_LT}}>残り {5-weekDates.filter(d=>d<=today).length} 営業日</div>}
                </div>
              </div>
            </Card>

            {/* 週間振り返り（自動保存） */}
            <Card>
              <CardTitle>週間振り返り</CardTitle>
              <div style={{background:"linear-gradient(135deg,#fffef5,#fffef5)",border:`1.5px solid rgba(245,196,0,0.2)`,borderRadius:10,padding:"12px 14px",marginBottom:12,fontSize:12,color:INK_LT,lineHeight:1.7}}>
                <span style={{fontSize:16}}>📝</span>　うまくいったこと・いかなかったこと・気づきを記録しましょう
              </div>
              <TA rows={5} value={weekData.reflection||""}
                onChange={e=>updateWeek({reflection:e.target.value})}
                placeholder="今週の取り組みを自由に振り返ってみましょう..."
                style={{fontSize:13,padding:"10px 12px"}}/>
              <SaveIndicator status={weekSaveStatus}/>
            </Card>
          </>
        )}

        {/* ── 実績 ──────────────────────────────────────── */}
        {tab==="stats"&&(
          <>
            <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:20,color:INK,marginBottom:6}}>実績レポート</div>
            <div style={{fontSize:12,color:INK_LT,marginBottom:20}}>あなたの成長の記録</div>
            <Card>
              <CardTitle>累計サマリー</CardTitle>
              <div style={{display:"flex",justifyContent:"center",margin:"12px 0"}}>
                <ProgressRing pct={overallPct} size={120} stroke={10} color={overallPct>=70?SUCCESS:YELLOW}/>
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
                          {k===weekKey&&<span style={{color:YELLOW}}>今週</span>}
                          {wd.reflection&&<span style={{color:SUCCESS}}>📝 振り返り済</span>}
                        </div>
                      </div>
                      <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:18,color:p>=70?SUCCESS:YELLOW,minWidth:44,textAlign:"right"}}>{p}%</div>
                    </div>
                  );
                })
              }
            </Card>
          </>
        )}

        {/* ── AI ────────────────────────────────────────── */}
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
              <CardTitle>{isCurrent?"今週のまとめ":"この週のまとめ"}</CardTitle>
              <div style={{fontSize:13,color:INK_LT,marginBottom:6}}>目標：{weekData.goal||<span style={{color:"#aaa"}}>未設定</span>}</div>
              <div style={{fontSize:13,marginBottom:4}}>達成率：<strong style={{color:pct>=70?SUCCESS:YELLOW}}>{pct}%</strong>（{checkedDays}/{isCurrent?weekDates.filter(d=>d<=today).length:5}日）</div>
              <Btn disabled={!weekData.goal||adviceLoading} onClick={handleAdvice}>
                {adviceLoading?"生成中...":"✦ AIアドバイスを取得"}
              </Btn>
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

        {/* ── 自分 ──────────────────────────────────────── */}
        {tab==="profile"&&(
          <>
            <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:20,color:INK,marginBottom:6}}>プロフィール</div>
            <div style={{fontSize:12,color:INK_LT,marginBottom:20}}>360度サーベイとセッションの気づき</div>

            {/* 受講者情報 */}
            <Card>
              <CardTitle>受講者情報</CardTitle>
              {editName?(
                <div>
                  <input type="text" value={nameDraft} onChange={e=>setNameDraft(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&handleNameChange()} autoFocus
                    style={{...taStyle,fontSize:15,padding:"10px 12px",border:`1.5px solid ${BORDER}`,borderRadius:8,resize:"none",width:"100%",boxSizing:"border-box"}}/>
                  <div style={{display:"flex",gap:8}}>
                    <Btn onClick={handleNameChange} disabled={!nameDraft.trim()}>変更を保存</Btn>
                    <Btn secondary style={{marginTop:8}} onClick={()=>setEditName(false)}>キャンセル</Btn>
                  </div>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:PAPER_DK,borderRadius:8,marginBottom:12}}>
                  <div style={{width:38,height:38,borderRadius:"50%",background:"#111",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:16,flexShrink:0}}>👤</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontFamily:"'Noto Serif JP',serif",color:INK}}>{userName}</div>
                    <div style={{fontSize:11,color:INK_LT,marginTop:2}}>変わるリーダー 受講者</div>
                  </div>
                  <button onClick={()=>{setNameDraft(userName);setEditName(true);}}
                    style={{background:"none",border:`1px solid ${BORDER}`,borderRadius:6,padding:"5px 10px",fontSize:11,color:INK_LT,cursor:"pointer"}}>
                    変更
                  </button>
                </div>
              )}
              {/* 個人URL */}
              <div style={{background:"linear-gradient(135deg,#f0f4ff,#e8eeff)",border:"1px solid rgba(80,100,230,0.2)",borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontSize:11,color:"#4455bb",fontWeight:"bold",marginBottom:6,display:"flex",alignItems:"center",gap:5}}>
                  🔗 あなた専用のURL（別端末・別ブラウザでもこのURLでアクセスすれば引き継ぎできます）
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1,fontSize:10,color:INK_LT,background:"white",borderRadius:6,padding:"6px 8px",border:`1px solid ${BORDER}`,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
                    {`${window.location.origin}?uid=${userId}`}
                  </div>
                  <button
                    onClick={()=>{
                      navigator.clipboard.writeText(`${window.location.origin}?uid=${userId}`);
                      setUrlCopied(true);
                      setTimeout(()=>setUrlCopied(false),2000);
                    }}
                    style={{flexShrink:0,padding:"6px 12px",background:urlCopied?SUCCESS:YELLOW,color:urlCopied?"white":INK,border:"none",borderRadius:6,fontSize:11,cursor:"pointer",transition:"background 0.2s",whiteSpace:"nowrap"}}>
                    {urlCopied?"✓ コピー済":"コピー"}
                  </button>
                </div>
              </div>
            </Card>

            {/* 360度サーベイ */}
            <Card>
              <CardTitle>360度サーベイ</CardTitle>
              <div style={{background:"linear-gradient(135deg,#fffef5,#fffef5)",border:`1.5px solid rgba(245,196,0,0.2)`,borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:12,color:INK_LT,lineHeight:1.7}}>
                周囲からのフィードバックを入力してください。<br/>
                <span style={{color:"#b8920a",fontWeight:"bold"}}>AIアドバイスに自動で反映されます。</span>
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
                  <TA rows={3} value={profileData.survey?.[key]||""}
                    onChange={e=>updateSurvey({[key]:e.target.value})}
                    placeholder={placeholder}/>
                </div>
              ))}
              <SaveIndicator status={profileSaveStatus}/>
            </Card>

            {/* セッション気づき */}
            <Card>
              <CardTitle>セッションの気づき</CardTitle>
              <div style={{background:"linear-gradient(135deg,#fffef0,#fffde8)",border:`1.5px solid rgba(245,196,0,0.35)`,borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:12,color:INK_LT,lineHeight:1.7}}>
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
                  <TA rows={4} value={profileData.sessions?.[key]||""}
                    onChange={e=>updateSessions({[key]:e.target.value})}
                    placeholder={placeholder}/>
                </div>
              ))}
              <SaveIndicator status={profileSaveStatus}/>
            </Card>
          </>
        )}

      </div>
    </div>
  );
}
