import { server, port, launchChrome, connect } from './browser-harness.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const output=resolve('artifacts/screenshots/animation');
await mkdir(output,{recursive:true});
await new Promise((done,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',done)});
let browser,client;
const reports=[];
try {
    browser=await launchChrome();client=await connect(browser.websocketURL);
    for(const viewport of [{width:1280,height:800},{width:390,height:844}]) {
        const {targetId}=await client.command('Target.createTarget',{url:'about:blank'});
        const {sessionId}=await client.command('Target.attachToTarget',{targetId,flatten:true});
        const cmd=(method,params={})=>client.command(method,params,sessionId);
        const evaluate=async expression=>{
            const result=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
            if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
            return result.result.value;
        };
        await cmd('Page.enable');await cmd('Runtime.enable');
        await cmd('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:viewport.width<620});
        // Real GPU frames, limited in size so software GPU throughput does not
        // obscure timing regressions. Full-size composition is checked separately.
        await cmd('Page.addScriptToEvaluateOnNewDocument',{source:`
            const getParameter=WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter=function(p){return p===this.MAX_VIEWPORT_DIMS?new Int32Array([128,128]):getParameter.call(this,p)};
        `});
        await cmd('Page.navigate',{url:`http://127.0.0.1:${port}/?intro=off&motion=on&quality=native`});
        await evaluate(`new Promise(resolve=>{(function poll(){if(window.site)return window.site.ready.then(resolve);setTimeout(poll,25)})()})`);
        await evaluate(`window.checkArrival=id=>{
            const expected=window.site.scenes.find(s=>s.id===id).camera, actual=window.site.getState().camera, m=window.FractalMath;
            if(actual.zoom!==expected.zoom||m.parse(actual.preciseCenterX)!==m.parse(expected.centerX)||m.parse(actual.preciseCenterY)!==m.parse(expected.centerY))throw Error('Imprecise arrival: '+id);
            const panel=document.querySelector('[data-scene="'+id+'"]');
            if(panel.inert)throw Error('Arrival panel is inert: '+id);
        }`);
        // Rapid navigation should only announce the last requested destination.
        console.log(await evaluate(`(async()=>{
            await window.site.gotoScene('home',{animate:false});
            const events=[],record=e=>events.push(e.detail.scene);
            window.addEventListener('site:scene-rendered',record);
            const first=window.site.gotoScene('work',{duration:1200});
            await new Promise(r=>setTimeout(r,180));
            const second=window.site.gotoScene('about',{duration:1000});
            await new Promise(r=>setTimeout(r,180));
            const third=window.site.gotoScene('resume',{duration:900});
            await Promise.all([first,second,third]);
            window.removeEventListener('site:scene-rendered',record);
            window.checkArrival('resume');
            if(events.join(',')!=='resume')throw Error('Stale arrivals after interrupted navigation: '+events);
            return 'Passed rapid navigation interruptions';
        })()`));
        console.log(await evaluate(`(async()=>{
            await window.site.gotoScene('home',{animate:false});
            const moving=window.site.gotoScene('work');
            await new Promise(r=>setTimeout(r,180));
            window.sitePreferences.set('motion','off');
            await moving;window.checkArrival('work');
            const start=performance.now();await window.site.gotoScene('home');window.checkArrival('home');
            if(performance.now()-start>700)throw Error('Motion-off navigation animated');
            window.sitePreferences.set('motion','on');
            await window.site.gotoScene('work',{duration:0});window.checkArrival('work');
            const repeated=performance.now();
            await window.site.gotoScene('work');window.checkArrival('work');
            if(performance.now()-repeated>700)throw Error('Repeated destination animated');
            return 'Passed motion disabled mid-trip, disabled motion, zero duration, and repeated destination';
        })()`));
        // Wheel input cancels travel; the next requested route starts from that camera.
        console.log(await evaluate(`(async()=>{
            await window.site.gotoScene('home',{animate:false});
            const interrupted=window.site.gotoScene('work',{duration:1400});
            await new Promise(r=>setTimeout(r,180));
            document.getElementById('fractalCanvas').dispatchEvent(new WheelEvent('wheel',{deltaY:-50,clientX:innerWidth/2,clientY:innerHeight/2,bubbles:true,cancelable:true}));
            const before=window.fractalRenderer.getState();
            await new Promise(r=>setTimeout(r,200));
            const after=window.fractalRenderer.getState();
            if(before.zoom!==after.zoom||before.preciseCenterX!==after.preciseCenterX)throw Error('Wheel did not stop animation');
            const m=window.FractalMath, home=window.site.scenes[0].camera;
            const expected=window.CameraTravel.plan({x:m.parse(after.preciseCenterX),y:m.parse(after.preciseCenterY),zoom:after.zoom},
                {x:m.parse(home.centerX),y:m.parse(home.centerY),zoom:home.zoom},
                {aspect:innerWidth/innerHeight,minZoom:window.fractalRenderer.getMinZoom(),maxZoom:window.fractalRenderer.getMaxZoom(),minOverviewZoom:window.site.scenes.find(s=>s.id==='home').camera.zoom});
            const resumed=performance.now();
            await window.site.gotoScene('home');await interrupted;window.checkArrival('home');
            if(Math.abs(performance.now()-resumed-expected.duration)>700)throw Error('Interrupted route did not replan from current camera');
            return 'Passed wheel interruption and recovery';
        })()`));
        // Run every directed scene pair using its automatically planned duration.
        for(const from of ['home','about','work','resume']) for(const to of ['home','about','work','resume']) {
            if(from===to)continue;
            const report=await evaluate(`(async()=>{
                await window.site.gotoScene('${from}',{animate:false});
                await window.fractalRenderer.whenReady();
                const source=window.site.scenes.find(s=>s.id==='${from}'), target=window.site.scenes.find(s=>s.id==='${to}');
                const m=window.FractalMath, renderer=window.fractalRenderer;
                const camera=s=>({x:m.parse(s.centerX),y:m.parse(s.centerY),zoom:s.zoom});
                const plan=window.CameraTravel.plan(camera(source.camera),camera(target.camera),{
                    aspect:innerWidth/innerHeight,minZoom:renderer.getMinZoom(),maxZoom:renderer.getMaxZoom(),minOverviewZoom:window.site.scenes.find(s=>s.id==='home').camera.zoom
                });
                const duration=plan.duration;
                const started=performance.now(), frames=[];
                const record=({detail:s})=>frames.push({time:performance.now()-started,x:s.preciseCenterX,y:s.preciseCenterY,zoom:s.zoom});
                window.addEventListener('fractal:render',record);
                await window.site.gotoScene('${to}');
                const elapsed=performance.now()-started;
                window.removeEventListener('fractal:render',record);
                await window.fractalRenderer.whenReady();window.checkArrival('${to}');
                if(elapsed<duration-50||elapsed>duration+2500)throw Error('Duration out of bounds: '+elapsed+' / '+duration);
                if(frames.length<20)throw Error('Too few rendered animation frames: '+frames.length);
                const floor=Math.min(source.camera.zoom,target.camera.zoom,window.site.scenes.find(s=>s.id==='home').camera.zoom);
                const minimumZoom=Math.min(...frames.map(f=>f.zoom));
                if(minimumZoom<floor*(1-1e-10))throw Error('Travel pulled back past Home: '+minimumZoom);
                if(minimumZoom<plan.overview*(1-1e-10))throw Error('Travel exceeded its planned overview');
                const overlapping=frames.filter((f,i)=>i>0 && f.x!==frames[i-1].x
                    && Math.abs(Math.log(f.zoom/frames[i-1].zoom))>1e-6);
                if(!overlapping.length)throw Error('Pan and zoom never overlap: ${from} → ${to}');
                if('${from}'==='home'&&'${to}'==='work'){
                    const zooming=frames.filter(f=>f.zoom>source.camera.zoom*1.02);
                    if(zooming[0].time>duration*0.25)throw Error('Home → Work waits too long before zooming');
                    const midpoint=frames.find(f=>f.time>=duration*0.5);
                    if(midpoint.zoom<100)throw Error('Home → Work has not progressed into zoom by halfway');
                    const panEnd=frames.find(f=>window.FractalMath.parse(f.x)===window.FractalMath.parse(target.camera.centerX));
                    const expectedPanEnd=plan.tracks.find(track=>track.kind==='pan').end*duration;
                    if(Math.abs(panEnd.time-expectedPanEnd)>250)throw Error('Pan did not follow adaptive timing');
                    if(overlapping.length<3)throw Error('Home → Work overlap is not visible across several frames');
                }
                return {from:'${from}',to:'${to}',duration,overview:plan.overview,minimumZoom,elapsed,frames};
            })()`);
            reports.push({viewport:viewport.width,...report});
            console.log(`${viewport.width}px ${from} → ${to}: ${Math.round(report.elapsed)}ms, ${report.frames.length} rendered frames`);
        }
        // Device reduced motion is honored when the user chooses the auto option.
        await cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
        await evaluate(`(async()=>{window.sitePreferences.set('motion','auto');await new Promise(r=>setTimeout(r,100));if(!window.sitePreferences.getState().reduceMotion)throw Error('Device motion preference ignored');await window.site.gotoScene('work');window.checkArrival('work')})()`);
        console.log(`${viewport.width}px: passed device reduced motion`);
        await client.command('Target.closeTarget',{targetId});
    }
    if(client.exceptions.length)throw Error(client.exceptions.join('\n'));
} finally {
    await writeFile(resolve(output,'timings.json'),JSON.stringify(reports,null,2));
    client?.close();browser?.child.kill('SIGTERM');server.close();
}
