import test from 'node:test'
import assert from 'node:assert/strict'
import {blank,validateProject,History,fromPoints,toLocal,toWorld,rotateAroundCenter,exportSVG,clone,visibleObjects,editable,recognizeShape,hexToHSV,hsvToHex,cameraRange,hitTest} from '../app/core.js'
const shape=()=>({id:'one',type:'rect',x:20,y:30,w:100,h:80,rotation:0,fill:'#668374',stroke:'#343630',strokeWidth:4,opacity:1})
test('project round trip preserves geometry and style, regenerating IDs',()=>{
  const doc=blank();doc.objects=[shape(),fromPoints([{x:20,y:30},{x:40,y:10},{x:60,y:80}],{stroke:'#343630',strokeWidth:4,opacity:1})]
  const copy=validateProject(JSON.parse(JSON.stringify(doc)))
  assert.equal(copy.objects.length,2)
  copy.objects.forEach((o,i)=>{assert.notEqual(o.id,doc.objects[i].id);assert.deepEqual({...o,id:''},{...doc.objects[i],id:'',layerId:'layer-1',locked:false,...(i===0?{radius:0}:{smooth:true})})})
})
test('history restores an old canvas and objects after New, with redo',()=>{
  const doc=blank();doc.objects.push(shape());const h=new History(doc)
  h.commit({...blank(),width:900,height:1200})
  assert.deepEqual(h.undo(),doc);assert.equal(h.redo().width,900)
  h.undo();const changed=clone(doc);changed.objects[0].x=400;h.commit(changed);assert.equal(h.redo(),null)
})
test('history snapshots cannot be corrupted by later dragging',()=>{
  const doc=blank(),h=new History(doc);doc.objects.push(shape());h.commit(doc);doc.objects[0].x=800;h.commit(doc)
  const restored=h.undo();assert.equal(restored.objects[0].x,20);restored.objects[0].x=999;assert.equal(h.current.objects[0].x,20)
})
test('rotation keeps the center fixed and coordinate conversion is invertible',()=>{
  const o=shape(),c=toWorld({x:50,y:40},o),rotated=rotateAroundCenter(o,138),c2=toWorld({x:50,y:40},rotated)
  assert.ok(Math.hypot(c.x-c2.x,c.y-c2.y)<1e-9)
  const p={x:71,y:59},back=toLocal(toWorld(p,rotated),rotated)
  assert.ok(Math.hypot(p.x-back.x,p.y-back.y)<1e-9)
})
test('freehand horizontal, vertical, and single-point strokes stay finite',()=>{
  for(const points of [[{x:3,y:4}],[{x:0,y:20},{x:100,y:20}],[{x:20,y:0},{x:20,y:100}]]){
    const doc=blank();doc.objects=[fromPoints(points,{stroke:'#343630',strokeWidth:4,opacity:1})]
    const svg=exportSVG(validateProject(doc));assert.ok(!/NaN|Infinity|undefined/.test(svg));assert.match(svg,/<path d="M/)
  }
})
test('SVG contains editable paths and text with safe escaping, no editor handles',()=>{
  const doc=blank();doc.name='<script>&"';doc.objects=[shape(),{...shape(),type:'text',text:'<script>alert("a")</script>',fill:'#343630',stroke:'none'}]
  const svg=exportSVG(doc);assert.match(svg,/&lt;script&gt;/);assert.ok(!svg.includes('<script>'));assert.ok(!svg.includes('data-handle'));assert.match(svg,/<text /)
  assert.ok(!svg.includes('fill="#ffffff"'));assert.ok(exportSVG(doc,true).includes('fill="#ffffff"'))
})
test('project import rejects executable colors, non-finite geometry, bad formats, excessive content',()=>{
  for(const mutate of [d=>d.version=100,d=>d.width=Infinity,d=>d.objects[0].x=NaN,d=>d.objects[0].fill='url(https://evil.example)',d=>d.objects[0].stroke='red" onload="x',d=>d.objects=Array(3001).fill(shape()),d=>d.objects[0].w=-1]){
    const doc=blank();doc.objects=[shape()];mutate(doc);assert.throws(()=>validateProject(doc))
  }
  assert.throws(()=>validateProject(null));assert.throws(()=>validateProject({format:'svg'}))
})
test('import strips unrecognized fields and does not retain executable properties',()=>{
  const doc=blank();doc.objects=[{...shape(),onload:'bad',href:'https://evil.example',id:'" onload="bad'}]
  const safe=validateProject(doc);assert.equal(safe.objects[0].onload,undefined);assert.equal(safe.objects[0].href,undefined);assert.ok(!safe.objects[0].id.includes('"'))
})

test('v1 projects migrate without losing artwork',()=>{
 const old={...blank(),version:1,objects:[shape()]};delete old.layers
 const migrated=validateProject(old);assert.equal(migrated.version,2);assert.equal(migrated.layers.length,1);assert.equal(migrated.objects[0].layerId,'layer-1')
})
test('layers determine visibility, editability and SVG stacking',()=>{
 const doc=blank();doc.layers.push({id:'top',name:'Top & logo',visible:true,locked:true});doc.objects=[{...shape(),id:'top-object',layerId:'top',fill:'#ff0000'},{...shape(),id:'bottom',layerId:'layer-1',fill:'#0000ff'}]
 assert.deepEqual(visibleObjects(doc).map(o=>o.id),['bottom','top-object']);assert.equal(editable(doc,doc.objects[0]),false)
 let svg=exportSVG(doc);assert.ok(svg.indexOf('#0000ff')<svg.indexOf('#ff0000'));assert.match(svg,/Top &amp; logo/)
 doc.layers[1].visible=false;assert.equal(visibleObjects(doc).length,1);assert.ok(!exportSVG(doc).includes('#ff0000'))
 doc.objects[1].locked=true;assert.equal(editable(doc,doc.objects[1]),false)
})
test('curve geometry, pencil style and branding survive project round trip',()=>{
 const doc=blank();doc.brandColors=['#123456'];doc.objects=[{...shape(),type:'curve',controls:[[.25,-.5],[.75,1.5]]},{...shape(),type:'text',text:'Brand',font:'serif',bold:true,italic:true,tracking:3},fromPoints([{x:0,y:0},{x:50,y:30}],{stroke:'#123456',strokeWidth:2,opacity:1,smooth:false})]
 const copy=validateProject(doc);assert.deepEqual(copy.brandColors,doc.brandColors);assert.deepEqual(copy.objects[0].controls,doc.objects[0].controls);assert.equal(copy.objects[1].tracking,3);assert.equal(copy.objects[2].smooth,false);assert.match(exportSVG(copy),/M0 0L50 30/)
 doc.layers.push({...doc.layers[0]});assert.throws(()=>validateProject(doc))
})
test('shape recognition tidies lines and closed shapes but preserves doodles',()=>{
 const line=Array.from({length:20},(_,i)=>({x:i*10,y:100+Math.sin(i)}));assert.equal(recognizeShape(line,{}).type,'line')
 const box=[{x:0,y:0},{x:100,y:0},{x:100,y:80},{x:0,y:80},{x:0,y:0}];assert.equal(recognizeShape(box,{}).type,'rect')
 const circle=Array.from({length:49},(_,i)=>({x:100+60*Math.cos(i*Math.PI/24),y:100+40*Math.sin(i*Math.PI/24)}));assert.equal(recognizeShape(circle,{}).type,'ellipse')
 assert.equal(recognizeShape([{x:0,y:0},{x:100,y:100},{x:0,y:100},{x:100,y:0}],{}),null)
})
test('colour conversion preserves custom HEX and camera limits keep the page reachable',()=>{
 for(const hex of ['#ffffff','#000000','#2563eb','#14b8a6','#9333ea']){const {h,s,v}=hexToHSV(hex);assert.equal(hsvToHex(h,s,v),hex)}
 const fitted=cameraRange(900,1000,1);assert.equal(fitted.min,fitted.max)
 const zoomed=cameraRange(900,600,2);assert.ok(zoomed.min<0);assert.ok(zoomed.max+600/2>=900)
})
test('eraser distinguishes an empty shape interior from its edge after rotation',()=>{
 const o={...shape(),fill:'none',rotation:30};assert.equal(hitTest(o,toWorld({x:50,y:40},o),2),false);assert.equal(hitTest(o,toWorld({x:0,y:40},o),2),true)
})
