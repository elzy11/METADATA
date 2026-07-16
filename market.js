// ============================================================
// THE ATTENTION MARKET — 
//
// Stock data:
//   · Long-range history = REAL closing prices (MetaData.STOCK_D in
//     meta_series.js, from S&P Global / MacroTrends, 2012 IPO -> today)
//   · Live price = Finnhub quote API (paste your free key below,
//     from https://finnhub.io/register — 60 calls/min free)
//   · Without a key (or offline) the live session is SIMULATED as a
//     realistic random walk anchored to the last real close.
// ============================================================

// ------------------------- CONFIG ---------------------------
const FINNHUB_KEY   = 'd9958dhr01qssj11d7tgd9958dhr01qssj11d7u0';          // Finnhub API key here
const QUOTE_POLL_MS = 15000;       // real-quote poll interval (15s)
const TICK_MS       = 1000;        // chart tick interval (1s, like real terminals)
// -------------------------------------------------------------

// Fundamentals now come from the canonical MetaData module (meta_series.js)
const MD = window.MetaData;
function yearFrac(t){let d=new Date(t),y=d.getFullYear();let a=new Date(y,0,1).getTime(),b=new Date(y+1,0,1).getTime();return y+(t-a)/(b-a);}
function nowYf(){return yearFrac(Date.now());}

const C={bg:'#0a0a0a',green:'#00d97e',red:'#ef5350',amber:'#f5a623',gridLine:'#161616',divider:'#1e1e1e',textDim:'#6f6f6f',textMid:'#8d8d8d',textBright:'#e8e8e8',smaLine:'#4d4d4d',sidebarBg:'#0c0c0c',est:'#767676',btnBg:'#111111',mGreen:'#2e8062',mRed:'#9e4a45'};

// ==================== EVENT ANNOTATIONS ====================
const EVENTS=window.MetaData.EVENTS; // canonical copies live in meta_series.js
const EVENT_ROTATE_MS=25000;
let eventIdx=0,eventHover=-1,lastRotate=0,evScreen=[],linkRect=null;

// ---- display toggles (sidebar top-right buttons) ----
let showEUR=false,showCandles=true,toggleRects=[];
// USD->EUR via ECB reference rate (Frankfurter API); fallback if offline
let fx={rate:0.86,live:false};
function fetchFX(){
  fetch('https://api.frankfurter.app/latest?from=USD&to=EUR')
    .then(r=>r.json())
    .then(j=>{if(j&&j.rates&&j.rates.EUR){fx.rate=j.rates.EUR;fx.live=true;}})
    .catch(()=>{});
}
function fxv(v){return showEUR?v*fx.rate:v;}      // convert value for display
function fxs(){return showEUR?'€':'$';}           // currency symbol
function fxc(){return showEUR?'EUR':'USD';}       // currency code

const ZOOMS=[
  {label:'1D',days:1},
  {label:'5D',days:5},
  {label:'1M',days:30},
  {label:'6M',days:180},
  {label:'YTD',days:-1},
  {label:'1Y',days:365},
  {label:'5Y',days:1825},
  {label:'MAX',days:-2},
];
let activeZoom=0; // start on 1D — the live view

// ------------------------- STATE ----------------------------
let REAL=[];                    // parsed real stock history [{ts,price}]
let allEngBuckets=[];           // daily engagement candles 2012->today
let visEng=[],visStock=[],smaLine=[];
let stockSession=null;          // live intraday session {ticks:[{t,p}],startMs,endMs,open,prevClose,dayIdx}
let engLive=null;               // live 24h engagement {candles:[...], cur:{...}, val}
let quote={price:MD.STOCK_PREV_CLOSE.price,prevClose:MD.STOCK_PREV_CLOSE.price,open:null,source:'sim',ok:false,lastPoll:0,err:''};
let simPrice=MD.STOCK_PREV_CLOSE.price;
let lastTickMs=0;
let liveEUUsers=0,liveEUTarget=0,liveClicksEU=0,liveRevEU=0,liveGlobalUsers=0,liveRevGlobal=0;
let metaStatus='loading...',igStatus='loading...',csvEng=[];
let hoverEngIdx=-1,hoverStockIdx=-1;
let L={};

// ---- responsive scale: all type & fixed paddings follow window size ----
let U=1;
function TS(n){textSize(n*U);} // scaled text size (used everywhere)

// ------------------------ LAYOUT ----------------------------
function recalcLayout(){
  // responsive type scale: ~1.15 at a 1440x900 window (bigger baseline),
  // grows/shrinks with BOTH dimensions; height-capped so short windows never overflow
  U=constrain(min(1.15*sqrt((width/1440)*(height/900)),height/785),0.8,1.7);
  let sw=constrain(floor(width*0.27),280,430),sx=width-sw;
  let cx=floor(72*U),cw=sx-cx-floor(64*U); // wide right gutter for the price pills
  let titleH=52*U,headerH=30*U,chartGap=30*U,zoomH=38*U,footerH=50*U,padTop=12*U,padBot=12*U;
  let used=titleH+headerH+headerH+chartGap+zoomH+footerH+padTop+padBot;
  let avail=height-used;
  let eh=floor(avail*0.52),sh=floor(avail*0.42);
  let ey=padTop+titleH+headerH;
  let sy=ey+eh+chartGap+headerH;
  let zy=sy+sh+padBot+8*U;
  let fy=zy+zoomH+4*U;
  // chart headers are ONE line: label (left) + change/price (right), same baseline
  L={sideX:sx,sideW:sw,chartX:cx,chartW:cw,engH:eh,engY:ey,stockH:sh,stockY:sy,zoomY:zy,footerY:fy,engHeaderY:ey-12*U,engValueY:ey-12*U,stockHeaderY:sy-12*U,stockValueY:sy-12*U};
}

function setup(){
  createCanvas(windowWidth,windowHeight);
  textFont('monospace');
  recalcLayout();
  REAL=MD.STOCK_D.map(r=>({ts:new Date(r[0]+'T16:00:00'),price:r[1]}));
  simPrice=MD.STOCK_PREV_CLOSE.price*(1+(noise(999)-0.5)*0.01); // tiny overnight gap
  buildEngHistory([]);
  initStockSession();
  initEngLive();
  buildVisible();
  updateLive();
  loadCSVsAsync();
  fetchQuote();
  fetchFX();
  setInterval(fetchQuote,QUOTE_POLL_MS);
}

// ==================== MARKET CLOCK (NYSE/NASDAQ) ====================
function nyNow(){return new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'}));}

// ==================== LIVE QUOTE (FINNHUB) ====================
function fetchQuote(){
  if(!FINNHUB_KEY){quote.source='sim';return;}
  fetch('https://finnhub.io/api/v1/quote?symbol=META&token='+FINNHUB_KEY)
    .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(j=>{
      if(!j||!j.c){throw new Error('empty quote');}
      let first=!quote.ok;
      quote={price:j.c,prevClose:j.pc||MD.STOCK_PREV_CLOSE.price,open:j.o||null,source:'live',ok:true,lastPoll:millis(),err:''};
      simPrice=j.c;
      if(first)initStockSession(); // re-anchor session path to real open/prev-close once
    })
    .catch(e=>{quote.err=String(e.message||e);if(!quote.ok)quote.source='sim';});
}

// ==================== LIVE STOCK — CONTINUOUS ROLLING 24H ====================
// One continuous line (like investing.com): always ticking, never "closed".
// Volatility quietly follows the rhythm of the trading day, but nothing is labeled.
function sessionVol(t){
  let ny=new Date(t+nyOffsetMs());
  let d=ny.getDay(),h=ny.getHours()+ny.getMinutes()/60;
  if(d===0||d===6)return 0.22;
  if(h>=9.5&&h<16)return 1.0;   // core hours: full volatility
  if(h>=4&&h<9.5)return 0.45;   // pre
  if(h>=16&&h<20)return 0.5;    // after
  return 0.25;                  // overnight
}
let _nyOff=null;
function nyOffsetMs(){if(_nyOff===null)_nyOff=nyNow().getTime()-Date.now();return _nyOff;}

function initStockSession(){
  let now=Date.now();
  let target=quote.ok?quote.price:simPrice;
  let start=quote.prevClose;
  let pts=[];
  noiseSeed(floor(now/86400000));
  for(let m=0;m<=1440;m++){
    let t01=m/1440,t=now-(1440-m)*60000;
    let vol=sessionVol(t);
    let base=lerp(start,target,t01);
    let wig=(noise(m*0.09)-0.5)*2*start*0.005*sqrt(max(0.0001,t01*(1-t01)))*4*vol;
    let wig2=(noise(m*0.55+50)-0.5)*start*0.0016*vol;
    pts.push({t,p:max(1,base+wig+wig2)});
  }
  pts[pts.length-1].p=target;
  noiseSeed(floor(random(100000)));
  simPrice=target;
  stockSession={ticks:pts};
}

// one live tick (called every TICK_MS) — always moves
function tickStock(){
  if(!stockSession)return;
  let nowMs=Date.now(),vol=sessionVol(nowMs);
  if(quote.source==='live'&&quote.ok){
    let cur=stockSession.ticks[stockSession.ticks.length-1].p;
    simPrice=lerp(cur,quote.price,0.25)+randomGaussian(0,quote.price*0.00012*max(vol,0.35));
  } else {
    simPrice+=randomGaussian(0,simPrice*0.00045*vol)+(quote.prevClose-simPrice)*0.0006;
    if(random()<0.0025*vol)simPrice+=randomGaussian(0,simPrice*0.002); // occasional jump
  }
  stockSession.ticks.push({t:nowMs,p:max(1,simPrice)});
  let cutoff=nowMs-86400000;
  if(stockSession.ticks.length>2600)
    stockSession.ticks=compressTicks(stockSession.ticks).filter(p=>p.t>=cutoff);
}
function compressTicks(ticks){
  let out=[],lastMin=-1;
  for(let i=0;i<ticks.length-120;i++){
    let m=floor(ticks[i].t/60000);
    if(m!==lastMin){out.push(ticks[i]);lastMin=m;}
  }
  return out.concat(ticks.slice(-120));
}
function livePrice(){return stockSession?stockSession.ticks[stockSession.ticks.length-1].p:simPrice;}

// ==================== LIVE ENGAGEMENT MARKET (24/7) ====================
// EU engagement events per minute at local hour hr on weekday dow.
// The live-engagement formula is CANONICAL (MetaData.eventsPerMinLive,
// shared by all three visualizations); only the EU scoping is local.
function engBaseVal(hr,dow){
  let yf=nowYf();
  return MD.eventsPerMinLive(yf,hr%24,dow)*MD.euShare(yf);
}
function initEngLive(){
  let now=Date.now(),candles=[];
  for(let m=0;m<1440;m++){
    let t=now-(1440-m)*60000,d=new Date(t),hr=d.getHours()+d.getMinutes()/60;
    let base=engBaseVal(hr,d.getDay());
    let mult=csvMult(m);
    let v=base*mult*(1+(noise(m*0.05)-0.5)*0.05);
    let o=v*(1+(noise(m*0.1)-0.5)*0.015),c=v*(1+(noise(m*0.1+5)-0.5)*0.015);
    candles.push({ts:new Date(t),open:o,close:c,high:max(o,c)*(1+noise(m*0.1+10)*0.008),low:min(o,c)*(1-noise(m*0.1+15)*0.008)});
  }
  let lastC=candles[candles.length-1].close;
  engLive={candles,val:lastC,curMin:floor(now/60000)};
}
function csvMult(i){
  if(!csvEng.length)return 0.96+noise(i*0.06)*0.08;
  return map(constrain(csvEng[i%csvEng.length]/150,0,2),0,2,0.94,1.06);
}
function tickEng(){
  if(!engLive)return;
  let now=Date.now(),d=new Date(now),hr=d.getHours()+d.getMinutes()/60;
  let base=engBaseVal(hr,d.getDay())*csvMult(floor(now/60000));
  // engagement value = smooth walk around the diurnal baseline
  engLive.val=lerp(engLive.val,base,0.02)+randomGaussian(0,base*0.0035);
  let curMin=floor(now/60000);
  let cur=engLive.candles[engLive.candles.length-1];
  if(curMin!==engLive.curMin){
    engLive.candles.push({ts:new Date(now),open:engLive.val,close:engLive.val,high:engLive.val,low:engLive.val});
    if(engLive.candles.length>1440)engLive.candles.shift();
    engLive.curMin=curMin;
  } else {
    cur.close=engLive.val;
    cur.high=max(cur.high,engLive.val);
    cur.low=min(cur.low,engLive.val);
  }
}

// ==================== HISTORICAL SERIES ====================
// Daily engagement candles 2012 -> today, driven entirely by MetaData
// (eventsPerSec × EU share, interpolated through the canonical series)
function buildEngHistory(eng){
  allEngBuckets=[];
  let now=Date.now(),k=0;
  for(let t=new Date(2012,0,1).getTime();t<=now;t+=86400000,k++){
    let yf=yearFrac(t);
    // daily average × canonical weekend dip (weekly ripple shows on 1M zoom)
    // = eventsPerMinLive integrated over the day (rhythm averages to 1)
    let base=MD.eventsPerSec(yf)*60*MD.euShare(yf)*MD.dayFactor(new Date(t).getDay());
    let v=eng.length>0?map(constrain(eng[k%eng.length]/150,0,2),0,2,0.94,1.06):0.96+noise(k*0.06)*0.08;
    let b=base*v;
    let n1=noise(k*0.2)*2-1,n2=noise(k*0.2+7)*2-1,n3=noise(k*0.2+14)*2-1,n4=noise(k*0.2+21)*2-1;
    let o=b*(1+n1*0.015),c=b*(1+n2*0.015);
    allEngBuckets.push({ts:new Date(t),open:o,high:max(o,c)*(1+abs(n3)*0.010),low:min(o,c)*(1-abs(n4)*0.010),close:c,engRate:MD.series(MD.ENG_PCT,yf)});
  }
}

// real stock series for a range, with live price appended
function stockRange(startTs){
  let now=new Date();
  let pts=REAL.filter(p=>p.ts>=startTs&&p.ts<=now).map(p=>({ts:p.ts,price:p.price}));
  if(pts.length<2){ // range shorter than data resolution — interpolate
    pts=REAL.slice(-2).map(p=>({ts:p.ts,price:p.price}));
  }
  pts.push({ts:now,price:livePrice()});
  return pts;
}

// 5D: last 5 real daily closes, bridged with dense noisy intraday paths.
// CONTINUOUS by design — no flat nights or weekends. The market isn't 24/7,
// but attention is, and this chart follows attention's clock.
function stock5D(){
  let dailies=REAL.slice(-6); // includes prev closes as anchors
  let out=[],N=40; // 40 points per day -> jagged like a real 5D chart
  for(let i=1;i<dailies.length;i++){
    let a=dailies[i-1],b=dailies[i];
    for(let h=0;h<N;h++){
      let t01=h/(N-1);
      let base=lerp(a.price,b.price,t01);
      // layered noise: slow swing + chatter + micro-jitter, pinned at real closes
      let pin=sin(t01*PI);
      let wig=(noise(i*97+h*0.23)-0.5)*a.price*0.020*pin
             +(noise(i*97+h*1.3+31)-0.5)*a.price*0.008*pin
             +(noise(i*97+h*4.3+77)-0.5)*a.price*0.0035*pin;
      let ts=new Date(b.ts);ts.setHours(9+floor(t01*6.5),floor((t01*6.5%1)*60),0,0);
      out.push({ts,price:max(1,base+wig)});
    }
  }
  out.push({ts:new Date(),price:livePrice()});
  return out;
}

function buildVisible(){
  let zoom=ZOOMS[activeZoom],now=new Date();
  if(zoom.days===1){
    // handled live in draw (stockSession + engLive)
    visEng=[];visStock=[];smaLine=[];return;
  }
  if(zoom.days===5){
    visStock=ds(stock5D(),200,'l');
    let raw=engHist5D();
    visEng=ds(raw,200,'c');
    smaLine=smaFullRes(raw,200);
  } else {
    let st;
    if(zoom.days===-1)st=new Date(now.getFullYear(),0,1);
    else if(zoom.days===-2)st=REAL[0].ts;
    else st=new Date(now.getTime()-zoom.days*86400000);
    visStock=ds(stockRange(st),240,'l');
    let raw=allEngBuckets.filter(b=>b.ts>=st&&b.ts<=now);
    visEng=ds(raw,200,'c');
    smaLine=smaFullRes(raw,200);
  }
}

// 10-period moving average computed at FULL resolution, then thinned
// with the same grouping as ds() so it stays aligned with the candles
function smaFullRes(raw,mx){
  const n=10;
  let sma=[],s=0;
  for(let i=0;i<raw.length;i++){
    s+=raw[i].close;
    if(i>=n)s-=raw[i-n].close;
    sma.push(s/min(i+1,n));
  }
  if(raw.length<=mx)return sma;
  let step=raw.length/mx,out=[];
  for(let i=0;i<mx;i++){
    let g0=floor(i*step),g1=floor((i+1)*step);
    if(g1<=g0)continue;
    out.push(sma[min(raw.length-1,g1-1)]); // last of group = aligns with close
  }
  return out;
}

// engagement 5D built from the diurnal curve, half-hour resolution + chatter
function engHist5D(){
  let now=Date.now(),out=[];
  for(let h=0;h<240;h++){
    let t=now-(240-h)*1800000,d=new Date(t);
    let base=engBaseVal(d.getHours()+d.getMinutes()/60,d.getDay())*csvMult(h)
            *(1+(noise(h*0.15)-0.5)*0.05+(noise(h*0.9+40)-0.5)*0.025);
    let o=base*(1+(noise(h*0.3)-0.5)*0.02),c=base*(1+(noise(h*0.3+5)-0.5)*0.02);
    out.push({ts:new Date(t),open:o,close:c,high:max(o,c)*(1+noise(h*0.3+10)*0.012),low:min(o,c)*(1-noise(h*0.3+15)*0.012)});
  }
  return out;
}

function ds(arr,mx,type){
  if(arr.length<=mx)return arr;
  let step=arr.length/mx,out=[];
  for(let i=0;i<mx;i++){
    let g=arr.slice(floor(i*step),floor((i+1)*step));if(!g.length)continue;
    if(type==='c')out.push({ts:g[0].ts,open:g[0].open,close:g[g.length-1].close,high:Math.max(...g.map(x=>x.high)),low:Math.min(...g.map(x=>x.low)),engRate:g[g.length-1].engRate});
    else out.push({ts:g[0].ts,price:g.reduce((a,b)=>a+b.price,0)/g.length});
  }
  return out;
}

// ==================== CSV LOADING ====================
function loadCSVsAsync(){
  let fb=[],ig=[],md=false,id=false;
  // meta_data.csv is SEMICOLON-separated -> parse manually
  loadStrings('shared/data/meta_data.csv',
    function(lines){
      let n=0;
      for(let i=1;i<lines.length;i++){
        let p=lines[i].split(';');
        if(p.length<8)continue;
        let plat=p[0];
        if(plat!=='Facebook'&&plat!=='Instagram')continue;
        let l=parseFloat(p[5])||0,c=parseFloat(p[6])||0,s=parseFloat(p[7])||0;
        fb.push(l+c+s);n++;
      }
      metaStatus=nfc(n)+' rows';
      md=true;if(id)mergeCSV(fb,ig);
    },
    function(){metaStatus='not found';md=true;if(id)mergeCSV(fb,ig);}
  );
  loadTable('shared/data/instagram_data.csv','csv','header',
    function(t){igStatus=nfc(t.getRowCount())+' rows';
      for(let i=0;i<t.getRowCount();i++){let r=t.getRow(i),l=r.getNum('likes')||0,c=r.getNum('comments')||0,s=r.getNum('shares')||0;ig.push(l+c+s);}
      id=true;if(md)mergeCSV(fb,ig);},
    function(){igStatus='not found';id=true;if(md)mergeCSV(fb,ig);}
  );
}
function mergeCSV(fb,ig){
  let raw=[...fb,...ig];
  // smooth with a sliding mean so day-to-day modulation is organic, not glitchy
  csvEng=raw.map((_,i)=>{
    let s=0,n=0;
    for(let k=-7;k<=7;k++){let j=(i+k+raw.length)%raw.length;s+=raw[j];n++;}
    return s/n;
  });
  buildEngHistory(csvEng);initEngLive();buildVisible();
}

// ==================== SIDEBAR LIVE NUMBERS ====================
function updateLive(){
  let d=new Date(),yf=nowYf(),hr=d.getHours()+d.getMinutes()/60;
  // concurrent = people online right now (MetaData: DAP × minutes-online × rhythm)
  liveEUTarget=MD.concurrent(yf,hr)*MD.euShare(yf)*(0.95+noise(frameCount*0.002)*0.10);
  liveEUUsers=liveEUUsers===0?liveEUTarget:lerp(liveEUUsers,liveEUTarget,0.15);
  liveGlobalUsers=MD.concurrent(yf,hr);
  liveClicksEU=engLive?engLive.val:MD.eventsPerMinLive(yf,hr,d.getDay())*MD.euShare(yf);
  liveRevEU=MD.euRevPerMin(yf);
  liveRevGlobal=MD.revPerSec(yf)*60;
}

// ==================== MAIN LOOP ====================
function draw(){
  background(C.bg);
  let nowMs=millis();
  if(nowMs-lastTickMs>=TICK_MS){lastTickMs=nowMs;tickStock();tickEng();if(activeZoom>0&&frameCount>60&&(frameCount%(60*15)===0))buildVisible();}
  if(frameCount%60===0)updateLive();
  // rotate the event card (paused while hovering a diamond)
  if(eventHover<0&&nowMs-lastRotate>EVENT_ROTATE_MS){eventIdx=(eventIdx+1)%EVENTS.length;lastRotate=nowMs;}
  drawTitle();
  if(ZOOMS[activeZoom].days===1){drawEngChartLive();drawStockChartLive();}
  else{drawEngChart();drawStockChart();}
  drawZoomButtons();drawSidebar();drawFooter();drawHoverTooltips();
}

function drawTitle(){
  noStroke();
  fill(C.textBright);TS(21);textAlign(LEFT);text('THE ATTENTION MARKET',L.chartX,32*U);
  fill(C.textDim);TS(10);text('META · Facebook + Instagram  ·  (EU) ENGAGEMENT vs META:NASDAQ PROFIT (GLOBAL)',L.chartX,48*U);
  textAlign(LEFT);
}

// ==================== ENGAGEMENT CHART (historical zooms) ====================
function drawEngChart(){
  if(visEng.length<2)return;
  drawEngCandles(visEng,smaLine,ZOOMS[activeZoom].label);
}

function drawEngChartLive(){
  if(!engLive)return;
  let candles=ds(engLive.candles,220,'c');
  let sma=smaFullRes(engLive.candles,220);
  drawEngCandles(candles,sma,'1D',true);
}

function drawEngCandles(candles,sma,zl,live){
  let {chartX:cx,chartW:cw,engY:ey,engH:eh}=L;
  visEng=candles; // for hover
  let vals=candles.map(d=>d.close);
  let vMax=max(candles.map(d=>d.high))*1.03,vMin=max(0,min(candles.map(d=>d.low))*0.97),vR=vMax-vMin||1;
  let vY=v=>ey+eh-map(v,vMin,vMax,0,eh),xP=i=>cx+(i/(candles.length-1))*cw;
  let bW=max(1,cw/candles.length*0.6),lv=vals[vals.length-1];
  let chg=vals.length>1?((lv-vals[0])/vals[0])*100:0;
  let periodUp=lv>=vals[0],lc=periodUp?C.green:C.red;

  fill(lc);TS(13);textAlign(RIGHT);
  text((periodUp?'▲ +':'▼ ')+nf(chg,1,2)+'%   '+fmtAct(lv)+' clicks',cx+cw,L.engValueY);
  fill(C.textMid);TS(10);textAlign(LEFT);
  text('CLICKS / MIN  ·  EU  ·  EST',cx,L.engHeaderY);
  textAlign(LEFT);

  noFill();stroke(C.divider);strokeWeight(1);rect(cx,ey,cw,eh);
  stroke(C.gridLine);strokeWeight(0.5);
  for(let i=1;i<4;i++)line(cx,ey+(eh/4)*i,cx+cw,ey+(eh/4)*i);
  noStroke();

  stroke(C.smaLine);strokeWeight(1.5);noFill();
  beginShape();for(let i=0;i<sma.length;i++)vertex(xP(i),vY(sma[i]));endShape();

  // candles (toggleable via the ╽╿/∿ button)
  if(showCandles)candles.forEach((d,i)=>{
    let x=xP(i),up=d.close>=d.open,col=up?C.green:C.red;
    stroke(col);strokeWeight(0.7);line(x,vY(d.high),x,vY(d.low));
    noStroke();fill(col);
    let bT=vY(max(d.open,d.close)),bB=vY(min(d.open,d.close));
    rect(x-bW/2,bT,bW,max(1,bB-bT));
  });

  stroke(lc);strokeWeight(showCandles?1:1.4);noFill();
  beginShape();for(let i=0;i<vals.length;i++)vertex(xP(i),vY(vals[i]));endShape();
  noStroke();

  let lx=xP(vals.length-1),ly=vY(lv),p=sin(millis()*0.008)*0.5+0.5;
  fill(lc+'33');ellipse(lx,ly,10+p*4,10+p*4);fill(lc);ellipse(lx,ly,5,5);
  pricePill(cx+cw,ly,fmtAct(lv),lc);

  fill(C.textMid);noStroke();TS(9);textAlign(RIGHT);
  for(let i=0;i<=4;i++)text(fmtAct(vMin+(vR/4)*i),cx-8,vY(vMin+(vR/4)*i)+3);

  drawXAxis(candles.map(d=>d.ts),cx,ey+eh,cw);

  if(hoverEngIdx>=0){stroke(C.textMid+'44');strokeWeight(0.5);drawingContext.setLineDash([4,4]);line(xP(hoverEngIdx),ey,xP(hoverEngIdx),ey+eh);drawingContext.setLineDash([]);noStroke();}
}

// ==================== STOCK CHART — historical zooms ====================
function stockXofIdx(i){
  let {chartX:cx,chartW:cw}=L;
  // 5D: index-based (continuous flow, like real terminals)
  if(ZOOMS[activeZoom].days===5)return cx+(i/(visStock.length-1))*cw;
  // otherwise time-proportional (no distortion when data resolution changes)
  let t0=visStock[0].ts.getTime(),t1=visStock[visStock.length-1].ts.getTime();
  return cx+((visStock[i].ts.getTime()-t0)/max(1,t1-t0))*cw;
}
function drawStockChart(){
  if(visStock.length<2)return;
  let {chartX:cx,chartW:cw,stockY:sy,stockH:sh}=L;
  let vals=visStock.map(d=>d.price);
  let vMax=max(vals)*1.04,vMin=max(0,min(vals)*0.96);
  let vY=v=>sy+sh-map(v,vMin,vMax,0,sh),xP=stockXofIdx;
  let lv=vals[vals.length-1],chg=((lv-vals[0])/vals[0])*100;
  let periodUp=lv>=vals[0],lc=periodUp?C.green:C.red;
  stockHeader(lv,chg,periodUp,lc);
  stockFrame(cx,sy,cw,sh);
  areaLine(vals.map((v,i)=>[xP(i),vY(v)]),cx,sy,cw,sh,lc);
  fill(lc);noStroke();ellipse(xP(vals.length-1),vY(lv),6,6);
  pricePill(cx+cw,vY(lv),fxs()+nf(fxv(lv),1,2),lc);
  drawEventDiamonds(vY);
  stockYAxis(cx,vY,vMin,vMax);
  if(ZOOMS[activeZoom].days===5)drawXAxis(visStock.map(d=>d.ts),cx,sy+sh,cw);
  else drawStockXAxisTime(cx,sy+sh,cw);
  if(hoverStockIdx>=0){stroke(C.textMid+'44');strokeWeight(0.5);drawingContext.setLineDash([4,4]);line(xP(hoverStockIdx),sy,xP(hoverStockIdx),sy+sh);drawingContext.setLineDash([]);noStroke();}
}
// ◆ event markers on the stock line, quiet until hovered / active
function drawEventDiamonds(vY){
  evScreen=[];
  if(visStock.length<2)return;
  let t0=visStock[0].ts.getTime(),t1=visStock[visStock.length-1].ts.getTime();
  let active=eventHover>=0?eventHover:eventIdx;
  EVENTS.forEach((ev,ei)=>{
    let et=new Date(ev.d+'T16:00:00').getTime();
    if(et<t0||et>t1)return;
    let best=0,bd=Infinity;
    for(let i=0;i<visStock.length;i++){let dd=abs(visStock[i].ts.getTime()-et);if(dd<bd){bd=dd;best=i;}}
    let ex=stockXofIdx(best),ey=vY(visStock[best].price);
    evScreen.push({ei,x:ex,y:ey});
    push();translate(ex,ey);rotate(PI/4);noStroke();
    if(ei===active){
      let pp=sin(millis()*0.005)*0.5+0.5;
      noFill();stroke(255,255,255,70+pp*90);strokeWeight(1);rect(-5.5,-5.5,11,11);
      noStroke();fill('#f2f2f2');rect(-3.5,-3.5,7,7);
    } else {
      fill('#cfcfcfaa');rect(-3,-3,6,6);
    }
    pop();
  });
}

// x-axis labels at even TIME intervals (matches time-proportional line)
function drawStockXAxisTime(ax,ay,aw){
  let t0=visStock[0].ts.getTime(),t1=visStock[visStock.length-1].ts.getTime();
  fill(C.textDim);noStroke();TS(9);textAlign(CENTER);
  let z=ZOOMS[activeZoom];
  for(let i=0;i<=6;i++){
    let d=new Date(t0+(i/6)*(t1-t0));
    let label;
    if(z.days===-2)label=String(d.getFullYear());
    else if(z.days===-1||z.days>30&&z.days<=365)label=d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
    else if(z.days<=30&&z.days>7)label=d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
    else if(z.days<=7)label=d.toLocaleDateString('en-GB',{weekday:'short'})+' '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    else label=String(d.getFullYear());
    text(label,ax+(i/6)*aw,ay+14*U);
  }
  textAlign(LEFT);
}

// ==================== STOCK CHART — live rolling 24h ====================
function drawStockChartLive(){
  if(!stockSession)return;
  let {chartX:cx,chartW:cw,stockY:sy,stockH:sh}=L;
  evScreen=[]; // no diamonds in the live rolling view
  let {ticks}=stockSession;
  let prevClose=quote.prevClose;
  let nowMs=Date.now(),t0=nowMs-86400000;
  let pts=ticks.length>500?ds(ticks.map(t=>({ts:t.t,price:t.p})),480,'l').map(d=>({t:d.ts,p:d.price})):ticks;
  if(!pts.length)return;
  visStock=pts.map(d=>({ts:new Date(d.t),price:d.p})); // for hover
  let vals=pts.map(d=>d.p);
  let lv=vals[vals.length-1];
  let vMax=max(max(vals),prevClose)*1.002,vMin=min(min(vals),prevClose)*0.998;
  let pad=(vMax-vMin)*0.15||lv*0.004;vMax+=pad;vMin-=pad;
  let vY=v=>sy+sh-map(v,vMin,vMax,0,sh);
  let xT=t=>cx+constrain((t-t0)/86400000,0,1)*cw; // rolling last 24h
  let ref=vals[0]; // 24h-ago reference for the % change
  let chg=((lv-ref)/ref)*100;
  let dayUp=lv>=ref,lc=dayUp?C.green:C.red;

  stockHeader(lv,chg,dayUp,lc,true);
  stockFrame(cx,sy,cw,sh);

  // quiet unlabeled horizontal datum (previous close)
  let pcy=vY(prevClose);
  stroke(C.textMid+'55');strokeWeight(0.8);drawingContext.setLineDash([3,4]);
  line(cx,pcy,cx+cw,pcy);drawingContext.setLineDash([]);noStroke();

  areaLine(pts.map(d=>[xT(d.t),vY(d.p)]),cx,sy,cw,sh,lc);

  // live dot + price pill
  let lx=xT(pts[pts.length-1].t),ly=vY(lv),p=sin(millis()*0.008)*0.5+0.5;
  fill(lc+'33');ellipse(lx,ly,10+p*4,10+p*4);fill(lc);ellipse(lx,ly,5,5);
  pricePill(cx+cw,ly,fxs()+nf(fxv(lv),1,2),lc);

  stockYAxis(cx,vY,vMin,vMax);

  // x axis: last 24h in local time
  fill(C.textDim);noStroke();TS(9);textAlign(CENTER);
  for(let i=0;i<=6;i++){
    let t=t0+(i/6)*86400000;
    text(new Date(t).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),cx+(i/6)*cw,sy+sh+14*U);
  }
  textAlign(LEFT);

  if(hoverStockIdx>=0&&hoverStockIdx<pts.length){
    stroke(C.textMid+'44');strokeWeight(0.5);drawingContext.setLineDash([4,4]);
    line(xT(pts[hoverStockIdx].t),sy,xT(pts[hoverStockIdx].t),sy+sh);
    drawingContext.setLineDash([]);noStroke();
  }
}

// ---- stock drawing helpers ----
function stockHeader(lv,chg,up,lc,isDay){
  let {chartX:cx,chartW:cw}=L;
  fill(lc);TS(13);textAlign(RIGHT);
  text((up?'▲ +':'▼ ')+nf(chg,1,2)+'%   '+fxs()+nf(fxv(lv),1,2),cx+cw,L.stockValueY);
  fill(C.textMid);TS(10);textAlign(LEFT);
  text('META · NASDAQ · STOCK MARKET ·'+fxc(),cx,L.stockHeaderY);
  textAlign(LEFT);
}
function stockFrame(cx,sy,cw,sh){
  noFill();stroke(C.divider);strokeWeight(1);rect(cx,sy,cw,sh);
  stroke(C.gridLine);strokeWeight(0.5);
  for(let i=1;i<3;i++)line(cx,sy+(sh/3)*i,cx+cw,sy+(sh/3)*i);
  noStroke();
}
function areaLine(xy,cx,sy,cw,sh,lc){
  // gradient area fill
  let ctx=drawingContext;
  let g=ctx.createLinearGradient(0,sy,0,sy+sh);
  g.addColorStop(0,lc+'38');g.addColorStop(1,lc+'00');
  ctx.beginPath();
  ctx.moveTo(xy[0][0],sy+sh);
  for(let i=0;i<xy.length;i++)ctx.lineTo(xy[i][0],xy[i][1]);
  ctx.lineTo(xy[xy.length-1][0],sy+sh);
  ctx.closePath();ctx.fillStyle=g;ctx.fill();
  // polyline (real market charts are not smoothed)
  stroke(lc);strokeWeight(1.4);noFill();
  beginShape();for(let i=0;i<xy.length;i++)vertex(xy[i][0],xy[i][1]);endShape();
  noStroke();
}
function stockYAxis(cx,vY,vMin,vMax){
  let vR=vMax-vMin||1,dec=fxv(vR)<8?2:0;
  fill(C.textMid);noStroke();TS(9);textAlign(RIGHT);
  for(let i=0;i<=3;i++){let v=vMin+(vR/3)*i;text(fxs()+nf(fxv(v),1,dec),cx-8,vY(v)+3);}
  textAlign(LEFT);
}
function pricePill(x,y,label,col){
  // small translucent pill, sitting OUTSIDE the chart frame (right gutter)
  TS(8);
  let w=textWidth(label)+8*U;
  fill(col+'2e');stroke(col+'70');strokeWeight(1);rect(x+5*U,y-6.5*U,w,13*U,3);
  noStroke();fill(col);textAlign(LEFT);text(label,x+9*U,y+2.5*U);
}

// ==================== AXES / CHROME ====================
function drawXAxis(ts,ax,ay,aw){
  fill(C.textDim);noStroke();TS(9);textAlign(CENTER);
  let z=ZOOMS[activeZoom];
  for(let i=0;i<=6;i++){
    let d=ts[floor((i/6)*(ts.length-1))];if(!d)continue;
    let label;
    if(z.days===-2)label=String(d.getFullYear());
    else if(z.days===-1)label=d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
    else if(z.days===1)label=d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    else if(z.days<=7)label=d.toLocaleDateString('en-GB',{weekday:'short'})+' '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    else if(z.days<=30)label=d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
    else if(z.days<=365)label=d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
    else label=String(d.getFullYear());
    text(label,ax+(i/6)*aw,ay+14*U);
  }
  textAlign(LEFT);
}

function drawZoomButtons(){
  let bW=42*U,bH=24*U,gap=6*U,sx=L.chartX;
  ZOOMS.forEach((z,i)=>{
    let x=sx+i*(bW+gap),y=L.zoomY,active=i===activeZoom;
    noStroke();fill(active?'#1c1c1c':C.btnBg);rect(x,y,bW,bH,3);
    if(active){fill(C.green);rect(x+4*U,y+bH-3,bW-8*U,2,1);}
    fill(active?C.green:C.textMid);TS(11);textAlign(CENTER);text(z.label,x+bW/2,y+bH/2+4*U);
  });
  textAlign(LEFT);
}

function drawSidebar(){
  noStroke();fill(C.sidebarBg);rect(L.sideX,0,L.sideW,height);
  stroke(C.divider);strokeWeight(1);line(L.sideX,0,L.sideX,height);noStroke();
  let x=L.sideX+20*U,rw=L.sideW-40*U,y=26*U;

  // LIVE
  let p=sin(millis()*0.006)*0.5+0.5;
  fill(C.green);noStroke();ellipse(x+5*U,y-3*U,(7+p)*U,(7+p)*U);
  fill(C.green);TS(12);textAlign(LEFT);text('  LIVE',x,y);
  let lw=textWidth('  LIVE');
  fill(C.est);TS(9);text('EST',x+lw+7*U,y);
  drawToggleButtons(x+rw);
  y+=24*U;

  // top three sections — tight stack (all values canonical via MetaData)
  estLabel(x,y,'Daily Active Users');y+=15*U;
  sPair(x,rw,y,'EU',nfc(floor(liveEUUsers)),'Global',nfc(floor(liveGlobalUsers)));y+=33*U;

  estLabel(x,y,'Engagement / min');y+=15*U;
  sPair(x,rw,y,'EU',fmtAct(liveClicksEU),'Global',fmtAct(liveClicksEU/MD.euShare(nowYf())));y+=33*U;

  estLabel(x,y,'Revenue / min');y+=15*U;
  sPair(x,rw,y,'EU',fxs()+nfc(floor(fxv(liveRevEU))),'Global',fxs()+nfc(floor(fxv(liveRevGlobal))));y+=37*U;

  sDiv(x,rw,y);y+=20*U;

  fill(C.textDim);TS(10);textAlign(LEFT);text('── EXTRACTION',x,y);y+=20*U;

  let yf=nowYf();
  let arpu=MD.euArpuYear(yf),arpuChg=round((arpu/MD.euArpuYear(2012)-1)*100);
  fill(C.textMid);TS(12);text('ARPU Europe / yr',x,y);y+=16*U;
  fill(C.textBright);TS(16);textAlign(LEFT);text(fxs()+nf(fxv(arpu),1,2),x+8*U,y);
  fill(C.green);TS(12);textAlign(RIGHT);text('+'+nfc(arpuChg)+'% ↑',x+rw,y);y+=29*U;

  let engRate=MD.series(MD.ENG_PCT,yf),engChg=round((engRate/MD.ENG_PCT[0]-1)*100);
  textAlign(LEFT);fill(C.textMid);TS(12);text('Engagement Rate',x,y);y+=16*U;
  fill(C.textBright);TS(16);text(nf(engRate,1,2)+'%',x+8*U,y);
  fill(C.red);TS(12);textAlign(RIGHT);text(engChg+'% ↓',x+rw,y);y+=29*U;

  textAlign(LEFT);
  estLabel(x,y,'Revenue / Session');y+=16*U;
  fill(C.textBright);TS(16);text(fxs()+nf(fxv(MD.revPerSession(yf)),1,4),x+8*U,y);y+=29*U;

  let pas=MD.passivity(yf),pasChg=round((pas/MD.passivity(2012)-1)*100);
  textAlign(LEFT);fill(C.textMid);TS(12);text('Passivity Index',x,y);y+=13*U;
  fill(C.est);TS(9);text('% of session with no conscious action',x,y);y+=15*U;
  fill(C.textBright);TS(16);text(nf(pas*100,1,0)+'%',x+8*U,y);
  fill(C.red);TS(12);textAlign(RIGHT);text('+'+pasChg+'% ↑',x+rw,y);y+=32*U;

  sDiv(x,rw,y);y+=19*U;

  let LQ=MD.LATEST_Q;
  textAlign(LEFT);fill(C.textDim);TS(9);text('── '+LQ.label+'  ·  '+LQ.dateLabel,x,y);y+=17*U;
  sRowS(x,rw,y,'Revenue',fxs()+nf(fxv(LQ.rev_b),1,2)+'B');y+=15*U;
  sRowS(x,rw,y,'Daily Active People',nf(LQ.dap_b,1,2)+'B');y+=15*U;
  sRowS(x,rw,y,'Europe Revenue',fxs()+nf(fxv(LQ.eu_rev_b),1,1)+'B');y+=15*U;
  textAlign(LEFT);fill(C.textMid);TS(9);text('Europe Growth',x,y);
  fill(C.green);TS(9);textAlign(RIGHT);text('+'+round(LQ.eu_growth_yoy*100)+'% YoY ↑',x+rw,y);y+=15*U;
  sRowS(x,rw,y,'Net Income',fxs()+nf(fxv(LQ.net_income_b),1,2)+'B');y+=15*U;
  textAlign(LEFT);

  // ── rotating event card, pinned to the bottom of the sidebar
  drawEventCard(x,rw,max(y+12*U,height-208*U));
}

function wrapText(s,w){
  let words=s.split(' '),lines=[],cur='';
  for(let wd of words){
    let t=cur?cur+' '+wd:wd;
    if(textWidth(t)>w&&cur){lines.push(cur);cur=wd;}
    else cur=t;
  }
  if(cur)lines.push(cur);
  return lines;
}

function drawEventCard(x,rw,top){
  let ev=EVENTS[eventHover>=0?eventHover:eventIdx];
  // lighter panel with a thicker outline
  fill('#161616');stroke('#3d3d3d');strokeWeight(1.5);
  rect(x-10*U,top,rw+20*U,height-top-16*U,5);
  noStroke();
  let y=top+24*U;
  textAlign(LEFT);noStroke();
  // header + source chip beside it
  fill(C.textBright);TS(10);
  let tl=wrapText('◆ '+ev.title,rw);
  for(let i=0;i<tl.length;i++){text(tl[i],x,y);if(i<tl.length-1)y+=13*U;}
  let lastW=textWidth(tl[tl.length-1]);
  TS(8);
  let lbl='↗ '+ev.domain,chW=textWidth(lbl)+10*U,chH=13*U;
  let chx=x+lastW+8*U,chy=y-10*U;
  if(chx+chW>x+rw){y+=15*U;chx=x;chy=y-10*U;} // wraps below if the title line is full
  fill('#1a1a1a');stroke(C.textDim+'55');strokeWeight(1);rect(chx,chy,chW,chH,3);noStroke();
  fill(C.textDim);text(lbl,chx+5*U,chy+9.5*U);
  linkRect={x:chx,y:chy,w:chW,h:chH,url:ev.url};
  y+=19*U;
  // market line
  let mc=ev.mDir>0?C.mGreen:ev.mDir<0?C.mRed:C.textMid;
  let mSym=ev.mDir>0?'▲ ':ev.mDir<0?'▼ ':'▬ ';
  fill(C.textDim);TS(9);text('MARKET',x,y);
  fill(mc);TS(10);
  for(let ln of wrapText(mSym+ev.mText,rw-70*U)){text(ln,x+70*U,y);y+=13*U;}
  y+=6*U;
  // attention line
  let ac=ev.aDir>0?C.mGreen:ev.aDir<0?C.mRed:C.textMid;
  let aSym=ev.aDir>0?'▲ ':ev.aDir<0?'▼ ':'▬ ';
  fill(C.textDim);TS(9);text('ATTENTION',x,y);
  fill(ac);TS(10);
  for(let ln of wrapText(aSym+ev.aText,rw-70*U)){text(ln,x+70*U,y);y+=13*U;}
  y+=7*U;
  // quote
  textStyle(ITALIC);fill('#bdbdbd');TS(10);
  for(let ln of wrapText('“'+ev.quote+'”',rw)){text(ln,x,y);y+=13*U;}
  textStyle(NORMAL);
}

function estLabel(x,y,label){
  fill(C.textMid);TS(12);textAlign(LEFT);text(label,x,y);
  let w=textWidth(label); // measured at size 12, BEFORE switching size
  fill(C.est);TS(9);text('EST',x+w+7*U,y);
}
function sDiv(x,w,y){stroke(C.divider);strokeWeight(0.5);line(x,y,x+w,y);noStroke();}
function sPair(x,rw,y,l1,v1,l2,v2){
  fill(C.textDim);TS(11);textAlign(LEFT);text(l1,x+10*U,y);
  fill(C.textBright);TS(14);textAlign(RIGHT);text(v1,x+rw,y);
  fill(C.textDim);TS(11);textAlign(LEFT);text(l2,x+10*U,y+15*U);
  fill(C.textBright);TS(14);textAlign(RIGHT);text(v2,x+rw,y+15*U);
  textAlign(LEFT);
}
function sRow(x,rw,y,label,val){
  fill(C.textMid);TS(13);textAlign(LEFT);text(label,x,y);
  fill(C.textBright);TS(14);textAlign(RIGHT);text(val,x+rw,y);
  textAlign(LEFT);
}
function sRowS(x,rw,y,label,val){ // smaller variant for the report block
  fill(C.textMid);TS(9);textAlign(LEFT);text(label,x,y);
  fill(C.textBright);TS(10);textAlign(RIGHT);text(val,x+rw,y);
  textAlign(LEFT);
}

// ---- sidebar top-right toggle buttons: currency + candles ----
function drawToggleButtons(rightX){
  toggleRects=[];
  let bW=28*U,bH=20*U,gap=6*U,y=8*U;
  let defs=[
    {label:fxs(),on:showEUR,key:'fx'},
    {label:showCandles?'╽╿':'∿',on:showCandles,key:'candles'},
  ];
  let x=rightX-(bW*2+gap);
  defs.forEach(d=>{
    noStroke();fill('#131313');rect(x,y,bW,bH,3);
    stroke(C.divider);strokeWeight(1);noFill();rect(x,y,bW,bH,3);noStroke();
    fill(d.on&&d.key==='candles'||d.key==='fx'&&showEUR?C.green:C.textMid);
    TS(11);textAlign(CENTER);text(d.label,x+bW/2,y+bH/2+4*U);
    toggleRects.push({x,y,w:bW,h:bH,key:d.key});
    x+=bW+gap;
  });
  textAlign(LEFT);
}

function drawFooter(){
  let maxW=L.sideX-20-L.chartX;
  stroke(C.divider);strokeWeight(0.5);line(L.chartX,L.footerY-8,L.sideX-20,L.footerY-8);noStroke();
  fill(C.textDim);TS(8);textAlign(LEFT);
  let fxNote=showEUR?'  ·  FX: ECB '+nf(fx.rate,1,3)+' €/$'+(fx.live?'':' (offline rate)'):'';
  text('Stock: S&P Global / MacroTrends · real closing prices 2012–2026 · Live: Finnhub'+fxNote,L.chartX,L.footerY,maxW);
  text('Engagement: MetaData v'+MD.version+' (Meta IR / SEC 10-K · Rival IQ / Socialinsider · eMarketer) · texture: Kaggle “Social Media Engagement Report” · “Instagram Analytics Dataset”',L.chartX,L.footerY+12*U,maxW);
  text('meta_data.csv ('+metaStatus+') · instagram_data.csv ('+igStatus+')',L.chartX,L.footerY+24*U,maxW);
  textAlign(LEFT);
}

function drawHoverTooltips(){
  let {chartX:cx,chartW:cw,engY:ey,stockY:sy,sideX}=L;
  if(hoverEngIdx>=0&&hoverEngIdx<visEng.length){
    let d=visEng[hoverEngIdx],xP=i=>cx+(i/(visEng.length-1))*cw,x=xP(hoverEngIdx);
    let periodUp=visEng[visEng.length-1].close>=visEng[0].close,lc=periodUp?C.green:C.red;
    let bw=190*U;
    let bx=x+10*U;if(bx+bw>sideX-10)bx=x-bw-10*U;
    fill('#111111f2');stroke(C.divider);strokeWeight(1);rect(bx,ey+12*U,bw,52*U,4);noStroke();
    fill(lc);TS(15);textAlign(LEFT);text(fmtAct(d.close)+' clicks',bx+12*U,ey+34*U);
    fill(C.textMid);TS(10);text(fmtDate(d.ts),bx+12*U,ey+52*U);
    textAlign(LEFT);
  }
  if(hoverStockIdx>=0&&hoverStockIdx<visStock.length){
    let d=visStock[hoverStockIdx],x;
    if(ZOOMS[activeZoom].days===1&&stockSession)
      x=cx+constrain((d.ts.getTime()-(Date.now()-86400000))/86400000,0,1)*cw;
    else x=stockXofIdx(hoverStockIdx);
    let periodUp=visStock[visStock.length-1].price>=visStock[0].price,lc=periodUp?C.green:C.red;
    let bw=170*U;
    let bx=x+10*U;if(bx+bw>sideX-10)bx=x-bw-10*U;
    fill('#111111f2');stroke(C.divider);strokeWeight(1);rect(bx,sy+12*U,bw,52*U,4);noStroke();
    fill(lc);TS(15);textAlign(LEFT);text(fxs()+nf(fxv(d.price),1,2)+' '+fxc(),bx+12*U,sy+34*U);
    fill(C.textMid);TS(10);text(fmtDate(d.ts),bx+12*U,sy+52*U);
    textAlign(LEFT);
  }
}

function fmtDate(d){
  let z=ZOOMS[activeZoom];
  let base=d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  if(z.days>0&&z.days<=7)return base+', '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  return base;
}

function mouseMoved(){
  let {chartX:cx,chartW:cw,engY:ey,engH:eh,stockY:sy,stockH:sh}=L;
  // event diamonds + link hover
  eventHover=-1;
  for(let s of evScreen){
    if(dist(mouseX,mouseY,s.x,s.y)<9){eventHover=s.ei;eventIdx=s.ei;lastRotate=millis();break;}
  }
  let overLink=linkRect&&mouseX>=linkRect.x&&mouseX<=linkRect.x+linkRect.w&&mouseY>=linkRect.y&&mouseY<=linkRect.y+linkRect.h;
  let overToggle=toggleRects.some(t=>mouseX>=t.x&&mouseX<=t.x+t.w&&mouseY>=t.y&&mouseY<=t.y+t.h);
  cursor(eventHover>=0||overLink||overToggle?HAND:ARROW);

  if(mouseX>=cx&&mouseX<=cx+cw&&mouseY>=ey&&mouseY<=ey+eh&&visEng.length>1)
    hoverEngIdx=constrain(round(map(mouseX,cx,cx+cw,0,visEng.length-1)),0,visEng.length-1);
  else hoverEngIdx=-1;
  if(mouseX>=cx&&mouseX<=cx+cw&&mouseY>=sy&&mouseY<=sy+sh&&visStock.length>1){
    if(ZOOMS[activeZoom].days===1&&stockSession){
      // 1D x-axis is time-based: map mouse -> time in rolling 24h window -> nearest point
      let nowMs=Date.now();
      let tm=(nowMs-86400000)+((mouseX-cx)/cw)*86400000;
      let best=-1,bd=Infinity;
      for(let i=0;i<visStock.length;i++){let dd=abs(visStock[i].ts.getTime()-tm);if(dd<bd){bd=dd;best=i;}}
      hoverStockIdx=bd<10*60000?best:-1; // only when near the drawn line
    } else if(ZOOMS[activeZoom].days===5){
      hoverStockIdx=constrain(round(map(mouseX,cx,cx+cw,0,visStock.length-1)),0,visStock.length-1);
    } else {
      // time-proportional inverse mapping -> nearest point in time
      let t0=visStock[0].ts.getTime(),t1=visStock[visStock.length-1].ts.getTime();
      let tm=t0+((mouseX-cx)/cw)*(t1-t0),best=0,bd=Infinity;
      for(let i=0;i<visStock.length;i++){let dd=abs(visStock[i].ts.getTime()-tm);if(dd<bd){bd=dd;best=i;}}
      hoverStockIdx=best;
    }
  }
  else hoverStockIdx=-1;
}

function mousePressed(){
  let bW=42*U,gap=6*U,bH=24*U;
  ZOOMS.forEach((z,i)=>{
    let x=L.chartX+i*(bW+gap),y=L.zoomY;
    if(mouseX>=x&&mouseX<=x+bW&&mouseY>=y&&mouseY<=y+bH){activeZoom=i;buildVisible();}
  });
  // open the event card's source article
  if(linkRect&&mouseX>=linkRect.x&&mouseX<=linkRect.x+linkRect.w&&mouseY>=linkRect.y&&mouseY<=linkRect.y+linkRect.h)
    window.open(linkRect.url,'_blank');
  // sidebar toggles: currency / candles
  for(let t of toggleRects){
    if(mouseX>=t.x&&mouseX<=t.x+t.w&&mouseY>=t.y&&mouseY<=t.y+t.h){
      if(t.key==='fx')showEUR=!showEUR;
      else showCandles=!showCandles;
    }
  }
}

function fmtAct(v){
  if(v>=1e9)return nf(v/1e9,1,2)+'B';
  if(v>=1e6)return nf(v/1e6,1,1)+'M';
  if(v>=1e3)return nf(v/1e3,1,1)+'K';
  return nf(v,1,0);
}

function windowResized(){resizeCanvas(windowWidth,windowHeight);recalcLayout();buildVisible();}
