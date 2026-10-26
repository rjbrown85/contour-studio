import {blank,clone,clamp,uid,toLocal,toWorld,rotateAroundCenter,fromPoints,objectSVG,exportSVG,validateProject,History,esc,FONTS,layerFor,editable,visibleObjects,bounds,snap,cameraRange,hexToHSV,hsvToHex,hitTest,recognizeShape} from './core.js?v=4'

const $=s=>document.querySelector(s)
const stage=$('#stage'), wrap=$('#stage-wrap'), art=$('#objects'), overlay=$('#overlay')
const testMode=['127.0.0.1','localhost'].includes(location.hostname)&&new URLSearchParams(location.search).has('test')
const STORAGE='contour-studio.document.v1'+(testMode?'.test':''), PREFS='contour-studio.preferences.v1'+(testMode?'.test':'')
let doc=blank(), startupError=''
try {const saved=localStorage.getItem(STORAGE);if(saved)doc=validateProject(JSON.parse(saved))}
catch {startupError='The saved drawing could not be opened. Save a project file regularly for a backup.'}
let prefs={theme:'dark',pencilOnly:false,grid:false,gridSpacing:40,snapGrid:false,snapShapes:false,holdShapes:false,curveStyle:'arc'}
try{prefs={...prefs,...JSON.parse(localStorage.getItem(PREFS)||'{}')}}catch{}
document.documentElement.dataset.theme=prefs.theme==='light'?'light':'dark'
let history=new History(doc),selected=null,tool='draw',ink='#343630',width=4,filled=false,opacity=1
let autoFit=true,fillInk='#668374',paintTarget='stroke',wheelHSV=hexToHSV(ink),holdTimer,recognizedOriginal=null,editingLayer=null
let camera={x:0,y:0,z:1},gesture=null,pointers=new Map(),pinch=null,waitForLift=false,raf=0,saveTimer,toastTimer,textTarget=null
const hints={pencil:'Pencil keeps your hand-drawn line. Snap shapes can tidy it.',erase:'Drag over marks to erase whole objects. Locked artwork is protected.',curve:'Drag between endpoints. Select the curve to adjust its control points.',draw:'Draw freely. Use two fingers to move and zoom.',select:'Tap an object. Drag to move, use the corner to resize.',line:'Drag to draw a line.',rect:'Drag to draw a box.',ellipse:'Drag to draw an oval.',text:'Tap the canvas to add text.',hand:'Drag to move the canvas. Pinch to zoom.'}
const getSelected=()=>doc.objects.find(o=>o.id===selected)
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4200)}
function preference(){try{localStorage.setItem(PREFS,JSON.stringify(prefs))}catch{}}
function save(){clearTimeout(saveTimer);try{localStorage.setItem(STORAGE,JSON.stringify(doc));$('#saved').textContent='Saved on this device'}catch{$('#saved').textContent='Not saved · use Save project';toast('Browser storage is full or unavailable. Save a project file to keep your work.')}}
function commit(){if(history.commit(doc)){$('#saved').textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(save,200)}render()}
function render(){
  if(selected&&!visibleObjects(doc).some(o=>o.id===selected))selected=null
  art.innerHTML=visibleObjects(doc).map(o=>objectSVG(o,true)).join('')
  renderGrid();renderLayers()

  $('#paper').setAttribute('width',doc.width);$('#paper').setAttribute('height',doc.height)
  $('#empty').hidden=visibleObjects(doc).length>0||!!gesture||camera.z>1.1
  $('#project-name').textContent=doc.name||'Untitled'
  $('#undo').disabled=!history.past.length;$('#redo').disabled=!history.future.length
  selectionOverlay()
}
function requestRender(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;render()})}
function selectionOverlay(){
  const o=getSelected(),show=o&&tool==='select',canEdit=o&&editable(doc,o)
  $('#selection-actions').hidden=!show
  $('#edit-text').hidden=o?.type!=='text'
  $('#lock-object').textContent=o?.locked?'Unlock':'Lock'
  $('#lock-object').disabled=!!o&&layerFor(doc,o)?.locked
  for(const id of ['edit-text','inspect-object','duplicate','delete'])$('#'+id).disabled=!canEdit

  $('#backward').disabled=!canEdit||doc.objects.filter(item=>item.layerId===o?.layerId).indexOf(o)<=0
  $('#forward').disabled=!canEdit||doc.objects.filter(item=>item.layerId===o?.layerId).at(-1)===o
  if(!show){overlay.innerHTML='';return}
  if(!canEdit){overlay.innerHTML=`<rect transform="translate(${o.x} ${o.y}) rotate(${o.rotation})" width="${o.w}" height="${o.h}" fill="none" stroke="#8b8b83" stroke-dasharray="${5/camera.z}" stroke-width="${1.5/camera.z}" pointer-events="none"/>`;return}
  const s=1/camera.z, r=8*s, handle=toWorld({x:o.w/2,y:-30*s},o)
  const corner=toWorld({x:o.w,y:o.h},o)
  overlay.innerHTML=`<g transform="translate(${o.x} ${o.y}) rotate(${o.rotation})" fill="none" stroke="#5284ba" stroke-width="${1.3*s}"><rect width="${o.w}" height="${o.h}" pointer-events="none"/><path d="M${o.w/2} 0V${-30*s}" pointer-events="none"/></g><circle data-handle="rotate" cx="${handle.x}" cy="${handle.y}" r="${r*1.75}" fill="transparent"/><circle cx="${handle.x}" cy="${handle.y}" r="${r}" fill="white" stroke="#5284ba" stroke-width="${1.5*s}" pointer-events="none"/><circle data-handle="resize" cx="${corner.x}" cy="${corner.y}" r="${r*1.75}" fill="transparent"/><rect x="${corner.x-r}" y="${corner.y-r}" width="${r*2}" height="${r*2}" rx="${2*s}" fill="white" stroke="#5284ba" stroke-width="${1.5*s}" pointer-events="none"/>`
  if(o.type==='curve')o.controls.forEach(([cx,cy],i)=>{
    const p=toWorld({x:cx*o.w,y:cy*o.h},o),a=toWorld({x:i?o.w:0,y:o.h/2},o)
    overlay.innerHTML+=`<path d="M${a.x} ${a.y}L${p.x} ${p.y}" stroke="#bd6b53" stroke-width="${s}" stroke-dasharray="${4*s}" pointer-events="none"/><circle data-handle="control-${i}" cx="${p.x}" cy="${p.y}" r="${16*s}" fill="transparent"/><circle cx="${p.x}" cy="${p.y}" r="${8*s}" fill="#fceda3" stroke="#bd6b53" stroke-width="${1.5*s}" pointer-events="none"/>`
  })
}
function updateCamera(){
  const xr=cameraRange(doc.width,wrap.clientWidth,camera.z,48),yr=cameraRange(doc.height,wrap.clientHeight,camera.z,36)
  camera.x=clamp(camera.x,xr.min,xr.max);camera.y=clamp(camera.y,yr.min,yr.max)

  stage.setAttribute('viewBox',`${camera.x} ${camera.y} ${wrap.clientWidth/camera.z} ${wrap.clientHeight/camera.z}`)
  $('#zoom-label').textContent=`${Math.round(camera.z*100)}%`
  syncScroll();selectionOverlay()
}
function fit(){autoFit=true;const pad=window.innerWidth<600?30:52;camera.z=Math.max(.02,Math.min((wrap.clientWidth-pad*2)/doc.width,(wrap.clientHeight-48)/doc.height));camera.x=(doc.width-wrap.clientWidth/camera.z)/2;camera.y=(doc.height-wrap.clientHeight/camera.z)/2;updateCamera();render()}
function fitWidth(){autoFit=false;camera.z=Math.max(.02,(wrap.clientWidth-104)/doc.width);camera.x=(doc.width-wrap.clientWidth/camera.z)/2;camera.y=-24/camera.z;updateCamera();render()}

function screen(e){const rect=stage.getBoundingClientRect();return {x:e.clientX-rect.left,y:e.clientY-rect.top}}
function world(p){return {x:camera.x+p.x/camera.z,y:camera.y+p.y/camera.z}}
function zoom(factor,center={x:wrap.clientWidth/2,y:wrap.clientHeight/2}){autoFit=false;const anchor=world(center);camera.z=clamp(camera.z*factor,.05,8);camera.x=anchor.x-center.x/camera.z;camera.y=anchor.y-center.y/camera.z;updateCamera()}
function syncStyle(){
  const o=getSelected()
  if(o){ink=o.type==='text'?o.fill:(o.stroke==='none'?ink:o.stroke);width=o.strokeWidth||width;filled=o.fill!=='none';if(filled)fillInk=o.fill;opacity=o.opacity}
  $('#color').value=ink;$('#weight').value=width;$('#weight-value').textContent=width
  $('#fill').setAttribute('aria-pressed',String(filled));$('#fill-state').textContent=filled?'on':'off'
  $('#opacity').value=opacity*100;$('#opacity-value').textContent=`${Math.round(opacity*100)}%`
  for(const b of document.querySelectorAll('[data-color]'))b.setAttribute('aria-pressed',String(b.dataset.color===ink))
}
function setTool(next){cancelGesture();tool=next;if(next==='pencil')width=2;else if(next==='draw')width=4;stage.dataset.tool=tool;for(const b of document.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===tool));$('#hint').textContent=hints[tool];if(tool!=='select')selected=null;syncStyle();render()}
function setStyle(property,value,final=true){
  if(property==='ink')ink=value
  if(property==='width')width=value
  if(property==='filled')filled=value
  if(property==='opacity')opacity=value
  const o=getSelected()
  if(o&&!editable(doc,o)){toast('Unlock this object or its layer before editing.');syncStyle();return}
  if(o){
    if(property==='ink'){if(o.type==='text')o.fill=ink;else{o.stroke=ink}}
    if(property==='width'&&o.type!=='text')o.strokeWidth=width
    if(property==='filled'&&['rect','ellipse'].includes(o.type))o.fill=filled?fillInk:'none'
    if(property==='opacity')o.opacity=opacity
  }
  syncStyle();if(final)commit();else render()
}
const style=()=>({fill:filled?fillInk:'none',stroke:ink,strokeWidth:width,opacity,layerId:doc.activeLayerId,locked:false})
function choose(id){recognizedOriginal=null;$('#keep-original').hidden=true;selected=id;const o=getSelected();if(o)doc.activeLayerId=o.layerId;syncStyle();render()}
function inside(p){return p.x>=0&&p.y>=0&&p.x<=doc.width&&p.y<=doc.height}
function cancelGesture(){clearTimeout(holdTimer);if(gesture?.before)doc=gesture.before;gesture=null;pinch=null;render()}
function startPinch(){
  clearTimeout(holdTimer);autoFit=false
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
  let p=world(sp);const id=e.target.closest('[data-object]')?.dataset.object,handle=e.target.dataset.handle
  if(tool==='hand'||(prefs.pencilOnly&&e.pointerType==='touch')){autoFit=false;gesture={kind:'pan',pointer:e.pointerId,screen:sp,camera:{...camera}};return}
  if(tool==='select'){
    const o=getSelected()
    if(handle&&o&&editable(doc,o)){gesture={kind:handle,pointer:e.pointerId,before:clone(doc),original:clone(o),start:p};return}
    choose(id||null)
    if(id&&editable(doc,getSelected())){gesture={kind:'move',pointer:e.pointerId,before:clone(doc),original:clone(getSelected()),start:p}}
    return
  }
  if(!inside(p))return
  if(tool==='erase'){gesture={kind:'erase',pointer:e.pointerId,before:clone(doc),last:p};eraseAt(p);return}
  const active=doc.layers.find(l=>l.id===doc.activeLayerId)
  if(!active||active.locked||!active.visible){toast('Choose an unlocked, visible layer to draw.');return}
  if(!['draw','pencil'].includes(tool))p=gridPoint(p)
  recognizedOriginal=null;$('#keep-original').hidden=true
  if(tool==='text'){openText(p);return}
  const before=clone(doc)
  let o
  if(['draw','pencil'].includes(tool))o=fromPoints([p],{...style(),smooth:tool!=='pencil'})
  else if(tool==='curve')o=curveFromEndpoints(p,{x:p.x+1,y:p.y},style())
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
  const g=gesture;let p=world(sp)
  if(g.kind==='pan'){camera.x=g.camera.x-(sp.x-g.screen.x)/camera.z;camera.y=g.camera.y-(sp.y-g.screen.y)/camera.z;updateCamera();return}
  if(g.kind==='erase'){
    const dist=Math.hypot(p.x-g.last.x,p.y-g.last.y),steps=Math.min(300,Math.ceil(dist/(8/camera.z)))
    for(let i=1;i<=steps;i++)eraseAt({x:g.last.x+(p.x-g.last.x)*i/steps,y:g.last.y+(p.y-g.last.y)*i/steps})
    g.last=p;return
  }
  if(g.kind==='draw'){
    const o=doc.objects.find(o=>o.id===g.object)
    if(!o)return
    if(['draw','pencil'].includes(g.tool)){
      const events=e.getCoalescedEvents?.()||[]
      for(const sample of events.length?events:[e]){
        const q=world(screen(sample)),last=g.points[g.points.length-1]
        if(Math.hypot(q.x-last.x,q.y-last.y)>.5/camera.z&&g.points.length<12000)g.points.push(q)
      }
      if(g.recognized){g.recognized=false;recognizedOriginal=null;$('#keep-original').hidden=true}
      const next=fromPoints(g.points,{...style(),smooth:g.tool!=='pencil'});Object.assign(o,next,{id:g.object})
      clearTimeout(holdTimer)
      if(prefs.holdShapes&&g.points.length>3)holdTimer=setTimeout(()=>{if(gesture===g){tidyGesture(g);render()}},650)
    }else if(g.tool==='curve'){p=gridPoint(p);Object.assign(o,curveFromEndpoints(g.start,p,style()),{id:g.object})
    }else{
      p=gridPoint(p);let dx=p.x-g.start.x,dy=p.y-g.start.y
      if(e.shiftKey||$('#constrain').checked){if(g.tool==='line'){const a=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4,dist=Math.hypot(dx,dy);dx=Math.cos(a)*dist;dy=Math.sin(a)*dist}else{const size=Math.max(Math.abs(dx),Math.abs(dy));dx=(dx<0?-1:1)*size;dy=(dy<0?-1:1)*size}}
      o.x=Math.min(g.start.x,g.start.x+dx);o.y=Math.min(g.start.y,g.start.y+dy);o.w=Math.max(.01,Math.abs(dx));o.h=Math.max(.01,Math.abs(dy));o.flip=dx*dy<0
    }
  }else{
    const o=getSelected();if(!o||!editable(doc,o))return
    if(g.kind==='move'){const target=gridPoint({x:g.original.x+p.x-g.start.x,y:g.original.y+p.y-g.start.y});o.x=target.x;o.y=target.y}
    if(g.kind==='resize'){const local=toLocal(gridPoint(p),g.original);o.w=clamp(local.x,1,100000);o.h=clamp(local.y,1,100000);if(e.shiftKey||$('#constrain').checked){const s=Math.max(o.w/g.original.w,o.h/g.original.h);o.w=g.original.w*s;o.h=g.original.h*s}}
    if(g.kind.startsWith('control-')){const local=toLocal(gridPoint(p),o);o.controls[+g.kind.slice(-1)]=[local.x/o.w,local.y/o.h]}
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
  const g=gesture;clearTimeout(holdTimer);gesture=null
  if(cancel){if(g.before)doc=g.before;render();return}
  if(g.kind==='draw'&&['draw','pencil'].includes(g.tool)&&prefs.snapShapes&&!g.recognized)tidyGesture(g)
  if(g.kind==='draw'&&!['draw','pencil'].includes(g.tool)){
    const o=doc.objects.find(o=>o.id===g.object)
    if(o&&Math.hypot(o.w,o.h)<4/camera.z){doc=g.before;render();return}
  }
  if(g.kind==='draw'&&g.tool==='curve'){tool='select';selected=g.object;updateToolButtons();syncStyle()}
  if(g.kind!=='pan')commit();else render()
}
stage.addEventListener('pointerup',e=>endPointer(e))
stage.addEventListener('pointercancel',e=>endPointer(e,true))
stage.addEventListener('lostpointercapture',e=>endPointer(e,true))
stage.addEventListener('contextmenu',e=>e.preventDefault())
stage.addEventListener('wheel',e=>{e.preventDefault();if(gesture)return;if(e.ctrlKey||e.metaKey)zoom(Math.exp(-e.deltaY*.008),screen(e));else{autoFit=false;camera.x+=e.deltaX/camera.z;camera.y+=e.deltaY/camera.z;updateCamera()}},{passive:false})
stage.addEventListener('dblclick',e=>{const id=e.target.closest('[data-object]')?.dataset.object,o=doc.objects.find(o=>o.id===id);if(tool==='select'&&o?.type==='text'&&editable(doc,o)){choose(id);openText(null,o)}})

function openText(position,object){
  if(object&&!editable(doc,object))return
  textTarget={position,object:object?.id};$('#text-heading').textContent=object?'Edit text':'Add text';$('#text-content').value=object?.text||''
  $('#text-font').value=object?.font||'sans';$('#text-size').value=Math.round(object?.h||40);$('#text-bold').checked=!!object?.bold;$('#text-italic').checked=!!object?.italic;$('#text-tracking').value=object?.tracking||0
  $('#text-dialog').showModal();$('#text-content').focus()
}
$('#text-form').addEventListener('submit',e=>{
  e.preventDefault();const text=$('#text-content').value.trim();if(!text)return
  const h=clamp(+$('#text-size').value||40,8,400),font=$('#text-font').value,bold=$('#text-bold').checked,italic=$('#text-italic').checked,tracking=clamp(+$('#text-tracking').value||0,-5,40)
  const measure=document.createElement('canvas').getContext('2d');measure.font=`${italic?'italic ':''}${bold?'bold ':''}${h}px ${FONTS[font]}`
  const w=Math.max(15,measure.measureText(text).width+tracking*Math.max(0,text.length-1)),properties={text,w,h,font,bold,italic,tracking}
  if(textTarget.object){const o=doc.objects.find(o=>o.id===textTarget.object);if(o&&editable(doc,o))Object.assign(o,properties)}
  else{const o={id:uid(),type:'text',x:textTarget.position.x,y:textTarget.position.y,rotation:0,...style(),fill:ink,stroke:'none',strokeWidth:0,...properties};doc.objects.push(o);selected=o.id;tool='select';updateToolButtons()}
  $('#text-dialog').close();syncStyle();commit()
})
$('#cancel-text').onclick=()=>$('#text-dialog').close()
function remove(){if(!getSelected()||!editable(doc,getSelected()))return;doc.objects=doc.objects.filter(o=>o.id!==selected);selected=null;commit()}
function duplicate(){const o=getSelected();if(!o||!editable(doc,o))return;const copy={...clone(o),id:uid(),x:o.x+24,y:o.y+24};doc.objects.splice(doc.objects.indexOf(o)+1,0,copy);selected=copy.id;commit()}
function reorder(delta){const o=getSelected();if(!o||!editable(doc,o))return;const same=doc.objects.filter(item=>item.layerId===o.layerId),target=same[same.indexOf(o)+delta];if(!target)return;const i=doc.objects.indexOf(o),j=doc.objects.indexOf(target);[doc.objects[i],doc.objects[j]]=[doc.objects[j],doc.objects[i]];commit()}

function undo(){cancelGesture();recognizedOriginal=null;$('#keep-original').hidden=true;const oldSize=`${doc.width},${doc.height}`,previous=history.undo();if(previous){doc=previous;selected=null;save();render();if(oldSize!==`${doc.width},${doc.height}`)fit()}}
function redo(){cancelGesture();recognizedOriginal=null;$('#keep-original').hidden=true;const oldSize=`${doc.width},${doc.height}`,next=history.redo();if(next){doc=next;selected=null;save();render();if(oldSize!==`${doc.width},${doc.height}`)fit()}}
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
$('#zoom-in').onclick=()=>zoom(1.25);$('#zoom-out').onclick=()=>zoom(.8);$('#fit').onclick=fit;$('#fit-width').onclick=fitWidth
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
  if(o&&editable(doc,o)&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')o.x-=step;if(e.key==='ArrowRight')o.x+=step;if(e.key==='ArrowUp')o.y-=step;if(e.key==='ArrowDown')o.y+=step;commit();return}
  const shortcut={b:'draw',p:'pencil',e:'erase',c:'curve',v:'select',l:'line',r:'rect',o:'ellipse',t:'text',h:'hand'}[e.key.toLowerCase()]
  if(shortcut){e.preventDefault();setTool(shortcut)}
})
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelGesture();pointers.clear();waitForLift=false;save()}})
window.addEventListener('pagehide',save)
function viewportSize(){document.documentElement.style.setProperty('--app-height',`${Math.round(window.visualViewport?.height||window.innerHeight)}px`)}
viewportSize();window.visualViewport?.addEventListener('resize',viewportSize);window.addEventListener('resize',viewportSize)
new ResizeObserver(()=>{if(!gesture&&!pinch){if(autoFit)fit();else updateCamera()}}).observe(wrap)

function updateToolButtons(){stage.dataset.tool=tool;for(const b of document.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===tool));$('#hint').textContent=hints[tool]}
function gridPoint(p){return prefs.snapGrid?{x:snap(p.x,prefs.gridSpacing),y:snap(p.y,prefs.gridSpacing)}:p}
function renderGrid(){
  const space=[20,40,80].includes(+prefs.gridSpacing)?+prefs.gridSpacing:40
  $('#grid').innerHTML=prefs.grid?`<defs><pattern id="grid-pattern" width="${space}" height="${space}" patternUnits="userSpaceOnUse"><path d="M${space} 0H0V${space}" fill="none" stroke="#a5ada8" stroke-opacity=".4" stroke-width="${.7/camera.z}"/></pattern></defs><rect width="${doc.width}" height="${doc.height}" fill="url(#grid-pattern)"/>`:''
}
function syncScroll(){
  const track=$('#scroll-track'),thumb=$('#scroll-thumb'),range=cameraRange(doc.height,wrap.clientHeight,camera.z,36),available=range.max-range.min
  const ratio=clamp(wrap.clientHeight/(camera.z*doc.height),.04,1),height=Math.max(36,track.clientHeight*ratio),travel=Math.max(0,track.clientHeight-height),fraction=available?(camera.y-range.min)/available:.5
  thumb.style.height=`${Math.min(track.clientHeight,height)}px`;thumb.style.top=`${fraction*travel}px`
  track.setAttribute('aria-valuenow',String(Math.round(fraction*1000)));track.setAttribute('aria-disabled',String(!available));$('#scroll-up').disabled=!available;$('#scroll-down').disabled=!available
}
function scrollCanvas(direction){autoFit=false;camera.y+=direction*wrap.clientHeight*.2/camera.z;updateCamera()}
function curveFromEndpoints(a,b,style){const angle=Math.atan2(b.y-a.y,b.x-a.x),w=Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),h=Math.max(40,w*.5);return {id:uid(),type:'curve',x:a.x+Math.sin(angle)*h/2,y:a.y-Math.cos(angle)*h/2,w,h,rotation:angle*180/Math.PI,...style,fill:'none',controls:prefs.curveStyle==='wave'?[[.25,-.4],[.75,1.4]]:[[.25,-.15],[.75,-.15]]}}
function eraseAt(p){
  const o=visibleObjects(doc).reverse().find(o=>editable(doc,o)&&hitTest(o,p,8/camera.z))
  if(o){doc.objects=doc.objects.filter(item=>item.id!==o.id);if(selected===o.id)selected=null;render()}
}
function tidyGesture(g){
  const index=doc.objects.findIndex(o=>o.id===g.object);if(index<0)return
  const original=clone(doc.objects[index]),shape=recognizeShape(g.points,style())
  if(!shape)return
  doc.objects[index]={...shape,id:g.object};g.recognized=true
  recognizedOriginal={id:g.object,object:original};$('#keep-original').hidden=false
}
function renderLayers(){
  $('#layer-count').textContent=doc.layers.length
  $('#layer-list').innerHTML=[...doc.layers].reverse().map(l=>`<div class="layer-row ${l.id===doc.activeLayerId?'active':''}"><button class="layer-select" data-layer="${esc(l.id)}" data-action="select" aria-label="Select ${esc(l.name)}" aria-pressed="${l.id===doc.activeLayerId}">${esc(l.name)}<small>${doc.objects.filter(o=>o.layerId===l.id).length} objects</small></button><button data-layer="${esc(l.id)}" data-action="visible" aria-label="${l.visible?'Hide':'Show'} ${esc(l.name)}" aria-pressed="${!l.visible}">${l.visible?'◉':'○'}</button><button data-layer="${esc(l.id)}" data-action="lock" aria-label="${l.locked?'Unlock':'Lock'} ${esc(l.name)}" aria-pressed="${l.locked}">${l.locked?'▣':'□'}</button><button data-layer="${esc(l.id)}" data-action="settings" aria-label="Settings for ${esc(l.name)}">•••</button></div>`).join('')
}
function toggleLayers(show=!$('#layers-panel').hidden){$('#layers-panel').hidden=show;$('#layers-toggle').setAttribute('aria-expanded',String(!show));if(!show)renderLayers()}
function inspect(){
  const o=getSelected();if(!o||!editable(doc,o))return
  $('#object-width').value=Math.round(o.w*100)/100;$('#object-height').value=Math.round(o.h*100)/100;$('#object-rotation').value=Math.round(o.rotation);$('#object-radius').value=o.radius||0;$('#object-radius').disabled=o.type!=='rect'
  $('#object-layer').innerHTML=doc.layers.map(l=>`<option value="${esc(l.id)}" ${l.locked||!l.visible?'disabled':''}>${esc(l.name)}</option>`).join('');$('#object-layer').value=o.layerId
  showDialog('#inspect-dialog')
}
function colorCurrent(){const o=getSelected();return paintTarget==='fill'?(o?.fill!=='none'&&o?.fill?o.fill:fillInk):(o?.stroke!=='none'&&o?.stroke?o.stroke:ink)}
function setWheel(hex){wheelHSV=hexToHSV(hex);updateWheel()}
function updateWheel(){
  const angle=wheelHSV.h*Math.PI/180,el=$('#color-wheel'),radius=el.clientWidth/2,hex=hsvToHex(wheelHSV.h,wheelHSV.s,wheelHSV.v)
  $('#wheel-marker').style.left=`${50+Math.cos(angle)*wheelHSV.s*50}%`;$('#wheel-marker').style.top=`${50+Math.sin(angle)*wheelHSV.s*50}%`
  $('#color-value').value=Math.round(wheelHSV.v*100);$('#hex-color').value=hex;$('#apply-color').style.background=hex;$('#apply-color').style.color=wheelHSV.v>.65&&wheelHSV.s<.5?'#343630':'white'
  el.style.filter=`brightness(${Math.max(.15,wheelHSV.v)})`
}
function applyPaint(hex){
  if(!/^#[0-9a-f]{6}$/i.test(hex)){toast('Enter six HEX digits, for example #2563EB.');return false}
  const o=getSelected();if(o&&!editable(doc,o)){toast('Unlock this object or its layer first.');return false}
  if(paintTarget==='fill'){
    if(o&&['path','line','curve'].includes(o.type)){toast('Open lines have no fill. Choose Outline / ink.');return false}
    fillInk=hex;filled=true;if(o)o.fill=hex
  }else{ink=hex;if(o){if(o.type==='text'){o.fill=hex}else{o.stroke=hex;if(!o.strokeWidth)o.strokeWidth=width}}}
  syncStyle();commit();setWheel(hex);return true
}
function palette(){
  const colors=[['Black','#000000'],['White','#ffffff'],['Gray','#808080'],['Navy','#172554'],['Red','#ef4444'],['Orange','#f97316'],['Yellow','#facc15'],['Green','#22c55e'],['Teal','#14b8a6'],['Cyan','#06b6d4'],['Royal blue','#2563eb'],['Purple','#9333ea'],['Pink','#ec4899'],['Brown','#92400e'],['Cream','#fff7df'],['Charcoal','#343630']]
  const button=([name,hex])=>`<button data-paint="${hex}" style="--swatch:${hex}" aria-label="${esc(name)} ${hex}" title="${esc(name)} ${hex}"></button>`
  $('#common-colors').innerHTML=colors.map(button).join('');$('#brand-colors').innerHTML=doc.brandColors.map(hex=>button(['Brand',hex])).join('');$('#brand-empty').hidden=doc.brandColors.length>0
}
function initializeExtras(){
  if(![20,40,80].includes(+prefs.gridSpacing))prefs.gridSpacing=40
  const scrollTrack=$('#scroll-track');let scrolling=false,grabOffset=0
  const moveScroll=e=>{if(scrollTrack.getAttribute('aria-disabled')==='true')return;const box=scrollTrack.getBoundingClientRect(),thumb=$('#scroll-thumb'),height=thumb.getBoundingClientRect().height,travel=box.height-height,range=cameraRange(doc.height,wrap.clientHeight,camera.z,36);autoFit=false;camera.y=range.min+clamp((e.clientY-box.top-grabOffset)/Math.max(1,travel),0,1)*(range.max-range.min);updateCamera()}
  scrollTrack.onpointerdown=e=>{e.preventDefault();const t=$('#scroll-thumb').getBoundingClientRect();grabOffset=e.clientY>=t.top&&e.clientY<=t.bottom?e.clientY-t.top:t.height/2;scrolling=true;scrollTrack.setPointerCapture(e.pointerId);moveScroll(e)}
  scrollTrack.onpointermove=e=>{if(scrolling)moveScroll(e)};scrollTrack.onpointerup=scrollTrack.onpointercancel=()=>{scrolling=false}
  scrollTrack.onkeydown=e=>{if(['ArrowDown','ArrowUp','PageDown','PageUp'].includes(e.key)){e.preventDefault();e.stopPropagation();scrollCanvas(e.key.endsWith('Down')?1:-1)}}
  $('#scroll-up').onclick=()=>scrollCanvas(-1);$('#scroll-down').onclick=()=>scrollCanvas(1)
  $('#grid-toggle').onclick=()=>{prefs.grid=!prefs.grid;syncExtras();preference();renderGrid()}
  $('#snap-shapes').onclick=()=>{prefs.snapShapes=!prefs.snapShapes;syncExtras();preference()}
  $('#grid-visible').onchange=e=>{prefs.grid=e.target.checked;syncExtras();preference();renderGrid()}
  $('#grid-spacing').onchange=e=>{prefs.gridSpacing=+e.target.value;preference();renderGrid()}
  $('#snap-grid').onchange=e=>{prefs.snapGrid=e.target.checked;preference()}
  $('#hold-shapes').onchange=e=>{prefs.holdShapes=e.target.checked;preference()}
  $('#curve-style').onchange=e=>{prefs.curveStyle=e.target.value;preference()}
  $('#keep-original').onclick=()=>{if(recognizedOriginal){const i=doc.objects.findIndex(o=>o.id===recognizedOriginal.id);if(i>=0&&editable(doc,doc.objects[i])){doc.objects[i]=recognizedOriginal.object;commit()}}recognizedOriginal=null;$('#keep-original').hidden=true}
  $('#layers-toggle').onclick=()=>toggleLayers();$('#close-layers').onclick=()=>toggleLayers(true)
  $('#add-layer').onclick=()=>{if(doc.layers.length>=100){toast('This project has reached 100 layers.');return}const l={id:uid(),name:`Layer ${doc.layers.length+1}`,visible:true,locked:false};doc.layers.push(l);doc.activeLayerId=l.id;selected=null;commit()}
  $('#layer-list').onclick=e=>{
    const b=e.target.closest('[data-layer]');if(!b)return;const l=doc.layers.find(l=>l.id===b.dataset.layer);if(!l)return
    if(b.dataset.action==='select'){doc.activeLayerId=l.id;selected=null;commit()}
    if(b.dataset.action==='visible'){l.visible=!l.visible;selected=null;commit()}
    if(b.dataset.action==='lock'){l.locked=!l.locked;commit()}
    if(b.dataset.action==='settings'){
      editingLayer=l.id;$('#layer-name').value=l.name;$('#layer-back').disabled=l.locked||doc.layers.indexOf(l)===0;$('#layer-front').disabled=l.locked||doc.layers.indexOf(l)===doc.layers.length-1;$('#delete-layer').disabled=doc.layers.length===1||l.locked||doc.objects.some(o=>o.layerId===l.id&&o.locked);showDialog('#layer-dialog')
    }
  }
  $('#cancel-layer').onclick=()=>$('#layer-dialog').close()
  $('#layer-form').onsubmit=e=>{e.preventDefault();const l=doc.layers.find(l=>l.id===editingLayer);if(l)l.name=$('#layer-name').value.trim()||'Layer';commit();$('#layer-dialog').close()}
  const moveLayer=delta=>{const i=doc.layers.findIndex(l=>l.id===editingLayer),to=i+delta;if(i<0||to<0||to>=doc.layers.length||doc.layers[i].locked)return;const [l]=doc.layers.splice(i,1);doc.layers.splice(to,0,l);commit();$('#layer-dialog').close()}
  $('#layer-back').onclick=()=>moveLayer(-1);$('#layer-front').onclick=()=>moveLayer(1)
  $('#delete-layer').onclick=()=>{const l=doc.layers.find(l=>l.id===editingLayer);if(!l||l.locked||doc.layers.length===1||doc.objects.some(o=>o.layerId===l.id&&o.locked))return;doc.objects=doc.objects.filter(o=>o.layerId!==l.id);doc.layers=doc.layers.filter(item=>item.id!==l.id);doc.activeLayerId=doc.layers.at(-1).id;selected=null;commit();$('#layer-dialog').close()}
  $('#lock-object').onclick=()=>{const o=getSelected();if(!o||layerFor(doc,o)?.locked)return;o.locked=!o.locked;commit()}
  $('#inspect-object').onclick=inspect
  $('#apply-object').onclick=()=>{
    const o=getSelected();if(!o||!editable(doc,o))return
    const w=+$('#object-width').value,h=+$('#object-height').value,r=+$('#object-rotation').value,radius=+$('#object-radius').value
    if(![w,h,r,radius].every(Number.isFinite)||w<1||h<1||w>100000||h>100000){toast('Enter valid dimensions greater than zero.');return}
    o.w=w;o.h=h;Object.assign(o,rotateAroundCenter(o,clamp(r,-360,360)));if(o.type==='rect')o.radius=clamp(radius,0,500);commit();$('#inspect-dialog').close()
  }
  for(const b of document.querySelectorAll('[data-align]'))b.onclick=()=>{const o=getSelected();if(!o||!editable(doc,o))return;const box=bounds(o),a=b.dataset.align;if(a==='left')o.x-=box.left;if(a==='center')o.x+=doc.width/2-(box.left+box.right)/2;if(a==='right')o.x+=doc.width-box.right;if(a==='top')o.y-=box.top;if(a==='middle')o.y+=doc.height/2-(box.top+box.bottom)/2;if(a==='bottom')o.y+=doc.height-box.bottom;commit()}
  $('#move-layer').onclick=()=>{const o=getSelected(),l=doc.layers.find(l=>l.id===$('#object-layer').value);if(!o||!editable(doc,o)||!l||l.locked||!l.visible)return;o.layerId=l.id;doc.activeLayerId=l.id;commit();$('#inspect-dialog').close()}
  $('#colors').onclick=()=>{paintTarget=getSelected()?.type==='text'?'fill':'stroke';showDialog('#colors-dialog');palette();syncColorTarget();setWheel(colorCurrent())}
  for(const target of ['stroke','fill'])$('#target-'+target).onclick=()=>{paintTarget=target;syncColorTarget();setWheel(colorCurrent())}
  $('#color-value').oninput=e=>{wheelHSV.v=+e.target.value/100;updateWheel()}
  let wheelDragging=false
  const pick=e=>{const rect=$('#color-wheel').getBoundingClientRect(),dx=e.clientX-rect.left-rect.width/2,dy=e.clientY-rect.top-rect.height/2;wheelHSV.h=(Math.atan2(dy,dx)*180/Math.PI+360)%360;wheelHSV.s=clamp(Math.hypot(dx,dy)/(rect.width/2),0,1);updateWheel()}
  $('#color-wheel').onpointerdown=e=>{e.preventDefault();wheelDragging=true;$('#color-wheel').setPointerCapture(e.pointerId);pick(e)}
  $('#color-wheel').onpointermove=e=>{if(wheelDragging)pick(e)};$('#color-wheel').onpointerup=$('#color-wheel').onpointercancel=()=>wheelDragging=false
  $('#hex-color').oninput=e=>{let hex=e.target.value.trim();if(!hex.startsWith('#'))hex='#'+hex;if(/^#[0-9a-f]{6}$/i.test(hex)){wheelHSV=hexToHSV(hex);$('#apply-color').style.background=hex}}
  $('#apply-color').onclick=()=>{let hex=$('#hex-color').value.trim();if(!hex.startsWith('#'))hex='#'+hex;applyPaint(hex.toLowerCase())}
  for(const id of ['common-colors','brand-colors'])$('#'+id).onclick=e=>{const b=e.target.closest('[data-paint]');if(b)applyPaint(b.dataset.paint)}
  $('#save-brand-color').onclick=()=>{let hex=$('#hex-color').value.trim().toLowerCase();if(!hex.startsWith('#'))hex='#'+hex;if(!/^#[0-9a-f]{6}$/.test(hex)){toast('Enter a valid HEX colour first.');return}if(!doc.brandColors.includes(hex)&&doc.brandColors.length<24){doc.brandColors.push(hex);commit();palette()}else toast(doc.brandColors.includes(hex)?'That colour is already saved.':'Your palette holds up to 24 colours.')}
  $('#no-paint').onclick=()=>{
    const o=getSelected();if(o&&!editable(doc,o))return
    if(paintTarget==='fill'){if(o?.type==='text'){toast('Text needs a fill colour.');return}filled=false;if(o){o.fill='none';if(o.stroke==='none'){o.stroke=ink;o.strokeWidth=width}}}
    else{if(!o||['path','curve','line','text'].includes(o.type)){toast('Choose a box or oval to remove its outline.');return}o.stroke='none';if(o.fill==='none')o.fill=fillInk}
    syncStyle();commit()
  }
  syncExtras()
}
function syncColorTarget(){$('#target-stroke').setAttribute('aria-pressed',String(paintTarget==='stroke'));$('#target-fill').setAttribute('aria-pressed',String(paintTarget==='fill'));$('#no-paint').textContent=paintTarget==='stroke'?'No outline':'No fill'}
function syncExtras(){$('#grid-toggle').setAttribute('aria-pressed',String(!!prefs.grid));$('#snap-shapes').setAttribute('aria-pressed',String(!!prefs.snapShapes));$('#grid-visible').checked=!!prefs.grid;$('#grid-spacing').value=prefs.gridSpacing;$('#snap-grid').checked=!!prefs.snapGrid;$('#hold-shapes').checked=!!prefs.holdShapes;$('#curve-style').value=prefs.curveStyle}
initializeExtras();render();syncStyle();fit()
if(startupError)toast(startupError)
if('serviceWorker'in navigator&&location.hostname!=='127.0.0.1'&&location.hostname!=='localhost')navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{})
