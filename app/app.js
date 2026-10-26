import {blank,clone,clamp,uid,toLocal,toWorld,rotateAroundCenter,fromPoints,objectSVG,exportSVG,validateProject,History} from './core.js'

const $=s=>document.querySelector(s)
const stage=$('#stage'), wrap=$('#stage-wrap'), art=$('#objects'), overlay=$('#overlay')
const testMode=['127.0.0.1','localhost'].includes(location.hostname)&&new URLSearchParams(location.search).has('test')
const STORAGE='contour-studio.document.v1'+(testMode?'.test':''), PREFS='contour-studio.preferences.v1'+(testMode?'.test':'')
let doc=blank(), startupError=''
try {const saved=localStorage.getItem(STORAGE);if(saved)doc=validateProject(JSON.parse(saved))}
catch {startupError='The saved drawing could not be opened. Save a project file regularly for a backup.'}
let prefs={theme:'dark',pencilOnly:false}
try{prefs={...prefs,...JSON.parse(localStorage.getItem(PREFS)||'{}')}}catch{}
document.documentElement.dataset.theme=prefs.theme==='light'?'light':'dark'
let history=new History(doc),selected=null,tool='draw',ink='#343630',width=4,filled=false,opacity=1
let camera={x:0,y:0,z:1},gesture=null,pointers=new Map(),pinch=null,waitForLift=false,raf=0,saveTimer,toastTimer,textTarget=null
const hints={draw:'Draw freely. Use two fingers to move and zoom.',select:'Tap an object. Drag to move, use the corner to resize.',line:'Drag to draw a line.',rect:'Drag to draw a box.',ellipse:'Drag to draw an oval.',text:'Tap the canvas to add text.',hand:'Drag to move the canvas. Pinch to zoom.'}
const getSelected=()=>doc.objects.find(o=>o.id===selected)
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4200)}
function preference(){try{localStorage.setItem(PREFS,JSON.stringify(prefs))}catch{}}
function save(){clearTimeout(saveTimer);try{localStorage.setItem(STORAGE,JSON.stringify(doc));$('#saved').textContent='Saved on this device'}catch{$('#saved').textContent='Not saved · use Save project';toast('Browser storage is full or unavailable. Save a project file to keep your work.')}}
function commit(){if(history.commit(doc)){$('#saved').textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(save,200)}render()}
function render(){
  art.innerHTML=doc.objects.map(o=>objectSVG(o,true)).join('')
  $('#paper').setAttribute('width',doc.width);$('#paper').setAttribute('height',doc.height)
  $('#empty').hidden=doc.objects.length>0||!!gesture||camera.z>1.1
  $('#project-name').textContent=doc.name||'Untitled'
  $('#undo').disabled=!history.past.length;$('#redo').disabled=!history.future.length
  selectionOverlay()
}
function requestRender(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;render()})}
function selectionOverlay(){
  const o=getSelected(),show=o&&tool==='select'
  $('#selection-actions').hidden=!show
  $('#edit-text').hidden=o?.type!=='text'
  $('#backward').disabled=doc.objects.indexOf(o)<=0
  $('#forward').disabled=doc.objects.indexOf(o)===doc.objects.length-1
  if(!show){overlay.innerHTML='';return}
  const s=1/camera.z, r=8*s, handle=toWorld({x:o.w/2,y:-30*s},o)
  const corner=toWorld({x:o.w,y:o.h},o)
  overlay.innerHTML=`<g transform="translate(${o.x} ${o.y}) rotate(${o.rotation})" fill="none" stroke="#5284ba" stroke-width="${1.3*s}"><rect width="${o.w}" height="${o.h}" pointer-events="none"/><path d="M${o.w/2} 0V${-30*s}" pointer-events="none"/></g><circle data-handle="rotate" cx="${handle.x}" cy="${handle.y}" r="${r*1.75}" fill="transparent"/><circle cx="${handle.x}" cy="${handle.y}" r="${r}" fill="white" stroke="#5284ba" stroke-width="${1.5*s}" pointer-events="none"/><circle data-handle="resize" cx="${corner.x}" cy="${corner.y}" r="${r*1.75}" fill="transparent"/><rect x="${corner.x-r}" y="${corner.y-r}" width="${r*2}" height="${r*2}" rx="${2*s}" fill="white" stroke="#5284ba" stroke-width="${1.5*s}" pointer-events="none"/>`
}
function updateCamera(){
  stage.setAttribute('viewBox',`${camera.x} ${camera.y} ${wrap.clientWidth/camera.z} ${wrap.clientHeight/camera.z}`)
  $('#zoom-label').textContent=`${Math.round(camera.z*100)}%`
  selectionOverlay()
}
function fit(){const pad=window.innerWidth<600?24:44;camera.z=Math.max(.05,Math.min((wrap.clientWidth-pad*2)/doc.width,(wrap.clientHeight-pad*2)/doc.height));camera.x=(doc.width-wrap.clientWidth/camera.z)/2;camera.y=(doc.height-wrap.clientHeight/camera.z)/2;updateCamera();render()}
function screen(e){const rect=stage.getBoundingClientRect();return {x:e.clientX-rect.left,y:e.clientY-rect.top}}
function world(p){return {x:camera.x+p.x/camera.z,y:camera.y+p.y/camera.z}}
function zoom(factor,center={x:wrap.clientWidth/2,y:wrap.clientHeight/2}){const anchor=world(center);camera.z=clamp(camera.z*factor,.05,8);camera.x=anchor.x-center.x/camera.z;camera.y=anchor.y-center.y/camera.z;updateCamera()}
function syncStyle(){
  const o=getSelected()
  if(o){ink=o.type==='text'?o.fill:(o.stroke==='none'?ink:o.stroke);width=o.strokeWidth||width;filled=o.fill!=='none';opacity=o.opacity}
  $('#color').value=ink;$('#weight').value=width;$('#weight-value').textContent=width
  $('#fill').setAttribute('aria-pressed',String(filled));$('#fill-state').textContent=filled?'on':'off'
  $('#opacity').value=opacity*100;$('#opacity-value').textContent=`${Math.round(opacity*100)}%`
  for(const b of document.querySelectorAll('[data-color]'))b.setAttribute('aria-pressed',String(b.dataset.color===ink))
}
function setTool(next){cancelGesture();tool=next;stage.dataset.tool=tool;for(const b of document.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===tool));$('#hint').textContent=hints[tool];if(tool!=='select')selected=null;render()}
function setStyle(property,value,final=true){
  if(property==='ink')ink=value
  if(property==='width')width=value
  if(property==='filled')filled=value
  if(property==='opacity')opacity=value
  const o=getSelected()
  if(o){
    if(property==='ink'){if(o.type==='text')o.fill=ink;else{o.stroke=ink;if(o.fill!=='none')o.fill=ink}}
    if(property==='width'&&o.type!=='text')o.strokeWidth=width
    if(property==='filled'&&['rect','ellipse'].includes(o.type))o.fill=filled?ink:'none'
    if(property==='opacity')o.opacity=opacity
  }
  syncStyle();if(final)commit();else render()
}
const style=()=>({fill:filled?ink:'none',stroke:ink,strokeWidth:width,opacity})
function choose(id){selected=id;syncStyle();render()}
function inside(p){return p.x>=0&&p.y>=0&&p.x<=doc.width&&p.y<=doc.height}
function cancelGesture(){if(gesture?.before)doc=gesture.before;gesture=null;pinch=null;render()}
function startPinch(){
  if(gesture?.before)doc=gesture.before
  gesture=null;selected=null
  const pts=[...pointers.values()].filter(p=>p.type==='touch')
  if(pts.length<2)return
  const mid={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}
  pinch={distance:Math.max(1,Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)),zoom:camera.z,anchor:world(mid)}
  render()
}
stage.addEventListener('pointerdown',e=>{
  if(e.button!==0)return
  if(e.pointerType==='touch'&&[...pointers.values()].some(p=>p.type==='pen'))return
  e.preventDefault();stage.focus({preventScroll:true})
  const sp=screen(e);pointers.set(e.pointerId,{...sp,type:e.pointerType});stage.setPointerCapture(e.pointerId)
  if(e.pointerType==='pen'&&[...pointers.values()].some(p=>p.type==='touch')){cancelGesture();for(const [id,p]of pointers)if(p.type==='touch')pointers.delete(id);waitForLift=false}
  if(e.pointerType==='touch'&&[...pointers.values()].filter(p=>p.type==='touch').length===2){startPinch();return}
  if(pinch||waitForLift||gesture)return
  const p=world(sp),id=e.target.closest('[data-object]')?.dataset.object,handle=e.target.dataset.handle
  if(tool==='hand'||(prefs.pencilOnly&&e.pointerType==='touch')){gesture={kind:'pan',pointer:e.pointerId,screen:sp,camera:{...camera}};return}
  if(tool==='select'){
    const o=getSelected()
    if(handle&&o){gesture={kind:handle,pointer:e.pointerId,before:clone(doc),original:clone(o),start:p};return}
    choose(id||null)
    if(id){gesture={kind:'move',pointer:e.pointerId,before:clone(doc),original:clone(getSelected()),start:p}}
    return
  }
  if(!inside(p))return
  if(tool==='text'){openText(p);return}
  const before=clone(doc)
  let o
  if(tool==='draw')o=fromPoints([p],style())
  else o={id:uid(),type:tool,x:p.x,y:p.y,w:1,h:1,rotation:0,...style(),...(tool==='line'?{fill:'none'}:{})}
  doc.objects.push(o)
  gesture={kind:'draw',pointer:e.pointerId,before,object:o.id,start:p,points:[p],tool}
  render()
})
stage.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return
  const sp=screen(e);pointers.set(e.pointerId,{...sp,type:e.pointerType})
  if(pinch){
    const pts=[...pointers.values()].filter(p=>p.type==='touch')
    if(pts.length<2)return
    const mid={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2}
    const distance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)
    camera.z=clamp(pinch.zoom*distance/pinch.distance,.05,8)
    camera.x=pinch.anchor.x-mid.x/camera.z;camera.y=pinch.anchor.y-mid.y/camera.z;updateCamera();return
  }
  if(!gesture||gesture.pointer!==e.pointerId)return
  const g=gesture,p=world(sp)
  if(g.kind==='pan'){camera.x=g.camera.x-(sp.x-g.screen.x)/camera.z;camera.y=g.camera.y-(sp.y-g.screen.y)/camera.z;updateCamera();return}
  if(g.kind==='draw'){
    const o=doc.objects.find(o=>o.id===g.object)
    if(!o)return
    if(g.tool==='draw'){
      const events=e.getCoalescedEvents?.()||[]
      for(const sample of events.length?events:[e]){
        const q=world(screen(sample)),last=g.points[g.points.length-1]
        if(Math.hypot(q.x-last.x,q.y-last.y)>.5/camera.z&&g.points.length<12000)g.points.push(q)
      }
      const next=fromPoints(g.points,style());Object.assign(o,next,{id:g.object})
    }else{
      let dx=p.x-g.start.x,dy=p.y-g.start.y
      if(e.shiftKey||$('#constrain').checked){if(g.tool==='line'){const a=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4,dist=Math.hypot(dx,dy);dx=Math.cos(a)*dist;dy=Math.sin(a)*dist}else{const size=Math.max(Math.abs(dx),Math.abs(dy));dx=(dx<0?-1:1)*size;dy=(dy<0?-1:1)*size}}
      o.x=Math.min(g.start.x,g.start.x+dx);o.y=Math.min(g.start.y,g.start.y+dy);o.w=Math.max(.01,Math.abs(dx));o.h=Math.max(.01,Math.abs(dy));o.flip=dx*dy<0
    }
  }else{
    const o=getSelected();if(!o)return
    if(g.kind==='move'){o.x=g.original.x+p.x-g.start.x;o.y=g.original.y+p.y-g.start.y}
    if(g.kind==='resize'){const local=toLocal(p,g.original);o.w=clamp(local.x,1,100000);o.h=clamp(local.y,1,100000);if(e.shiftKey||$('#constrain').checked){const s=Math.max(o.w/g.original.w,o.h/g.original.h);o.w=g.original.w*s;o.h=g.original.h*s}}
    if(g.kind==='rotate'){const center=toWorld({x:g.original.w/2,y:g.original.h/2},g.original);let angle=Math.atan2(p.y-center.y,p.x-center.x)*180/Math.PI+90;if(e.shiftKey)angle=Math.round(angle/15)*15;Object.assign(o,rotateAroundCenter(g.original,angle))}
  }
  requestRender()
})
function endPointer(e,cancel=false){
  if(!pointers.has(e.pointerId))return
  pointers.delete(e.pointerId)
  if(pinch){pinch=null;waitForLift=pointers.size>0;return}
  if(waitForLift){if(!pointers.size)waitForLift=false;return}
  if(!gesture||gesture.pointer!==e.pointerId)return
  const g=gesture;gesture=null
  if(cancel){if(g.before)doc=g.before;render();return}
  if(g.kind==='draw'&&g.tool!=='draw'){
    const o=doc.objects.find(o=>o.id===g.object)
    if(o&&Math.hypot(o.w,o.h)<4/camera.z){doc=g.before;render();return}
  }
  if(g.kind!=='pan')commit();else render()
}
stage.addEventListener('pointerup',e=>endPointer(e))
stage.addEventListener('pointercancel',e=>endPointer(e,true))
stage.addEventListener('lostpointercapture',e=>endPointer(e,true))
stage.addEventListener('contextmenu',e=>e.preventDefault())
stage.addEventListener('wheel',e=>{e.preventDefault();if(gesture)return;if(e.ctrlKey||e.metaKey)zoom(Math.exp(-e.deltaY*.008),screen(e));else{camera.x+=e.deltaX/camera.z;camera.y+=e.deltaY/camera.z;updateCamera()}},{passive:false})
stage.addEventListener('dblclick',e=>{const id=e.target.closest('[data-object]')?.dataset.object,o=doc.objects.find(o=>o.id===id);if(tool==='select'&&o?.type==='text'){choose(id);openText(null,o)}})

function openText(position,object){textTarget={position,object:object?.id};$('#text-heading').textContent=object?'Edit text':'Add text';$('#text-content').value=object?.text||'';$('#text-dialog').showModal();$('#text-content').focus()}
$('#text-form').addEventListener('submit',e=>{
  e.preventDefault();const text=$('#text-content').value.trim();if(!text)return
  const measure=document.createElement('canvas').getContext('2d');measure.font='40px Arial';const w=Math.max(15,measure.measureText(text).width)
  if(textTarget.object){const o=doc.objects.find(o=>o.id===textTarget.object);if(o){o.text=text;o.w=w*(o.h/40)}}
  else{const o={id:uid(),type:'text',x:textTarget.position.x,y:textTarget.position.y,w,h:40,rotation:0,fill:ink,stroke:'none',strokeWidth:0,opacity,text};doc.objects.push(o);selected=o.id;tool='select';stage.dataset.tool=tool;for(const b of document.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===tool));$('#hint').textContent=hints.select}
  $('#text-dialog').close();syncStyle();commit()
})
$('#cancel-text').onclick=()=>$('#text-dialog').close()
function remove(){if(!selected)return;doc.objects=doc.objects.filter(o=>o.id!==selected);selected=null;commit()}
function duplicate(){const o=getSelected();if(!o)return;const copy={...clone(o),id:uid(),x:o.x+24,y:o.y+24};doc.objects.splice(doc.objects.indexOf(o)+1,0,copy);selected=copy.id;commit()}
function reorder(delta){const i=doc.objects.findIndex(o=>o.id===selected),to=i+delta;if(i<0||to<0||to>=doc.objects.length)return;const [o]=doc.objects.splice(i,1);doc.objects.splice(to,0,o);commit()}
function undo(){cancelGesture();const oldSize=`${doc.width},${doc.height}`,previous=history.undo();if(previous){doc=previous;selected=null;save();render();if(oldSize!==`${doc.width},${doc.height}`)fit()}}
function redo(){cancelGesture();const oldSize=`${doc.width},${doc.height}`,next=history.redo();if(next){doc=next;selected=null;save();render();if(oldSize!==`${doc.width},${doc.height}`)fit()}}
for(const b of document.querySelectorAll('[data-tool]'))b.onclick=()=>setTool(b.dataset.tool)
for(const b of document.querySelectorAll('[data-color]'))b.onclick=()=>setStyle('ink',b.dataset.color)
$('#color').oninput=e=>setStyle('ink',e.target.value,false)
$('#color').onchange=()=>commit()
$('#weight').oninput=e=>setStyle('width',+e.target.value,false)
$('#weight').onchange=()=>commit()
$('#opacity').oninput=e=>setStyle('opacity',+e.target.value/100,false)
$('#opacity').onchange=()=>commit()
$('#fill').onclick=()=>setStyle('filled',!filled)
$('#delete').onclick=remove;$('#duplicate').onclick=duplicate
$('#backward').onclick=()=>reorder(-1);$('#forward').onclick=()=>reorder(1)
$('#edit-text').onclick=()=>openText(null,getSelected())
$('#undo').onclick=undo;$('#redo').onclick=redo
$('#zoom-in').onclick=()=>zoom(1.25);$('#zoom-out').onclick=()=>zoom(.8);$('#fit').onclick=fit
$('#pencil-only').checked=!!prefs.pencilOnly
$('#pencil-only').onchange=e=>{prefs.pencilOnly=e.target.checked;preference()}
function themeLabel(){$('#theme').setAttribute('aria-label',`Switch to ${document.documentElement.dataset.theme==='dark'?'light':'dark'} theme`)}
$('#theme').onclick=()=>{prefs.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=prefs.theme;preference();themeLabel()}
themeLabel()
function showDialog(id){cancelGesture();$(id).showModal()}
$('#project').onclick=()=>{$('#name').value=doc.name;showDialog('#project-dialog')}
$('#export').onclick=()=>showDialog('#export-dialog')
$('#options').onclick=()=>showDialog('#options-dialog')
$('#help').onclick=()=>showDialog('#help-dialog')
function applyName(){doc.name=$('#name').value.trim()||'Untitled';$('#name').value=doc.name;commit()}
$('#name').onchange=applyName
$('#project-dialog form').addEventListener('submit',applyName)
$('#project-dialog').addEventListener('cancel',applyName)
$('#new').onclick=()=>{cancelGesture();const [w,h]=$('#canvas-size').value.split(',').map(Number);doc={...blank(),width:w,height:h};selected=null;commit();fit();$('#project-dialog').close();toast('New canvas. Undo will restore your previous drawing.')}
function filename(ext){return (doc.name||'Untitled').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').slice(0,80)+ext}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
$('#save-project').onclick=()=>{if($('#project-dialog').open)applyName();download(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}),filename('.contour.json'));toast('Project download started. Keep it in Files or iCloud Drive.')}
$('#open-project').onclick=()=>$('#file-input').click()
$('#file-input').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return
  try{
    if(file.size>10*1024*1024)throw new Error('Choose a project smaller than 10 MB.')
    const incoming=validateProject(JSON.parse(await file.text()))
    cancelGesture();doc=incoming;selected=null;commit();fit();$('#project-dialog').close();toast('Project opened. Undo restores your previous drawing.')
  }catch(err){toast(err instanceof SyntaxError?'This file is not a valid Contour project.':err.message)}
  e.target.value=''
}
function svgBlob(){return new Blob([exportSVG(doc,$('#background').checked)],{type:'image/svg+xml'})}
$('#download-svg').onclick=()=>{download(svgBlob(),filename('.svg'));toast('SVG download started.')}
$('#share-svg').onclick=async()=>{
  const file=new File([svgBlob()],filename('.svg'),{type:'image/svg+xml'})
  if(!navigator.canShare?.({files:[file]})){download(file,file.name);toast('File sharing is unavailable here. SVG download started.');return}
  try{await navigator.share({files:[file],title:doc.name})}catch(error){if(error.name!=='AbortError')toast('Sharing failed. Use Download SVG instead.')}
}
$('#download-png').onclick=async()=>{
  const button=$('#download-png');button.disabled=true;button.textContent='Preparing PNG…'
  const url=URL.createObjectURL(svgBlob())
  try{
    const image=new Image();image.src=url;await image.decode()
    const canvas=document.createElement('canvas'),scale=Math.min(2,4096/Math.max(doc.width,doc.height));canvas.width=Math.round(doc.width*scale);canvas.height=Math.round(doc.height*scale)
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height)
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('PNG could not be created')
    download(blob,filename('.png'));toast('PNG download started.')
  }catch{toast('PNG export failed. Try SVG instead.')}finally{URL.revokeObjectURL(url);button.disabled=false;button.textContent='Download PNG'}
}
document.addEventListener('keydown',e=>{
  if(document.querySelector('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return
  const command=e.metaKey||e.ctrlKey
  if(command&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return}
  if(command&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return}
  if(command&&e.key.toLowerCase()==='d'){e.preventDefault();duplicate();return}
  if(command&&e.key.toLowerCase()==='s'){e.preventDefault();$('#save-project').click();return}
  if(command)return
  if(e.key==='Escape'){cancelGesture();selected=null;render();return}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();return}
  const o=getSelected(),step=e.shiftKey?10:1
  if(o&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')o.x-=step;if(e.key==='ArrowRight')o.x+=step;if(e.key==='ArrowUp')o.y-=step;if(e.key==='ArrowDown')o.y+=step;commit();return}
  const shortcut={b:'draw',v:'select',l:'line',r:'rect',o:'ellipse',t:'text',h:'hand'}[e.key.toLowerCase()]
  if(shortcut){e.preventDefault();setTool(shortcut)}
})
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelGesture();pointers.clear();waitForLift=false;save()}})
window.addEventListener('pagehide',save)
new ResizeObserver(()=>{if(!gesture&&!pinch)fit()}).observe(wrap)
render();syncStyle();fit()
if(startupError)toast(startupError)
if('serviceWorker'in navigator&&location.hostname!=='127.0.0.1'&&location.hostname!=='localhost')navigator.serviceWorker.register('./sw.js').catch(()=>{})
