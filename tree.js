/*
  THE GROWING TREE
*/
"use strict";

/* ================= MetaData bootstrap (module or fallback) ================= */
const MD=(function(){
  if(window.MetaData&&window.MetaData.version>=7)return window.MetaData;
  console.warn('MetaData v7+ not found — tree.js running on built-in fallback data.');
  const YEAR0=2012;
  const DAU_B  =[0.62,0.79,0.97,1.15,1.35,1.57,1.82,2.26,2.60,2.82,2.96,3.19,3.35,3.57,3.63];
  const ARPU_Q =[1.54,2.14,2.81,3.73,4.83,6.18,7.37,8.52,10.14,11.57,10.86,13.12,14.25,16.78,19.50];
  const ENG_PCT=[1.00,0.95,0.95,0.85,0.75,0.65,0.55,0.45,0.38,0.32,0.27,0.22,0.19,0.17,0.15];
  const INT_DAY=[11.0,10.2,9.4,8.6,7.8,7.0,6.2,5.4,4.8,4.3,3.8,3.3,2.9,2.7,2.5];
  const MIN_DAY=[28,30,32,34,36,38,40,42,46,48,49,50,51,52,52];
  const REV_B  =[5.09,7.87,12.47,17.93,27.64,40.65,55.84,70.70,85.97,117.93,116.61,134.90,164.50,200.97,245.0];
  const REV_YR=REV_B.map(v=>v*1e9);
  const REV_CUM=[0];
  for(let i=1;i<REV_YR.length;i++)REV_CUM[i]=REV_CUM[i-1]+(REV_YR[i-1]+REV_YR[i])/2;
  /* v7: advertising revenue only (10-K line item; pre-2012 per SEC Form S-1 ad split) */
  const AD_REV_B=[4.28,6.99,11.49,17.08,26.89,39.94,55.01,69.66,84.17,114.93,113.64,131.95,160.63,196.4,239.0];
  const AD_REV_YR=AD_REV_B.map(v=>v*1e9);
  const AD_REV_CUM=[0];
  for(let i=1;i<AD_REV_YR.length;i++)AD_REV_CUM[i]=AD_REV_CUM[i-1]+(AD_REV_YR[i-1]+AD_REV_YR[i])/2;
  const AD_REV_PRE2012=6.25e9;
  const clamp=(v,a,b)=>(v<a?a:v>b?b:v);
  function series(arr,yf){
    const x=clamp(yf-YEAR0,0,arr.length-1);
    const i=Math.min(Math.floor(x),arr.length-2);
    return arr[i]+(arr[i+1]-arr[i])*(x-i);
  }
  function rhythmRaw(h){
    return 0.22+Math.exp(-Math.pow(h-9,2)/5.0)+0.92*Math.exp(-Math.pow(h-15,2)/7.0);
  }
  let RM=0;const ST=480;
  for(let i=0;i<ST;i++)RM+=rhythmRaw((i/ST)*24)/ST;
  function rhythm(h){return rhythmRaw(h)/RM;}
  /* v6: year-aware weekly curve (Tue/Wed peak, weekend trough; contrast
     fades over the years, flattened during COVID) — weekly mean = 1 */
  const DAILY_MULT_BASE=[0.72,0.88,1.00,1.00,0.96,0.82,0.68];
  function weekBlend(yf){
    const passive=clamp(1.0-(yf-2012)*(0.35/12),0.65,1.0);
    let covid=1.0;
    if(yf>=2020&&yf<2022)covid=0.60;
    else if(yf>=2022&&yf<2023)covid=0.80;
    return Math.min(passive,covid);
  }
  function dayFactor(dow,yf){
    const b=weekBlend(yf===undefined?2026:yf);
    let mean=0;
    for(let i=0;i<7;i++)mean+=(1+(DAILY_MULT_BASE[i]-1)*b)/7;
    return (1+(DAILY_MULT_BASE[dow]-1)*b)/mean;
  }
  const SEASONAL_Q=[0.965,0.985,1.010,1.040];
  function seasonalQ(yf){
    const q=clamp(Math.floor(((yf%1)+1)%1*4),0,3);
    return SEASONAL_Q[q];
  }
  function eventMult(yf){
    if(yf>=2018.0&&yf<2018.75)return 0.95;
    if(yf>=2020.25&&yf<2020.5)return 1.12;
    return 1.0;
  }
  return {
    version:7,YEAR0,estFrom:2026,
    DAU_B,ARPU_Q,ENG_PCT,INT_DAY,MIN_DAY,REV_B,REV_YR,REV_CUM,
    series,rhythm,dayFactor,weekBlend,seasonalQ,eventMult,
    rhythmWeek(h,dow){return rhythm(h)*dayFactor(dow);},
    concurrent(yf,h){return series(DAU_B,yf)*1e9*(series(MIN_DAY,yf)/1440)*rhythm(h);},
    eventsPerSec(yf){return series(DAU_B,yf)*1e9*series(INT_DAY,yf)/86400;},
    eventsPerActiveSec(yf){return series(INT_DAY,yf)/(series(MIN_DAY,yf)*60);},
    eventsPerMinLive(yf,h,dow){
      const df=(dow===undefined)?1:dayFactor(dow,yf);
      return series(DAU_B,yf)*1e9*(series(MIN_DAY,yf)/1440)*rhythm(h)*df
             *(series(INT_DAY,yf)/(series(MIN_DAY,yf)*60))*60
             *seasonalQ(yf)*eventMult(yf);
    },
    revPerSec(yf){return series(REV_YR,yf)/31557600;},
    revCum(yf){return series(REV_CUM,yf);},
    REV_PRE2012:6.94e9,
    revCumTotal(yf){return 6.94e9+series(REV_CUM,yf);},
    AD_REV_B,AD_REV_YR,AD_REV_CUM,AD_REV_PRE2012,
    adRevYr(yf){return series(AD_REV_YR,yf);},
    adRevPerSec(yf){return series(AD_REV_YR,yf)/31557600;},
    adRevCum(yf){return series(AD_REV_CUM,yf);},
    adRevCumTotal(yf){return AD_REV_PRE2012+series(AD_REV_CUM,yf);},
    adShare(yf){return series(AD_REV_YR,yf)/series(REV_YR,yf);},
    arpuQuarter(yf){return series(ARPU_Q,yf);},
    passivity(yf){return 1-0.38*Math.pow(series(ENG_PCT,yf)/ENG_PCT[0],0.8);},
    methodsCurve(yf){
      const b=clamp((yf-2012.3)/3.2,0,1);
      const s=b*b*(3-2*b);
      return Math.min(1,0.12+0.78*s+0.10*clamp((yf-2018)/4,0,1));
    },
    minuteJitter(epochMin){
      let a=(epochMin|0)%2147483647;
      a=a+0x6D2B79F5|0;
      let t=Math.imul(a^(a>>>15),1|a);
      t=t+Math.imul(t^(t>>>7),61|t)^t;
      return (((t^(t>>>14))>>>0)/4294967296*2-1)*0.03;
    },
    FX_EUR:{rate:0.877,date:'2026-07-13'},
  };
})();

/* ================= derived constants ================= */
const NODE_SCALE=250000;                       /* 1 node = 250k users online */
const YEND=MD.YEAR0+MD.DAU_B.length-1;         /* 2026 */
/* v7: the extraction economy is ADVERTISING revenue only —
   the value pulled from attention & data, excluding hardware etc. */
const REVSEC_END=MD.adRevPerSec(YEND);
const CUM_END=MD.adRevCumTotal(YEND);
const CUM_2012=MD.adRevCumTotal(2012);
const DAU_2012=MD.series(MD.DAU_B,2012)*1e9;
const REVSEC_2012=MD.adRevPerSec(2012);
const ENG_2012=MD.series(MD.ENG_PCT,2012);

function nowFracYear(){
  const d=new Date(), s=new Date(d.getFullYear(),0,1), e=new Date(d.getFullYear()+1,0,1);
  return d.getFullYear()+(d-s)/(e-s);
}
function metrics(fy){
  const d=new Date(), h=d.getHours()+d.getMinutes()/60, dow=d.getDay();
  return {
    dau:MD.series(MD.DAU_B,fy)*1e9,
    arpu:MD.arpuQuarter(fy),
    eng:MD.series(MD.ENG_PCT,fy),
    intd:MD.series(MD.INT_DAY,fy),
    mind:MD.series(MD.MIN_DAY,fy),
    hour:h,dow,
    sessions:MD.concurrent(fy,h)*MD.dayFactor(dow,fy), /* year-aware weekly curve */
    revSec:MD.adRevPerSec(fy),                         /* ad revenue only */
    evSec:MD.eventsPerSec(fy),
    evMinLive:MD.eventsPerMinLive(fy,h,dow),
    seas:MD.seasonalQ(fy)*MD.eventMult(fy),            /* Q4/Q1 + 2018 dip, COVID surge */
    cum:MD.adRevCumTotal(fy),                          /* lifetime ad revenue */
    pass:MD.passivity(fy),
    est:fy>=MD.estFrom,
  };
}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}

/* ================= GEOMETRY ================= */
const DA=Math.PI/4;
function dcos(d){return Math.cos(d*DA);} function dsin(d){return Math.sin(d*DA);}
const UPSET=[0,4,5,6,7], DOWNSET=[0,1,2,3,4];

const cv=document.getElementById('c'), ctx=cv.getContext('2d');
let W=0,H=0,GY=0;
let TREE=null;

function recum(s){
  const cum=[0];let L=0;
  for(let i=1;i<s.pts.length;i++){L+=Math.hypot(s.pts[i].x-s.pts[i-1].x,s.pts[i].y-s.pts[i-1].y);cum.push(L);}
  s.cum=cum;s.len=L;
}
function localDir(pts,i){
  const a=pts[Math.max(0,i-1)],b=pts[i];
  return ((Math.round(Math.atan2(b.y-a.y,b.x-a.x)/DA)%8)+8)%8;
}
function measure(path){
  const cum=[0];let L=0;
  for(let i=1;i<path.length;i++){L+=Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y);cum.push(L);}
  return {cum,L};
}
function subPath(path,cum,d0,d1){
  d0=Math.max(0,d0);d1=Math.min(cum[cum.length-1],d1);
  if(d1<=d0)return null;
  const pt=d=>{let lo=0,hi=cum.length-1;
    while(lo<hi){const m2=(lo+hi)>>1;if(cum[m2]<d)lo=m2+1;else hi=m2;}
    const i=Math.max(1,lo),f=(d-cum[i-1])/Math.max(1e-6,cum[i]-cum[i-1]);
    return {x:path[i-1].x+(path[i].x-path[i-1].x)*f,y:path[i-1].y+(path[i].y-path[i-1].y)*f,i};};
  const a=pt(d0),b=pt(d1),out=[{x:a.x,y:a.y}];
  for(let i=a.i;i<b.i;i++)out.push(path[i]);
  out.push({x:b.x,y:b.y});
  return out;
}
function poly(c,pts){c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)c.lineTo(pts[i].x,pts[i].y);c.stroke();}
function offsetPts(pts,o){
  const out=[];
  for(let i=0;i<pts.length;i++){
    const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];
    const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;
    out.push({x:pts[i].x-dy/L*o,y:pts[i].y+dx/L*o});
  }
  return out;
}
function strokeVascular(pp,w,color){
  if(w<2.6){ctx.strokeStyle=color;ctx.lineWidth=Math.max(0.8,w);poly(ctx,pp);}
  else{
    const n=Math.min(11,Math.max(2,Math.round(w/2.2)));
    ctx.strokeStyle=color;ctx.lineWidth=1.25;
    for(let k=0;k<n;k++)poly(ctx,offsetPts(pp,(k-(n-1)/2)*2.1));
  }
}

/* ================= BUILD ================= */
function buildTree(seed){
  const rnd=mulberry32(seed);
  const T={csegs:[],rsegs:[],rootPaths:[],occ:new Map(),topY:0,rootDepth:0};

  /* ---------- CANOPY: node-driven BFS, no overlaps ---------- */
  const CELL=4.5;
  const ck=(x,y)=>Math.round(x/CELL)+'_'+Math.round(y/CELL);
  function markPath(pts,id){
    const cells=[];
    for(let i=1;i<pts.length;i++){
      const L=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y),n=Math.max(1,Math.ceil(L/CELL));
      for(let k2=0;k2<=n;k2++){
        const key=ck(pts[i-1].x+(pts[i].x-pts[i-1].x)*k2/n,pts[i-1].y+(pts[i].y-pts[i-1].y)*k2/n);
        let s=T.occ.get(key);if(!s){s=new Set();T.occ.set(key,s);}
        if(!s.has(id)){s.add(id);cells.push(key);}
      }
    }
    return cells;
  }
  function blockedC(x,y,pid){
    const cx=Math.round(x/CELL),cy=Math.round(y/CELL);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
      const s=T.occ.get((cx+dx)+'_'+(cy+dy));
      if(s)for(const v of s)if(v!==pid)return true;
    }
    return false;
  }
  const XB=430,YB=-300;
  T.routeBranch=function(site,id,rr){
    const rf=rr||rnd;
    const base=site.dir;
    const tries=[base,(base+1)%8,(base+7)%8].filter(d=>UPSET.includes(d));
    for(const d0 of tries){
      const pts=[{x:site.x,y:site.y}];
      let x=site.x,y=site.y,d=d0,ok=true;
      const steps=2+(rf()<0.5?1:0);
      for(let s2=0;s2<steps;s2++){
        const st=5.5+rf()*4.5;
        const nx=x+dcos(d)*st,ny=y+dsin(d)*st;
        if((s2>0&&blockedC(nx,ny,site.parent))||Math.abs(nx)>XB||ny<YB||ny>-6){ok=false;break;}
        pts.push({x:nx,y:ny});
        x=nx;y=ny;
        if(s2<steps-1&&rf()<0.5){
          const c=[(d+1)%8,(d+7)%8].filter(dd=>UPSET.includes(dd));
          if(c.length)d=c[Math.floor(rf()*c.length)];
        }
      }
      if(ok&&pts.length>=2){
        const cells=markPath(pts,id);
        return {pts,cells,endDir:d};
      }
    }
    return null;
  };
  const TL=105, trunkPts=[];
  for(let yy=0;yy<=TL;yy+=TL/14)trunkPts.push({x:0,y:-yy});
  T.csegs.push({pts:trunkPts,parent:-1,cur:0,alive:true,trunk:true,cells:markPath(trunkPts,0),site:null});
  const queue=[];
  const seedFr=[0.40,0.47,0.54,0.61,0.68,0.75,0.82,0.89,0.95,1.0];
  let sd=rnd()<0.5?1:-1;
  for(let i=0;i<seedFr.length;i++){
    const ai=Math.round(seedFr[i]*(trunkPts.length-1));
    const dir=seedFr[i]>=1?6:(sd>0?7:5);
    queue.push({x:trunkPts[ai].x,y:trunkPts[ai].y,dir,parent:0});
    sd=-sd;
  }
  const CAP=1500;                    /* headroom for 250k-scale peak counts */
  while(queue.length&&T.csegs.length<CAP){
    const site=queue.shift();
    const r=T.routeBranch(site,T.csegs.length);
    if(!r)continue;
    const idx=T.csegs.length;
    T.csegs.push({pts:r.pts,parent:site.parent,cur:0,alive:false,cells:r.cells,site:{x:site.x,y:site.y,dir:site.dir}});
    const e=r.pts[r.pts.length-1];
    queue.push({x:e.x,y:e.y,dir:r.endDir,parent:idx});
    const tilt=rnd()<0.5?(r.endDir+1)%8:(r.endDir+7)%8;
    queue.push({x:e.x,y:e.y,dir:UPSET.includes(tilt)?tilt:6,parent:idx});
    if(rnd()<0.22){
      const t2=rnd()<0.5?(r.endDir+2)%8:(r.endDir+6)%8;
      queue.push({x:e.x,y:e.y,dir:UPSET.includes(t2)?t2:6,parent:idx});
    }
  }
  let cTop=0,xmaxC=1;
  for(const s of T.csegs)for(const p of s.pts){if(p.y<cTop)cTop=p.y;if(Math.abs(p.x)>xmaxC)xmaxC=Math.abs(p.x);}
  const sc=Math.min((GY-58)/Math.max(1,-cTop),(W*0.49)/xmaxC);
  for(const s of T.csegs)s.pts.forEach(p=>{p.x*=sc;p.y*=sc;});
  T.topY=cTop*sc;
  for(const s of T.csegs)recum(s);
  T.csegs[0].cur=T.csegs[0].len;
  let cTotal=0;for(const s of T.csegs)cTotal+=s.len;
  T.canopyTotal=cTotal;
  T.genScale=sc;

  /* ---------- ROOTS: colonize the ENTIRE underground (screen space) ------ */
  const RCELL=3.8, rocc=new Map();
  const rk=(x,y)=>Math.round(x/RCELL)+'_'+Math.round(y/RCELL);
  function rMark(pts){
    for(let i=1;i<pts.length;i++){
      const L=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y),n=Math.max(1,Math.ceil(L/RCELL));
      for(let k2=0;k2<=n;k2++)
        rocc.set(rk(pts[i-1].x+(pts[i].x-pts[i-1].x)*k2/n,pts[i-1].y+(pts[i].y-pts[i-1].y)*k2/n),1);
    }
  }
  function rBlocked(x,y){return rocc.has(rk(x,y));}
  const HWx=W/2-12, RD=H-GY-95;
  T.rootDepth=RD;
  const CDpx=Math.min(RD*0.8,340), colPts=[];
  for(let yy=0;yy<=CDpx;yy+=CDpx/12)colPts.push({x:0,y:yy});
  T.rsegs.push({pts:colPts,parent:-1,cur:0,alive:false,ext:0});
  rMark(colPts);
  const rq=[];
  const pfr=[0.04,0.10,0.17,0.24,0.31,0.38,0.45,0.52,0.59,0.66,0.73,0.80,0.86,0.91,0.95,0.99],
        pdir=[4,0,3,1,4,0,1,3,4,0,3,1,0,4,1,2];
  for(let i=0;i<pfr.length;i++){
    const ai=Math.round(pfr[i]*(colPts.length-1));
    rq.push({x:colPts[ai].x,y:colPts[ai].y,dir:pdir[i],parent:0});
  }
  const rootBudget=T.canopyTotal*14;   /* full-underground capacity, ≈12.5× + headroom */
  let rTotal=0,attempts=0;
  function routeRoot(site){
    const tries=[site.dir,(site.dir+1)%8,(site.dir+7)%8].filter(d=>DOWNSET.includes(d));
    for(const d0 of tries){
      const pts=[{x:site.x,y:site.y}];
      let x=site.x,y=site.y,d=d0,ok=true;
      const steps=2+(rnd()<0.5?1:0);
      for(let s2=0;s2<steps;s2++){
        const st=6+rnd()*5;
        const nx=x+dcos(d)*st,ny=y+dsin(d)*st;
        if((s2>0&&rBlocked(nx,ny))||Math.abs(nx)>HWx||ny<6||ny>RD){ok=false;break;}
        pts.push({x:nx,y:ny});
        x=nx;y=ny;
        if(s2<steps-1&&rnd()<0.5){
          const c=[(d+1)%8,(d+7)%8].filter(dd=>DOWNSET.includes(dd));
          if(c.length)d=c[Math.floor(rnd()*c.length)];
        }
      }
      if(ok&&pts.length>=2){rMark(pts);return {pts,endDir:d};}
    }
    return null;
  }
  while(rTotal<rootBudget&&attempts<70000){
    attempts++;
    let site;
    if(rq.length)site=rq.shift();
    else{
      const ri=Math.floor(rnd()*T.rsegs.length);
      const rs=T.rsegs[ri], ep=rs.pts[rs.pts.length-1];
      site={x:ep.x,y:ep.y,dir:DOWNSET[Math.floor(rnd()*5)],parent:ri};
    }
    const r=routeRoot(site);
    if(!r)continue;
    const idx=T.rsegs.length;
    T.rsegs.push({pts:r.pts,parent:site.parent,cur:0,alive:false,ext:0});
    const e=r.pts[r.pts.length-1];
    let L=0;for(let i=1;i<r.pts.length;i++)L+=Math.hypot(r.pts[i].x-r.pts[i-1].x,r.pts[i].y-r.pts[i-1].y);
    rTotal+=L;
    rq.push({x:e.x,y:e.y,dir:r.endDir,parent:idx});
    if(rnd()<0.5){
      const tilt=rnd()<0.5?(r.endDir+1)%8:(r.endDir+7)%8;
      rq.push({x:e.x,y:e.y,dir:DOWNSET.includes(tilt)?tilt:2,parent:idx});
    }
  }
  for(const s of T.rsegs)recum(s);
  T.rPrefix=new Float64Array(T.rsegs.length);
  let acc=0;
  for(let i=0;i<T.rsegs.length;i++){acc+=T.rsegs[i].len;T.rPrefix[i]=acc;}
  T.rootTotal=acc;

  const hasChild=new Array(T.rsegs.length).fill(false);
  for(const s of T.rsegs)if(s.parent>=0)hasChild[s.parent]=true;
  const terms=[];
  for(let i=1;i<T.rsegs.length;i++)if(!hasChild[i])terms.push(i);
  terms.sort((a,b)=>T.rsegs[a].pts[T.rsegs[a].pts.length-1].x-T.rsegs[b].pts[T.rsegs[b].pts.length-1].x);
  const NP=Math.min(460,terms.length);
  for(let i=0;i<NP;i++){
    const ti=terms[Math.floor(i*(terms.length-1)/Math.max(1,NP-1))];
    const chain=[];let j=ti;
    while(j>=0){chain.unshift(j);j=T.rsegs[j].parent;}
    const path=[];
    for(const ci of chain){
      const p=T.rsegs[ci].pts;
      for(let v=(path.length?1:0);v<p.length;v++)path.push(p[v]);
    }
    const ms=measure(path);
    T.rootPaths.push({path,cum:ms.cum,L:ms.L,term:ti});
  }
  return T;
}

/* canopy drain: node → trunk base */
function drainFromNode(i){
  const path=[];let j=i;
  while(j>0){
    const s=TREE.csegs[j];
    const rev=s.pts.slice().reverse();
    for(let k=(path.length?1:0);k<rev.length;k++)path.push(rev[k]);
    j=s.parent;
  }
  const tp=TREE.csegs[0].pts;
  let bi=0,bd=1e9;
  const last=path[path.length-1]||tp[tp.length-1];
  for(let v=0;v<tp.length;v++){
    const dd=Math.hypot(tp[v].x-last.x,tp[v].y-last.y);
    if(dd<bd){bd=dd;bi=v;}
  }
  for(let v=bi;v>=0;v--)path.push(tp[v]);
  const ms=measure(path);
  return {path,cum:ms.cum,L:ms.L};
}

/* ================= STATE ================= */
let leaves=[],ripples=[],rRunners=[],rootEnergy=0,evCarry=0;
let rootAliveLen=0,bgPulse=0,rootM=0;
let live=false,viewFy=2012,euro=true,intro=true;   /* intro: ride 2012 → now; € default */
let paused=false;
const NOWFY=nowFracYear();
const scrub=document.getElementById('scrub');
scrub.max=NOWFY.toFixed(2);scrub.value="2012";
let base2012=null;

function resize(){
  W=cv.width=innerWidth;H=cv.height=innerHeight;GY=Math.round(H/3);
  TREE=buildTree(4242);
  leaves=[];ripples=[];rRunners=[];
  rootAliveLen=0;bgPulse=0;rootM=0;base2012=null;
}
addEventListener('resize',resize);

/* ---- minute pulse (shared jitter) + free re-routing of retracted wires --- */
let curMinute=-1,minuteJ=0,prevMinSessions=null,minSessions=null,
    prevMinRev=null,minRev=null;
function minuteTick(m){
  const mk=Math.floor(Date.now()/60000);
  if(mk===curMinute)return;
  curMinute=mk;
  minuteJ=MD.minuteJitter(mk);              /* SAME value on every page */
  prevMinSessions=minSessions;
  minSessions=m.sessions*(1+minuteJ);
  prevMinRev=minRev;
  minRev=m.revSec*60;
  const sc=TREE.genScale, inv=1/sc;
  const rr=mulberry32((mk*7919)%2147483647);
  const rerouted=new Array(TREE.csegs.length).fill(false);
  for(let i=1;i<TREE.csegs.length;i++){
    const s=TREE.csegs[i];
    if(s.cur>0.01)continue;
    const parentMoved=s.parent>0&&rerouted[s.parent];
    if(!parentMoved&&rr()>0.35)continue;
    let ox,oy,od;
    if(s.parent===0){ox=s.site.x;oy=s.site.y;od=s.site.dir;}
    else{
      const pp=TREE.csegs[s.parent].pts;
      ox=pp[pp.length-1].x*inv;oy=pp[pp.length-1].y*inv;
      od=[5,6,7,0,4][Math.floor(rr()*5)];
    }
    (function(){
      const occ=TREE.occ;
      for(const key of s.cells){
        const set=occ.get(key);
        if(set){set.delete(i);if(!set.size)occ.delete(key);}
      }
    })();
    const res=TREE.routeBranch({x:ox,y:oy,dir:od,parent:s.parent},i,rr);
    if(res){
      s.pts=res.pts.map(p=>({x:p.x*sc,y:p.y*sc}));
      s.cells=res.cells;
      recum(s);
      s.detached=false;
      rerouted[i]=true;
    }else{
      s.cells=(function(){
        const cells=[];
        const CELL=4.5;
        const ckk=(x,y)=>Math.round(x/CELL)+'_'+Math.round(y/CELL);
        for(let q=1;q<s.pts.length;q++){
          const ax=s.pts[q-1].x*inv,ay=s.pts[q-1].y*inv,bx=s.pts[q].x*inv,by=s.pts[q].y*inv;
          const L=Math.hypot(bx-ax,by-ay),n=Math.max(1,Math.ceil(L/CELL));
          for(let k2=0;k2<=n;k2++){
            const key=ckk(ax+(bx-ax)*k2/n,ay+(by-ay)*k2/n);
            let set=TREE.occ.get(key);if(!set){set=new Set();TREE.occ.set(key,set);}
            if(!set.has(i)){set.add(i);cells.push(key);}
          }
        }
        return cells;
      })();
      s.detached=parentMoved;
    }
  }
}

/* ================= MAIN LOOP ================= */
const MONTHS=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
let lastT=performance.now(),tGlobal=0,sweepPh=Math.random(),extracted=0;
function frame(now){
  const dt=Math.min(0.05,(now-lastT)/1000);lastT=now;tGlobal+=dt;
  if(!paused){
    if(intro){
      viewFy=Math.min(NOWFY,viewFy+dt*(NOWFY-2012)/20);
      scrub.value=viewFy;
      if(viewFy>=NOWFY-0.001){intro=false;setLive(true);}
    }else if(live)viewFy=nowFracYear();
  }
  const m=metrics(viewFy);
  minuteTick(m);
  const mc=MD.methodsCurve(viewFy);
  const revI=Math.sqrt(m.revSec/REVSEC_END);   /* current volume ∝ √revenue */
  if(!paused)extracted+=m.revSec*dt;           /* dollars earned while open  */
  const baseX=W*0.5;

  ctx.fillStyle='#060d15';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(70,160,190,0.05)';ctx.lineWidth=1;
  const gs=Math.max(40,W/30);
  ctx.beginPath();
  for(let x=baseX%gs;x<W;x+=gs){ctx.moveTo(x,0);ctx.lineTo(x,H);}
  for(let y=GY%gs;y<H;y+=gs){ctx.moveTo(0,y);ctx.lineTo(W,y);}
  ctx.stroke();
  ctx.fillStyle='rgba(90,233,255,0.10)';ctx.fillRect(0,GY-1,W,2);
  ctx.fillStyle='rgba(90,233,255,0.45)';ctx.fillRect(0,GY,W,0.6);

  ctx.save();
  ctx.translate(baseX,GY);

  /* ---- canopy: node count = users online / 250k (weekday-aware) ---- */
  const sessNow=m.sessions*(1+minuteJ);
  const K=Math.min(TREE.csegs.length-1,Math.round(sessNow/NODE_SCALE));
  let liveNodes=0,canopyWire=TREE.csegs[0].len;
  for(let i=1;i<TREE.csegs.length;i++){
    const s=TREE.csegs[i];
    s.alive=i<=K&&!s.detached;
    const parentFull=TREE.csegs[s.parent].cur>=TREE.csegs[s.parent].len-0.01;
    const tgt=(s.alive&&parentFull)?s.len:0;
    if(s.cur<tgt)s.cur=Math.min(tgt,s.cur+26*dt);
    else if(s.cur>tgt)s.cur=Math.max(0,s.cur-34*dt);
    canopyWire+=s.cur;
    if(s.alive&&s.cur>=s.len-0.01)liveNodes++;
  }

  /* ---- roots: area ∝ LIFETIME AD revenue (cumulative since 2004) ----
     LIVE adds the real ad dollars earned while the page has been open —
     the fabric and the EXTRACTED counter are the same physical thing */
  const cumNow=m.cum+(live?extracted:0);
  const rootTarget=Math.min(TREE.rootTotal,
    TREE.rootTotal*Math.sqrt(Math.min(1,cumNow/CUM_END)));
  while(rootM<TREE.rsegs.length&&TREE.rPrefix[rootM]<=rootTarget)rootM++;
  while(rootM>0&&TREE.rPrefix[rootM-1]>rootTarget)rootM--;
  const childActR=new Uint8Array(TREE.rsegs.length);
  for(let i=1;i<TREE.rsegs.length;i++)
    if(TREE.rsegs[i].cur>0.01&&TREE.rsegs[i].parent>=0)childActR[TREE.rsegs[i].parent]=1;
  const yrT=Math.min(1,Math.max(0,(viewFy-2012)/(NOWFY-2012)));
  const rGrow=42*(1+9*(1-yrT)*(1-yrT));
  rootAliveLen=0;
  let rootWireCount=0;
  for(let i=0;i<TREE.rsegs.length;i++){
    const s=TREE.rsegs[i];
    s.alive=i<rootM;
    const parentFull=s.parent<0||TREE.rsegs[s.parent].cur>=TREE.rsegs[s.parent].len-0.01;
    const tgt=(s.alive&&parentFull)?s.len:0;
    if(s.cur<tgt)s.cur=Math.min(tgt,s.cur+rGrow*dt);
    else if(s.cur>tgt&&!childActR[i])s.cur=Math.max(0,s.cur-78*dt);
    rootAliveLen+=s.cur+s.ext;
    if(s.cur>0.01)rootWireCount++;
  }

  if(!base2012){
    base2012={u:DAU_2012,cum:CUM_2012,rev:REVSEC_2012};
  }

  /* vascular widths */
  const nc=TREE.csegs.length,nr=TREE.rsegs.length;
  const downC=new Float64Array(nc),downR=new Float64Array(nr);
  for(let i=nc-1;i>=1;i--){
    downC[i]+=TREE.csegs[i].cur;
    downC[TREE.csegs[i].parent]+=downC[i];
  }
  downC[0]+=TREE.csegs[0].len;
  for(let i=nr-1;i>=0;i--){
    downR[i]+=TREE.rsegs[i].cur+TREE.rsegs[i].ext;
    if(TREE.rsegs[i].parent>=0)downR[TREE.rsegs[i].parent]+=downR[i];
  }
  const widthOf=d=>0.9+0.11*Math.sqrt(d);

  /* core glow — low, wide, pulses on absorption & arrivals */
  const rFrac=rootAliveLen/Math.max(1,TREE.rootTotal);
  const coreY=TREE.rootDepth*0.58*Math.min(1,rFrac*1.4)+24,
        coreR=Math.max(100,TREE.rootDepth*Math.min(1,rFrac*1.2)*1.0)+70*bgPulse;
  const cg=ctx.createRadialGradient(0,coreY,0,0,coreY,coreR);
  cg.addColorStop(0,`rgba(90,220,255,${0.14+0.22*revI+0.16*bgPulse})`);
  cg.addColorStop(1,'rgba(90,220,255,0)');
  ctx.fillStyle=cg;ctx.beginPath();ctx.arc(0,coreY,coreR,0,7);ctx.fill();

  /* roots — batched capillaries + vascular mains */
  ctx.lineCap='round';ctx.lineJoin='round';
  const thin=[],mid=[];
  for(let i=0;i<nr;i++){
    const s=TREE.rsegs[i];
    if(s.cur<=0.2)continue;
    const w=widthOf(downR[i]);
    const pp=s.cur>=s.len?s.pts:subPath(s.pts,s.cum,0,s.cur);
    if(!pp)continue;
    if(w<1.5)thin.push(pp,s);
    else if(w<2.6)mid.push(pp,s);
    else strokeVascular(pp,w,'rgba(82,204,238,0.8)');
  }
  ctx.strokeStyle='rgba(66,186,220,0.6)';ctx.lineWidth=0.95;
  ctx.beginPath();
  for(let i=0;i<thin.length;i+=2){
    const pp=thin[i],s=thin[i+1];
    ctx.moveTo(pp[0].x,pp[0].y);
    for(let k=1;k<pp.length;k++)ctx.lineTo(pp[k].x,pp[k].y);
    if(s.ext>0.2&&s.cur>=s.len){
      const ld=localDir(s.pts,s.pts.length-1);
      const e=s.pts[s.pts.length-1];
      ctx.moveTo(e.x,e.y);ctx.lineTo(e.x+dcos(ld)*s.ext,e.y+dsin(ld)*s.ext);
    }
  }
  ctx.stroke();
  ctx.strokeStyle='rgba(74,196,230,0.7)';ctx.lineWidth=1.7;
  ctx.beginPath();
  for(let i=0;i<mid.length;i+=2){
    const pp=mid[i];
    ctx.moveTo(pp[0].x,pp[0].y);
    for(let k=1;k<pp.length;k++)ctx.lineTo(pp[k].x,pp[k].y);
  }
  ctx.stroke();

  /* canopy branches + nodes */
  for(let i=0;i<nc;i++){
    const s=TREE.csegs[i];
    if(s.cur<=0.2)continue;
    const pp=s.cur>=s.len?s.pts:subPath(s.pts,s.cum,0,s.cur);
    if(!pp)continue;
    strokeVascular(pp,widthOf(downC[i]),'rgba(92,222,248,0.82)');
  }
  for(let i=1;i<nc;i++){
    const s=TREE.csegs[i];
    if(!s.alive||s.cur<s.len-0.01)continue;
    const e=s.pts[s.pts.length-1];
    ctx.strokeStyle='rgba(150,242,255,0.9)';ctx.lineWidth=1.1;
    ctx.beginPath();ctx.arc(e.x,e.y,2.6,0,7);ctx.stroke();
    ctx.fillStyle='rgba(240,254,255,1)';
    ctx.beginPath();ctx.arc(e.x,e.y,1.15,0,7);ctx.fill();
  }

  /* ---- passive extraction current: node → trunk → root, all modes ---- */
  ctx.globalCompositeOperation='lighter';
  {
    const alivePaths=TREE.rootPaths.filter(r=>r.term<rootM&&TREE.rsegs[r.term].cur>=TREE.rsegs[r.term].len-0.01);
    const nR=Math.round(36*revI);
    const mkRunner=()=>{
      if(!alivePaths.length)return null;
      let ni=-1;
      for(let t2=0;t2<14;t2++){
        const i2=1+Math.floor(Math.random()*(TREE.csegs.length-1));
        const s2=TREE.csegs[i2];
        if(s2&&s2.alive&&s2.cur>=s2.len-0.01){ni=i2;break;}
      }
      const rp=alivePaths[Math.floor(Math.random()*alivePaths.length)];
      let path;
      if(ni>0){
        const cp=drainFromNode(ni);
        path=cp.path.concat(rp.path.slice(1));
      }else path=rp.path.slice();
      const ms=measure(path);
      return {path,cum:ms.cum,L:ms.L,term:rp.term,d:0,v:75+Math.random()*70};
    };
    while(rRunners.length<nR){
      const r0=mkRunner();if(!r0)break;
      r0.d=Math.random()*r0.L*0.5;
      rRunners.push(r0);
    }
    if(rRunners.length>nR)rRunners.length=nR;
    for(const rn of rRunners){
      rn.d+=rn.v*dt;
      if(rn.d-26>rn.L){
        const ts=TREE.rsegs[rn.term];
        ts.ext=Math.min(8,(ts.ext||0)+0.8);
        bgPulse=Math.min(1,bgPulse+0.07);
        const r0=mkRunner();
        if(r0){rn.path=r0.path;rn.cum=r0.cum;rn.L=r0.L;rn.term=r0.term;rn.v=r0.v;}
        rn.d=0;
        continue;
      }
      const seg=subPath(rn.path,rn.cum,rn.d-26,rn.d);
      if(seg){
        ctx.strokeStyle=`rgba(140,235,255,${0.10+0.26*revI})`;ctx.lineWidth=2.6;poly(ctx,seg);
        ctx.strokeStyle=`rgba(225,252,255,${0.20+0.45*revI})`;ctx.lineWidth=1.1;poly(ctx,seg);
      }
    }
  }
  ctx.globalCompositeOperation='source-over';

  /* harvest sweep — slower & rarer in low-methods eras */
  if(mc>0.03){
    const period=7+19*(1-mc);
    sweepPh+=dt/period;if(sweepPh>1.35)sweepPh-=1.35;
    if(sweepPh<=1){
      const frontY=TREE.topY+(TREE.rootDepth-TREE.topY)*sweepPh,bw=34;
      ctx.lineWidth=1.5;
      const sw=(arr)=>{
        for(let i=0;i<arr.length;i++){
          const s=arr[i];
          if(s.cur<=0.2)continue;
          const my=(s.pts[0].y+s.pts[s.pts.length-1].y)/2;
          const env=Math.exp(-((my-frontY)**2)/(2*bw*bw));
          if(env<0.05)continue;
          const pp=s.cur>=s.len?s.pts:subPath(s.pts,s.cum,0,s.cur);
          if(!pp)continue;
          ctx.strokeStyle=`rgba(170,245,255,${env*0.4*mc})`;
          poly(ctx,pp);
        }};
      sw(TREE.csegs);sw(TREE.rsegs);
    }
  }

  /* ---- engagement leaves (per-user rate × seasonality; absorption pulses the bg) ---- */
  const leafRate=6.5*(m.eng/ENG_2012)*m.seas;
  evCarry+=leafRate*dt;
  while(evCarry>=1){evCarry--;if(leaves.length<400)fireEvent();}
  ctx.lineWidth=1;
  const drawLeaf=(x,y,r,a)=>{
    ctx.globalAlpha=a;
    ctx.fillStyle='rgba(150,245,225,0.45)';ctx.strokeStyle='rgba(200,255,245,0.9)';
    ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);
    ctx.closePath();ctx.fill();ctx.stroke();
    ctx.globalAlpha=1;
  };
  for(let i=leaves.length-1;i>=0;i--){
    const l=leaves[i];l.age+=dt;
    if(l.state===0){
      if(l.age>l.hold)l.state=1;
      const pr=Math.min(1,l.age/0.25);
      drawLeaf(l.x,l.y,3.4*pr,1);
    }else if(l.state===1){
      l.y+=l.vy*dt;l.x+=Math.sin(tGlobal*2+l.ph)*12*dt;
      if(l.y>=-3){
        l.y=-3;l.state=2;l.age=0;
        ripples.push({x:l.x,age:0});
        rootEnergy=Math.min(16,rootEnergy+0.35);
        bgPulse=Math.min(1,bgPulse+0.12);
      }
      drawLeaf(l.x,l.y,3.4,1);
    }else{
      l.a-=dt/0.4;
      if(l.a<=0){leaves.splice(i,1);continue;}
      drawLeaf(l.x,l.y,3.4*l.a,l.a);
    }
  }
  ctx.globalCompositeOperation='lighter';
  for(let i=ripples.length-1;i>=0;i--){
    const r=ripples[i];r.age+=dt;
    if(r.age>0.9){ripples.splice(i,1);continue;}
    const a=(1-r.age/0.9);
    ctx.fillStyle=`rgba(140,240,255,${0.35*a})`;
    ctx.beginPath();ctx.ellipse(r.x,0,6+r.age*46,2.4+r.age*2,0,0,7);ctx.fill();
  }
  ctx.globalCompositeOperation='source-over';
  rootEnergy=Math.max(0,rootEnergy-dt*2.0);
  bgPulse=Math.max(0,bgPulse-dt*0.55);
  ctx.restore();

  /* ---- HUD ---- */
  const est=m.est?' <span class="est">EST</span>':'';
  const fmt=n=>Math.round(n).toLocaleString('en-US');
  const FX=MD.FX_EUR.rate;
  const money=n=>euro?('€'+fmt(n*FX)):('$'+fmt(n));
  const moneyBig=n=>{
    const v=euro?n*FX:n, s=euro?'€':'$';
    return v>=1e12?s+(v/1e12).toFixed(2)+'T':s+(v/1e9).toFixed(1)+'B';
  };
  const arrow=(cur,prev)=>{
    if(prev===null||cur===null||Math.abs(prev)<1e-9)return '';
    const pct=(cur-prev)/Math.abs(prev)*100;
    if(Math.abs(pct)<0.005)return '';
    const t=Math.abs(pct).toFixed(Math.abs(pct)<0.1?2:1)+'%';
    return pct>=0?` <span class="up">▲${t}</span>`:` <span class="dn">▼${t}</span>`;
  };
  const mult=v=>` <span class="mult">×${v>=100?v.toFixed(0):v.toFixed(1)}</span>`;
  const pctSince=v=>
    {
  const p=(v-1)*100;
  const t=Math.abs(p)>=100?p.toFixed(0):p.toFixed(1);
  return p>=0?` <span class="up">▲${t}%</span>`:` <span class="dn">▼${Math.abs(t)}%</span>`;
};
  const uMult=m.dau/base2012.u;
  const K12=Math.max(1,Math.round(MD.concurrent(2012,m.hour)*MD.dayFactor(m.dow,2012)/NODE_SCALE));
  const nMult=Math.max(1,K)/K12;
  const cumMult=cumNow/base2012.cum;
  const engMult=m.eng/ENG_2012;
  const rvMult=m.revSec/base2012.rev;
  document.getElementById('hSess').innerHTML=fmt(sessNow)+est+pctSince(uMult);
  document.getElementById('hNodes').innerHTML=fmt(liveNodes)+pctSince(nMult);
  document.getElementById('hRoots').innerHTML=fmt(rootWireCount)+pctSince(cumMult);
  document.getElementById('hRev').innerHTML=moneyBig(cumNow)+est+pctSince(cumMult);
  document.getElementById('hEv').innerHTML=fmt(m.evMinLive)+est+pctSince(engMult);
  document.getElementById('hEng').innerHTML=m.eng.toFixed(2)+'% <span class="est">per user</span>';
  document.getElementById('hPas').innerHTML=(m.pass*100).toFixed(0)+'% <span class="est">EST</span>';
  document.getElementById('hExt').innerHTML=money(extracted);
  const lgLeaf=document.getElementById('lgLeaf');
  if(lgLeaf)lgLeaf.textContent='≈'+fmt(m.evSec/Math.max(0.01,leafRate));
  const lgRatio=document.getElementById('lgRatio');
  if(lgRatio)lgRatio.textContent=moneyBig(cumNow);
  const d2=new Date();
  document.getElementById('stamp').innerHTML= live
    ? `<span class="live">● GLOBAL LIVE</span> — ${d2.toLocaleTimeString()} local<br>${d2.toLocaleDateString()}`
    : `<span class="hist">◆ GLOBAL HISTORICAL</span> — ${Math.floor(viewFy)} ${(viewFy%1)>=0.5?'H2':'H1'}`;
  const mi=Math.min(11,Math.floor((viewFy%1)*12));
  document.getElementById('yr').textContent=Math.floor(viewFy)+' '+MONTHS[mi];
  requestAnimationFrame(frame);
}

/* engagement → a leaf at a live node; leaves never drive the current */
function fireEvent(){
  let ni=-1;
  for(let tries=0;tries<14;tries++){
    const i=1+Math.floor(Math.random()*(TREE.csegs.length-1));
    const s=TREE.csegs[i];
    if(s&&s.alive&&s.cur>=s.len-0.01){ni=i;break;}
  }
  if(ni<0)return;
  const s=TREE.csegs[ni], e=s.pts[s.pts.length-1];
  leaves.push({x:e.x+(Math.random()-0.5)*4,y:e.y-3,
    age:0,hold:1.0+Math.random()*1.6,state:0,vy:26+Math.random()*18,ph:Math.random()*7,a:1});
}

/* ================= CONTROLS ================= */
const bLive=document.getElementById('bLive');
function setLive(v){
  intro=false;
  live=v;bLive.classList.toggle('on',v);
  if(v){viewFy=nowFracYear();scrub.value=viewFy;}
}
bLive.classList.remove('on');
scrub.addEventListener('input',()=>{setLive(false);viewFy=parseFloat(scrub.value);});
document.getElementById('bBack').onclick=()=>{setLive(false);viewFy=Math.max(2012,viewFy-0.5);scrub.value=viewFy;};
document.getElementById('bFwd').onclick=()=>{viewFy=Math.min(NOWFY,viewFy+0.5);scrub.value=viewFy;if(viewFy>=NOWFY-0.01)setLive(true);};
bLive.onclick=()=>setLive(true);
const bUsd=document.getElementById('bUsd'),bEur=document.getElementById('bEur');
bUsd.onclick=()=>{euro=false;bUsd.classList.add('on');bEur.classList.remove('on');};
bEur.onclick=()=>{euro=true;bEur.classList.add('on');bUsd.classList.remove('on');};
document.querySelectorAll('.tg').forEach(b=>{
  b.onclick=()=>{
    const card=b.parentElement;
    card.classList.toggle('closed');
    b.textContent=card.classList.contains('closed')?'+':'–';
  };
});
document.querySelectorAll('.chip').forEach(c=>{
  c.onclick=()=>{
    const card=c.parentElement;
    card.classList.remove('closed');
    const b=card.querySelector('.tg');
    if(b)b.textContent='–';
  };
});
addEventListener('keydown',e=>{
  if(e.code==='Space'){e.preventDefault();paused=!paused;}
  if(e.key==='ArrowLeft')document.getElementById('bBack').click();
  if(e.key==='ArrowRight')document.getElementById('bFwd').click();
});

resize();
requestAnimationFrame(frame);