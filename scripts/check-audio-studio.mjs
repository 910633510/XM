import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
const base=fileURLToPath(new URL('../audio-studio', import.meta.url));
const elements=new Map(),events={},snapshots=[];let lang='en',owner='guest';const drafts=new Map();
function element(){return {innerHTML:'',textContent:'',hidden:false,open:false,clientWidth:320,classList:{add(){},remove(){},toggle(){}},setAttribute(){},removeAttribute(){},addEventListener(){},querySelector(){return null;},pause(){},load(){},close(){this.open=false;},showModal(){this.open=true;}};}
const doc={activeElement:null,documentElement:{},body:element(),querySelector(selector){if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);},getElementById(){return null;},addEventListener(name,fn){events[name]=fn;},createElement(){return element();},head:{append(){}}};
const requests=[];
const context=vm.createContext({console,document:doc,navigator:{language:'en'},location:{hash:'',origin:'https://www.xmaillc.com',pathname:'/audio-studio/',search:'',href:'https://www.xmaillc.com/audio-studio/'},history:{replaceState(){}},crypto:webcrypto,URL,URLSearchParams,FormData,File,Blob,structuredClone,confirm:()=>true,prompt:()=>null,setTimeout:()=>1,clearTimeout(){},
  t:(en,zh)=>lang==='zh'?zh:en,getLanguage:()=>lang,setLanguage:v=>lang=v,dateLabel:()=> 'Oct 30, 2026',durationLabel:()=> '0:20',
  setDraftOwner:id=>owner=id?`user:${id}`:'guest',readDrafts:()=>drafts.get(owner)||null,saveDrafts:v=>{drafts.set(owner,structuredClone(v));return true;},setCSRFToken(){},onAuthExpired(){},errorMessage:e=>`Readable error (${e.code})`,StudioError:class extends Error{constructor(code,status=0){super(code);this.code=code;this.status=status;}},
  request:async(path,options={})=>{requests.push({path,...options});if(path.includes('/jobs/'))return{id:'job-1',kind:'speech',status:'paused',progress:{stage:'paused'}};if(path==='/speech')return{id:'job-1',kind:'speech',status:'queued'};return{items:[]};},
});context.window={addEventListener(){},scrollTo(){}};
let source=fs.readFileSync(`${base}/js/app.js`,'utf8').replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify('https://www.xmaillc.com/audio-studio/js/app.js')).replace('initialize().catch(showError);','');
source+='\nglobalThis.TEST={state,renderClone,renderVoices,renderCover,renderMusic,renderAssistant,renderCreations,renderAccount,renderJobs,requestID,validMusic,clearAccount,submitJob,refreshData,mergeCloudJobs,restoreJobHints,projectHasActiveJob,pollJob};';
vm.runInContext(source,context);const T=context.TEST;
const voices=JSON.parse(fs.readFileSync(`${base}/voices/catalog.json`)).items;
T.state.catalog=voices;T.state.voices=[{id:'own',name:'Owned voice',language:'en',kind:'user'}];
T.state.session={user:{id:'user-a',name:'Test Creator',email:'test@example.invalid'},csrf_token:'test',entitlements:{speech:true,music:true,assistant:true,full_cover:true,cover_max_seconds:300}};
T.state.config={google_configured:false,billing_enabled:true};T.state.prices=[{id:'p',currency:'usd',unit_amount:99,interval:'month'}];
T.state.creations=[{id:'c1',title:'<img src=x onerror=alert(1)>',kind:'music',language:'en',duration:20,created_at:1,favorite:false,request:{generation_mode:'song',lyrics:'song'}}];
const plan={mode:'dialogue',title:'Two friends',language:'en',roles:[{id:'r1',name:'Alice',voice_id:voices[0].id},{id:'r2',name:'Bob',voice_id:voices[1].id}],segments:[{id:'s1',role_id:'r1',text:'Hello <script>test</script>',speed:1,pitch:0,volume:1},{id:'s2',role_id:'r2',text:'Hello back',speed:1,pitch:0,volume:1}],music:null};
T.state.currentProject={id:'project-1',mode:'dialogue',title:'Two friends',language:'en',prompt:'A short scene',version:1,plan,status:'ready',completed_segment_ids:['s1']};T.state.projects=[T.state.currentProject];
for(const language of ['en','zh']){lang=language;for(const route of ['Clone','Voices','Cover','Music','Assistant','Creations','Account']){const html=T[`render${route}`]();assert(!html.includes('<script>test</script>'));assert(!html.includes('<img src=x'));assert(html.includes('<h1>'));snapshots.push({name:`${language}-${route}`,html});}}
assert.equal(new Set(voices.map(v=>v.id)).size,voices.length);
assert.equal(T.requestID('speech',{text:'a'}),T.requestID('speech',{text:'a'}));assert.notEqual(T.requestID('speech',{text:'a'}),T.requestID('speech',{text:'b'}));
assert(T.validMusic({lyrics:'',style:'Ambient',generation_mode:'instrumental',bpm:90,duration:12}));assert(!T.validMusic({lyrics:'',style:'Pop',generation_mode:'song',bpm:90,duration:12}));
// Exercise the actual document click listener using the action rendered on each
// button. Calling submitJob directly would miss route/action name collisions.
function clickRenderedButton(html,action) {
  const tag=html.match(new RegExp(`<button\\b[^>]*data-action="${action}"[^>]*>`))?.[0];
  assert(tag,`Missing rendered button for ${action}`);
  const target={dataset:{action},disabled:/\sdisabled(?:\s|>)/.test(tag)};
  let prevented=false;
  const result=events.click({target:{closest:selector=>selector==='[data-action]'?target:null},preventDefault(){prevented=true;}});
  if(!target.disabled)assert(prevented,'The action should be handled by the document click listener');
  return result;
}
const originalRequest=context.request;
for(const [mode,action,path] of [['music','generate-music','/music'],['cover','generate-cover','/covers']]) {
  T.state.forms.music={lyrics:'Test lyrics',style:'Acoustic pop',language:'en',bpm:100,duration:20,seed:4,generation_mode:'song'};
  T.state.forms.cover={voice_id:voices[0].id,seconds:30};
  T.state.coverFile=new File(['test audio'],'example.wav',{type:'audio/wav'});
  let finishPost;const before=requests.filter(r=>r.path===path&&r.method==='POST').length;
  context.request=(url,options={})=>{
    if(url===path&&options.method==='POST'){requests.push({path:url,...options});return new Promise(resolve=>finishPost=resolve);}
    if(url===`/jobs/event-${mode}`)return Promise.resolve({id:`event-${mode}`,kind:mode,status:'paused',progress:{stage:'paused'}});
    return originalRequest(url,options);
  };
  const html=mode==='music'?T.renderMusic():T.renderCover();
  const running=clickRenderedButton(html,action);
  assert.equal(requests.filter(r=>r.path===path&&r.method==='POST').length,before+1,`${action} must POST ${path}, not just navigate`);
  assert(T.state.busy.has(mode),`${action} must use the existing ${mode} busy key`);
  const busyHTML=mode==='music'?T.renderMusic():T.renderCover();
  assert(new RegExp(`data-action="${action}"[^>]* disabled`).test(busyHTML));
  await clickRenderedButton(html,action); // A stale, still-enabled button cannot submit twice.
  assert.equal(requests.filter(r=>r.path===path&&r.method==='POST').length,before+1);
  const sent=requests.filter(r=>r.path===path&&r.method==='POST').at(-1);
  if(mode==='music'){assert(sent.body.request_id);assert.equal(sent.body.generation_mode,'song');}
  else {assert(sent.body instanceof FormData);assert(sent.body.get('request_id'));assert.equal(sent.body.get('voice_id'),voices[0].id);assert.equal(sent.body.get('song').name,'example.wav');}
  finishPost({id:`event-${mode}`,kind:mode,status:'queued',progress:{stage:'queued'}});
  await running;assert(!T.state.busy.has(mode));
}
context.request=originalRequest;
const initialProject=T.state.currentProject;
T.state.currentProject=null;T.state.busy.add('project-plan');
const pendingAssistant=T.renderAssistant();
assert(/data-action="save-project"[^>]* disabled/.test(pendingAssistant));
assert(/<select[^>]*id="assistant-language"[^>]* disabled/.test(pendingAssistant));
assert(/data-key="consent"[^>]* disabled/.test(pendingAssistant));
T.state.busy.delete('project-plan');T.state.currentProject=initialProject;
console.log('PASS: rendered music/cover buttons invoke the actual click listener and POST their endpoints; busy keys prevent double submission; initial assistant controls lock during submission.');
T.state.currentProject={...T.state.currentProject,mode:'music',plan:{mode:'music',title:'Song',language:'en',roles:[],segments:[],music:{lyrics:'Words',style:'Pop',bpm:90,duration:17,generation_mode:'song'}}};
const musical=T.renderAssistant();assert(musical.includes('value="17" selected'));snapshots.push({name:'music-project-duration17',html:musical});
await T.submitJob('speech','/speech',{text:'Example',language:'en',voice_id:voices[0].id,speed:1,pitch:0,volume:1});
assert.equal(requests.find(r=>r.path==='/speech').method,'POST');assert(requests.find(r=>r.path==='/speech').body.request_id);
T.state.forms.clone.text='Private account draft';context.setDraftOwner('user-a');T.clearAccount();assert.equal(T.state.session.user,null);assert.equal(T.state.voices.length,0);assert.equal(T.state.creations.length,0);assert.equal(T.state.projects.length,0);assert.notEqual(T.state.forms.clone.text,'Private account draft');assert.equal(drafts.get('user:user-a').forms.clone.text,'Private account draft');
// A fresh browser has no local job IDs: the account endpoint restores both
// runnable and paused tasks, and their project IDs lock the editing controls.
T.state.session={user:{id:'cloud-owner'},entitlements:{speech:true,music:true,assistant:true}};
T.state.config={billing_enabled:false};T.state.jobs.clear();T.state.timers.clear();
const cloudProject={id:'cloud-project',mode:'dialogue',title:'Cloud project',language:'en',prompt:'Cloud brief',version:2,plan,status:'rendering',completed_segment_ids:['s1']};
T.state.currentProject=cloudProject;T.state.projectDirty=false;
const cloudJobs=[{id:'cloud-queued',kind:'project_render',status:'queued',project_id:'cloud-project',created_at:2,progress:{stage:'queued'}},{id:'cloud-paused',kind:'project_render',status:'paused',project_id:'paused-project',created_at:1,progress:{stage:'paused'}},...Array.from({length:15},(_,i)=>({id:'finished-'+i,kind:'music',status:'succeeded',created_at:100+i,result:{creation_id:'c'+i}}))];
context.request=async(path,options={})=>{requests.push({path,...options});if(path==='/jobs')return{items:structuredClone(cloudJobs)};if(path==='/projects')return{items:[cloudProject]};return{items:[]};};
await T.refreshData();assert.equal(T.state.jobs.get('cloud-queued').project_id,'cloud-project');assert.equal(T.state.jobs.get('cloud-paused').status,'paused');assert(T.state.timers.has('cloud-queued'));assert(!T.state.timers.has('cloud-paused'));assert(T.projectHasActiveJob('cloud-project'));assert(T.projectHasActiveJob('paused-project'));
const locked=T.renderAssistant();assert(locked.includes('<fieldset class="plain-fieldset" disabled>'));assert(/data-action="render-project"[^>]* disabled/.test(locked));
T.renderJobs();const jobHTML=elements.get('#jobs-panel').innerHTML;assert(jobHTML.includes('data-id="cloud-queued"'));assert(jobHTML.includes('data-id="cloud-paused"'));assert(jobHTML.indexOf('data-id="cloud-queued"')<jobHTML.indexOf('data-id="finished-14"'));
const postsBefore=requests.filter(r=>r.method==='POST').length;await assert.rejects(T.submitJob('project-render','/projects/cloud-project/render',{version:2},{projectID:'cloud-project'}),e=>e.code==='project_job_active');assert.equal(requests.filter(r=>r.method==='POST').length,postsBefore);
T.state.jobs.get('cloud-queued').request_key='local-request-hint';T.mergeCloudJobs(cloudJobs,'cloud-owner');assert.equal(T.state.jobs.get('cloud-queued').request_key,'local-request-hint');assert.equal(T.state.jobs.get('cloud-paused').status,'paused');
const keysBefore=[...T.state.jobs.keys()];assert.equal(T.mergeCloudJobs([{id:'foreign-job',status:'running'}],'another-owner'),false);assert.deepEqual([...T.state.jobs.keys()],keysBefore);
let finishOldList;context.request=async(path)=>path==='/jobs'?new Promise(resolve=>finishOldList=resolve):{items:[]};const staleList=T.refreshData();T.state.session={user:{id:'new-owner'},entitlements:{}};T.state.jobs.clear();finishOldList({items:[{id:'old-owner-secret-task',status:'running'}]});await staleList;assert.equal(T.state.jobs.size,0);
// Concurrent refresh and resume cannot start a second poll for one task.
T.state.jobs.set('one-poll',{id:'one-poll',kind:'speech',status:'running'});let completePoll,pollRequests=0;context.request=()=>{pollRequests++;return new Promise(resolve=>completePoll=resolve);};
const pollOne=T.pollJob('one-poll'),pollTwo=T.pollJob('one-poll');assert.equal(pollRequests,1);completePoll({id:'one-poll',kind:'speech',status:'paused',progress:{stage:'paused'}});await Promise.all([pollOne,pollTwo]);assert.equal(T.state.polling.size,0);
console.log('PASS: cloud-only job discovery, active-first visibility, paused project locks, duplicate project-submit rejection, local-hint merge, stale-owner list rejection and poll deduplication.');

fs.mkdirSync('/tmp/xm-audio-studio-check',{recursive:true});fs.writeFileSync('/tmp/xm-audio-studio-check/snapshots.json',JSON.stringify(snapshots));
let fetchResult={ok:true,status:200,json:async()=>({ok:true})},fetchOptions,expired=0;
const apiContext=vm.createContext({Headers,FormData,URL,AbortController,setTimeout,clearTimeout,console,t:(en)=>en,fetch:async(url,options)=>{fetchOptions={url,...options};return fetchResult;}});
const apiSource=fs.readFileSync(`${base}/js/api.js`,'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','')+'\nglobalThis.API={request,apiURL,setCSRFToken,onAuthExpired};';
vm.runInContext(apiSource,apiContext);const A=apiContext.API;A.setCSRFToken('csrf-a');await A.request('/speech',{method:'POST',body:{text:'safe'}});assert.equal(fetchOptions.credentials,'include');assert.equal(fetchOptions.headers.get('X-CSRF-Token'),'csrf-a');assert.equal(fetchOptions.url,'https://api-voiceclone.xmaillc.com/web-studio/api/speech');
assert.throws(()=>A.apiURL('https://example.invalid/file.wav'));A.onAuthExpired(()=>expired++);fetchResult={ok:false,status:401,json:async()=>({error_code:'session_expired'})};await assert.rejects(A.request('/voices'));assert.equal(expired,1);
let complete;apiContext.fetch=()=>new Promise(resolve=>complete=resolve);const stale=A.request('/creations');A.setCSRFToken('csrf-b');complete({ok:true,status:200,json:async()=>({items:[{private:true}]})});await assert.rejects(stale,e=>e.code==='WEB_SESSION_CHANGED');
console.log(`PASS: ${snapshots.length} bilingual/workflow HTML renders, 34 unique catalog IDs, XSS escaping, account draft isolation, idempotent submissions, music validation, variable duration, CSRF/cookie/auth-expiry/stale-response contracts.`);
