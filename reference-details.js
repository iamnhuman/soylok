import { designFor } from './composition-random.js';
const TAU=Math.PI*2;
const mod=(n,m)=>((n%m)+m)%m;
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
function effect(id,draw){return p=>{if(p.density<=0)return;p.ctx.save();try{draw({...p,d:designFor(id,p.variant),s:Math.min(p.w,p.h)});}finally{p.ctx.restore();}};}
function plus(ctx,x,y,size,weight){ctx.fillRect(x-size/2,y-weight/2,size,weight);ctx.fillRect(x-weight/2,y-size/2,weight,size);}
const signatures=new Map();
function signaturePath(d){
  if(signatures.has(d.seed))return signatures.get(d.seed);
  const curves=[
    [[.05,.8],[.18,.25],[.63,-.2],[.39,.04]],
    [[.39,.04],[.12,.3],[-.08,1.05],[.29,.59]],
    [[.29,.59],[.4,.15],[.27,.91],[.43,.54]],
  ];
  let last=[.43,.54];
  for(let i=0;i<d.int('letters',5,9);i++){
    const x=.39+i*.043,high=d.range(`high:${i}`,.27,.47),low=d.range(`low:${i}`,.65,.88);
    const end=[x+.06,.49];curves.push([last,[x+.11,high],[x-.075,low],end]);last=end;
  }
  curves.push([last,[.87,.3],[.48,1.28],[.42,1.05]]);
  curves.push([[.42,1.05],[.58,.48],[.84,.66],[.97,.11]]);
  curves.push([[.97,.11],[.77,.4],[.66,.69],[.37,.77]]);
  const points=[];let length=0;
  for(const [a,b,c,e] of curves)for(let i=points.length?1:0;i<=40;i++){
    const t=i/40,u=1-t;
    const point={x:u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*e[0],y:u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*e[1]};
    if(points.length)length+=Math.hypot(point.x-points.at(-1).x,point.y-points.at(-1).y);
    points.push({...point,length});
  }
  const result={points,length};if(signatures.size>=64)signatures.clear();signatures.set(d.seed,result);return result;
}

export const DETAIL_EFFECTS={
  signature:effect('signature',p=>{
    const {ctx,w,h,s,d,color,localTime}=p;
    const layouts=[[.5,.63,.65,-.13],[.56,.42,.76,.06],[.37,.7,.53,-.28],[.54,.52,.79,-.06]];
    const [cx,cy,span,angle]=layouts[d.mode],width=w*span*d.range('width',.85,1.05),height=Math.min(h*.35,width*.32);
    const {points,length}=signaturePath(d),phase=mod(localTime,d.range('cycle',4.8,6.8));
    const progress=p.automatic?clamp(p.progress/.68):clamp(phase/d.range('drawSeconds',1.25,2.1)),limit=length*progress;
    ctx.translate(cx*w,cy*h);ctx.rotate(angle+d.range('tilt',-.06,.06));ctx.scale(width,height);
    ctx.strokeStyle=color;ctx.lineWidth=(1.8+p.density*1.8)*s/720/Math.sqrt(width*height);ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(points[0].x-.5,points[0].y-.5);
    for(let i=1;i<points.length;i++){
      const point=points[i],before=points[i-1];
      if(point.length>limit){const f=clamp((limit-before.length)/(point.length-before.length||1));ctx.lineTo(before.x+(point.x-before.x)*f-.5,before.y+(point.y-before.y)*f-.5);break;}
      ctx.lineTo(point.x-.5,point.y-.5);
    }
    ctx.stroke();
  }),
  risingCrosses:effect('risingCrosses',p=>{
    const {ctx,w,h,s,d,color,density,t,audio}=p;
    const count=Math.round(45+density*130),columns=d.int('columns',9,15);
    // Shared integrated music energy makes the entire field accelerate together
    // on real bass onsets, without independent/random simulated beats.
    const travel=t*d.range('speed',.065,.12)+(audio.motion||0)*.14;
    for(let i=0;i<count;i++){
      const depth=d.range(`depth:${i}`,.45,1),phase=d.value(`phase:${i}`);
      const y=(1.12-mod(phase+travel*(.75+depth*.25),1.24))*h;
      let x=d.value(`x:${i}`)*w;
      if(d.mode===1)x=((i%columns+.5)/columns)*w+Math.sin(t*.45+i)*w*.01;
      if(d.mode===2)x=w*(.5+(x/w-.5)*(.55+.45*clamp(y/h)))+Math.sin(t*.3)*w*.04;
      if(d.mode===3)x=mod(x+Math.sin(y/h*TAU+t*.35)*w*.065,w);
      const size=s*d.range(`size:${i}`,.008,.031)*(1+audio.peak*.24);
      ctx.globalAlpha=.3+depth*.62;ctx.fillStyle=color;
      plus(ctx,x,y,size,Math.max(s*.0012,size*d.range('weight',.12,.2)));
    }
  }),
  rain:effect('rain',p=>{
    const {ctx,w,h,s,d,color,density,t,audio}=p,count=Math.round(110+density*270);
    for(let i=0;i<count;i++){
      const depth=d.range(`depth:${i}`,.18,1),speed=d.range(`speed:${i}`,.08,.23),phase=d.value(`phase:${i}`);
      const y=(mod(phase+t*speed+(audio.motion||0)*.03,1.22)-.14)*h;
      let x=d.value(`x:${i}`)*w;
      if(d.mode===1)x=(Math.floor(x/w*20)+.5)*w/20;
      if(d.mode===2)x=mod(x+Math.sin(y/h*3+i)*w*.025,w);
      const length=s*d.range(`length:${i}`,.009,.065)*depth*(d.mode===3?1.65:1);
      ctx.globalAlpha=.16+depth*.73;ctx.fillStyle=color;
      ctx.fillRect(x,y,Math.max(.7,s*(.001+depth*.002)),length);
    }
  }),
  callout:effect('callout',p=>{
    const {ctx,w,h,s,d,color,faces,hands,annotation={}}=p,items=[];
    const average=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
    if(annotation.target==='manual')items.push({point:{x:annotation.x??.5,y:annotation.y??.5},label:annotation.label||'объект'});
    else{
      if(annotation.target!=='hands')for(const face of faces){
        if(face[33]&&face[133]&&face[263]&&face[362]){
          items.push({point:average(face[33],face[133]),label:'eyes'});
          if(d.mode===1||d.mode===3)items.push({point:average(face[263],face[362]),label:'eyes'});
        }
      }
      if(annotation.target==='hands'||(!items.length&&annotation.target!=='eyes'))for(const hand of hands){
        const pt=hand.landmarks[d.mode===2?8:0];if(pt)items.push({point:pt,label:d.mode===2?'finger':'hand'});
      }
    }
    const fontSize=Math.max(11,s*.023),margin=s*.035;
    ctx.font=`400 ${fontSize}px Arial, Helvetica, sans-serif`;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=Math.max(1,s*.0018);
    for(const [i,item]of items.slice(0,3).entries()){
      const x=clamp(item.point.x)*w,y=clamp(item.point.y)*h;
      const right=x<w*.55,sign=right?1:-1;
      const targetX=clamp(x+sign*w*d.range('lineLength',.22,.4),margin,w-margin);
      const targetY=clamp(y+(d.mode===2?-1:d.mode===3?1:0)*h*.12,margin,h-margin-fontSize*1.4);
      const reveal=clamp(p.localTime/.6),endX=x+(targetX-x)*reveal,endY=y+(targetY-y)*reveal;
      ctx.beginPath();ctx.arc(x,y,2*s/720,0,TAU);ctx.fill();ctx.beginPath();ctx.moveTo(x,y);
      if(d.mode>=2)ctx.lineTo(x+(endX-x)*.35,endY);
      ctx.lineTo(endX,endY);ctx.stroke();
      ctx.globalAlpha=reveal;ctx.textAlign=right?'right':'left';
      ctx.fillText(item.label,endX,Math.min(h-margin,endY+fontSize*1.3+i*fontSize*.2),Math.max(fontSize,right?endX-margin:w-margin-endX));ctx.globalAlpha=1;
    }
  }),
};
