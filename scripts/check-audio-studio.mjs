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
source+='\nglobalThis.TEST={state,render,featureAvailable,renderComingSoon,releaseRequestID,voiceStillAvailable,projectNeedsMissingVoice,renderClone,renderVoices,renderVlog,renderDub,renderCover,renderMusic,renderAssistant,renderCreations,renderAccount,renderJobs,requestID,validMusic,clearAccount,submitJob,refreshData,mergeCloudJobs,restoreJobHints,projectHasActiveJob,pollJob};';
vm.runInContext(source,context);const T=context.TEST;
const voices=JSON.parse(fs.readFileSync(`${base}/voices/catalog.json`)).items;
T.state.catalog=voices;T.state.voices=[{id:'own',name:'Owned voice',language:'en',kind:'user'}];
T.state.session={user:{id:'user-a',name:'Test Creator',email:'test@example.invalid'},csrf_token:'test',entitlements:{speech:true,music:true,assistant:true,full_cover:true,cover_max_seconds:300}};
T.state.config={google_configured:false,billing_enabled:true};T.state.prices=[{id:'p',currency:'usd',unit_amount:99,interval:'month'}];
T.state.creations=[{id:'c1',title:'<img src=x onerror=alert(1)>',kind:'music',language:'en',duration:20,created_at:1,favorite:false,request:{generation_mode:'song',lyrics:'song'}},{id:'d1',title:'Dubbed <b>tour</b>',kind:'dub',media:'video',language:'zh',source_language:'en',duration:95,created_at:2,favorite:false,line_count:12,request:{voice_id:'original',target_language:'zh',source_language:'auto',background:'mute'}}];
T.state.config={google_configured:false,billing_enabled:true,dubbing:{max_seconds:600,max_bytes:314572800,translation_configured:true},vlog:{max_seconds:600,max_bytes:314572800,narration_configured:true}};
const plan={mode:'dialogue',title:'Two friends',language:'en',roles:[{id:'r1',name:'Alice',voice_id:voices[0].id},{id:'r2',name:'Bob',voice_id:voices[1].id}],segments:[{id:'s1',role_id:'r1',text:'Hello <script>test</script>',speed:1,pitch:0,volume:1},{id:'s2',role_id:'r2',text:'Hello back',speed:1,pitch:0,volume:1}],music:null};
T.state.currentProject={id:'project-1',mode:'dialogue',title:'Two friends',language:'en',prompt:'A short scene',version:1,plan,status:'ready',completed_segment_ids:['s1']};T.state.projects=[T.state.currentProject];
for(const language of ['en','zh']){lang=language;for(const route of ['Clone','Voices','Vlog','Dub','Cover','Music','Assistant','Creations','Account']){const html=T[`render${route}`]();assert(!html.includes('<script>test</script>'));assert(!html.includes('<img src=x'));assert(html.includes('<h1>'));snapshots.push({name:`${language}-${route}`,html});}}
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
{
  // The dubbing form posts multipart to /dubs with the consent flag, uses the 'dub' busy key and clears the chosen file on success.
  T.state.forms.dub={voice_id:'original',target_language:'zh',source_language:'auto',background:'quiet',title:'Tour',consent:true};
  T.state.dubFile=new File(['video bytes'],'clip.mp4',{type:'video/mp4'});
  let finishDub;const before=requests.filter(r=>r.path==='/dubs').length;
  context.request=(url,options={})=>{if(url==='/dubs'&&options.method==='POST'){requests.push({path:url,...options});return new Promise(resolve=>finishDub=resolve);}if(url==='/jobs/event-dub')return Promise.resolve({id:'event-dub',kind:'dub',status:'paused',progress:{stage:'paused'}});return originalRequest(url,options);};
  const rendered=T.renderDub();assert(rendered.includes('data-key="consent"'));assert(rendered.includes('value="original" selected'));assert(/accept="[^"]*\.mkv/.test(rendered));assert(rendered.includes('600')===false||rendered.includes('10'));
  const running=clickRenderedButton(rendered,'generate-dub');
  assert.equal(requests.filter(r=>r.path==='/dubs').length,before+1,'generate-dub must POST /dubs');assert(T.state.busy.has('dub'));
  assert(/data-action="generate-dub"[^>]* disabled/.test(T.renderDub()));
  const sent=requests.filter(r=>r.path==='/dubs').at(-1);assert(sent.body instanceof FormData);assert(sent.body.get('request_id'));assert.equal(sent.body.get('voice_id'),'original');assert.equal(sent.body.get('target_language'),'zh');assert.equal(sent.body.get('background'),'quiet');assert.equal(sent.body.get('consent'),'true');assert.equal(sent.body.get('video').name,'clip.mp4');assert.equal(sent.body.get('title'),'Tour');
  finishDub({id:'event-dub',kind:'dub',status:'queued',progress:{stage:'queued'}});await running;assert(!T.state.busy.has('dub'));assert.equal(T.state.dubFile,null);
  T.state.forms.dub.consent=false;T.state.dubFile=new File(['video bytes'],'clip.mp4',{type:'video/mp4'});
  const postsBefore=requests.filter(r=>r.path==='/dubs').length;await clickRenderedButton(T.renderDub(),'generate-dub');assert.equal(requests.filter(r=>r.path==='/dubs').length,postsBefore,'no consent means no upload');
  const creationsHTML=T.renderCreations();assert(creationsHTML.includes('data-action="view-transcript"'));assert(creationsHTML.includes('English → 中文'));assert(!creationsHTML.includes('<b>tour</b>'));
  T.renderJobs();const dubJobHTML=elements.get("#jobs-panel").innerHTML;assert(dubJobHTML.includes("data-id=\"event-dub\""));assert(dubJobHTML.includes("data-action=\"resume-job\""));assert(dubJobHTML.includes("Video dubbing")||dubJobHTML.includes("视频配音"));
  console.log('PASS: video dubbing form posts multipart with consent, locks its busy key, requires consent, and dubbed creations render video actions.');
  // Vlog narration: the upload form posts multipart to /vlogs; the review editor saves with the script version and renders with the chosen voice.
  T.state.forms.vlog={genre:'promo',brief:'Sunday <b>walk</b>',style:'travel',style_text:'',language:'en',title:'Walk',consent:true,mode:'auto',engine:'openai',narrator:'sage',narrator_style:'sleepy',voice_id:'',background:40};
  T.state.vlogFile=new File(['video bytes'],'walk.mov',{type:'video/quicktime'});T.state.currentVlogID=null;T.state.vlogDraft=null;
  let finishVlog;const vlogBefore=requests.filter(r=>r.path==='/vlogs').length;
  context.request=(url,options={})=>{if(url==='/vlogs'&&options.method==='POST'){requests.push({path:url,...options});return new Promise(resolve=>finishVlog=resolve);}if(url==='/jobs/event-vlog')return Promise.resolve({id:'event-vlog',kind:'vlog_script',status:'paused',progress:{stage:'paused'}});return originalRequest(url,options);};
  const vlogForm=T.renderVlog();assert(vlogForm.includes('data-action="generate-vlog-script"'));assert(/data-action="vlog-genre" data-id="promo" aria-pressed="true"/.test(vlogForm),'the upload form shows the chosen video type');assert(vlogForm.includes('data-id="auto"'));assert(/data-action="vlog-mode" data-id="auto" aria-pressed="true"/.test(vlogForm));assert(vlogForm.includes('value="sage" selected'));assert(!vlogForm.includes('<b>walk</b>'));
  const vlogRunning=clickRenderedButton(vlogForm,'generate-vlog-script');
  assert.equal(requests.filter(r=>r.path==='/vlogs').length,vlogBefore+1,'generate-vlog-script must POST /vlogs');assert(T.state.busy.has('vlog-script'));
  const vlogSent=requests.filter(r=>r.path==='/vlogs').at(-1);assert(vlogSent.body instanceof FormData);assert.equal(vlogSent.body.get('style'),'travel');assert.equal(vlogSent.body.get('genre'),'promo');assert.equal(vlogSent.body.get('language'),'en');assert.equal(vlogSent.body.get('consent'),'true');assert.equal(vlogSent.body.get('video').name,'walk.mov');assert.equal(vlogSent.body.get('brief'),'Sunday <b>walk</b>');
  finishVlog({id:'event-vlog',kind:'vlog_script',status:'queued',progress:{stage:'queued'}});await vlogRunning;assert(!T.state.busy.has('vlog-script'));assert.equal(T.state.vlogFile,null);
  const vlogJob=T.state.jobs.get('event-vlog');assert(vlogJob.auto,'auto mode must remember the render request on the job');assert.equal(JSON.stringify(vlogJob.render),JSON.stringify({voice:{engine:'openai',voice:'sage',style:'sleepy'},background_volume:0.4}));
  const script={title:'Walk <i>x</i>',language:'en',lines:[{id:'line-1',start:1,end:3.5,text:'Coffee first <script>bad</script>'},{id:'line-2',start:5,end:8,text:'Then the river.'}]};
  const studio={genre:'vlog',requested_genre:'promo',detected_genre:'promo',genre_confidence:'high',genre_mismatch:true,genre_evidence:['2.0s app screen <i>x</i>'],analysis:{subject:'A kettle',product_promise:''},facts:[{id:'F1',start:1,end:3,text:'the kettle <i>y</i>',certainty:'likely'}],approved:false,chosen_round:1,
    pitch:[{draft:1,angle:'problem <i>first</i>',lines:['Pitch one <b>a</b>'],scores:{hook:2,spoken:4},total:6,must:1,note:'flat open',chosen:false},{draft:2,angle:'result first',lines:['Pitch two'],scores:{hook:5,spoken:4},total:9,must:0,note:'',chosen:true}],
    cut_lines:[{text:'Invented <b>cat</b>',problems:['visual claim unsupported: a cat']}],
    rounds:[{round:1,final_check:false,verdict:'revise',reasons:['ungrounded lines: line-2'],claims:3,supported:2,line_problems:[{id:'line-2',text:'So cozy',problems:['picture mismatch: no bakery']}],validation:[{id:'line-2',severity:'must',code:'too_fast',detail:'too fast'},{id:null,severity:'should',code:'too_little_silence',detail:'needs silence'}],editor:{overall:'Line 2 is filler <b>here</b>.',flagged_phrases:['so cozy'],scores:[{criterion:'genre_fit',score:2,note:'diary'},{criterion:'specific',score:5,note:''}],lines:[{id:'line-2',action:'rewrite',note:'say why'}]}},
            {round:2,final_check:true,verdict:'revise',reasons:[],claims:2,supported:1,line_problems:[],validation:[],editor:null}]};
  const vlogFixture={id:'vlog-1',title:'Walk',name:'walk.mov',duration:20,created_at:3,language:'en',style:'travel',brief:'Sunday',script,script_version:3,status:'ready',active_jobs:[],creation_ids:['v-out','v-out2'],studio};T.state.vlogs=[vlogFixture];T.state.creations=[...T.state.creations,{id:'v-out',title:'Walk narrated',kind:'vlog',media:'video',language:'en',duration:20,created_at:5,favorite:false,listening:{available:true,retakes:1,open_problems:3,max_speedup:1.22,sped_up_lines:1,lost_seconds:1.4,lines:[{id:'line-2',heard:'The <b>bakery</b>',kept:'retake',speedup:1.22,problems:[{code:'flat',detail:'pitch <i>flat</i>'},{code:'long',detail:'has to be sped up'}],first_problems:[{code:'words',detail:'x'}]},{id:'line-3',heard:'',shift:0.9,speedup:1,problems:[{code:'late',detail:'raw late note'}]},{id:'line-4',heard:'',cut_off:1.4,speedup:1.6,problems:[{code:'long',detail:'raw lost note'}]},{id:'line-5',heard:'',cut_off:0.8,shift:4.1,speedup:1.6,problems:[{code:'late',detail:'raw pushed note'}]}]}},{id:'v-out2',title:'Older',kind:'vlog',media:'video',language:'en',duration:20,created_at:4,favorite:false,listening:{available:false,reason:'studio_listening_unavailable'}}];
  T.state.jobs.clear();context.request=async(url,options={})=>{requests.push({path:url,...options});if(url==='/vlogs/vlog-1/script'&&options.method==='PUT')return{...T.state.vlogs[0],script:{...script,title:'Edited'},script_version:4,title:'Edited'};if(url==='/vlogs/vlog-1/render')return{id:'render-1',kind:'vlog_render',status:'queued'};return{items:[]};};
  const setCurrent=context.setCurrentVlog||null;
  T.state.currentVlogID='vlog-1';T.state.vlogDraft={title:'Edited',lines:script.lines.map((l,i)=>({...l,...(i===0?{delivery:'quiet <u>x</u>'}:{})}))};T.state.vlogDirty=true;
  const editor=T.renderVlog();assert(editor.includes('data-vlog-line="1"'));assert(!editor.includes('<script>bad</script>'));
  assert(editor.includes('data-line-key="delivery"'),'each line gets a delivery note input');assert(editor.includes('value="quiet &lt;u&gt;x&lt;/u&gt;"'));assert(!editor.includes('<u>x</u>'));
  assert(editor.includes('class="studio-round"'),'studio notes render the review rounds');assert(editor.includes('so cozy'));assert(editor.includes('say why'));assert(!editor.includes('<b>here</b>'));assert(!editor.includes('<i>x</i>'));assert(!editor.includes('<i>y</i>'));assert(editor.includes('the kettle'));
  assert(editor.includes('version from round 1')||editor.includes('第 1 轮的版本'),'the chosen earlier version is explained');assert(editor.includes('picture mismatch: no bakery'),'frame-check problems are listed per line');assert(editor.includes('class="score low"'),'low editor scores are highlighted');assert(editor.includes('needs silence'));assert(editor.includes('2/3'));
  assert(editor.includes('Pitch one &lt;b&gt;a&lt;/b&gt;')&&editor.includes('problem &lt;i&gt;first&lt;/i&gt;'),'pitched drafts are listed and escaped');assert(editor.includes('flat open'));assert(/Chosen|选用/.test(editor),'the chosen draft is marked');assert(/3 line\(s\) still have problems|3 句仍有问题/.test(editor),'the listening summary is shown under the video');assert(/re-voiced|已重录/.test(editor)&&/flat intonation|语调太平/.test(editor),'retakes and remaining problems are labelled');assert(editor.includes('The &lt;b&gt;bakery&lt;/b&gt;')&&!editor.includes('<b>bakery'),'heard text is escaped');assert(!editor.includes('pitch &lt;i&gt;'),'raw measurement notes stay out of the page');assert(/Listening check did not run|试听没有运行/.test(editor),'an unavailable listener is stated');assert(/fastest line sped up 1\.22|最快一句加速 1\.22 倍/.test(editor),'the final speed-up is stated');assert(/sped up 1\.22×|加速了 1\.22 倍/.test(editor),'a line left too long says how much it was sped up');assert(!editor.includes('has to be sped up')&&!editor.includes('raw late note')&&!editor.includes('raw lost note')&&!editor.includes('raw pushed note'),'raw English timing notes stay out of the bilingual page');assert(/pushed past the end of the video by earlier lines, so 0\.8 s|被前面的句子挤出视频结尾，有 0\.8 秒/.test(editor),'a line pushed off the end blames the earlier lines');assert(/still flat intonation|仍然语调太平/.test(editor),'labels are spaced in English');assert(/last 1\.4 s of narration ran past|最后 1\.4 秒旁白超出视频结尾/.test(editor),'lost words are stated in the summary');assert(/its last 1\.4 s ran past the end|最后 1\.4 秒超出视频结尾/.test(editor),'the line that lost words says so');assert(/0\.9 s after its moment because earlier lines|比画面晚 0\.9 秒，因为前面的句子太长/.test(editor),'a line that is only late points at the earlier lines');{const saved=T.state.vlogs[0].studio;T.state.vlogs[0].studio={...saved,cut_lines:[],approved:false,chosen_round:1,rounds:[{round:1,verdict:'revise',claims:1,supported:1,line_problems:[],editor:null,validation:[{id:'line-1',severity:'must',code:'too_fast',detail:'x'}]}]};const open=T.renderVlog();assert(/measured checks are still open|还有规则检查没通过/.test(open),'open measured checks are not called editor notes');T.state.vlogs[0].studio={...saved,cut_lines:[],approved:false,chosen_round:1,rounds:[{round:1,verdict:'revise',claims:1,supported:1,line_problems:[],editor:null,validation:[]}]};assert(/did not sign this version off|主编没有签发/.test(T.renderVlog()),'without open checks the summary says the editor did not sign it off');const round=(number,verdict,extra={})=>({round:number,verdict,claims:1,supported:1,line_problems:[],editor:null,validation:[],...extra});T.state.vlogs[0].studio={...saved,approved:true,chosen_round:1,rounds:[round(1,'approve')],cut_lines:[{id:'line-2',text:'cut on a note',problems:[],reason:'editor',round:1}]};const signed=T.renderVlog();assert(/The editor signed off this version|这一版主编已签发/.test(signed),'an approved version says the editor signed it off');assert(/Cut on the editor's note before voicing|配音前按主编意见删掉/.test(signed)&&!/Cut during revision|修改时删掉/.test(signed),'a cut of the chosen version has its own heading');T.state.vlogs[0].studio={...saved,approved:false,chosen_round:1,rounds:[round(1,'revise'),round(2,'revise',{final_check:true})],cut_lines:[{id:'line-3',text:'cut while revising',problems:[],reason:'editor',round:0}]};const earlier=T.renderVlog();assert(/Not signed off|未签发/.test(earlier),'a final check that did not pass says so instead of sent back');assert(/ranked first on the frame check|依次比较，它排在最前/.test(earlier),'an earlier version says how it was ranked');assert(/Cut during revision|修改时删掉/.test(earlier),'a repair cut stays under revision');T.state.vlogs[0].studio=saved;}assert(editor.includes('Invented &lt;b&gt;cat&lt;/b&gt;'),'lines removed by the gate are shown');assert(editor.includes('job-error'),'a confident genre disagreement is surfaced');assert(editor.includes('data-action="vlog-genre"'),'the rewrite panel offers the video type');assert(/data-action="save-script"(?![^>]*disabled)/.test(editor));assert(editor.includes('data-action="render-vlog"'));assert(editor.includes('data-action="add-line"'));
  // Editing only the title must make Save actionable, without a full rerender.
  const saveButton=doc.querySelector('[data-action="save-script"]');saveButton.disabled=true;
  events.input({target:{dataset:{vlogTitle:''},value:'Edited'}});
  assert.equal(saveButton.disabled,false,'title-only edits enable Save');
  await clickRenderedButton(editor,'render-vlog');
  const putSent=requests.find(r=>r.path==='/vlogs/vlog-1/script'&&r.method==='PUT');assert(putSent,'render must save unsaved edits first');assert.equal(putSent.body.version,3);assert.equal(putSent.body.title,'Edited');assert.equal(putSent.body.lines.length,2);assert.equal(putSent.body.lines[0].delivery,'quiet <u>x</u>');assert(!('delivery' in putSent.body.lines[1]),'empty delivery notes are not sent');
  const renderSent=requests.find(r=>r.path==='/vlogs/vlog-1/render'&&r.method==='POST');assert(renderSent);assert.equal(renderSent.body.version,4);assert.equal(JSON.stringify(renderSent.body.voice),JSON.stringify({engine:'openai',voice:'sage',style:'sleepy'}));assert.equal(renderSent.body.background_volume,0.4);assert(renderSent.body.request_id);
  assert(!T.state.vlogDirty);
  T.state.vlogs=[{...vlogFixture,status:'rendering'}];T.state.currentVlogID='vlog-1';T.state.vlogDraft={title:'Edited',lines:script.lines.map(l=>({...l}))};T.state.vlogDirty=false;const lockedEditor=T.renderVlog();assert(lockedEditor.includes('<fieldset class="plain-fieldset" disabled>'));assert(/data-action="render-vlog"[^>]* disabled/.test(lockedEditor));
  T.state.vlogs=[];T.state.currentVlogID=null;T.state.vlogDraft=null;T.state.vlogDirty=false;
  console.log('PASS: vlog narration form posts multipart with style/consent, auto mode stores the render request, the editor saves edits with the script version before rendering, and active tasks lock the editor.');
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
{
  // Voiceover text limit, request-ID retention across retries, and voices deleted elsewhere.
  context.request=originalRequest;lang='en';T.state.busy.clear();T.state.jobs.clear();
  T.state.session={user:{id:'user-a',name:'Test Creator'},csrf_token:'test',entitlements:{speech:true,music:true,assistant:true,full_cover:true,cover_max_seconds:300}};
  T.state.catalog=voices;T.state.voices=[{id:'own',name:'Owned voice',language:'en',kind:'user'}];T.state.voicesLoadedFor='user-a';T.state.requestIds={};
  const speechPosts=()=>requests.filter(r=>r.path==='/speech'&&r.method==='POST');const notice=()=>doc.querySelector('#notice').textContent;
  T.state.forms.clone={text:'a'.repeat(501),language:'en',voice_id:'own',speed:1,pitch:0,volume:1};
  let before=speechPosts().length;await clickRenderedButton(T.renderClone(),'speech');
  assert.equal(speechPosts().length,before,'an over-limit script is not sent');assert.match(notice(),/WEB_SPEECH_TEXT_TOO_LONG/,'over-limit scripts get their own message, not the vlog script one');
  T.state.forms.clone.text='   ';await clickRenderedButton(T.renderClone(),'speech');assert.equal(speechPosts().length,before);assert.match(notice(),/WEB_SPEECH_TEXT_EMPTY/);
  T.state.forms.clone.text='  '+'a'.repeat(500)+'\n';await clickRenderedButton(T.renderClone(),'speech');
  assert.equal(speechPosts().length,before+1,'500 characters after trimming is accepted');assert.equal(speechPosts().at(-1).body.text,'a'.repeat(500),'the script is sent trimmed');
  T.state.busy.clear();T.state.forms.clone={...T.state.forms.clone,text:'hello',voice_id:'deleted-elsewhere'};before=speechPosts().length;
  await clickRenderedButton(T.renderClone(),'speech');
  assert.equal(speechPosts().length,before,'a voice that no longer exists is not sent');assert.equal(T.state.forms.clone.voice_id,'');assert.match(notice(),/WEB_VOICE_UNAVAILABLE/);
  T.state.voicesLoadedFor=null;assert(T.voiceStillAvailable('deleted-elsewhere'),'an unloaded voice list never blanks a choice');T.state.voicesLoadedFor='user-a';
  T.state.requestIds={};const first=T.requestID('speech',{text:'A'});const second=T.requestID('speech',{text:'B'});
  T.releaseRequestID({request_key:'speech',request_id:first});assert.equal(T.state.requestIds.speech?.id,second,'an older job finishing keeps the newer pending request ID');
  T.releaseRequestID({request_key:'speech',request_id:second});assert.equal(T.state.requestIds.speech,undefined);
  for(const [status,keeps] of [[422,false],[402,false],[0,true],[409,true],[503,true]]){
    T.state.requestIds={};context.request=async(url,options={})=>{if(url==='/speech'&&options.method==='POST')throw new context.StudioError(status?'refused':'WEB_TIMEOUT',status);return originalRequest(url,options);};
    await assert.rejects(T.submitJob('speech','/speech',{text:'retry me'}));
    assert.equal(!!T.state.requestIds.speech,keeps,`HTTP ${status||'timeout'} ${keeps?'keeps':'frees'} the request ID`);
  }
  context.request=originalRequest;
  console.log('PASS: voiceover limit (trimmed, 500) with its own messages, deleted voices cleared before submit, request IDs survive older jobs and timeouts but are freed after a 4xx refusal.');
}
{
  // Review follow-ups: per-project request IDs, request_id_conflict, voice-list freshness, render voice check.
  context.request=originalRequest;T.state.requestIds={};T.state.jobs.clear();T.state.busy.clear();
  const sent=[];context.request=async(url,options={})=>{if(options.method==='POST'&&/^\/projects\//.test(url)){sent.push(options.body.request_id);return{id:`job-${sent.length}`,kind:'project_render',status:'queued'};}if(url==='/jobs')return{items:[]};if(url.startsWith('/jobs/'))return{id:url.split('/').pop(),kind:'project_render',status:'paused',progress:{stage:'paused'}};return originalRequest(url,options);};
  await T.submitJob('project-render','/projects/p1/render',{version:2},{projectID:'p1'});
  await T.submitJob('project-render','/projects/p2/render',{version:2},{projectID:'p2'});
  assert.equal(sent.length,2);assert.notEqual(sent[0],sent[1],'two projects at the same version get different request IDs');
  T.state.requestIds={};context.request=async(url,options={})=>{if(url==='/speech'&&options.method==='POST')throw new context.StudioError('request_id_conflict',409);return originalRequest(url,options);};
  await assert.rejects(T.submitJob('speech','/speech',{text:'x'}));assert.equal(T.state.requestIds.speech,undefined,'request_id_conflict frees the ID');
  T.state.requestIds={};context.request=async(url,options={})=>{if(url==='/speech'&&options.method==='POST')throw new context.StudioError('WEB_HTTP_409',409);return originalRequest(url,options);};
  await assert.rejects(T.submitJob('speech','/speech',{text:'x'}));assert(T.state.requestIds.speech,'other 409s keep the ID');
  T.state.voicesLoadedFor='user-a';context.request=async(url,options={})=>{if(url==='/voices')throw new context.StudioError('WEB_TIMEOUT',0);return originalRequest(url,options);};
  await T.refreshData();assert.equal(T.state.voicesLoadedFor,null,'a failed voice refresh stops trusting the old list');assert(T.voiceStillAvailable('just-saved'));
  context.request=originalRequest;T.state.voicesLoadedFor='user-a';T.state.voices=[{id:'own',name:'Owned voice',language:'en',kind:'user'}];
  const plan={roles:[{id:'r1',voice_id:'deleted-voice'},{id:'r2',voice_id:voices[0].id},{id:'r3',voice_id:'deleted-voice'}],segments:[{id:'s1',role_id:'r1'},{id:'s2',role_id:'r2'}]};
  assert.equal(T.projectNeedsMissingVoice({plan,completed_segment_ids:['s1']}),false,'finished or empty roles with a deleted voice do not block');
  assert.equal(T.projectNeedsMissingVoice({plan,completed_segment_ids:[]}),true,'a pending part with a deleted voice blocks');
  T.state.forms.clone={text:' padded \n',language:'en',voice_id:'own',speed:1,pitch:0,volume:1};T.state.requestIds={speech:{id:'legacy-id',signature:JSON.stringify(T.state.forms.clone)}};
  const posts=requests.filter(r=>r.path==='/speech'&&r.method==='POST').length;await clickRenderedButton(T.renderClone(),'speech');
  const legacy=requests.filter(r=>r.path==='/speech'&&r.method==='POST');assert.equal(legacy.length,posts+1);assert.equal(legacy.at(-1).body.request_id,'legacy-id','a retry saved by the previous release keeps its ID and payload');
  console.log('PASS: per-project plan/render request IDs, request_id_conflict frees the ID, failed voice refresh is not trusted, render checks only pending roles, previous-release retries keep their ID.');
}
{
  // Video pages stay hidden (and /vlogs is not requested) until the backend's /config reports them.
  context.request=originalRequest;const savedConfig=T.state.config;T.state.session={user:{id:'user-a',name:'Test Creator'},csrf_token:'test',entitlements:{speech:true}};
  T.state.config={google_configured:false,billing_enabled:false};
  assert(!T.featureAvailable('dub')&&!T.featureAvailable('vlog')&&T.featureAvailable('clone'));
  T.state.route='clone';T.render();const nav=doc.querySelector('#sidebar').innerHTML;assert(!nav.includes('href="#dub"')&&!nav.includes('href="#vlog"')&&nav.includes('href="#clone"'),'video nav entries hidden without backend support');
  T.state.route='dub';T.render();assert(doc.querySelector('#workspace').innerHTML.includes('data-action="clone"')&&!doc.querySelector('#workspace').innerHTML.includes('generate-dub'),'a direct #dub link shows the coming-soon page');
  let vlogCalls=requests.filter(r=>r.path==='/vlogs').length;await T.refreshData();assert.equal(requests.filter(r=>r.path==='/vlogs').length,vlogCalls,'no /vlogs request without backend support');
  T.state.config={...T.state.config,dubbing:{max_seconds:600},vlog:{max_seconds:600}};assert(T.featureAvailable('dub')&&T.featureAvailable('vlog'));
  await T.refreshData();assert.equal(requests.filter(r=>r.path==='/vlogs').length,vlogCalls+1,'/vlogs is loaded once the backend supports it');
  T.state.route='clone';T.render();assert(doc.querySelector('#sidebar').innerHTML.includes('href="#dub"'));
  T.state.config=null;assert(T.featureAvailable('dub'),'before /config loads the entries stay visible');T.state.config=savedConfig;
  console.log('PASS: video dubbing and AI narration appear only when /config reports them; otherwise no /vlogs request and a coming-soon page.');
}
