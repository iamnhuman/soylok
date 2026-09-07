import { PRESETS, SEQUENCE, makeTimeline } from './effect-catalog.js';
import { MARK_EFFECTS } from './reference-marks.js';
import { COMPOSITION_EFFECTS } from './reference-compositions.js';
import { designFor, normalizeVariant } from './composition-random.js';
import { drawDixyBrand } from './branding.js';
import { DETAIL_EFFECTS } from './reference-details.js';
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
  setVariant(variant){this.variant=normalizeVariant(variant);const random=rand(this.variant*73013);this.anchors=Array.from({length:32},()=>({x:.05+random()*.9,y:.08+random()*.83,size:8+random()*30,phase:random()*TAU,rate:.25+random()*.5}));}
  timeline(duration){
    const key=`${duration}:${this.variant}`;
    if(this.timelineKey!==key){this.timelineKey=key;this.scenes=makeTimeline(duration,this.variant);}
    return this.scenes;
  }
  activeScene(settings,time,duration){
    const t=Number.isFinite(time)?Math.max(0,time):0;
    if(settings.preset!=='sequence')return {preset:PRESETS[settings.preset]?settings.preset:'vector',index:0,start:0,end:duration||15,localTime:t,progress:(t%4)/4,variant:this.variant};
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
      const effect=DETAIL_EFFECTS[preset]||MARK_EFFECTS[preset]||COMPOSITION_EFFECTS[preset];
      if(effect)layout=effect({ctx,video,w,h,t,localTime:scene.localTime,progress:scene.progress,automatic:settings.preset==='sequence',audio:a,density,color,text:settings.text,annotation:settings.annotation,anchors:this.anchors,variant:scene.variant,faces,hands});
    }
    const trackColor=preset==='clean'?'#f5f4e9':color;
    const trackingDesign=preset==='clean'?designFor('clean',scene.variant):null;
    const windows=layout?.videoWindows||[];
    const brandFaces=layout?.replaceBase?[]:[...(tracking?.faces||[])];
    if(!layout?.replaceBase){
      ctx.save();
      if(windows.length){ctx.beginPath();ctx.rect(0,0,w,h);windows.forEach(win=>ctx.rect(win.x,win.y,win.width,win.height));ctx.clip('evenodd');}
      if(preset!=='callout')this.tracking(ctx,w,h,faces,hands,trackColor,preset==='clean',a,t,trackingDesign,density);ctx.restore();
    }
    // The same real landmarks also follow every reframed/cropped video window.
    // Full-screen title cards have no visible video, hence no phantom face box.
    for(const win of windows){
      const crop=win.sourceRect;
      const map=point=>({...point,x:(win.x+(point.x*video.videoWidth-crop.x)/crop.width*win.width)/w,y:(win.y+(point.y*video.videoHeight-crop.y)/crop.height*win.height)/h});
      const intersects=points=>{const b=box(points);return b.r*video.videoWidth>crop.x&&b.x*video.videoWidth<crop.x+crop.width&&b.b*video.videoHeight>crop.y&&b.y*video.videoHeight<crop.y+crop.height;};
      brandFaces.push(...(tracking?.faces||[]).filter(intersects).map(points=>points.map(map)));
      ctx.save();ctx.beginPath();ctx.rect(win.x,win.y,win.width,win.height);ctx.clip();
      this.tracking(ctx,w,h,faces.filter(intersects).map(points=>points.map(map)),hands.filter(hand=>intersects(hand.landmarks)).map(hand=>({...hand,landmarks:hand.landmarks.map(map)})),trackColor,false,a);
      ctx.restore();
    }
    drawDixyBrand(ctx,{width:w,height:h,time:t,duration:video.duration,faces:brandFaces});
    ctx.restore();
  }
  tracking(ctx,w,h,faces,hands,color,contour,a,t=0,design=null,density=.65){
    if(contour){this.contour(ctx,w,h,faces,hands,color,a,t,design||designFor('clean',this.variant),density);return;}
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
  contour(ctx,w,h,faces,hands,color,a,t,d,density){
    if(density<=0)return;
    ctx.save();ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineCap='round';ctx.lineJoin='round';
    const mode=d.mode,weight=d.range('weight',1.5,3.8)*(.65+density*.6);
    const scale=Math.min(w,h)/720;
    const dot=(p,r,filled=true)=>{ctx.beginPath();ctx.arc(p.x*w,p.y*h,r*scale,0,TAU);filled?ctx.fill():ctx.stroke();};
    const dimension=(b,id)=>{
      const pad=d.range('padding',.025,.065),frame=brackets(ctx,b,w,h,color,pad);
      const x=frame.x,y=frame.y,r=frame.r,bottom=frame.b;
      ctx.lineWidth=weight*.5;line(ctx,x,y-7*scale,r,y-7*scale);line(ctx,r+7*scale,y,r+7*scale,bottom);
      const ticks=d.int('ticks',4,9);
      for(let i=0;i<=ticks;i++){const u=i/ticks;line(ctx,x+(r-x)*u,y-11*scale,x+(r-x)*u,y-3*scale);line(ctx,r+3*scale,y+(bottom-y)*u,r+11*scale,y+(bottom-y)*u);}
      label(ctx,id,x,Math.max(6,y-32*scale),color,w);return frame;
    };
    faces.forEach((points,index)=>{
      const b=box(points);ctx.lineWidth=weight;
      if(mode===0){
        path(ctx,points,faceOval,w,h);path(ctx,points,eyeL,w,h);path(ctx,points,eyeR,w,h);path(ctx,points,mouth,w,h);
        ctx.lineWidth=weight*.5;path(ctx,points,[168,6,197,195,5,4,1],w,h);
        const frame=brackets(ctx,b,w,h,color,d.range('padding',.018,.05));label(ctx,`FACE_${index+1}`,frame.x,frame.y-23,color,w);
      }else if(mode===1){
        // A point cloud and its real feature contours, never invented landmarks.
        const stride=d.int('stride',3,7);
        points.forEach((p,i)=>{if(i%stride===0)dot(p,d.range(`node:${i}`,1.8,4.2));});
        ctx.lineWidth=weight*.55;path(ctx,points,eyeL,w,h);path(ctx,points,eyeR,w,h);path(ctx,points,mouth,w,h);
        ctx.setLineDash([3*scale,8*scale]);path(ctx,points,faceOval,w,h);ctx.setLineDash([]);
      }else if(mode===2){
        dimension(b,`FACE / ${String(index+1).padStart(2,'0')}`);
        for(const i of [1,33,133,263,362,61,291]){const p=points[i];plus(ctx,p.x*w,p.y*h,d.range('cross',16,28)*scale,weight);}
        ctx.lineWidth=weight*.55;path(ctx,points,[33,133,1,362,263],w,h);path(ctx,points,[61,1,291],w,h);
      }else{
        // Concentric drawing follows the detected head bounds and eye positions.
        const cx=(b.x+b.r)*w/2,cy=(b.y+b.b)*h/2;
        const count=d.int('rings',2,4),pulse=1+Math.sin(t*d.range('speed',.4,1.3))* .04+a.peak*.04;
        for(let i=0;i<count;i++){ctx.lineWidth=weight/(1+i*.4);ctx.beginPath();ctx.ellipse(cx,cy,Math.max(1,(b.r-b.x)*w*(.55+i*.1))*pulse,Math.max(1,(b.b-b.y)*h*(.55+i*.08))*pulse,d.range('tilt',-.25,.25),0,TAU);ctx.stroke();}
        [33,263,1].forEach(i=>dot(points[i],d.range('eye-ring',5,11),false));
      }
    });
    hands.forEach((hand,index)=>{
      const points=hand.landmarks,b=box(points);ctx.lineWidth=weight;
      if(mode===0){
        for(const [from,to]of handLinks)line(ctx,points[from].x*w,points[from].y*h,points[to].x*w,points[to].y*h);
        points.forEach((p,i)=>dot(p,[4,8,12,16,20].includes(i)?5:2.6));
      }else if(mode===1){
        ctx.lineWidth=weight*.45;
        for(const [from,to]of handLinks)line(ctx,points[from].x*w,points[from].y*h,points[to].x*w,points[to].y*h);
        points.forEach((p,i)=>dot(p,d.range(`joint:${i}`,4,10),i%3===0));
        [4,8,12,16,20].forEach(i=>dot(points[i],d.range('tiphalo',12,20),false));
      }else if(mode===2){
        dimension(b,`HAND / ${String(index+1).padStart(2,'0')}`);
        for(const i of [4,8,12,16,20]){const p=points[i];plus(ctx,p.x*w,p.y*h,22*scale,weight);ctx.lineWidth=weight*.5;line(ctx,points[0].x*w,points[0].y*h,p.x*w,p.y*h);}
      }else{
        // Rounded finger ribbons use only the actual wrist/joint/tip coordinates.
        const fingers=[[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20]];
        ctx.lineWidth=weight*d.range('ribbon-width',2,4);fingers.forEach(indices=>path(ctx,points,indices,w,h));
        [4,8,12,16,20].forEach((i,n)=>{const p=points[i],pulse=1+.08*Math.sin(t*d.range('speed',1,2.5)+n);ctx.lineWidth=weight*.55;dot(p,d.range('ring-size',16,28)*pulse,false);dot(p,4);});
      }
    });
    ctx.restore();
  }
}
