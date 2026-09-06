import { PRESETS, SEQUENCE, makeTimeline } from './effect-catalog.js';
import { MARK_EFFECTS } from './reference-marks.js';
import { COMPOSITION_EFFECTS } from './reference-compositions.js';
export { PRESETS, SEQUENCE, EFFECT_KEYS } from './effect-catalog.js';
const TAU = Math.PI * 2;
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const handLinks = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const faceOval = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
const eyeL = [33,160,158,133,153,144,33], eyeR = [362,385,387,263,373,380,362], mouth = [61,40,37,0,267,270,291,321,314,17,84,91,61];
function rand(seed) { let n = seed >>> 0; return () => { n += 0x6d2b79f5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function box(points) { const xs = points.map(p=>p.x), ys=points.map(p=>p.y); return {x:Math.min(...xs),y:Math.min(...ys),r:Math.max(...xs),b:Math.max(...ys)}; }
function line(ctx,x,y,x2,y2){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();}
function plus(ctx,x,y,s,thickness=2){ctx.fillRect(x-s/2,y-thickness/2,s,thickness);ctx.fillRect(x-thickness/2,y-s/2,thickness,s);}
function label(ctx, text, x,y,color,w) {
  ctx.font='500 9px monospace';const width=ctx.measureText(text).width+12;
  x=clamp(x,4,w-width-4);y=Math.max(5,y);ctx.fillStyle='#131610df';ctx.fillRect(x,y,width,17);ctx.fillStyle=color;ctx.fillText(text,x+6,y+12);
}
function path(ctx,points,indices,w,h,close=false) {ctx.beginPath();indices.forEach((index,i)=>{const p=points[index];if(p)ctx[i?'lineTo':'moveTo'](p.x*w,p.y*h);});if(close)ctx.closePath();ctx.stroke();}
function brackets(ctx,b,w,h,color,extra=.018) {
  const x=clamp((b.x-extra)*w,3,w-3),y=clamp((b.y-extra)*h,3,h-3),r=clamp((b.r+extra)*w,3,w-3),bottom=clamp((b.b+extra)*h,3,h-3),c=Math.min(20,(r-x)*.18,(bottom-y)*.18);
  ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();
  for(const [px,py,dx,dy] of [[x,y,1,1],[r,y,-1,1],[x,bottom,1,-1],[r,bottom,-1,-1]]){ctx.moveTo(px,py+dy*c);ctx.lineTo(px,py);ctx.lineTo(px+dx*c,py);}ctx.stroke();return {x,y,r,b:bottom};
}

export class EffectRenderer {
  constructor(){this.variant=0;this.setVariant(1);}
  setVariant(variant){this.variant=variant;const random=rand(variant*73013);this.anchors=Array.from({length:32},()=>({x:.05+random()*.9,y:.08+random()*.83,size:8+random()*30,phase:random()*TAU,rate:.25+random()*.5}));this.flip=random()>.5;}
  timeline(duration){
    const key=`${duration}:${this.variant}`;
    if(this.timelineKey!==key){this.timelineKey=key;this.scenes=makeTimeline(duration,this.variant);}
    return this.scenes;
  }
  activeScene(settings,time,duration){
    const t=Number.isFinite(time)?Math.max(0,time):0;
    if(settings.preset!=='sequence')return {preset:PRESETS[settings.preset]?settings.preset:'vector',index:0,start:0,end:duration||15,localTime:t,progress:(t%4)/4};
    const scenes=this.timeline(duration),scene=scenes.find(item=>t<item.end)||scenes[scenes.length-1];
    return {...scene,localTime:t-scene.start,progress:clamp((t-scene.start)/(scene.end-scene.start),0,1)};
  }
  activePreset(settings,time,duration){return this.activeScene(settings,time,duration).preset;}
  draw(ctx,video,settings,tracking,audio,options={}){
    const width=ctx.canvas.width,height=ctx.canvas.height;
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,width,height);
    if(video.readyState<2 || !video.videoWidth)return;
    ctx.drawImage(video,0,0,width,height);
    if(settings.original)return;
    const w=1280,h=1280*height/width;ctx.save();ctx.scale(width/w,width/w);
    const t=options.time??video.currentTime??0,scene=this.activeScene(settings,t,video.duration),preset=scene.preset,color=settings.color;
    const a=settings.audio?audio:{level:0,bass:0,mid:0,high:0,peak:0};
    const density=clamp(settings.intensity/100,0,1);
    const faces=settings.face?(tracking?.faces||[]):[],hands=settings.hands?(tracking?.hands||[]):[];
    let layout;
    if(density>0){
      const effect=MARK_EFFECTS[preset]||COMPOSITION_EFFECTS[preset];
      if(effect)layout=effect({ctx,video,w,h,t,localTime:scene.localTime,progress:scene.progress,audio:a,density,color,text:settings.text,anchors:this.anchors,variant:this.variant,faces,hands});
    }
    const trackColor=preset==='clean'?'#f5f4e9':color;
    const windows=layout?.videoWindows||[];
    if(!layout?.replaceBase){
      ctx.save();
      if(windows.length){ctx.beginPath();ctx.rect(0,0,w,h);windows.forEach(win=>ctx.rect(win.x,win.y,win.width,win.height));ctx.clip('evenodd');}
      this.tracking(ctx,w,h,faces,hands,trackColor,preset==='clean',a);ctx.restore();
    }
    // The same real landmarks also follow every reframed/cropped video window.
    // Full-screen title cards have no visible video, hence no phantom face box.
    for(const win of windows){
      const crop=win.sourceRect;
      const map=point=>({...point,x:(win.x+(point.x*video.videoWidth-crop.x)/crop.width*win.width)/w,y:(win.y+(point.y*video.videoHeight-crop.y)/crop.height*win.height)/h});
      const intersects=points=>{const b=box(points);return b.r*video.videoWidth>crop.x&&b.x*video.videoWidth<crop.x+crop.width&&b.b*video.videoHeight>crop.y&&b.y*video.videoHeight<crop.y+crop.height;};
      ctx.save();ctx.beginPath();ctx.rect(win.x,win.y,win.width,win.height);ctx.clip();
      this.tracking(ctx,w,h,faces.filter(intersects).map(points=>points.map(map)),hands.filter(hand=>intersects(hand.landmarks)).map(hand=>({...hand,landmarks:hand.landmarks.map(map)})),trackColor,false,a);
      ctx.restore();
    }
    ctx.restore();
  }
  tracking(ctx,w,h,faces,hands,color,contour,a){
    ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineJoin='round';ctx.lineCap='round';
    faces.forEach((points,index)=>{
      const b=box(points),frame=brackets(ctx,b,w,h,color);ctx.strokeStyle=color;ctx.lineWidth=contour?1.9:1;
      ctx.globalAlpha=contour?.9:.52;path(ctx,points,faceOval,w,h);ctx.globalAlpha=1;
      path(ctx,points,eyeL,w,h);path(ctx,points,eyeR,w,h);
      if(contour){path(ctx,points,mouth,w,h);path(ctx,points,[168,6,197,195,5,4,1],w,h);}
      [1,4,33,133,263,362,61,291].forEach(i=>{const p=points[i];ctx.fillStyle=color;ctx.fillRect(p.x*w-1.5,p.y*h-1.5,3,3);});
      const nose=points[1];plus(ctx,nose.x*w,nose.y*h,8,1);
      label(ctx,`FACE_${String(index+1).padStart(2,'0')}`,frame.x,Math.max(6,frame.y-23),color,w);
    });
    hands.forEach((hand,index)=>{
      const points=hand.landmarks,b=box(points),frame=brackets(ctx,b,w,h,color,.012);
      ctx.lineWidth=contour?2.2:1.6;ctx.strokeStyle=color;ctx.globalAlpha=.88;
      for(const [from,to] of handLinks)line(ctx,points[from].x*w,points[from].y*h,points[to].x*w,points[to].y*h);
      ctx.globalAlpha=1;ctx.fillStyle=color;
      points.forEach((p,i)=>{const tip=[4,8,12,16,20].includes(i);if(tip){ctx.fillRect(p.x*w-3,p.y*h-3,6,6);ctx.strokeStyle=color;ctx.lineWidth=.8;ctx.strokeRect(p.x*w-6,p.y*h-6,12,12);}else{ctx.beginPath();ctx.arc(p.x*w,p.y*h,1.9,0,TAU);ctx.fill();}});
      label(ctx,`HAND_${String(index+1).padStart(2,'0')}`,frame.x,Math.min(h-23,frame.b+6),color,w);
    });
    ctx.restore();
  }
}
