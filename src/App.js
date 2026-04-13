import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const DAYS_JP   = ["月","火","水","木","金"];
const PROFILE_KEY = "__profile__";

// ── カラー ──────────────────────────────────────────────────
const INK       = "#111";
const INK_LT    = "#555";
const PAPER     = "#faf9f6";
const PAPER_DK  = "#f0ede6";
const ACCENT    = "#e63329";   // ✕ボタン・警告のみ
const SUCCESS   = "#2ea84a";
const YELLOW    = "#f5c400";   // メインアクセント
const YELLOW_DK = "#d4aa00";   // ホバー用（将来拡張）
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
      ?{background:"transparent",color:INK,border:`1px solid ${BORDER}`}
      :{background:YELLOW,color:INK,border:"none"};
  return(
    <button onClick={onClick} disabled={disabled}
      style={{padding:small?"7px 14px":"11px 16px",...base,borderRadius:8,
        fontFamily:"'Noto Sans JP',sans-serif",fontSize:small?12:13,
        cursor:disabled?"not-allowed":"pointer",letterSpacing:"0.08em",...style}}>
      {children}
    </button>
  );
}

function CheckBtns({dk,day,onToggle,isFuture=false}){
  return(
    <div style={{display:"flex",gap:5}}>
      {[{value:"done",label:"○",bg:SUCCESS},{value:"skip",label:"✕",bg:ACCENT},{value:"half",label:"ー",bg:"#888"}].map(({value,label,bg})=>(
        <button key={value} onClick={()=>!isFuture&&onToggle(dk,value)} disabled={isFuture}
          style={{width:36,height:36,borderRadius:"50%",border:`1.5px solid ${day.status===value?bg:BORDER}`,
            background:day.status===value?bg:"white",cursor:isFuture?"default":"pointer",
            fontSize:14,fontWeight:"bold",color:day.status===value?"white":INK,
            display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",flexShrink:0}}>
          {label}
        </button>
      ))}
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
  const [saveStatus,setSaveStatus] = useState("idle");
  const [weekOffset,setWeekOffset] = useState(0);
  const saveTimer    = useRef(null);
  const latestWeekRef = useRef({});

  const today     = new Date();
  const isCurrent = weekOffset===0;
  const weekDates = getWeekDates(weekOffset);
  const weekKey   = dateKey(weekDates[0]);
  const weekData  = data[weekKey]||{goal:"",days:{},reflection:{good:"",improve:""}};

  // 振り返りの後方互換（旧：文字列 → 新：オブジェクト）
  const reflection = typeof weekData.reflection==="string"
    ?{good:weekData.reflection,improve:""}
    :(weekData.reflection||{good:"",improve:""});

  useEffect(()=>{
    localStorage.setItem("kawaru_user_id",userId);
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

  async function saveWeekData(key,weekDataToSave){
    await supabase.from("entries").upsert(
      {user_id:userId,week_key:key,data:weekDataToSave,updated_at:new Date().toISOString()},
      {onConflict:"user_id,week_key"}
    );
  }

  function updateWeek(patch){
    const base=data[weekKey]||{goal:"",days:{},reflection:{good:"",improve:""}};
    const updated={...base,...patch};
    const key=weekKey; // クロージャ用にキャプチャ
    setData(prev=>({...prev,[key]:updated}));
    latestWeekRef.current[key]=updated;
    setSaveStatus("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(async()=>{
      await saveWeekData(key,latestWeekRef.current[key]);
      setSaveStatus("saved");
      setTimeout(()=>setSaveStatus("idle"),2000);
    },700);
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

  function updateReflection(patch){
    updateWeek({reflection:{...reflection,...patch}});
  }

  async function handleNameSubmit(){
    if(!nameInput.trim()) return;
    const name=nameInput.trim();
    setUserName(name);
    localStorage.setItem("kawaru_user_name",name);
    const updated={...(data[PROFILE_KEY]||{}),name};
    setData(prev=>({...prev,[PROFILE_KEY]:updated}));
    await saveWeekData(PROFILE_KEY,updated);
  }

  const checkedDays = weekDates.filter(d=>weekData.days[dateKey(d)]?.status==="done").length;
  const totalSoFar  = isCurrent
    ? weekDates.filter(d=>d<=today).length
    : weekDates.filter(d=>["done","skip"].includes(weekData.days[dateKey(d)]?.status)).length;
  const pct         = totalSoFar>0?Math.round((checkedDays/totalSoFar)*100):0;

  const allWeeks     = Object.entries(data).filter(([k])=>k!==PROFILE_KEY).sort((a,b)=>b[0].localeCompare(a[0]));
  const totalDone    = allWeeks.reduce((s,[,wd])=>s+Object.values(wd.days||{}).filter(d=>d.status==="done").length,0);
  const totalChecked = allWeeks.reduce((s,[,wd])=>s+Object.values(wd.days||{}).filter(d=>["done","skip"].includes(d.status)).length,0);
  const overallPct   = totalChecked>0?Math.round(totalDone/totalChecked*100):0;

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
              style={{width:"100%",padding:"14px 16px",background:"rgba(255,255,255,0.08)",
                border:`1.5px solid ${nameInput.trim()?"rgba(245,196,0,0.6)":"rgba(255,255,255,0.15)"}`,
                borderRadius:8,color:"white",fontSize:16,fontFamily:"'Noto Sans JP',sans-serif",
                outline:"none",boxSizing:"border-box",marginBottom:16,transition:"border-color 0.2s"}}/>
            <button onClick={handleNameSubmit} disabled={!nameInput.trim()}
              style={{width:"100%",padding:14,
                background:nameInput.trim()?YELLOW:"rgba(255,255,255,0.1)",
                color:nameInput.trim()?INK:"rgba(255,255,255,0.3)",
                border:"none",borderRadius:8,fontSize:14,
                cursor:nameInput.trim()?"pointer":"not-allowed",
                fontFamily:"'Noto Sans JP',sans-serif",letterSpacing:"0.12em",transition:"all 0.2s"}}>
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

      {/* ヘッダー */}
      <div style={{background:"#111",padding:"18px 20px 0",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
          <h1 style={{fontFamily:"'Noto Serif JP',serif",fontSize:17,color:"white",letterSpacing:"0.08em",margin:0}}>変わるリーダー</h1>
          <span style={{background:"rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.8)",fontSize:11,padding:"3px 10px",borderRadius:12}}>{userName}</span>
        </div>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",letterSpacing:"0.14em",marginBottom:10}}>CHANGING LEADER PROGRAM</div>
        {/* タブ */}
        <div style={{display:"flex",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
          {[{id:"week",label:"週の記録"},{id:"summary",label:"サマリー"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{flex:1,padding:"12px 4px",background:"none",border:"none",
                borderBottom:tab===t.id?`2px solid ${YELLOW}`:"2px solid transparent",
                color:tab===t.id?YELLOW:"rgba(255,255,255,0.38)",
                fontFamily:"'Noto Sans JP',sans-serif",fontSize:11,cursor:"pointer",
                letterSpacing:"0.04em",transition:"color 0.15s",
                WebkitTapHighlightColor:"transparent"}}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 週ナビゲーション（週の記録タブのみ） */}
      {tab==="week"&&(
        <div style={{background:"white",borderBottom:`1px solid ${BORDER}`,padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:88,zIndex:99}}>
          <button onClick={()=>{setWeekOffset(o=>o-1);setEditGoal(false);}}
            style={{background:"none",border:"none",cursor:"pointer",fontSize:22,color:"#888",padding:"4px 8px",lineHeight:1}}>‹</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:13,fontFamily:"'Noto Serif JP',serif",color:INK}}>
              {weekDates[0].getMonth()+1}/{weekDates[0].getDate()} 〜 {weekDates[4].getMonth()+1}/{weekDates[4].getDate()}
            </div>
            <div style={{fontSize:10,marginTop:2,letterSpacing:"0.08em",color:isCurrent?YELLOW:INK_LT}}>
              {isCurrent?"今週":weekOffset<0?`${Math.abs(weekOffset)}週前`:`${weekOffset}週後`}
            </div>
          </div>
          <button onClick={()=>{setWeekOffset(o=>o+1);setEditGoal(false);}}
            style={{background:"none",border:"none",cursor:"pointer",fontSize:22,color:"#888",padding:"4px 8px",lineHeight:1}}>›</button>
        </div>
      )}

      <div style={{padding:"20px 20px 100px"}}>

        {/* ── 今週の記録 ─────────────────────────────────── */}
        {tab==="week"&&(
          <>
            {/* ① 今週取り組むこと */}
            <Card>
              <CardTitle>① {isCurrent?"今週":"この週"}取り組むこと</CardTitle>
              {editGoal?(
                <>
                  <TA value={goalDraft} onChange={e=>setGoalDraft(e.target.value)} rows={3}
                    placeholder="今週の取り組みを入力..." style={{fontSize:14,padding:12}}/>
                  <div style={{display:"flex",gap:8,marginTop:10}}>
                    <Btn onClick={()=>{updateWeek({goal:goalDraft});setEditGoal(false);}} style={{flex:1}}>保存する</Btn>
                    <Btn secondary onClick={()=>setEditGoal(false)} style={{flex:1}}>キャンセル</Btn>
                  </div>
                </>
              ):(
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
                  <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:16,lineHeight:1.8,color:weekData.goal?INK:"#aaa",flex:1}}>
                    {weekData.goal||"今週の取り組みを入力してください"}
                  </div>
                  <Btn secondary small onClick={()=>{setGoalDraft(weekData.goal||"");setEditGoal(true);}}
                    style={{flexShrink:0}}>
                    編集
                  </Btn>
                </div>
              )}
            </Card>

            {/* ② 今週の実行 */}
            <Card>
              <CardTitle>② {isCurrent?"今週":"この週"}の実行</CardTitle>
              {weekDates.map((d,i)=>{
                const dk=dateKey(d);
                const day=weekData.days[dk]||{};
                const isToday=isCurrent&&isSameDay(d,today);
                // 現在週のみ未来日はグレーアウト。過去週・未来週はすべて入力可
                const isFuture=isCurrent&&d>today;
                return(
                  <div key={dk} style={{
                    marginBottom:12,
                    opacity:isFuture?0.4:1,
                    borderLeft:isToday?`3px solid ${YELLOW}`:"3px solid transparent",
                    paddingLeft:10,
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:isFuture?0:6}}>
                      <div style={{width:20,fontSize:13,color:isToday?YELLOW:INK_LT,fontWeight:isToday?"bold":"normal"}}>{DAYS_JP[i]}</div>
                      <div style={{fontSize:12,color:INK_LT,flex:1}}>{d.getMonth()+1}/{d.getDate()}</div>
                      <CheckBtns dk={dk} day={day} onToggle={toggleCheck} isFuture={isFuture}/>
                    </div>
                    {!isFuture&&(
                      <TA rows={1} value={day.comment||""} onChange={e=>setComment(dk,e.target.value)}
                        placeholder={`${DAYS_JP[i]}曜のコメント...`} style={{fontSize:11,padding:"5px 8px"}}/>
                    )}
                  </div>
                );
              })}
              <SaveIndicator status={saveStatus}/>
            </Card>

            {/* ③ 今週の実行率 */}
            <Card>
              <CardTitle>③ {isCurrent?"今週":"この週"}の実行率</CardTitle>
              <div style={{textAlign:"center",padding:"12px 0"}}>
                <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:56,color:YELLOW,lineHeight:1}}>
                  {pct}<span style={{fontSize:22}}>%</span>
                </div>
                <div style={{fontSize:13,color:INK_LT,marginTop:10}}>
                  {isCurrent
                    ?<>{totalSoFar}日中 {checkedDays}日 実行</>
                    :totalSoFar>0
                      ?<>{checkedDays}日 実行（{totalSoFar}日記録）</>
                      :<>まだ記録がありません</>
                  }
                </div>
              </div>
            </Card>

            {/* ④ 振り返り */}
            <Card>
              <CardTitle>④ 振り返り</CardTitle>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:12,color:INK,marginBottom:6,fontWeight:"bold"}}>① できたこと</div>
                <TA rows={3} value={reflection.good} onChange={e=>updateReflection({good:e.target.value})}
                  placeholder="今週うまくいったこと、実践できたこと..."/>
              </div>
              <div>
                <div style={{fontSize:12,color:INK,marginBottom:6,fontWeight:"bold"}}>② 改善すること</div>
                <TA rows={3} value={reflection.improve} onChange={e=>updateReflection({improve:e.target.value})}
                  placeholder="次週に向けて改善したいこと..."/>
              </div>
              <SaveIndicator status={saveStatus}/>
            </Card>
          </>
        )}

        {/* ── サマリー ────────────────────────────────────── */}
        {tab==="summary"&&(
          <>
            <Card>
              <CardTitle>累計サマリー</CardTitle>
              <div style={{display:"flex",gap:12}}>
                {[
                  {num:totalDone,   unit:"日", label:"累計達成"},
                  {num:overallPct,  unit:"%",  label:"総合達成率"},
                  {num:allWeeks.length, unit:"週", label:"取組み週数"},
                ].map(({num,unit,label})=>(
                  <div key={label} style={{flex:1,background:PAPER_DK,borderRadius:10,padding:"14px 10px",textAlign:"center"}}>
                    <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:26,color:INK,lineHeight:1}}>
                      {num}<span style={{fontSize:13}}>{unit}</span>
                    </div>
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

      </div>
    </div>
  );
}
