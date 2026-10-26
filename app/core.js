export const VERSION = 2
export const clone = value => JSON.parse(JSON.stringify(value))
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
export const uid = () => globalThis.crypto?.randomUUID?.() || `s-${Date.now()}-${Math.random().toString(36).slice(2)}`
export const blank = () => ({format:'contour-studio',version:VERSION,name:'Untitled',width:1200,height:900,layers:[{id:'layer-1',name:'Layer 1',visible:true,locked:false}],activeLayerId:'layer-1',brandColors:[],objects:[]})
export const esc = s => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))
const n = v => Number(v.toFixed(3))
export function toLocal(p,o) {
  const a = -o.rotation*Math.PI/180, dx=p.x-o.x, dy=p.y-o.y
  return {x:dx*Math.cos(a)-dy*Math.sin(a),y:dx*Math.sin(a)+dy*Math.cos(a)}
}
export function toWorld(p,o) {
  const a=o.rotation*Math.PI/180
  return {x:o.x+p.x*Math.cos(a)-p.y*Math.sin(a),y:o.y+p.x*Math.sin(a)+p.y*Math.cos(a)}
}
export function rotateAroundCenter(o,angle) {
  const center=toWorld({x:o.w/2,y:o.h/2},o), a=angle*Math.PI/180
  return {...o,rotation:angle,x:center.x-o.w/2*Math.cos(a)+o.h/2*Math.sin(a),y:center.y-o.w/2*Math.sin(a)-o.h/2*Math.cos(a)}
}
// Remove nearby samples, then fit cubic curves through the remaining points.
export function simplify(points, tolerance=1.4) {
  if(points.length<3) return points
  const out=[points[0]]
  for(let i=1;i<points.length-1;i++) {
    const last=out[out.length-1], p=points[i]
    if(Math.hypot(p.x-last.x,p.y-last.y)>=tolerance) out.push(p)
  }
  out.push(points[points.length-1])
  return out
}
export function pathData(points,w,h,smooth=true) {
  const p=points.map(([x,y])=>({x:x*w,y:y*h}))
  if(!p.length)return ''
  if(p.length===1)return `M${n(p[0].x)} ${n(p[0].y)}l0.01 0`
  if(!smooth)return `M${p.map(q=>`${n(q.x)} ${n(q.y)}`).join("L")}`
  let d=`M${n(p[0].x)} ${n(p[0].y)}`
  for(let i=0;i<p.length-1;i++) {
    const a=p[Math.max(0,i-1)],b=p[i],c=p[i+1],e=p[Math.min(p.length-1,i+2)]
    d+=`C${n(b.x+(c.x-a.x)/6)} ${n(b.y+(c.y-a.y)/6)} ${n(c.x-(e.x-b.x)/6)} ${n(c.y-(e.y-b.y)/6)} ${n(c.x)} ${n(c.y)}`
  }
  return d
}
export function fromPoints(points,style) {
  const p=simplify(points), xs=p.map(q=>q.x),ys=p.map(q=>q.y)
  const x=Math.min(...xs), y=Math.min(...ys),w=Math.max(1,Math.max(...xs)-x),h=Math.max(1,Math.max(...ys)-y)
  return {id:uid(),type:'path',x,y,w,h,rotation:0,...style,fill:'none',points:p.map(q=>[(q.x-x)/w,(q.y-y)/h])}
}
export function geometry(o) {
  switch(o.type) {
    case 'rect':return `<rect width="${n(o.w)}" height="${n(o.h)}" rx="${n(Math.min(o.radius||0,o.w/2,o.h/2))}"/>`
    case 'ellipse':return `<ellipse cx="${n(o.w/2)}" cy="${n(o.h/2)}" rx="${n(o.w/2)}" ry="${n(o.h/2)}"/>`
    case 'line':return `<line x1="0" y1="${o.flip? n(o.h):0}" x2="${n(o.w)}" y2="${o.flip?0:n(o.h)}"/>`
    case 'path':return `<path d="${pathData(o.points,o.w,o.h,o.smooth!==false)}"/>`
    case 'curve':return `<path d="M0 ${n(o.h/2)}C${n(o.controls[0][0]*o.w)} ${n(o.controls[0][1]*o.h)} ${n(o.controls[1][0]*o.w)} ${n(o.controls[1][1]*o.h)} ${n(o.w)} ${n(o.h/2)}"/>`
    case 'text':return `<text x="0" y="${n(o.h*.85)}" font-family="${esc(FONTS[o.font]||FONTS.sans)}" font-weight="${o.bold?700:400}" font-style="${o.italic?'italic':'normal'}" letter-spacing="${o.tracking||0}" font-size="${n(o.h)}" textLength="${n(o.w)}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${esc(o.text)}</text>`
  }
}
export function objectSVG(o, interactive=false) {
  const transform=`translate(${n(o.x)} ${n(o.y)}) rotate(${n(o.rotation)})`
  const attrs=`fill="${o.fill}" stroke="${o.stroke}" stroke-width="${n(o.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" opacity="${o.opacity}"`
  const hit=interactive && ['path','line','curve'].includes(o.type) ? `<g fill="none" stroke="transparent" stroke-width="${Math.max(o.strokeWidth,16)}" pointer-events="stroke">${geometry(o)}</g>` : ''
  return `<g ${interactive?`data-object="${esc(o.id)}"`:''} transform="${transform}"><g ${attrs}>${geometry(o)}</g>${hit}</g>`
}
export function exportSVG(doc,background=false) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}">\n<title>${esc(doc.name)}</title>\n${background?`<rect width="100%" height="100%" fill="#ffffff"/>\n`:''}${(doc.layers||[{id:'layer-1',name:'Layer 1',visible:true}]).filter(l=>l.visible).map(l=>`<g id="${esc(l.id)}" data-layer-name="${esc(l.name)}">${doc.objects.filter(o=>(o.layerId||'layer-1')===l.id).map(o=>objectSVG(o)).join('\n')}</g>`).join('\n')}\n</svg>`
}
export function validateProject(input) {
  const fail=()=>{throw new Error('This file is not a supported Contour Studio project.')}
  if(!input || input.format!=='contour-studio'||![1,2].includes(input.version))fail()
  const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max
  if(!finite(input.width,100,6000)||!finite(input.height,100,6000)||typeof input.name!=='string'||input.name.length>100)fail()
  if(!Array.isArray(input.objects)||input.objects.length>3000)fail()
  const color=v=>v==='none'||(typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v))
  const layers=input.version===1?[{id:'layer-1',name:'Layer 1',visible:true,locked:false}]:input.layers
  if(!Array.isArray(layers)||!layers.length||layers.length>100)fail()
  const layerIds=new Set()
  const safeLayers=layers.map(l=>{
    if(!l||typeof l.id!=='string'||!/^[-a-z0-9]{1,80}$/i.test(l.id)||layerIds.has(l.id)||typeof l.name!=='string'||l.name.length>80)fail()
    layerIds.add(l.id)
    return {id:l.id,name:l.name,visible:l.visible!==false,locked:!!l.locked}
  })
  let total=0
  const objects=input.objects.map(o=>{
    if(!o||!['rect','ellipse','line','path','text','curve'].includes(o.type))fail()
    for(const key of ['x','y','rotation'])if(!finite(o[key],-100000,100000))fail()
    for(const key of ['w','h'])if(!finite(o[key],.01,100000))fail()
    if(!color(o.fill)||!color(o.stroke)||!finite(o.strokeWidth,0,100)||!finite(o.opacity,0,1))fail()
    const out={id:uid(),type:o.type,x:o.x,y:o.y,w:o.w,h:o.h,rotation:o.rotation,fill:o.fill,stroke:o.stroke,strokeWidth:o.strokeWidth,opacity:o.opacity}
    out.layerId=input.version===1?'layer-1':(o.layerId||safeLayers[0].id)
    if(!layerIds.has(out.layerId))fail()
    out.locked=!!o.locked
    if(o.type==='curve'){
      if(!Array.isArray(o.controls)||o.controls.length!==2)fail()
      out.controls=o.controls.map(p=>{if(!Array.isArray(p)||p.length!==2||!p.every(v=>finite(v,-10000,10000)))fail();return [...p]})
    }
    if(o.type==='path') {
      out.smooth=o.smooth!==false

      if(!Array.isArray(o.points)||!o.points.length||(total+=o.points.length)>100000)fail()
      out.points=o.points.map(p=>{if(!Array.isArray(p)||p.length!==2||!p.every(v=>finite(v,-10000,10000)))fail();return [...p]})
    }
    if(o.type==='text'){if(typeof o.text!=='string'||!o.text.trim()||o.text.length>500)fail();out.text=o.text;out.font=Object.hasOwn(FONTS,o.font)?o.font:'sans';out.bold=!!o.bold;out.italic=!!o.italic;out.tracking=finite(o.tracking,-5,40)?o.tracking:0}
    if(o.type==='rect')out.radius=finite(o.radius,0,500)?o.radius:0
    if(o.type==='line')out.flip=!!o.flip
    return out
  })
  return {format:'contour-studio',version:2,name:input.name,width:input.width,height:input.height,layers:safeLayers,activeLayerId:layerIds.has(input.activeLayerId)?input.activeLayerId:safeLayers[0].id,brandColors:Array.isArray(input.brandColors)?input.brandColors.filter(c=>color(c)&&c!=='none').slice(0,24):[],objects}
}
export class History {
  constructor(doc){this.past=[];this.future=[];this.current=clone(doc)}
  commit(doc){if(JSON.stringify(doc)===JSON.stringify(this.current))return false;this.past.push(this.current);if(this.past.length>60)this.past.shift();this.current=clone(doc);this.future=[];return true}
  undo(){if(!this.past.length)return null;this.future.push(this.current);this.current=this.past.pop();return clone(this.current)}
  redo(){if(!this.future.length)return null;this.past.push(this.current);this.current=this.future.pop();return clone(this.current)}
}

export const FONTS={sans:'Arial, Helvetica, sans-serif',serif:'Georgia, Times New Roman, serif',humanist:'Verdana, sans-serif',rounded:'Trebuchet MS, sans-serif',mono:'Courier New, monospace'}
export function layerFor(doc,o){return doc.layers.find(l=>l.id===(o.layerId||doc.layers[0].id))}
export function editable(doc,o){const l=layerFor(doc,o);return !!l&&l.visible&&!l.locked&&!o.locked}
export function visibleObjects(doc){return doc.layers.filter(l=>l.visible).flatMap(l=>doc.objects.filter(o=>(o.layerId||doc.layers[0].id)===l.id))}
export function bounds(o){const pts=[{x:0,y:0},{x:o.w,y:0},{x:o.w,y:o.h},{x:0,y:o.h}].map(p=>toWorld(p,o));return {left:Math.min(...pts.map(p=>p.x)),right:Math.max(...pts.map(p=>p.x)),top:Math.min(...pts.map(p=>p.y)),bottom:Math.max(...pts.map(p=>p.y))}}
export function snap(v,spacing){return Math.round(v/spacing)*spacing}
export function cameraRange(size,viewport,zoom,pad=24){const extent=viewport/zoom;if(size<=extent){const center=(size-extent)/2;return {min:center,max:center}}return {min:-pad/zoom,max:size-extent+pad/zoom}}
export function hexToHSV(hex){const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;let h=0;if(delta)h=60*(max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4);return {h:(h+360)%360,s:max?delta/max:0,v:max}}
export function hsvToHex(h,s,v){h=((h%360)+360)%360;const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return '#'+rgb.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('')}
const segmentDistance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)}
export function hitTest(o,worldPoint,tolerance=8){
  const p=toLocal(worldPoint,o),t=tolerance+o.strokeWidth/2
  if(o.type==='text')return p.x>=-t&&p.x<=o.w+t&&p.y>=-t&&p.y<=o.h+t
  if(o.type==='rect'){
    if(p.x< -t||p.x>o.w+t||p.y< -t||p.y>o.h+t)return false
    return o.fill!=='none'||Math.min(Math.abs(p.x),Math.abs(p.x-o.w),Math.abs(p.y),Math.abs(p.y-o.h))<=t
  }
  if(o.type==='ellipse'){const rx=o.w/2,ry=o.h/2,r=Math.hypot((p.x-rx)/rx,(p.y-ry)/ry);return o.fill!=='none'?r<=1+t/Math.min(rx,ry):Math.abs(r-1)<=t/Math.min(rx,ry)}
  let points
  if(o.type==='line')points=[{x:0,y:o.flip?o.h:0},{x:o.w,y:o.flip?0:o.h}]
  if(o.type==='path')points=o.points.map(([x,y])=>({x:x*o.w,y:y*o.h}))
  if(o.type==='curve')points=Array.from({length:65},(_,i)=>{const t=i/64,u=1-t;return {x:3*u*u*t*o.controls[0][0]*o.w+3*u*t*t*o.controls[1][0]*o.w+t*t*t*o.w,y:u*u*u*o.h/2+3*u*u*t*o.controls[0][1]*o.h+3*u*t*t*o.controls[1][1]*o.h+t*t*t*o.h/2}})
  return points.length===1?Math.hypot(p.x-points[0].x,p.y-points[0].y)<=t:points.slice(1).some((b,i)=>segmentDistance(p,points[i],b)<=t)
}
// Conservative recognition: uncertain doodles remain freehand paths.
export function recognizeShape(points,style){
  if(points.length<4)return null
  const a=points[0],b=points.at(-1),dist=Math.hypot(b.x-a.x,b.y-a.y)
  const length=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y),0)
  if(dist>24&&length/dist<1.18&&points.every(p=>segmentDistance(p,a,b)<Math.max(4,dist*.035)))return {id:uid(),type:'line',x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.max(.01,Math.abs(b.x-a.x)),h:Math.max(.01,Math.abs(b.y-a.y)),flip:(b.x-a.x)*(b.y-a.y)<0,rotation:0,...style,fill:'none'}
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y
  if(w<24||h<24||dist>Math.min(w,h)*.28)return null
  const perimeter=2*(w+h)
  const edgeError=points.reduce((s,p)=>s+Math.min(p.x-x,x+w-p.x,p.y-y,y+h-p.y),0)/points.length
  const corners=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].every(([cx,cy])=>points.some(p=>Math.hypot(p.x-cx,p.y-cy)<Math.min(w,h)*.2))
  let type
  if(corners&&edgeError<Math.min(w,h)*.055&&length>perimeter*.75&&length<perimeter*1.3)type='rect'
  else{
    const radial=points.map(p=>Math.hypot((p.x-x-w/2)/(w/2),(p.y-y-h/2)/(h/2)))
    const bins=new Set(points.map(p=>Math.floor((Math.atan2((p.y-y-h/2)/h,(p.x-x-w/2)/w)+Math.PI)*6/Math.PI)))
    if(radial.reduce((s,r)=>s+Math.abs(r-1),0)/radial.length<.13&&bins.size>=10&&length>Math.PI*Math.min(w,h)*.75)type='ellipse'
  }
  return type?{id:uid(),type,x,y,w,h,rotation:0,...style}:null
}

export function selectionPoints(o){
  let points=[]
  if(o.type==='path'){
    const stride=Math.max(1,Math.ceil(o.points.length/256))
    points=o.points.filter((_,i)=>i%stride===0||i===o.points.length-1).map(([x,y])=>({x:x*o.w,y:y*o.h}))
  }else if(o.type==='line')points=[{x:0,y:o.flip?o.h:0},{x:o.w,y:o.flip?0:o.h}]
  else if(o.type==='ellipse')points=Array.from({length:32},(_,i)=>({x:o.w/2*(1+Math.cos(i*Math.PI/16)),y:o.h/2*(1+Math.sin(i*Math.PI/16))}))
  else if(o.type==='curve')points=Array.from({length:49},(_,i)=>{const t=i/48,u=1-t;return {x:3*u*u*t*o.controls[0][0]*o.w+3*u*t*t*o.controls[1][0]*o.w+t*t*t*o.w,y:u*u*u*o.h/2+3*u*u*t*o.controls[0][1]*o.h+3*u*t*t*o.controls[1][1]*o.h+t*t*t*o.h/2}})
  else points=[{x:0,y:0},{x:o.w,y:0},{x:o.w,y:o.h},{x:0,y:o.h}]
  return points.map(p=>toWorld(p,o))
}
export function pointInPolygon(p,polygon){
  let inside=false
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[j],b=polygon[i]
    if(segmentDistance(p,a,b)<1e-6)return true
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside
  }
  return inside
}
export function lassoContains(o,polygon){
  if(polygon.length<3)return false
  const points=selectionPoints(o)
  if(!points.every(p=>pointInPolygon(p,polygon)))return false
  const closed=['rect','ellipse','text'].includes(o.type),edges=closed?[...points,points[0]]:points
  // Test between sampled vertices too, so a long line crossing a concavity is not selected.
  for(let i=1;i<edges.length;i++){
    const a=edges[i-1],b=edges[i],cuts=[0,1],dx=b.x-a.x,dy=b.y-a.y
    for(let j=0;j<polygon.length;j++){
      const c=polygon[j],d=polygon[(j+1)%polygon.length],ex=d.x-c.x,ey=d.y-c.y,den=dx*ey-dy*ex
      if(Math.abs(den)<1e-9)continue
      const t=((c.x-a.x)*ey-(c.y-a.y)*ex)/den,u=((c.x-a.x)*dy-(c.y-a.y)*dx)/den
      if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t)
    }
    cuts.sort((a,b)=>a-b)
    for(let j=1;j<cuts.length;j++){const t=(cuts[j-1]+cuts[j])/2;if(!pointInPolygon({x:a.x+dx*t,y:a.y+dy*t},polygon))return false}
  }
  return true
}
export function selectionBounds(objects){
  const boxes=objects.map(o=>{const p=selectionPoints(o),pad=o.stroke==='none'?0:o.strokeWidth/2;return {left:Math.min(...p.map(q=>q.x))-pad,right:Math.max(...p.map(q=>q.x))+pad,top:Math.min(...p.map(q=>q.y))-pad,bottom:Math.max(...p.map(q=>q.y))+pad}})
  return {left:Math.min(...boxes.map(b=>b.left)),right:Math.max(...boxes.map(b=>b.right)),top:Math.min(...boxes.map(b=>b.top)),bottom:Math.max(...boxes.map(b=>b.bottom))}

}
