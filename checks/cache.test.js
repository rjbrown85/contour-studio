import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
const source=await readFile(new URL('../app/sw.js',import.meta.url),'utf8')
function worker({offline=false,installFails=false}={}){
 const handlers={},entries=new Map([['./index.html',new Response('cached page')]]),deleted=[]
 let skipped=false,claimed=false,fetches=0
 const cache={addAll:async()=>{if(installFails)throw Error('offline')},match:async key=>entries.get(typeof key==='string'?key:key.url)?.clone(),put:async(key,value)=>entries.set(typeof key==='string'?key:key.url,value)}
 const self={registration:{scope:'https://example.com/contour/'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{skipped=true},clients:{claim:async()=>{claimed=true}}}
 vm.runInNewContext(source,{self,URL,Response,caches:{open:async()=>cache,keys:async()=>['contour-studio-v5','contour-studio-v6','other-app'],delete:async key=>deleted.push(key)},fetch:async()=>{fetches++;if(offline)throw Error('offline');return new Response('latest page')}})
 return {handlers,entries,deleted,state:()=>({skipped,claimed,fetches}),async lifecycle(name){let done;handlers[name]({waitUntil:p=>done=p});await done},async request(mode='navigate',url='https://example.com/contour/'){let response;handlers.fetch({request:{url,mode,method:'GET'},respondWith:p=>response=p});return await response}}
}
test('online navigation replaces stale cached HTML, including query-string entry links',async()=>{
 const w=worker();assert.equal(await(await w.request('navigate','https://example.com/contour/?open=1')).text(),'latest page');assert.equal(await w.entries.get('./index.html').text(),'latest page');assert.equal(w.state().fetches,1)
})
test('offline navigation restores the saved application shell',async()=>{const w=worker({offline:true});assert.equal(await(await w.request()).text(),'cached page')})
test('worker activates only after successful installation and preserves unrelated caches',async()=>{
 const w=worker();await w.lifecycle('install');assert.equal(w.state().skipped,true);await w.lifecycle('activate');assert.equal(w.state().claimed,true);assert.deepEqual(w.deleted,['contour-studio-v5'])
 const failed=worker({installFails:true});await assert.rejects(failed.lifecycle('install'));assert.equal(failed.state().skipped,false)
})
test('a new asset version cannot receive an older cached script',async()=>{
 const w=worker();w.entries.set('https://example.com/contour/app.js?v=5',new Response('old script'));assert.equal(await(await w.request('cors','https://example.com/contour/app.js?v=6')).text(),'latest page');assert.equal(w.state().fetches,1);assert.equal(await w.request('navigate','https://example.com/another-app/'),undefined)
})
