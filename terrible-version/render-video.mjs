// Regenerate the course-only video from settled renderer frames, then inspect it.
// Run from the repository: node terrible-version/render-video.mjs
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { server, port, launchChrome, connect } from '../tools/browser-harness.mjs';

const media = resolve(import.meta.dirname, 'media');
const review = resolve(import.meta.dirname, '../artifacts/course-video');
await mkdir(review, { recursive: true });
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
let browser, client;
try {
    browser = await launchChrome(); client = await connect(browser.websocketURL);
    const { targetId } = await client.command('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.command('Target.attachToTarget', { targetId, flatten: true });
    const command = (method, params = {}) => client.command(method, params, sessionId);
    const evaluate = async expression => {
        const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
    };
    await command('Page.enable'); await command('Runtime.enable');
    await command('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
    await command('Page.navigate', { url: `http://127.0.0.1:${port}/?intro=off&motion=off&quality=native` });
    await evaluate(`new Promise((resolve,reject)=>{const start=Date.now();(function poll(){if(window.site)return window.site.ready.then(resolve);if(Date.now()-start>15000)return reject(Error('Renderer unavailable'));setTimeout(poll,50)})()})`);
    await evaluate(`document.querySelectorAll('body > :not(#fractalCanvas):not(script)').forEach(e=>e.style.display='none');window.tourFrames=[];`);
    // Three useful scales, with chapter cuts across the sparse intermediate view.
    const zoomAt = i => i < 30 ? 1.35 * (2.5 / 1.35) ** (i / 29)
        : i < 60 ? 125 * (400 / 125) ** ((i - 30) / 29)
        : 600 * 2 ** ((i - 60) / 30);
    const frames = 91;
    for (let i = 0; i < frames; i++) {
        const zoom = zoomAt(i);
        // Center the boundary before zooming. Moving the center toward it during
        // a deep zoom sends the path through the uninformative black interior.
        await evaluate(`(async()=>{window.site.setCamera({centerX:-0.7435,centerY:0.1314,zoom:${zoom}});await window.fractalRenderer.whenReady();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`);
        const { data } = await command('Page.captureScreenshot', { format: 'png' });
        await evaluate(`(async()=>{const image=new Image();image.src='data:image/png;base64,${data}';await image.decode();window.tourFrames.push(image)})()`);
        if (i % 30 === 0) console.log(`Rendered boundary frame ${i + 1}/${frames} at ${zoom.toFixed(1)}×.`);
    }
    const output = await evaluate(`(async()=>{
        const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;
        const context=canvas.getContext('2d');
        const zoomAt=${zoomAt.toString()};
        const draw=i=>{
            context.drawImage(tourFrames[i],0,0);
            context.fillStyle='rgba(10,14,27,.94)';context.fillRect(0,0,960,65);context.fillRect(0,438,960,102);
            context.fillStyle='#f1edf8';context.font='600 26px Manrope, sans-serif';
            const stage=i<30?0:i<60?1:2;
            const headings=['01 / A simple rule','02 / Follow the boundary','03 / Detail at a smaller scale'];
            const lines=[
                ['Start at z = 0, then repeat z ← z² + c for each point c.', 'Dark points stay bounded within the iteration limit.'],
                ['Color shows how quickly nearby points escape.', 'Watch the boundary resolve into smaller curves and branches.'],
                ['The same rule produces these intricate spiral structures.', 'Built with WebGL for this portfolio; HTML keeps its content readable.']
            ];
            context.fillText(headings[stage],28,42);
            context.textAlign='right';context.fillStyle='#bedcff';context.font='600 21px Manrope, sans-serif';
            context.fillText(zoomAt(i).toLocaleString('en-US',{maximumFractionDigits:1})+'×',932,41);context.textAlign='left';
            context.font='500 21px Manrope, sans-serif';context.fillStyle='#f1edf8';
            context.fillText(lines[stage][0],28,477);context.fillText(lines[stage][1],28,511);
        };
        draw(0);const poster=canvas.toDataURL('image/png').split(',')[1];
        const stream=canvas.captureStream(20);
        const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:2500000});
        const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
        const done=new Promise(resolve=>recorder.onstop=resolve);
        // Hold each chapter long enough to read, with steady zooms in between.
        const frameAt=t=>t<3?0:t<8?Math.round((t-3)/5*30):t<11?30:t<16?30+Math.round((t-11)/5*30):t<19?60:t<24?60+Math.round((t-19)/5*30):90;
        recorder.start();const start=performance.now();
        await new Promise(resolve=>{function tick(now){const t=(now-start)/1000;draw(Math.min(90,frameAt(t)));if(t<28)requestAnimationFrame(tick);else resolve()}requestAnimationFrame(tick)});
        recorder.stop();await done;stream.getTracks().forEach(track=>track.stop());
        const blob=new Blob(chunks,{type:'video/webm'});
        const data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob)});
        // Decode the finished video, rather than trusting the source canvas.
        const video=document.createElement('video');video.muted=true;video.src=URL.createObjectURL(blob);
        await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject});
        if(video.readyState<2)await new Promise(resolve=>video.onloadeddata=resolve);
        const sheet=document.createElement('canvas');sheet.width=960;sheet.height=1080;
        const sheetContext=sheet.getContext('2d');const checks=[];
        for(let second=0;second<28;second++){
            await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Video frame decode timed out')),10000);video.requestVideoFrameCallback(()=>{clearTimeout(timeout);resolve()});video.currentTime=second+.15});
            context.clearRect(0,0,960,540);
            context.drawImage(video,0,0);
            const pixels=context.getImageData(0,70,960,360).data;let colorful=0;
            for(let p=0;p<pixels.length;p+=4)if(Math.max(pixels[p],pixels[p+1],pixels[p+2])-Math.min(pixels[p],pixels[p+1],pixels[p+2])>35 && Math.max(pixels[p],pixels[p+1],pixels[p+2])>60)colorful++;
            checks.push({second,colorfulFraction:colorful/(960*360)});
            if(second%4===0 || second===27){const tile=second===27?7:second/4;sheetContext.drawImage(video,(tile%2)*480,Math.floor(tile/2)*270,480,270)}
        }
        return {data,poster,duration:video.duration,checks,sheet:sheet.toDataURL('image/png').split(',')[1]};
    })()`);
    assert(output.duration >= 27 && output.duration < 31, `Unexpected duration: ${output.duration}`);
    for (const frame of output.checks) assert(frame.colorfulFraction > 0.25, `Uninformative dark frame: ${JSON.stringify(frame)}`);
    await writeFile(resolve(media, 'fractal-demo.webm'), Buffer.from(output.data, 'base64'));
    await writeFile(resolve(media, 'fractal-tour-poster.png'), Buffer.from(output.poster, 'base64'));
    await writeFile(resolve(review, 'decoded-contact-sheet.png'), Buffer.from(output.sheet, 'base64'));
    await writeFile(resolve(review, 'checks.json'), JSON.stringify({ duration: output.duration, frames: output.checks }, null, 2));
    assert.deepEqual(client.exceptions, []);
    console.log(`Verified ${output.duration.toFixed(1)}s video: decoded all 28 sampled seconds; no dark interior frames.`);
} finally { client?.close(); browser?.child.kill('SIGTERM'); server.close(); }
