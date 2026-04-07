import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const DAYS_JP = ["月","火","水","木","金"];

function getWeekDates(weekOffset=0) {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (day===0?6:day-1) + weekOffset*7);
  return Array.from({length:5},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return d; }); // 月〜金のみ
}
function isSameDay(a,b){ return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function dateKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function ProgressRing({pct,size=100,stroke=8,color="#c8502a"}){
  const r=(size-stroke)/2, circ=2*Math.PI*r, offset=circ-(pct/100)*circ;
  return (
    <div style={{position:"relative",width:size,height:size}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#ede9e3" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{transition:"stroke-dashoffset 0.6s ease"}}/>
      </svg>
      <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center"}}>
        <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:size>100?26:22,color:"#1a1a2e"}}>{pct}<span style={{fontSize:12}}>%</span></div>
        <div style={{fontSize:9,color:"#4a4a6a",letterSpacing:"0.1em"}}>達成率</div>
      </div>
    </div>
  );
}

async function fetchAdvice(goal,comments,achieveRate,reflection){
  const commentText=comments.filter(Boolean).join("\n");
  const reflectionText=reflection?`\n週間振り返り：${reflection||"（未記入）"}`:"";
  const prompt=`あなたはリーダーシップ研修のコーチです。受講者の今週の目標・日々のコメント・達成率・週間振り返りを踏まえ、以下を250字以内で日本語でアドバイスしてください。①今週の取り組みへの具体的なフィードバック②来週の目標への提案\n\n目標：${goal}\n達成率：${achieveRate}%\n日々のコメント：\n${commentText||"（コメントなし）"}${reflectionText}`;
  const res=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,messages:[{role:"user",content:prompt}]})
  });
  const data=await res.json();
  return data.content?.map(b=>b.text).join("")||"アドバイスを取得できませんでした。";
}

function WeekNav({weekOffset,setWeekOffset,weekDates}){
  const isCurrentWeek=weekOffset===0;
  const fmt=d=>`${d.getMonth()+1}/${d.getDate()}`;
  const accent="#c8502a", border="#d8d4cc", ink="#1a1a2e";
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"white",borderRadius:10,padding:"10px 16px",marginBottom:16,border:`1px solid ${border}`,boxShadow:"0 1px 6px rgba(26,26,46,0.06)"}}>
      <button onClick={()=>setWeekOffset(o=>o-1)} style={{background:"none",border:"none",cursor:"pointer",fontSize:22,color:"#888",padding:"0 8px",lineHeight:1}}>‹</button>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:12,fontFamily:"'Noto Serif JP',serif",color:ink}}>{fmt(weekDates[0])} 〜 {fmt(weekDates[4])}</div>
        <div style={{fontSize:10,color:isCurrentWeek?accent:"#999",marginTop:2,letterSpacing:"0.08em"}}>{isCurrentWeek?"今週":`${Math.abs(weekOffset)}週前`}</div>
      </div>
      <button onClick={()=>setWeekOffset(o=>Math.min(0,o+1))} style={{background:"none",border:"none",cursor:isCurrentWeek?"default":"pointer",fontSize:22,color:isCurrentWeek?"#ddd":"#888",padding:"0 8px",lineHeight:1}}>›</button>
    </div>
  );
}

const CHECK_TYPES=[
  {value:"done",label:"○",activeBg:"#2d7a4f"},
  {value:"skip",label:"✕",activeBg:"#c8502a"},
  {value:"half",label:"ー",activeBg:"#888"},
];

export default function App(){
  const [tab,setTab]=useState("today");

const [data,setData]=useState({});
const [userId]=useState(()=>localStorage.getItem("kawaru_user_id")||crypto.randomUUID());
const [loading,setLoading]=useState(true);

useEffect(()=>{
  localStorage.setItem("kawaru_user_id", userId);
  loadAllData();
},[]);

async function loadAllData(){
  setLoading(true);
  const {data:rows}=await supabase
    .from("entries")
    .select("*")
    .eq("user_id", userId);
  if(rows){
    const obj={};
    rows.forEach(r=>{ obj[r.week_key]=r.data; });
    setData(obj);
  }
  setLoading(false);
}

async function saveWeekData(weekKey, weekData){
  await supabase.from("entries").upsert({
    user_id: userId,
    week_key: weekKey,
    data: weekData,
    updated_at: new Date().toISOString()
  },{onConflict:"user_id,week_key"});
}
  const [editGoal,setEditGoal]=useState(false);
  const [goalDraft,setGoalDraft]=useState("");
  const [advice,setAdvice]=useState(null);
  const [reflectionSaved,setReflectionSaved]=useState(false);
  const [adviceLoading,setAdviceLoading]=useState(false);
  const [weekOffset,setWeekOffset]=useState(0);

  const today=new Date();
  const weekDates=getWeekDates(weekOffset);
  const weekKey=dateKey(weekDates[0]);
  const weekData=data[weekKey]||{goal:"",days:{}};
  const isCurrentWeek=weekOffset===0;

function updateWeek(patch){
    const updated={...(data[weekKey]||{goal:"",days:{}}),...patch};
    setData(prev=>({...prev,[weekKey]:updated}));
    saveWeekData(weekKey, updated);
  }  function toggleCheck(dk,value){
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

  const allWeeks=Object.entries(data).sort((a,b)=>b[0].localeCompare(a[0]));
  const totalDone=allWeeks.reduce((s,[,wd])=>s+Object.values(wd.days||{}).filter(d=>d.status==="done").length,0);
  const totalChecked=allWeeks.reduce((s,[,wd])=>s+Object.values(wd.days||{}).filter(d=>["done","skip"].includes(d.status)).length,0);
  const overallPct=totalChecked>0?Math.round(totalDone/totalChecked*100):0;

  async function handleAdvice(){
    if(!weekData.goal)return;
    setAdviceLoading(true);setAdvice(null);
    const comments=weekDates.map(d=>weekData.days[dateKey(d)]?.comment||"");
    const text=await fetchAdvice(weekData.goal,comments,pct,weekData.reflection||"");
    setAdvice(text);setAdviceLoading(false);
  }

  const ink="#1a1a2e",inkLight="#4a4a6a",paper="#faf9f6",paperDark="#f0ede6";
  const accent="#c8502a",accentLight="#e8795a",success="#2d7a4f",border="#d8d4cc";
  const shadow="0 2px 20px rgba(26,26,46,0.08)";

  const Card=({children,style={}})=>(
    <div style={{background:"white",borderRadius:12,padding:20,marginBottom:16,boxShadow:shadow,border:`1px solid ${border}`,...style}}>{children}</div>
  );
  const CardTitle=({children})=>(
    <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:13,color:inkLight,letterSpacing:"0.1em",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
      <span style={{width:3,height:16,background:accent,borderRadius:2,display:"block",flexShrink:0}}/>{children}
    </div>
  );
  const Btn=({children,onClick,disabled,secondary,style={}})=>(
    <button onClick={onClick} disabled={disabled} style={{width:"100%",padding:13,background:disabled?"#d8d4cc":secondary?ink:accent,color:"white",border:"none",borderRadius:8,fontFamily:"'Noto Sans JP',sans-serif",fontSize:13,cursor:disabled?"not-allowed":"pointer",letterSpacing:"0.1em",marginTop:8,...style}}>{children}</button>
  );
  const CheckBtns=({dk,day,isFuture=false})=>(
    <div style={{display:"flex",gap:5}}>
      {CHECK_TYPES.map(({value,label,activeBg})=>(
        <button key={value} onClick={()=>!isFuture&&toggleCheck(dk,value)} disabled={isFuture}
          style={{width:34,height:34,borderRadius:"50%",border:`1.5px solid ${day.status===value?activeBg:border}`,background:day.status===value?activeBg:"white",cursor:isFuture?"default":"pointer",fontSize:13,fontWeight:"bold",color:day.status===value?"white":ink,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s"}}>
          {label}
        </button>
      ))}
    </div>
  );

  const tabs=[
    {id:"today",label:"今日",icon:"⏱"},
    {id:"week",label:"今週",icon:"📅"},
    {id:"stats",label:"実績",icon:"📊"},
    {id:"ai",label:"AI",icon:"✦"},
  ];
  const navSet=o=>{setWeekOffset(o);setEditGoal(false);setAdvice(null);};

  return(
    <div style={{fontFamily:"'Noto Sans JP',sans-serif",background:paper,color:ink,minHeight:"100vh",maxWidth:480,margin:"0 auto"}}>
{loading&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(255,255,255,0.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999,fontSize:14,color:"#4a4a6a"}}>読み込み中...</div>}

      {/* Header */}
      <div style={{background:ink,padding:"20px 24px 0",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <h1 style={{fontFamily:"'Noto Serif JP',serif",fontSize:18,color:"white",letterSpacing:"0.08em",margin:0}}>変わるリーダー</h1>
          <span style={{background:isCurrentWeek?accent:"#555",color:"white",fontSize:11,padding:"3px 10px",borderRadius:12}}>
            {isCurrentWeek?`第${Math.ceil(today.getDate()/7)}週`:`${Math.abs(weekOffset)}週前`}
          </span>
        </div>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",letterSpacing:"0.12em",marginBottom:12}}>CHANGING LEADER PROGRAM</div>
        <div style={{display:"flex",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"10px 4px",background:"none",border:"none",color:tab===t.id?accentLight:"rgba(255,255,255,0.45)",fontFamily:"'Noto Sans JP',sans-serif",fontSize:10,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,letterSpacing:"0.06em"}}>
              <span style={{fontSize:16}}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:"20px 20px 100px"}}>

        {/* TODAY */}
        {tab==="today"&&(
          <>
            <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:20,color:ink,marginBottom:6}}>{isCurrentWeek?"今日の行動":"過去の記録"}</div>
            <div style={{fontSize:12,color:inkLight,marginBottom:16}}>
              {isCurrentWeek
                ?`${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日（${DAYS_JP[today.getDay()===0?4:today.getDay()-1]||""}）`
                :`${weekDates[0].getMonth()+1}/${weekDates[0].getDate()} 〜 ${weekDates[4].getMonth()+1}/${weekDates[4].getDate()} の週`
              }
            </div>
            <WeekNav weekOffset={weekOffset} setWeekOffset={navSet} weekDates={weekDates}/>
            {!isCurrentWeek&&(
              <div style={{background:"#f0ede6",border:"1px solid #d8d4cc",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:inkLight,display:"flex",alignItems:"center",gap:8}}>
                <span>📋</span><span>過去の週を表示中です。目標・チェックを入力・修正できます。</span>
              </div>
            )}

            {/* 目標 */}
            <Card style={isCurrentWeek?{background:"linear-gradient(135deg,#fff8f6,#fff3ee)",border:"1.5px solid #e8b09a"}:{}}>
              <CardTitle>{isCurrentWeek?"今週の目標":"この週の目標"}</CardTitle>
              {editGoal?(
                <>
                  <textarea value={goalDraft} onChange={e=>setGoalDraft(e.target.value)} rows={3} placeholder="この週の目標を入力..."
                    style={{width:"100%",fontFamily:"'Noto Sans JP',sans-serif",fontSize:14,padding:12,border:`1.5px solid ${border}`,borderRadius:8,background:paperDark,color:ink,resize:"none",outline:"none"}}/>
                  <Btn onClick={()=>{updateWeek({goal:goalDraft});setEditGoal(false);}}>保存する</Btn>
                  <Btn secondary style={{marginTop:8}} onClick={()=>setEditGoal(false)}>キャンセル</Btn>
                </>
              ):(
                <>
                  <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:15,lineHeight:1.7,padding:12,background:paperDark,borderRadius:8,minHeight:56}}>
                    {weekData.goal||<span style={{color:"#aaa",fontSize:13}}>目標を設定してください</span>}
                  </div>
                  <Btn secondary style={{marginTop:12}} onClick={()=>{setGoalDraft(weekData.goal);setEditGoal(true);}}>✏️ {weekData.goal?"目標を変更":"目標を設定"}</Btn>
                </>
              )}
            </Card>

            {/* 今日のチェック（今週のみ） */}
            {isCurrentWeek&&weekData.goal&&today.getDay()>=1&&today.getDay()<=5&&(()=>{
              const dk=dateKey(today);const day=weekData.days[dk]||{};
              return(
                <Card>
                  <CardTitle>今日の達成チェック <span style={{background:accent,color:"white",fontSize:10,padding:"2px 8px",borderRadius:10,marginLeft:4}}>TODAY</span></CardTitle>
                  <div style={{display:"flex",gap:8,marginBottom:12}}>
                    {CHECK_TYPES.map(({value,label,activeBg})=>(
                      <button key={value} onClick={()=>toggleCheck(dk,value)}
                        style={{flex:1,height:52,borderRadius:8,fontSize:22,fontWeight:"bold",border:`1.5px solid ${day.status===value?activeBg:border}`,background:day.status===value?activeBg:"white",color:day.status===value?"white":ink,cursor:"pointer",transition:"all 0.15s"}}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <textarea rows={3} value={day.comment||""} onChange={e=>setComment(dk,e.target.value)}
                    placeholder="今日の気づき・コメントを入力（AIアドバイスに活用されます）"
                    style={{width:"100%",fontFamily:"'Noto Sans JP',sans-serif",fontSize:12,padding:"8px 10px",border:`1px solid ${border}`,borderRadius:6,background:paperDark,color:ink,resize:"none",outline:"none"}}/>
                </Card>
              );
            })()}

            {/* 過去週：日別チェック */}
            {!isCurrentWeek&&(
              <Card>
                <CardTitle>日別チェック（修正・入力）</CardTitle>
                {weekDates.map((d,i)=>{
                  const dk=dateKey(d);const day=weekData.days[dk]||{};
                  return(
                    <div key={dk}>
                      <div style={{display:"flex",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${paperDark}`,gap:10}}>
                        <div style={{width:30,fontSize:12,color:inkLight}}>{DAYS_JP[i]}</div>
                        <div style={{flex:1,fontSize:11,color:inkLight}}>{d.getMonth()+1}/{d.getDate()}
                          {day.status==="done"&&<span style={{background:success,color:"white",fontSize:10,padding:"2px 6px",borderRadius:10,marginLeft:4}}>達成</span>}
                        </div>
                        <CheckBtns dk={dk} day={day}/>
                      </div>
                      <textarea rows={2} value={day.comment||""} onChange={e=>setComment(dk,e.target.value)} placeholder={`${DAYS_JP[i]}曜のコメント...`}
                        style={{width:"100%",marginTop:6,fontFamily:"'Noto Sans JP',sans-serif",fontSize:12,padding:"8px 10px",border:`1px solid ${border}`,borderRadius:6,background:paperDark,color:ink,resize:"none",outline:"none"}}/>
                    </div>
                  );
                })}
              </Card>
            )}

            {/* 進捗 */}
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

        {/* WEEK */}
        {tab==="week"&&(
          <>
            <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:20,color:ink,marginBottom:6}}>週間チェック</div>
            <div style={{fontSize:12,color:inkLight,marginBottom:16}}>5日間の取り組みを記録する</div>
            <WeekNav weekOffset={weekOffset} setWeekOffset={navSet} weekDates={weekDates}/>
            {!isCurrentWeek&&(
              <div style={{background:"#f0ede6",border:"1px solid #d8d4cc",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:inkLight,display:"flex",alignItems:"center",gap:8}}>
                <span>📋</span><span>過去の週を表示中です。内容を修正できます。</span>
              </div>
            )}
            <Card>
              <CardTitle>この週の目標</CardTitle>
              <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:15,lineHeight:1.7,padding:12,background:paperDark,borderRadius:8,minHeight:56}}>
                {weekData.goal||<span style={{color:"#aaa",fontSize:13}}>目標未設定</span>}
              </div>
            </Card>
            <Card>
              <CardTitle>日別チェック</CardTitle>
              {weekDates.map((d,i)=>{
                const dk=dateKey(d);const day=weekData.days[dk]||{};
                const isToday=isSameDay(d,today);
                const isFuture=isCurrentWeek&&d>today;
                return(
                  <div key={dk} style={{opacity:isFuture?0.35:1}}>
                    <div style={{display:"flex",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${paperDark}`,gap:10}}>
                      <div style={{width:30,fontSize:12,color:inkLight}}>{DAYS_JP[i]}</div>
                      <div style={{flex:1,fontSize:11,color:inkLight}}>
                        {d.getMonth()+1}/{d.getDate()}
                        {isToday&&<span style={{background:accent,color:"white",fontSize:10,padding:"2px 6px",borderRadius:10,marginLeft:4}}>今日</span>}
                        {day.status==="done"&&!isToday&&<span style={{background:success,color:"white",fontSize:10,padding:"2px 6px",borderRadius:10,marginLeft:4}}>達成</span>}
                      </div>
                      <CheckBtns dk={dk} day={day} isFuture={isFuture}/>
                    </div>
                    {!isFuture&&<textarea rows={2} value={day.comment||""} onChange={e=>setComment(dk,e.target.value)} placeholder={`${DAYS_JP[i]}曜のコメント...`}
                      style={{width:"100%",marginTop:6,fontFamily:"'Noto Sans JP',sans-serif",fontSize:12,padding:"8px 10px",border:`1px solid ${border}`,borderRadius:6,background:paperDark,color:ink,resize:"none",outline:"none"}}/>}
                  </div>
                );
              })}
            </Card>

            {/* 振り返り（1欄） */}
            <Card>
              <CardTitle>週間振り返り</CardTitle>
              <div style={{background:"linear-gradient(135deg,#fff8f5,#fff0ea)",border:"1.5px solid #e8b09a",borderRadius:12,padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:22}}>📝</span>
                <div style={{fontSize:12,color:inkLight,lineHeight:1.6}}>週の終わりに<strong style={{color:accent}}>今週の学び</strong>を振り返りましょう。</div>
              </div>
              <div style={{fontSize:12,color:inkLight,marginBottom:8}}>うまくいったこと・いかなかったこと・気づきは？</div>
              <textarea rows={6}
                value={weekData.reflection||""}
                onChange={e=>updateWeek({reflection:e.target.value})}
                placeholder="今週の取り組みを自由に振り返ってみましょう..."
                style={{width:"100%",fontFamily:"'Noto Sans JP',sans-serif",fontSize:13,padding:"10px 12px",border:`1.5px solid ${border}`,borderRadius:8,background:paperDark,color:ink,resize:"none",outline:"none",lineHeight:1.7}}/>
              <Btn onClick={()=>saveReflection(weekData.reflection||"")}>振り返りを保存する</Btn>
              <div style={{fontSize:11,color:success,textAlign:"right",marginTop:4,height:16}}>{reflectionSaved?"✓ 保存しました":""}</div>
            </Card>
          </>
        )}

        {/* STATS */}
        {tab==="stats"&&(
          <>
            <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:20,color:ink,marginBottom:6}}>実績レポート</div>
            <div style={{fontSize:12,color:inkLight,marginBottom:20}}>あなたの成長の記録</div>
            <Card>
              <CardTitle>累計サマリー</CardTitle>
              <div style={{display:"flex",justifyContent:"center",margin:"12px 0"}}>
                <ProgressRing pct={overallPct} size={120} stroke={10} color={overallPct>=70?success:accent}/>
              </div>
              <div style={{display:"flex",gap:12}}>
                {[{num:totalDone,unit:"日",label:"累計達成"},{num:overallPct,unit:"%",label:"総合達成率"},{num:allWeeks.length,unit:"週",label:"取組み週数"}].map(({num,unit,label})=>(
                  <div key={label} style={{flex:1,background:paperDark,borderRadius:10,padding:"14px 10px",textAlign:"center"}}>
                    <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:26,color:ink,lineHeight:1}}>{num}<span style={{fontSize:13}}>{unit}</span></div>
                    <div style={{fontSize:10,color:inkLight,marginTop:4,letterSpacing:"0.08em"}}>{label}</div>
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
                  const isThis=k===weekKey;
                  return(
                    <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:`1px solid ${paperDark}`}}>
                      <div style={{flex:1,marginRight:10}}>
                        <div style={{fontSize:13,color:ink}}>{wd.goal||"（目標未設定）"}</div>
                        <div style={{fontSize:11,color:"#aaa",marginTop:2,display:"flex",gap:6,flexWrap:"wrap"}}>
                          <span>{k.replace(/-/g,"/")} 週〜</span>
                          {isThis&&<span style={{color:accent}}>今週</span>}
                          {wd.reflection&&<span style={{color:success}}>📝 振り返り済</span>}
                        </div>
                      </div>
                      <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:18,color:p>=70?success:accent,minWidth:44,textAlign:"right"}}>{p}%</div>
                    </div>
                  );
                })
              }
            </Card>
          </>
        )}

        {/* AI */}
        {tab==="ai"&&(
          <>
            <div style={{fontFamily:"'Noto Serif JP',serif",fontSize:20,color:ink,marginBottom:6}}>AIアドバイス</div>
            <div style={{fontSize:12,color:inkLight,marginBottom:16}}>今週の取り組みを踏まえたコーチングを受ける</div>
            <WeekNav weekOffset={weekOffset} setWeekOffset={o=>{setWeekOffset(o);setAdvice(null);}} weekDates={weekDates}/>
            <Card>
              <CardTitle>{isCurrentWeek?"今週のまとめ":"この週のまとめ"}</CardTitle>
              <div style={{fontSize:13,color:"#666",marginBottom:6}}>目標：{weekData.goal||"未設定"}</div>
              <div style={{fontSize:13}}>達成率：<strong>{pct}%</strong>（{checkedDays}/{isCurrentWeek?weekDates.filter(d=>d<=today).length:5}日）</div>
              <Btn disabled={!weekData.goal||adviceLoading} onClick={handleAdvice}>{adviceLoading?"生成中...":"🤖 AIアドバイスを取得"}</Btn>
            </Card>
            {(advice||adviceLoading)&&(
              <div style={{background:"linear-gradient(135deg,#1a1a2e,#2d2d4e)",borderRadius:12,padding:20,marginBottom:16,color:"white"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <span style={{fontSize:20}}>✦</span>
                  <span style={{fontSize:12,color:"rgba(255,255,255,0.6)",letterSpacing:"0.1em"}}>LEADERSHIP COACH AI</span>
                </div>
                {adviceLoading
                  ?<div style={{color:"rgba(255,255,255,0.5)",fontSize:12}}>分析中...</div>
                  :<div style={{fontSize:13,lineHeight:1.8,color:"rgba(255,255,255,0.9)"}}>{advice}</div>
                }
              </div>
            )}
            <Card style={{background:"#f8f6f0"}}>
              <CardTitle>今後のアップグレード予定</CardTitle>
              <div style={{fontSize:12,color:"#888",lineHeight:1.8}}>
                ▸ 目指すリーダー像の設定<br/>▸ 360度サーベイ連携<br/>▸ セッション気づき入力<br/>▸ Supabaseでデータ保存<br/>▸ 事務局管理画面
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
