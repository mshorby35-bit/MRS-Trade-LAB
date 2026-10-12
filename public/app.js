
const state = {
  catalog: [],
  meta: null,
  give: [{ playerId: null }],
  get: [{ playerId: null }],
};

const $ = id => document.getElementById(id);
const els = {
  menuBtn:$("menuBtn"),menu:$("menu"),leagueType:$("leagueType"),format:$("format"),scoring:$("scoring"),size:$("size"),
  giveSlots:$("giveSlots"),getSlots:$("getSlots"),addGive:$("addGive"),addGet:$("addGet"),
  marker:$("marker"),callout:$("callout"),leftPct:$("leftPct"),rightPct:$("rightPct"),indicator:$("indicator"),
  rawPill:$("rawPill"),adjPill:$("adjPill"),diffPill:$("diffPill"),grade:$("grade"),explain:$("explain"),
  giveCards:$("giveCards"),getCards:$("getCards"),dataStatus:$("dataStatus"),sourceChips:$("sourceChips")
};

els.menuBtn.onclick=()=>els.menu.classList.toggle("open");
document.addEventListener("click",e=>{if(!e.target.closest(".menu-wrap"))els.menu.classList.remove("open")});

function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function playerById(id){return state.catalog.find(p=>String(p.id)===String(id))}
function imgFallback(el,p){
  if(!el.dataset.fallbackUsed && p.fallbackHeadshot){el.dataset.fallbackUsed="1";el.src=p.fallbackHeadshot;return}
  el.onerror=null;el.src="data:image/svg+xml,"+encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='100%' height='100%' rx='18' fill='#162238'/><text x='50%' y='54%' text-anchor='middle' dominant-baseline='middle' font-family='Helvetica,Arial' font-size='34' font-weight='700' fill='#dbe6fb'>${esc(p.name.split(" ").map(x=>x[0]).slice(0,2).join(""))}</text></svg>`)
}
window.__imgFallback=(el,id)=>{const p=playerById(id);if(p)imgFallback(el,p)}

function suggestionHTML(p){
  return `<div class="suggestion" data-id="${esc(p.id)}">
    <img class="sugg-img" src="${esc(p.headshot||p.fallbackHeadshot||"")}" onerror="__imgFallback(this,'${esc(p.id)}')">
    <div><div class="sugg-name">${esc(p.name)}</div><div class="sugg-meta">${esc(p.position)} • ${esc(p.team||"FA")} ${p.positionRank?`• ${esc(p.position)}${p.positionRank}`:""}</div></div>
    <div class="sugg-score">${p.modelScore}</div>
  </div>`
}

function renderSlot(side,index){
  const tpl=$("slotTemplate").content.cloneNode(true);
  const root=tpl.querySelector(".slot"),input=tpl.querySelector(".player-input"),box=tpl.querySelector(".suggestions"),remove=tpl.querySelector(".remove");
  const slot=state[side][index],selected=playerById(slot.playerId);
  if(selected) input.value=`${selected.name} — ${selected.position}, ${selected.team||"FA"}`;

  const show=()=>{
    const q=input.value.trim().toLowerCase();
    let list=state.catalog;
    if(q) list=list.filter(p=>`${p.name} ${p.team} ${p.position}`.toLowerCase().includes(q));
    list=list.slice(0,10);
    box.innerHTML=list.map(suggestionHTML).join("")||`<div class="empty">No matching players</div>`;
    box.classList.add("open");
    box.querySelectorAll(".suggestion").forEach(row=>{
      row.onclick=()=>{
        const p=playerById(row.dataset.id);
        slot.playerId=p.id;input.value=`${p.name} — ${p.position}, ${p.team||"FA"}`;box.classList.remove("open");updateTrade();
      }
    });
  };
  input.onfocus=show;input.oninput=()=>{slot.playerId=null;show();updateTrade()};
  input.onkeydown=e=>{if(e.key==="Escape")box.classList.remove("open")};
  remove.onclick=()=>{if(state[side].length>1){state[side].splice(index,1);renderSlots();updateTrade()}else{state[side][0].playerId=null;renderSlots();updateTrade()}};
  root.addEventListener("focusout",()=>setTimeout(()=>box.classList.remove("open"),150));
  return tpl;
}
function renderSlots(){
  els.giveSlots.innerHTML="";els.getSlots.innerHTML="";
  state.give.forEach((_,i)=>els.giveSlots.appendChild(renderSlot("give",i)));
  state.get.forEach((_,i)=>els.getSlots.appendChild(renderSlot("get",i)));
}
els.addGive.onclick=()=>{if(state.give.length<6){state.give.push({playerId:null});renderSlots()}};
els.addGet.onclick=()=>{if(state.get.length<6){state.get.push({playerId:null});renderSlots()}};

function packageAdjusted(players){
  const vals=players.map(p=>p.modelScore).sort((a,b)=>b-a);
  const weights=state.meta?.methodology?.packageWeights || [1,.94,.88,.82];
  return Math.round(vals.reduce((sum,v,i)=>sum+v*(weights[Math.min(i,weights.length-1)]??.82),0));
}
function card(p,side){
  const stats=(p.stats||[]).map(([v,l])=>`<div class="stat-cell"><div class="stat-value">${esc(v)}</div><div class="stat-label">${esc(l)}</div></div>`).join("");
  const trend=p.trend30Day>0?`▲ ${p.trend30Day}`:p.trend30Day<0?`▼ ${Math.abs(p.trend30Day)}`:"Stable";
  return `<article class="player-card">
    <div class="pc-top">
      <div class="info-wrap">
        <img class="avatar" src="${esc(p.headshot||p.fallbackHeadshot||"")}" alt="${esc(p.name)}" onerror="__imgFallback(this,'${esc(p.id)}')">
        <div><div class="name">${esc(p.name)}</div><div class="meta">${esc(p.position)} • ${esc(p.team||"FA")}${p.positionRank?` • ${esc(p.position)}${p.positionRank}`:""}</div><a class="profile-link" href="${esc(p.profile)}" target="_blank" rel="noopener">NFL profile ↗</a></div>
      </div>
      <div class="score-wrap"><div class="score">${p.modelScore}</div><span class="value-label">MODEL VALUE</span></div>
    </div>
    <div class="stats-title">Season stats</div><div class="stats-grid">${stats}</div>
    <div class="mini"><div class="${side==="give"?"givebar":"getbar"}" style="width:${Math.min(100,p.modelScore)}%"></div></div>
    <div class="meta-row">
      <span class="tag">Market ${p.marketValue?Number(p.marketValue).toLocaleString():"—"}</span>
      <span class="tag">30d ${esc(trend)}</span>
      ${p.injuryStatus?`<span class="tag">${esc(p.injuryStatus)}</span>`:""}
      <span class="tag">${esc(p.source?.value||"Model")}</span>
    </div>
  </article>`
}
function selected(side){return state[side].map(x=>playerById(x.playerId)).filter(Boolean)}
function setPill(el,text){el.childNodes[0].nodeValue=text+" "}

function updateTrade(){
  const give=selected("give"),get=selected("get");
  els.giveCards.innerHTML=give.length?give.map(p=>card(p,"give")).join(""):`<div class="empty">Choose players above.</div>`;
  els.getCards.innerHTML=get.length?get.map(p=>card(p,"get")).join(""):`<div class="empty">Choose players above.</div>`;
  if(!give.length||!get.length){
    els.marker.style.left="50%";els.leftPct.textContent="50%";els.rightPct.textContent="50%";els.callout.textContent="Even";
    els.grade.textContent="Waiting for players";els.indicator.textContent="Select players to begin";els.explain.textContent="Add at least one player to each side.";
    setPill(els.rawPill,"Raw: 0 vs 0");setPill(els.adjPill,"Adjusted: 0 vs 0");setPill(els.diffPill,"Difference: 0");return;
  }
  const lraw=Math.round(give.reduce((s,p)=>s+p.modelScore,0)),rraw=Math.round(get.reduce((s,p)=>s+p.modelScore,0));
  const ladj=packageAdjusted(give),radj=packageAdjusted(get),total=Math.max(1,ladj+radj),rshare=radj/total,lshare=ladj/total;
  els.marker.style.left=`${10+rshare*80}%`;els.leftPct.textContent=`${Math.round(lshare*100)}%`;els.rightPct.textContent=`${Math.round(rshare*100)}%`;
  const diffPts=Math.abs(radj-ladj),diffPct=Math.abs(rshare-lshare)*100,favoredGet=rshare>lshare;
  let grade,indicator,explain,callout;
  if(diffPct<=4){grade="Fair Trade";indicator="Near-even value";explain="The trade lands very close to midfield after the package adjustment.";callout="Even"}
  else if(diffPct<=10){
    if(favoredGet){grade="Slight Edge — You Get";indicator="You receive slightly more value";explain="The incoming package has a modest edge, but the deal remains in a reasonable trade range.";callout=`+${diffPts} to You`}
    else{grade="Slight Overpay";indicator="You give slightly more value";explain="Your outgoing package carries a modest premium. A small add from the other side would tighten the deal.";callout=`-${diffPts} to You`}
  } else if(diffPct<=20){
    if(favoredGet){grade="Clear Edge — You Get";indicator="You receive more value";explain="The incoming package has a clear edge after market, production, trend, and consolidation are considered.";callout=`+${diffPts} to You`}
    else{grade="Clear Overpay";indicator="You give more value";explain="Your package is materially stronger. You would likely want additional value back.";callout=`-${diffPts} to You`}
  } else {
    if(favoredGet){grade="Big Edge — You Get";indicator="Large advantage to you";explain="The incoming package sits well outside the fair-trade zone on the current model.";callout=`+${diffPts} to You`}
    else{grade="Major Overpay";indicator="Large advantage to opponent";explain="Your outgoing package sits well outside the fair-trade zone on the current model.";callout=`-${diffPts} to You`}
  }
  setPill(els.rawPill,`Raw: ${lraw} vs ${rraw}`);setPill(els.adjPill,`Adjusted: ${ladj} vs ${radj}`);setPill(els.diffPill,`Difference: ${diffPts} (${diffPct.toFixed(1)}%)`);
  els.grade.textContent=grade;els.indicator.textContent=indicator;els.explain.textContent=explain;els.callout.textContent=callout;
}
function sourceChips(meta){
  const ss=meta.sourceStatus||{};
  const chips=[
    ["FantasyCalc market",ss.fantasyCalc],
    ["Sleeper player pool",ss.sleeperPlayers],
    ["Sleeper season stats",ss.sleeperStats],
    ["ESPN/Sleeper headshots",true]
  ];
  els.sourceChips.innerHTML=chips.map(([t,live])=>`<span class="source-chip ${live?"live":""}">${live?"● ":"○ "}${t}</span>`).join("");
}

async function loadCatalog(preserve=true){
  els.dataStatus.textContent="Refreshing live data…";
  const previousNames={give:selected("give").map(p=>p.name),get:selected("get").map(p=>p.name)};
  const qs=new URLSearchParams({dynasty:els.leagueType.value,qbs:els.format.value,teams:els.size.value,ppr:els.scoring.value});
  try{
    const res=await fetch(`/api/catalog?${qs}`);if(!res.ok)throw new Error(await res.text());
    const data=await res.json();state.catalog=data.players||[];state.meta=data;
    if(preserve){
      for(const side of ["give","get"]) state[side].forEach((slot,i)=>{const n=previousNames[side][i];if(n){const p=state.catalog.find(x=>x.name===n);slot.playerId=p?.id||null}});
    }
    if(!selected("give").length){
      const h=state.catalog.find(p=>p.name==="Justin Herbert");if(h)state.give[0].playerId=h.id;
    }
    if(!selected("get").length){
      const j=state.catalog.find(p=>p.name==="Jaxon Smith-Njigba");if(j)state.get[0].playerId=j.id;
    }
    const when=new Date(data.updatedAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
    els.dataStatus.textContent=`${data.live?"Live":"Fallback"} • ${state.catalog.length.toLocaleString()} players • ${data.season}${data.week?` Week ${data.week}`:""} • refreshed ${when}`;
    sourceChips(data);renderSlots();updateTrade();
  }catch(e){
    els.dataStatus.textContent="Data load failed — start the site with the included Node server.";
    console.error(e);
  }
}
["leagueType","format","scoring","size"].forEach(id=>$(id).onchange=()=>loadCatalog(true));
loadCatalog(false);
