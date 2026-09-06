import { designFor } from './composition-random.js';

const TAU = Math.PI * 2;
const CREAM = '#f3f1e2';
const INK = '#171914';
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (n, m) => ((n % m) + m) % m;

function mark(id, draw) {
  return options => {
    const p = { t: 0, density: .65, color: '#ff6b16', faces: [], hands: [], variant: 1, ...options };
    p.density = clamp(Number.isFinite(p.density) ? p.density : .65, 0, 1);
    p.design = designFor(id, p.variant, 4);
    const metadata = { compositionMode: p.design.mode, compositionSeed: p.design.seed };
    if (!p.density || !(p.w > 0 && p.h > 0)) return metadata;
    p.audio = { level: 0, bass: 0, mid: 0, high: 0, peak: 0, ...p.audio };
    p.localTime = Number.isFinite(p.localTime) ? p.localTime : p.t;
    p.s = Math.min(p.w, p.h);
    p.motion = p.localTime * p.design.range('speed', .45, 1.6) * p.design.sign('direction');
    p.ctx.save();
    try {
      p.ctx.beginPath(); p.ctx.rect(0, 0, p.w, p.h); p.ctx.clip();
      p.ctx.globalAlpha = 1; p.ctx.lineCap = 'butt'; p.ctx.lineJoin = 'miter';
      return { ...metadata, ...draw(p) };
    } finally { p.ctx.restore(); }
  };
}

function path(ctx, points, close = false) {
  ctx.beginPath(); points.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
  if (close) ctx.closePath();
}
function line(ctx, x, y, x2, y2) { path(ctx, [[x, y], [x2, y2]]); ctx.stroke(); }
function poly(ctx, points, fill = false) { path(ctx, points, true); fill ? ctx.fill() : ctx.stroke(); }
function circle(ctx, x, y, r, fill = true) { ctx.beginPath(); ctx.arc(x, y, Math.max(.1, r), 0, TAU); fill ? ctx.fill() : ctx.stroke(); }
function cross(ctx, x, y, size, weight = size * .17) {
  ctx.fillRect(x - size / 2, y - weight / 2, size, weight);
  ctx.fillRect(x - weight / 2, y - size / 2, weight, size);
}
function rounded(ctx, x, y, w, h, radius = 20) {
  w = Math.max(1, w); h = Math.max(1, h); const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.stroke();
}
function box(item) {
  const points = item?.landmarks || item;
  if (!points?.length) return null;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) };
}
function side(p) {
  const face = box(p.faces[0]);
  return face ? (face.x + face.r) / 2 < .5 : p.design.value('side') > .5;
}
function region(p) {
  return { x: p.w * (side(p) ? .79 : .21), y: p.h * p.design.range('height', .32, .61),
    r: Math.min(p.w * .19, p.h * .3) * p.design.range('scale', .82, 1.16) * (.78 + p.density * .36) };
}
function clearOfPeople(p, x, y, pad = .04) {
  return ![...p.faces, ...p.hands].some(item => { const b = box(item); return b && x > b.x - pad && x < b.r + pad && y > b.y - pad && y < b.b + pad; });
}
// A quad is filled first, then all accent tiles are one batched path. No holes,
// offscreen textures, per-cell canvas allocations, or changes to the video.
function checker(ctx, corners, cols, rows, color, phase = 0, perspective = false) {
  const point = (u, v) => {
    const depth = perspective ? Math.pow(v, 1.45) : v;
    const top = [lerp(corners[0][0], corners[1][0], u), lerp(corners[0][1], corners[1][1], u)];
    const bottom = [lerp(corners[3][0], corners[2][0], u), lerp(corners[3][1], corners[2][1], u)];
    return [lerp(top[0], bottom[0], depth), lerp(top[1], bottom[1], depth)];
  };
  ctx.save(); path(ctx, corners, true); ctx.clip(); ctx.fillStyle = CREAM; poly(ctx, corners, true);
  ctx.beginPath();
  for (let row = -2; row <= rows; row++) for (let col = 0; col < cols; col++) {
    if (mod(row + col, 2) === 0) continue;
    const v1 = clamp((row + phase) / rows, 0, 1), v2 = clamp((row + 1 + phase) / rows, 0, 1);
    if (v1 === v2) continue;
    const points = [point(col / cols, v1), point((col + 1) / cols, v1), point((col + 1) / cols, v2), point(col / cols, v2)];
    points.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y)); ctx.closePath();
  }
  ctx.fillStyle = color; ctx.fill(); ctx.restore();
}

function figure(ctx, x, y, size, pose, time, color, phase = 0) {
  const swing = Math.sin(time + phase), bounce = Math.abs(Math.sin(time * .8 + phase));
  ctx.save(); ctx.translate(x, y - (pose === 1 ? bounce * size * .28 : 0));
  ctx.rotate(pose === 2 ? .18 : pose === 3 ? -.06 : swing * .055);
  ctx.strokeStyle = CREAM; ctx.lineWidth = Math.max(3, size * .055); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU, r = size * (.21 + Math.sin(a * 3 + phase) * .012); const px = Math.cos(a) * r, py = Math.sin(a) * r - size * .67; ctx[i ? 'lineTo' : 'moveTo'](px, py); }
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -size * .45); ctx.quadraticCurveTo(-size * .12, 0, 0, size * .38); ctx.stroke();
  let arms, legs;
  if (pose === 0) {
    arms = [[-.65, -.4 - swing * .18], [-.34, .02], [0, -.18], [.32, -.2], [.58, -.72 + swing * .2]];
    legs = [[-.58, .96], [-.2, .7], [0, .38], [.25, .73], [.58, .8 + swing * .1]];
  } else if (pose === 1) {
    arms = [[-.7, -.8], [-.42, -.48], [0, -.17], [.42, -.48], [.7, -.8]];
    legs = [[-.57, .62], [-.42, .96 - bounce * .15], [0, .38], [.42, .96 - bounce * .15], [.57, .62]];
  } else if (pose === 2) {
    arms = [[-.64, -.05], [-.32, .1], [0, -.2], [.38, -.42], [.58, -.13]];
    legs = [[-.6 - swing * .1, .78], [-.31, .58], [0, .38], [.28, .61 - swing * .16], [.54, 1.02]];
  } else {
    arms = [[-.25, .24], [-.32, -.06], [0, -.18], [.35, .06], [.58, .01 + swing * .12]];
    legs = [[-.12, .44], [.48, .43], [.48, .95], [.72, .95]];
  }
  path(ctx, arms.map(([px, py]) => [px * size, py * size])); ctx.stroke(); path(ctx, legs.map(([px, py]) => [px * size, py * size])); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, size * .035);
  if (pose < 2) for (let i = 0; i < 3; i++) { const a = -2.3 + i * .37; line(ctx, Math.cos(a) * size * .46, -size * .67 + Math.sin(a) * size * .46, Math.cos(a) * size * .68, -size * .67 + Math.sin(a) * size * .68); }
  ctx.restore();
}

export const MARK_EFFECTS = {
  vector: mark('vector', p => {
    const {ctx,w,h,s,density,color,design:d,motion:m,audio}=p, count=d.int('count',4,9)+Math.round(density*4);
    if (d.mode===0) {
      const columns=d.int('columns',3,5), step=s*d.range('spacing',.12,.19), size=step*d.range('cross',.35,.68);
      const originX=side(p)?w-step*columns*.9:step*.45, originY=h*d.range('top',.1,.28);
      for(let i=0;i<count;i++){const x=originX+(i%columns)*step,y=originY+Math.floor(i/columns)*step;if(!clearOfPeople(p,x/w,y/h,.02))continue;ctx.fillStyle=i%4===0?CREAM:color;cross(ctx,x+Math.sin(m+i)*4,y,size*(1+audio.peak*.15));}
    } else if (d.mode===1) {
      const r=region(p), size=s*d.range('hero',.42,.68);ctx.translate(r.x,r.y);ctx.rotate(Math.sin(m*.35)*.15);ctx.fillStyle=color;cross(ctx,0,0,size,size*d.range('weight',.17,.3));ctx.fillStyle=INK;cross(ctx,0,0,size*.42,size*.09);
      ctx.fillStyle=CREAM;cross(ctx,size*.5,-size*.55,size*.2,size*.035);
    } else if (d.mode===2) {
      const n=d.int('steps',4,7), right=side(p);for(let i=0;i<n;i++){const u=i/(n-1),x=w*(right?.58+u*.34:.42-u*.34),y=h*(.18+u*.67),size=s*(.045+u*d.range('growth',.1,.19))*(1+Math.sin(m+i)*.1);ctx.save();ctx.translate(x,y);ctx.rotate(i%2?Math.PI/4:0);ctx.fillStyle=i%3===0?CREAM:color;cross(ctx,0,0,size);ctx.restore();}
    } else {
      const size=s*d.range('size',.09,.16), inset=size*.65;ctx.fillStyle=color;
      [[inset,inset],[w-inset,inset],[w-inset,h-inset],[inset,h-inset]].forEach(([x,y],i)=>{ctx.save();ctx.translate(x,y);ctx.rotate(m*.2*(i%2?1:-1));cross(ctx,0,0,size*(i%2?1.5:1));ctx.restore();});
      const n=d.int('rail',3,7);for(let i=0;i<n;i++){ctx.fillStyle=i%2?CREAM:color;cross(ctx,w*(i+1)/(n+1),h*.92,s*.035*(1+Math.sin(m+i)*.2));}
    }
  }),

  signal: mark('signal', p => {
    const {ctx,w,h,s,density,color,design:d,motion:m,audio}=p,n=d.int('lines',8,15)+Math.round(density*7);ctx.strokeStyle=color;
    if(d.mode===0){
      for(let i=0;i<n;i++){const y=h*(.1+i/n*.78),x=i%2?w*.7:w*.04,len=w*d.range(`length:${i}`,.1,.24)*(1+audio.high*.25);ctx.strokeStyle=i%5===0?CREAM:color;ctx.lineWidth=i%6===0?6:2;line(ctx,x,y,x+len*(.85+Math.sin(m+i)*.15),y);}
    }else if(d.mode===1){
      const right=side(p),base=right?w*.96:w*.04;for(let i=0;i<n;i++){const u=i/(n-1),y=h*(.2+u*.62),len=w*(.07+Math.sin(u*Math.PI)*d.range('fanwidth',.2,.36))*(1+audio.bass*.16);ctx.lineWidth=3+density*4;ctx.strokeStyle=i%5===0?CREAM:color;line(ctx,base,y,base+(right?-1:1)*len,y);}
    }else if(d.mode===2){
      const base=h*d.range('baseline',.65,.77),span=h*d.range('spread',.15,.25);ctx.lineWidth=2;
      for(let i=0;i<n;i++){ctx.strokeStyle=i===0||i===n-1?CREAM:color;ctx.beginPath();for(let j=0;j<=32;j++){const x=j/32*w,y=base+i/n*span-Math.sin(j/32*Math.PI*2+m)*s*.025;ctx[j?'lineTo':'moveTo'](x,y);}ctx.stroke();}
    }else{
      const right=side(p),step=w*d.range('step',.025,.047),base=right?w*.95:w*.05;ctx.lineWidth=4;
      for(let i=0;i<n;i++){const u=i/n,y=h*(.09+u*.79),length=step*(2+mod(i+Math.floor(m*.8),5));ctx.strokeStyle=i%4===0?CREAM:color;path(ctx,[[base,y],[base+(right?-1:1)*length,y],[base+(right?-1:1)*length,y+h*.025]]);ctx.stroke();}
    }
  }),

  grid: mark('grid', p => {
    const {ctx,w,h,color,design:d,motion:m,density}=p,cols=Math.round(d.int('columns',8,15)*(.7+density*.5)),rows=Math.round(d.int('rows',5,9)*(.75+density*.4)),phase=mod(m*.18,2);
    if(d.mode===0){
      const horizon=h*d.range('horizon',.56,.65);checker(ctx,[[0,horizon],[w,horizon],[w*1.75,h*1.02],[-w*.75,h*1.02]],cols,rows,color,phase,true);
      ctx.strokeStyle=color;ctx.lineWidth=2;line(ctx,0,horizon-9,w,horizon-9);line(ctx,0,horizon-18,w,horizon-18);
    }else if(d.mode===1){
      const inner=w*d.range('wall',.2,.3),top=h*.12,bottom=h*.87;
      checker(ctx,[[0,0],[inner,top],[inner,bottom],[0,h]],d.int('wallcols',3,5),rows,color,phase);
      checker(ctx,[[w-inner,top],[w,0],[w,h],[w-inner,bottom]],d.int('wallcols',3,5),rows,color,2-phase);
    }else if(d.mode===2){
      const slope=d.sign('slope'),shift=Math.sin(m*.23)*h*.04;
      const corners=slope>0?[[-w*.06,h*.43+shift],[w,h*.06+shift],[w*1.06,h*.52+shift],[0,h*.89+shift]]:[[0,h*.06+shift],[w*1.06,h*.43+shift],[w,h*.89+shift],[-w*.06,h*.52+shift]];
      checker(ctx,corners,d.int('diagonalcols',9,14),d.int('diagonalrows',3,5),color,phase);
    }else{
      const size=w*d.range('tilewidth',.3,.43),height=h*(.25+density*.13),right=side(p);
      checker(ctx,[[right?w-size:0,0],[right?w:size,0],[right?w:size,height],[right?w-size:0,height]],d.int('largecols',2,4),d.int('largerows',2,3),color,0);
      checker(ctx,[[right?0:w-size,h-height],[right?size:w,h-height],[right?size:w,h],[right?0:w-size,h]],d.int('largecols',2,4),d.int('largerows',2,3),color,Math.floor(mod(m*.25,2)));
    }
  }),

  dashes: mark('dashes', p => {
    const {ctx,w,h,s,color,density,design:d,motion:m,audio}=p,n=d.int('number',10,20)+Math.round(density*10);ctx.lineCap='butt';
    if(d.mode===0){
      for(let i=0;i<n;i++){const x=w*d.range(`x:${i}`,.035,.965),y=(mod(d.value(`y:${i}`)+m*d.range(`speed:${i}`,.07,.17),1.3)-.2)*h,len=s*d.range(`length:${i}`,.035,.16);if(!clearOfPeople(p,x/w,(y+len*.5)/h,.015))continue;ctx.strokeStyle=i%5===0?CREAM:color;ctx.lineWidth=d.range(`weight:${i}`,2,7);line(ctx,x,y,x,y+len*(1+audio.high*.3));}
    }else if(d.mode===1){
      const r=region(p);ctx.translate(r.x,r.y);ctx.rotate(d.sign('lean')*.5);for(let i=0;i<n;i++){const x=(i/n-.5)*r.r*2.1,y=Math.sin(m+i*.25)*r.r*.12;ctx.strokeStyle=i%6===0?CREAM:color;ctx.lineWidth=i%3===0?8:3;line(ctx,x,y-r.r*.7,x,y+r.r*.7);}
    }else if(d.mode===2){
      const r=region(p),rings=d.int('rings',2,4);ctx.translate(r.x,r.y);ctx.rotate(m*.25);
      for(let ring=0;ring<rings;ring++)for(let i=0;i<n;i++){const a=i/n*TAU+(ring%2)*.12,ra=r.r*(.48+ring*.21);ctx.strokeStyle=ring%2?CREAM:color;ctx.lineWidth=3+ring;line(ctx,Math.cos(a)*ra,Math.sin(a)*ra,Math.cos(a)*(ra+r.r*.12),Math.sin(a)*(ra+r.r*.12));}
    }else{
      const rows=d.int('rows',3,5),cols=d.int('cols',7,12),len=w/cols*.43;ctx.lineWidth=4+density*3;
      for(let j=0;j<rows;j++)for(let i=-1;i<=cols;i++){const x=(i+mod(m*.3+j*.3,1))*w/cols,y=h*(j%2?.8+j*.025:.08+j*.035);ctx.strokeStyle=j%3===0?CREAM:color;line(ctx,x,y,x+len,y);}
    }
  }),

  blocks: mark('blocks', p => {
    const {ctx,w,h,s,color,density,design:d,motion:m}=p,right=side(p),slide=.92+Math.sin(m*.7)*.08;ctx.fillStyle=color;
    if(d.mode===0){
      const bw=w*d.range('width',.24,.39),bh=h*d.range('height',.34,.6),x=right?w-bw*slide:-bw*(1-slide),y=h*d.range('top',.08,.28);ctx.fillRect(x,y,bw,bh);ctx.fillStyle=CREAM;ctx.fillRect(right?x-15:x+bw+5,y,10,bh);ctx.fillStyle=INK;ctx.fillRect(x+bw*.2,y+bh*.7,bw*.6,bh*.06);
    }else if(d.mode===1){
      const n=d.int('steps',3,5),bw=w*d.range('width',.26,.4),bh=h*d.range('stepheight',.1,.16);
      for(let i=0;i<n;i++){const width=bw*(1-i*.13),x=right?w-width:0,y=h*.15+i*bh;ctx.fillStyle=[color,CREAM,INK,color,CREAM][i];ctx.fillRect(x+Math.sin(m+i)*s*.012,y,width,bh+1);}
    }else if(d.mode===2){
      const bh=h*d.range('bandheight',.12,.22),travel=Math.sin(m*.4)*w*.1;
      ctx.fillRect(-w*.1+travel,0,w*.83,bh);ctx.fillStyle=CREAM;ctx.fillRect(w*.65+travel,0,w*.45,bh);
      ctx.fillStyle=color;ctx.fillRect(w*.28-travel,h-bh,w*.82,bh);ctx.fillStyle=INK;ctx.fillRect(w*.28-travel,h-bh,w*.14,bh);
    }else{
      const q=Math.min(w*d.range('width',.23,.34),h*d.range('height',.27,.43));
      [[right?w-q:0,h*.12],[right?0:w-q,h-q]].forEach(([x,y],i)=>{ctx.fillStyle=i?CREAM:color;ctx.fillRect(x,y,q,q);ctx.fillStyle=i?color:INK;ctx.fillRect(x+q*.18,y+q*.18,q*.64,q*.2);ctx.fillRect(x+q*.18,y+q*.53,q*.3,q*.28);});
    }
  }),

  rectangles: mark('rectangles', p => {
    const {ctx,w,h,s,color,density,design:d,motion:m}=p,r=region(p),n=d.int('count',4,8);ctx.lineWidth=3;
    if(d.mode===0){
      ctx.translate(r.x,r.y);ctx.rotate(Math.sin(m*.25)*.12);const rw=r.r*1.65,rh=Math.min(h*.72,r.r*2.5);
      for(let i=0;i<n;i++){const f=1-i/(n+1)*.72;ctx.strokeStyle=i===n-2?CREAM:color;ctx.lineWidth=i?2.5:6;rounded(ctx,-rw*f/2+Math.sin(m+i*.3)*6,-rh*f/2,rw*f,rh*f,s*d.range('radius',.02,.06));}
    }else if(d.mode===1){
      const rw=w*d.range('cardwidth',.16,.25),rh=h*d.range('cardheight',.22,.36),nCards=d.int('cards',3,5),base=side(p)?w*.55:w*.02;
      for(let i=0;i<nCards;i++){ctx.save();ctx.translate(base+i*rw*.24,h*.28+i*rh*.22);ctx.rotate((i-(nCards-1)/2)*.18+Math.sin(m)*.06);ctx.strokeStyle=i%2?CREAM:color;ctx.lineWidth=4;rounded(ctx,0,0,rw,rh,s*.035);ctx.restore();}
    }else if(d.mode===2){
      const rw=w*d.range('framewidth',.21,.32),rh=h*d.range('frameheight',.2,.33),off=Math.sin(m*.6)*s*.025;
      [[-rw*.12+off,h*.04],[w-rw*.87,h*.12+off],[-rw*.08,h-rh*.9],[w-rw*.94-off,h-rh*.8]].forEach(([x,y],i)=>{ctx.strokeStyle=i%2?CREAM:color;ctx.lineWidth=5;rounded(ctx,x,y,rw,rh,s*.045);rounded(ctx,x+12,y+12,rw-24,rh-24,s*.025);});
    }else{
      const rw=w*d.range('wide',.66,.84),rh=h*d.range('short',.22,.34);ctx.translate(w*.5,h*.77);ctx.rotate(Math.sin(m*.35)*.07);
      for(let i=0;i<d.int('ribbons',3,6);i++){ctx.strokeStyle=i===1?CREAM:color;ctx.lineWidth=i?2.5:7;rounded(ctx,-rw/2+i*15,-rh/2+i*9,rw-i*30,rh-i*18,s*.09);}
    }
  }),

  discs: mark('discs', p => {
    const {ctx,w,h,s,color,design:d,motion:m,audio}=p,r=region(p);ctx.fillStyle=color;
    if(d.mode===0){
      circle(ctx,r.x,r.y,r.r*.76*(1+audio.peak*.08));ctx.save();ctx.translate(r.x,r.y);ctx.rotate(m*.22);ctx.fillStyle=CREAM;cross(ctx,0,0,r.r*.76,r.r*.12);ctx.restore();ctx.fillStyle=CREAM;circle(ctx,r.x+(side(p)?-1:1)*r.r*.85,r.y+r.r,r.r*.31);
    }else if(d.mode===1){
      const n=d.int('stack',3,5),radius=Math.min(w*.12,h/(n*2.5)),x=w*(side(p)?.85:.15);
      for(let i=0;i<n;i++){ctx.fillStyle=i%2?CREAM:color;circle(ctx,x+Math.sin(m+i*.6)*radius*.25,h*.13+radius+i*radius*1.82,radius*(1-i*.06));ctx.fillStyle=INK;if(i%2===0)circle(ctx,x+Math.sin(m+i*.6)*radius*.25,h*.13+radius+i*radius*1.82,radius*.22);}
    }else if(d.mode===2){
      ctx.translate(r.x,r.y);ctx.rotate(m*.2);const radius=r.r*.95;ctx.fillStyle=color;ctx.beginPath();ctx.arc(-radius*.22,0,radius,-Math.PI/2,Math.PI/2);ctx.closePath();ctx.fill();ctx.fillStyle=CREAM;ctx.beginPath();ctx.arc(radius*.22,0,radius,Math.PI/2,Math.PI*1.5);ctx.closePath();ctx.fill();ctx.fillStyle=INK;ctx.fillRect(-radius*.1,-radius*.72,radius*.2,radius*1.44);
    }else{
      const n=d.int('satellites',5,8),centerX=w*.5,centerY=h*.51;
      for(let i=0;i<n;i++){const a=i/n*TAU+m*.12,x=centerX+Math.cos(a)*w*.42,y=centerY+Math.sin(a)*h*.38,rr=s*d.range(`radius:${i}`,.035,.105);ctx.fillStyle=i%3===0?CREAM:color;circle(ctx,x,y,rr);if(i%2===0){ctx.fillStyle=INK;cross(ctx,x,y,rr*.95,rr*.18);}}
    }
  }),

  geometry: mark('geometry', p => {
    const {ctx,w,h,color,design:d,motion:m}=p,r=region(p);ctx.translate(r.x,r.y);ctx.rotate(Math.sin(m*.22)*.15);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=3;const a=r.r;
    if(d.mode===0){
      const points=[[0,-a],[a*.87,a*.55],[-a*.87,a*.55]],depth=a*d.range('depth',.18,.36),back=points.map(([x,y])=>[x-depth,y+depth]);poly(ctx,points);poly(ctx,back);points.forEach(([x,y],i)=>line(ctx,x,y,...back[i]));ctx.strokeStyle=CREAM;poly(ctx,points.map(([x,y])=>[x*.44,y*.44]));
    }else if(d.mode===1){
      const front=[[-a*.65,-a*.55],[a*.55,-a*.55],[a*.55,a*.65],[-a*.65,a*.65]],dx=a*.38,dy=-a*.35,back=front.map(([x,y])=>[x+dx,y+dy]);ctx.fillStyle=CREAM;poly(ctx,[front[0],back[0],back[1],front[1]],true);ctx.fillStyle=color;poly(ctx,[front[1],back[1],back[2],front[2]],true);ctx.strokeStyle=color;poly(ctx,front);poly(ctx,back);front.forEach(([x,y],i)=>line(ctx,x,y,...back[i]));
    }else if(d.mode===2){
      ctx.fillStyle=color;poly(ctx,[[-a*.88,a*.65],[a*.75,a*.65],[a*.48,-a*.55]],true);ctx.fillStyle=CREAM;circle(ctx,-a*.4,-a*.54,a*.37);ctx.strokeStyle=INK;ctx.lineWidth=5;line(ctx,-a*.7,a*.4,a*.55,a*.4);ctx.strokeStyle=CREAM;ctx.lineWidth=2;poly(ctx,[[-a,-a*.2],[a*.25,-a*.2],[a*.25,a*.95],[-a,a*.95]]);
    }else{
      const n=d.int('diamonds',3,5);for(let i=0;i<n;i++){const scale=1-i*.15,x=(i-(n-1)/2)*a*.26;ctx.strokeStyle=i%2?CREAM:color;poly(ctx,[[x,-a*scale],[x+a*.61*scale,0],[x,a*scale],[x-a*.61*scale,0]]);if(i===n-1){ctx.fillStyle=color;poly(ctx,[[x,-a*.22],[x+a*.16,0],[x,a*.22],[x-a*.16,0]],true);}}
    }
  }),

  orbital: mark('orbital', p => {
    const {ctx,w,h,s,color,design:d,motion:m}=p,r=region(p);ctx.strokeStyle=color;ctx.fillStyle=CREAM;ctx.lineWidth=3;
    if(d.mode===0){
      ctx.translate(r.x,r.y);for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(0,0,r.r,r.r*.28,m*.19+i*Math.PI/3,0,TAU);ctx.stroke();}circle(ctx,0,0,r.r*.075);
    }else if(d.mode===1){
      ctx.translate(r.x,r.y);ctx.rotate(d.range('tilt',-.55,.55)+Math.sin(m*.3)*.1);ctx.fillStyle=color;circle(ctx,0,0,r.r*.55);ctx.strokeStyle=CREAM;ctx.lineWidth=4;for(let i=0;i<2;i++){ctx.beginPath();ctx.ellipse(0,0,r.r*(1+i*.15),r.r*(.27+i*.08),0,0,TAU);ctx.stroke();}ctx.fillStyle=INK;circle(ctx,-r.r*.16,-r.r*.15,r.r*.075);
    }else if(d.mode===2){
      const n=d.int('loops',5,9);for(let i=0;i<n;i++){const u=i/(n-1),rx=r.r*(.5+Math.sin(u*Math.PI)*.5);ctx.strokeStyle=i%3===0?CREAM:color;ctx.beginPath();ctx.ellipse(r.x+Math.sin(m*.3+u)*r.r*.16,r.y+(u-.5)*r.r*2,rx,r.r*.19,Math.sin(m*.2)*.08,0,TAU);ctx.stroke();}
    }else{
      ctx.translate(w*.5,h*d.range('infinityy',.69,.82));ctx.rotate(Math.sin(m*.3)*.1);const rw=w*.2,rh=Math.min(h*.17,w*.12);for(let i=0;i<d.int('linked',2,4);i++){ctx.strokeStyle=i===1?CREAM:color;ctx.beginPath();ctx.ellipse(-rw*.7,0,rw+i*8,rh+i*7,-.3,0,TAU);ctx.stroke();ctx.beginPath();ctx.ellipse(rw*.7,0,rw+i*8,rh+i*7,.3,0,TAU);ctx.stroke();}
    }
  }),

  doodles: mark('doodles', p => {
    const {ctx,w,h,s,color,density,design:d,motion:m}=p,right=side(p),x=w*(right?.8:.2),size=Math.min(w*.13,h*.2)*d.range('figureScale',.78,1.18)*(.8+density*.32),base=h*d.range('base',.48,.69);
    if(d.mode===0){
      figure(ctx,x,base,size*1.22,0,m*2.2,color);ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,base+size*1.27,size*.87,size*.14,0,0,TAU);ctx.stroke();
    }else if(d.mode===1){
      const distance=size*.85;figure(ctx,x-distance,base,size*.82,1,m*2.5,color,0);figure(ctx,x+distance,base,size*.82,1,m*2.5,color,Math.PI*.65);ctx.strokeStyle=color;ctx.lineWidth=3;path(ctx,[[x-size*.25,base-size*1.1],[x,base-size*1.43],[x+size*.25,base-size*1.1]]);ctx.stroke();
    }else if(d.mode===2){
      const n=d.int('runners',2,3),baseY=h*.78;ctx.strokeStyle=color;ctx.lineWidth=4;line(ctx,w*.05,baseY+size,w*.95,baseY+size);
      for(let i=0;i<n;i++){const u=mod(i/n+m*.06,1);figure(ctx,w*(.13+u*.74),baseY,size*(.68+i*.12),2,m*3.5,color,i*1.8);}
    }else{
      const step=size*.45,baseX=x-size*.5;ctx.strokeStyle=color;ctx.lineWidth=4;path(ctx,[[baseX-size*.6,base+size],[baseX-size*.6,base+size*.48],[baseX+step,base+size*.48],[baseX+step,base+size*.04],[baseX+step*2.3,base+size*.04]]);ctx.stroke();figure(ctx,x,base,size,3,m*1.3,color);
      ctx.strokeStyle=CREAM;ctx.lineWidth=3;const bx=x+(right?-1:1)*size*1.25,by=base-size*.9+Math.sin(m)*size*.12;path(ctx,[[bx-size*.35,by-size*.13],[bx,by],[bx+size*.35,by-size*.13]]);ctx.stroke();
    }
  }),

  waves: mark('waves', p => {
    const {ctx,w,h,s,color,density,design:d,motion:m,audio}=p,n=d.int('curves',3,6),amplitude=s*d.range('amplitude',.055,.12)*(1+audio.bass*.2);ctx.lineCap='round';
    if(d.mode===0){
      for(let i=0;i<n;i++){ctx.strokeStyle=i===1?CREAM:color;ctx.lineWidth=i?3:7;ctx.beginPath();for(let j=0;j<=60;j++){const x=w*j/60,y=h*.75+i*s*.025+Math.sin(j/60*TAU*d.range('frequency',.8,1.5)+m-i*.25)*amplitude;ctx[j?'lineTo':'moveTo'](x,y);}ctx.stroke();}
    }else if(d.mode===1){
      const base=w*(side(p)?.82:.18);for(let i=0;i<n;i++){ctx.strokeStyle=i%3===0?CREAM:color;ctx.lineWidth=i?3:7;ctx.beginPath();for(let j=0;j<=60;j++){const y=h*j/60,x=base+(i-(n-1)/2)*s*.027+Math.sin(j/60*TAU*d.range('frequency',1,2)+m+i*.25)*amplitude;ctx[j?'lineTo':'moveTo'](x,y);}ctx.stroke();}
    }else if(d.mode===2){
      const x=side(p)?w:0,y=h*d.range('origin',.1,.35),rings=d.int('rings',6,11);for(let i=0;i<rings;i++){ctx.strokeStyle=i%4===0?CREAM:color;ctx.lineWidth=3;ctx.beginPath();const radius=s*(.16+i*.054);for(let j=0;j<=72;j++){const a=j/72*TAU,r=radius+Math.sin(a*3+m+i*.3)*amplitude*.2;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;ctx[j?'lineTo':'moveTo'](px,py);}ctx.closePath();ctx.stroke();}
    }else{
      const base=h*d.range('base',.65,.77),bend=Math.sin(m*.6)*s*.08;for(let i=0;i<n;i++){const y=base+i*s*.023;ctx.strokeStyle=i===n-1?CREAM:color;ctx.lineWidth=i===0?8:3;ctx.beginPath();ctx.moveTo(-w*.03,y);ctx.bezierCurveTo(w*.15,y-s*.5+bend,w*.26,y+s*.28,w*.42,y-s*.03);ctx.bezierCurveTo(w*.6,y-s*.39-bend,w*.7,y+s*.35,w*1.03,y-s*.14);ctx.stroke();}
    }
  }),

  starburst: mark('starburst', p => {
    const {ctx,w,h,s,color,density,design:d,motion:m,audio}=p,r=region(p),n=d.int('rays',25,48),radius=r.r*(1+audio.peak*.08);
    if(d.mode===0){
      ctx.translate(r.x,r.y);ctx.rotate(m*.12);ctx.strokeStyle=color;for(let i=0;i<n;i++){const a=i/n*TAU;ctx.lineWidth=i%4===0?5:2.4;line(ctx,Math.cos(a)*radius*.12,Math.sin(a)*radius*.12,Math.cos(a)*radius,Math.sin(a)*radius);}ctx.fillStyle=CREAM;circle(ctx,0,0,radius*.07);
    }else if(d.mode===1){
      ctx.translate(r.x,r.y);ctx.rotate(m*.15);const spikes=d.int('spikes',10,18),points=[];for(let i=0;i<spikes*2;i++){const a=i/(spikes*2)*TAU,rr=radius*(i%2?.68:1);points.push([Math.cos(a)*rr,Math.sin(a)*rr]);}ctx.fillStyle=color;poly(ctx,points,true);ctx.fillStyle=INK;circle(ctx,0,0,radius*.47);ctx.fillStyle=CREAM;cross(ctx,0,0,radius*.49,radius*.095);
    }else if(d.mode===2){
      const x=w*d.range('sunx',.32,.68),y=h*1.02,outer=Math.min(w*.56,h*.5);ctx.strokeStyle=color;
      for(let i=0;i<n;i++){const a=Math.PI+i/(n-1)*Math.PI;ctx.lineWidth=i%3?3:7;line(ctx,x+Math.cos(a)*outer*.18,y+Math.sin(a)*outer*.18,x+Math.cos(a)*outer,y+Math.sin(a)*outer);}ctx.fillStyle=CREAM;circle(ctx,x,y,outer*.13);
    }else{
      const positions=[[w*.13,h*.2,s*.16],[w*.83,h*.34,s*.25],[w*.28,h*.86,s*.105]],pointsCount=d.pick('points',[4,8]);
      positions.slice(0,d.int('stars',2,3)).forEach(([x,y,rr],i)=>{ctx.save();ctx.translate(x,y);ctx.rotate(m*.18*(i%2?1:-1));const pts=[];for(let j=0;j<pointsCount*2;j++){const a=j/(pointsCount*2)*TAU,len=rr*(j%2?.14:1);pts.push([Math.cos(a)*len,Math.sin(a)*len]);}ctx.fillStyle=i%2?CREAM:color;poly(ctx,pts,true);ctx.restore();});
    }
  }),
};
