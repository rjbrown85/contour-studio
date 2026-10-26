export const VERSION = 1
export const clone = value => JSON.parse(JSON.stringify(value))
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
export const uid = () => globalThis.crypto?.randomUUID?.() || `s-${Date.now()}-${Math.random().toString(36).slice(2)}`
export const blank = () => ({format:'contour-studio',version:VERSION,name:'Untitled',width:1200,height:900,objects:[]})
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
export function pathData(points,w,h) {
  const p=points.map(([x,y])=>({x:x*w,y:y*h}))
  if(!p.length)return ''
  if(p.length===1)return `M${n(p[0].x)} ${n(p[0].y)}l0.01 0`
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
    case 'path':return `<path d="${pathData(o.points,o.w,o.h)}"/>`
    case 'text':return `<text x="0" y="${n(o.h*.85)}" font-family="Arial, Helvetica, sans-serif" font-size="${n(o.h)}" textLength="${n(o.w)}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${esc(o.text)}</text>`
  }
}
export function objectSVG(o, interactive=false) {
  const transform=`translate(${n(o.x)} ${n(o.y)}) rotate(${n(o.rotation)})`
  const attrs=`fill="${o.fill}" stroke="${o.stroke}" stroke-width="${n(o.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" opacity="${o.opacity}"`
  const hit=interactive && ['path','line'].includes(o.type) ? `<g fill="none" stroke="transparent" stroke-width="${Math.max(o.strokeWidth,16)}" pointer-events="stroke">${geometry(o)}</g>` : ''
  return `<g ${interactive?`data-object="${esc(o.id)}"`:''} transform="${transform}"><g ${attrs}>${geometry(o)}</g>${hit}</g>`
}
export function exportSVG(doc,background=false) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}">\n<title>${esc(doc.name)}</title>\n${background?`<rect width="100%" height="100%" fill="#ffffff"/>\n`:''}${doc.objects.map(o=>objectSVG(o)).join('\n')}\n</svg>`
}
export function validateProject(input) {
  const fail=()=>{throw new Error('This file is not a supported Contour Studio project.')}
  if(!input || input.format!=='contour-studio'||input.version!==1)fail()
  const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max
  if(!finite(input.width,100,6000)||!finite(input.height,100,6000)||typeof input.name!=='string'||input.name.length>100)fail()
  if(!Array.isArray(input.objects)||input.objects.length>3000)fail()
  const color=v=>v==='none'||(typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v))
  let total=0
  const objects=input.objects.map(o=>{
    if(!o||!['rect','ellipse','line','path','text'].includes(o.type))fail()
    for(const key of ['x','y','rotation'])if(!finite(o[key],-100000,100000))fail()
    for(const key of ['w','h'])if(!finite(o[key],.01,100000))fail()
    if(!color(o.fill)||!color(o.stroke)||!finite(o.strokeWidth,0,100)||!finite(o.opacity,0,1))fail()
    const out={id:uid(),type:o.type,x:o.x,y:o.y,w:o.w,h:o.h,rotation:o.rotation,fill:o.fill,stroke:o.stroke,strokeWidth:o.strokeWidth,opacity:o.opacity}
    if(o.type==='path') {
      if(!Array.isArray(o.points)||!o.points.length||(total+=o.points.length)>100000)fail()
      out.points=o.points.map(p=>{if(!Array.isArray(p)||p.length!==2||!p.every(v=>finite(v,-10000,10000)))fail();return [...p]})
    }
    if(o.type==='text'){if(typeof o.text!=='string'||!o.text.trim()||o.text.length>500)fail();out.text=o.text}
    if(o.type==='rect')out.radius=finite(o.radius,0,500)?o.radius:0
    if(o.type==='line')out.flip=!!o.flip
    return out
  })
  return {format:'contour-studio',version:1,name:input.name,width:input.width,height:input.height,objects}
}
export class History {
  constructor(doc){this.past=[];this.future=[];this.current=clone(doc)}
  commit(doc){if(JSON.stringify(doc)===JSON.stringify(this.current))return false;this.past.push(this.current);if(this.past.length>60)this.past.shift();this.current=clone(doc);this.future=[];return true}
  undo(){if(!this.past.length)return null;this.future.push(this.current);this.current=this.past.pop();return clone(this.current)}
  redo(){if(!this.future.length)return null;this.past.push(this.current);this.current=this.future.pop();return clone(this.current)}
}
