import test from 'node:test';
import assert from 'node:assert/strict';
import '../fractal-math.js';
import '../camera-travel.js';
import '../site-content.js';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const m = globalThis.FractalMath, travel = globalThis.CameraTravel;
const context = { window: { siteContent: globalThis.siteContent } };
vm.runInNewContext(await readFile(new URL('../scene-data.js', import.meta.url), 'utf8'), context);
const cameras = Object.fromEntries(context.window.siteScenes.map(({id,camera}) => [id,
    { x:m.parse(camera.centerX), y:m.parse(camera.centerY), zoom:camera.zoom }]));
const between=(value,a,b)=>value>= (a<b?a:b) && value<= (a>b?a:b);
const active=(track,t)=>t>track.begin && t<track.end;

for (const [from,start] of Object.entries(cameras)) for (const [to,target] of Object.entries(cameras)) {
    test(`${from} → ${to}: bounded, precise, overlapping and continuous in velocity`, () => {
        const trip = travel.plan(start,target);
        assert.deepEqual(travel.sample(trip,-0.1),start);
        assert.deepEqual(travel.sample(trip,0),start);
        assert.deepEqual(travel.sample(trip,1),target);
        assert.deepEqual(travel.sample(trip,5),target);
        const pan=trip.tracks.find(s=>s.kind==='pan');
        const zooms=trip.tracks.filter(s=>s.kind==='zoom');
        for(let i=0;i<=1000;i++) {
            const t=i/1000, point=travel.sample(trip,t);
            assert.ok(Number.isFinite(point.zoom) && point.zoom>0);
            assert.ok(point.zoom>=trip.overview*(1-1e-12));
            assert.ok(point.zoom<=Math.max(start.zoom,target.zoom)*(1+1e-12));
            assert.ok(between(point.x,start.x,target.x));
            assert.ok(between(point.y,start.y,target.y));
            if(pan && active(pan,t)) {
                assert.ok(point.zoom<=trip.overview*4*(1+1e-10),'Pan overlaps excessively deep zoom');
            }
        }
        if(pan && zooms.length) for(const zoom of zooms) {
            assert.ok(Math.min(pan.end,zoom.end)>Math.max(pan.begin,zoom.begin),'Pan and zoom must overlap');
        }
        // Track boundaries must not introduce a velocity discontinuity. Measure
        // center motion in overview units and zoom motion in log magnification.
        const vector=point=>[m.number(point.x-start.x)*trip.overview,
            m.number(point.y-start.y)*trip.overview,Math.log(point.zoom)];
        const h=1e-5;
        for(const boundary of new Set(trip.tracks.flatMap(s=>[s.begin,s.end]))) {
            const a=vector(travel.sample(trip,boundary-h));
            const b=vector(travel.sample(trip,boundary));
            const c=vector(travel.sample(trip,boundary+h));
            for(let axis=0;axis<3;axis++)assert.ok(Math.abs((c[axis]-b[axis])/h-(b[axis]-a[axis])/h)<0.02,
                `Velocity discontinuity at ${boundary}, axis ${axis}`);
        }
    });
}

test('Home → Work starts zooming while panning and calculates its own duration',()=>{
    const trip=travel.plan(cameras.home,cameras.work);
    const pan=trip.tracks.find(s=>s.kind==='pan'), zoom=trip.tracks.find(s=>s.kind==='zoom');
    assert.ok(trip.duration>0 && Number.isFinite(trip.duration));
    assert.equal(trip.needsZoomOut,false);
    assert.ok(zoom.begin<pan.end);
    const during=travel.sample(trip,(zoom.begin+pan.end)/2);
    assert.notEqual(during.x,cameras.home.x);
    assert.notEqual(during.x,cameras.work.x);
    assert.ok(during.zoom>cameras.home.zoom);
    assert.ok(travel.sample(trip,0.5).zoom>100);
});

test('pan and zoom both accelerate and decelerate instead of cruising linearly',()=>{
    const start=cameras.home;
    const trips=[travel.plan(start,{...start,zoom:1e6}),travel.plan(start,{...start,x:start.x+m.parse('0.01')})];
    for(const [index,trip] of trips.entries()) {
        const position=t=>{const p=travel.sample(trip,t);return index===0?Math.log(p.zoom/start.zoom):m.number(p.x-start.x)};
        const speed=t=>(position(t+0.001)-position(t-0.001))/0.002;
        assert.ok(speed(0.5)>speed(0.15)*3);
        assert.ok(speed(0.5)>speed(0.85)*3);
        assert.ok(Math.abs(speed(0.15)/speed(0.85)-1)<1e-6);
        assert.equal(trip.tracks.length,1);
        assert.equal(trip.tracks[0].begin,0);assert.equal(trip.tracks[0].end,1);
    }
});

test('extremely deep distant travel waits until overview before significant panning',()=>{
    const start={...cameras.home,zoom:1e26},target={...cameras.work,zoom:1e26};
    const trip=travel.plan(start,target),pan=trip.tracks.find(t=>t.kind==='pan');
    for(let i=0;i<=1000;i++) {
        const t=pan.begin+(pan.end-pan.begin)*i/1000;
        assert.ok(travel.sample(trip,t).zoom<=trip.overview*4*(1+1e-10));
    }
});

test('tiny movements below floating-point precision preserve continuity and endpoints',()=>{
    const start={x:m.parse('-0.7'),y:m.parse('0.1'),zoom:1e24};
    const target={...start,x:start.x+m.parse('1e-24'),y:start.y-m.parse('2e-24'),zoom:1e26};
    assert.equal(m.number(start.x),m.number(target.x));
    const trip=travel.plan(start,target);
    assert.deepEqual(travel.sample(trip,1),target);
    const pan=trip.tracks.find(s=>s.kind==='pan');
    const middle=travel.sample(trip,(pan.begin+pan.end)/2);
    assert.ok(middle.x>start.x && middle.x<target.x);
});

test('dropped frames and restarting mid-trip do not overshoot or jump at restart',()=>{
    const trip=travel.plan(cameras.home,cameras.work);
    for(const time of [0,0.07,0.48,0.9,1.4]) {
        const state=travel.sample(trip,time);
        const replacement=travel.plan(state,cameras.resume);
        assert.deepEqual(travel.sample(replacement,0),state);
        assert.deepEqual(travel.sample(replacement,2),cameras.resume);
    }
});

test('roundoff just before a pan ends cannot overshoot precise coordinates',()=>{
    const trip=travel.plan(cameras.home,cameras.work);
    const pan=trip.tracks.find(s=>s.kind==='pan');
    for(const remainder of [1e-6,1e-8,1e-10,1e-12]) {
        const point=travel.sample(trip,pan.end-(pan.end-pan.begin)*remainder);
        assert.ok(between(point.x,cameras.home.x,cameras.work.x));
        assert.ok(between(point.y,cameras.home.y,cameras.work.y));
    }
});

test('no-op is instant; small moves are quick and stay at their current depth',()=>{
    const start={x:0n,y:0n,zoom:1e24};
    assert.equal(travel.plan(start,start).duration,0);
    const near=travel.plan(start,{...start,x:m.parse('1e-26')});
    const farther=travel.plan(start,{...start,x:m.parse('1e-24')});
    assert.equal(near.overview,start.zoom);
    assert.equal(near.needsZoomOut,false);
    assert.ok(near.duration<1000);
    assert.ok(farther.duration>near.duration);
    const shallow=travel.plan(start,{...start,zoom:2e24});
    const deep=travel.plan(start,{...start,zoom:1e26});
    assert.ok(deep.duration>shallow.duration);
});

test('relative distance and depth give the same motion at radically different scales',()=>{
    const start={x:0n,y:0n,zoom:1};
    const target={x:m.parse('0.2'),y:m.parse('0.1'),zoom:100};
    const a=travel.plan(start,target);
    const b=travel.plan({...start,zoom:1e24},{x:m.parse('2e-25'),y:m.parse('1e-25'),zoom:1e26});
    assert.ok(Math.abs(a.duration/b.duration-1)<1e-9);
    assert.ok(Math.abs(a.overview/(b.overview/1e24)-1)<1e-9);
});

test('viewport shape affects horizontal travel, while vertical travel remains consistent',()=>{
    const start={x:0n,y:0n,zoom:10};
    const horizontal={...start,x:m.parse('0.1')};
    const vertical={...start,y:m.parse('0.1')};
    const wide=travel.plan(start,horizontal,{aspect:2});
    const narrow=travel.plan(start,horizontal,{aspect:0.5});
    assert.ok(narrow.duration>wide.duration);
    assert.equal(travel.plan(start,vertical,{aspect:2}).duration,travel.plan(start,vertical,{aspect:0.5}).duration);
});

test('distant travel finds a faster overview than staying deep, respecting renderer bounds',()=>{
    const start={x:0n,y:0n,zoom:1e26},target={x:m.parse('2'),y:m.parse('1'),zoom:1e26};
    const trip=travel.plan(start,target,{minZoom:0.5,maxZoom:1e26});
    assert.ok(trip.needsZoomOut);
    assert.ok(trip.overview>=0.5 && trip.overview<10);
    assert.ok(trip.duration<30000);
    const capped=travel.plan(start,target,{minZoom:0.5,maxZoom:20000});
    assert.equal(capped.start.zoom,20000);
    assert.equal(capped.target.zoom,20000);
    assert.ok(capped.duration<trip.duration);
    const fixed=travel.plan(start,target,{minZoom:2,maxZoom:2});
    assert.equal(fixed.overview,2);
    assert.equal(fixed.tracks.length,1);
});

test('automatic timing is reversible and depends on the actual starting camera',()=>{
    const forward=travel.plan(cameras.home,cameras.resume);
    const reverse=travel.plan(cameras.resume,cameras.home);
    assert.ok(Math.abs(forward.duration-reverse.duration)<1);
    const near=travel.sample(forward,0.95);
    assert.ok(travel.plan(near,cameras.resume).duration<forward.duration/2);
});

// Differentiate sampled positions independently of the planner's derivative
// calculations. This catches screen-space acceleration caused by zoom/pan overlap.
function checkMotion(start,target,options={}) {
    const trip=travel.plan(start,target,options), duration=trip.duration/1000;
    const h=duration/20000, aspect=options.aspect??1;
    const point=t=>travel.sample(trip,t/duration);
    const velocity=t=>{
        const a=point(t-h), b=point(t+h), z=point(t).zoom;
        return [m.number(b.x-a.x)*z/(6*aspect*h),m.number(b.y-a.y)*z/(6*h),
            (Math.log2(b.zoom)-Math.log2(a.zoom))/(2*h)];
    };
    const derivative=(fn,t)=>{const a=fn(t-h),b=fn(t+h);return b.map((v,i)=>(v-a[i])/(2*h));};
    const acceleration=t=>derivative(velocity,t);
    const jerk=t=>derivative(acceleration,t);
    for(let i=2;i<600;i++) {
        const t=duration*i/600;
        for(const [key,fn] of [['speed',velocity],['acceleration',acceleration],['jerk',jerk]]) {
            const [x,y,z]=fn(t);
            const usage=Math.hypot(Math.hypot(x,y)/trip.limits.pan[key],z/trip.limits.zoom[key]);
            assert.ok(usage<1.04,`${key} budget exceeded: ${usage}, t=${t}, duration=${duration}`);
        }
    }
}

test('sampled scene paths stay within combined speed, acceleration, and jerk limits',()=>{
    for(const a of Object.keys(cameras)) for(const b of Object.keys(cameras)) {
        if(a===b)continue;
        for(const aspect of [1.6,390/844,320/900]) checkMotion(cameras[a],cameras[b],{
            aspect,minZoom:0.06561864456068546,minOverviewZoom:cameras.home.zoom
        });
    }
});

test('motion limits also hold for local pans, pure dives and extreme depth changes',()=>{
    const origin={x:m.parse('-0.7'),y:m.parse('0.1'),zoom:1};
    checkMotion(origin,{...origin,x:origin.x+m.parse('0.01')});
    checkMotion(origin,{...origin,zoom:1e26});
    checkMotion({...origin,zoom:1e24},{...origin,x:origin.x+m.parse('2e-24'),zoom:1e26});
    checkMotion({...origin,zoom:1e26},{x:m.parse('1'),y:0n,zoom:1e26},{aspect:0.4,minZoom:0.065});
});

test('invalid camera and viewport inputs fail before producing an animation',()=>{
    for(const zoom of [0,-1,Infinity,NaN]) assert.throws(()=>travel.plan({...cameras.home,zoom},cameras.work));
    for(const options of [{aspect:0},{aspect:NaN},{minZoom:0},{maxZoom:Infinity},{minZoom:10,maxZoom:1},{minOverviewZoom:0},{minOverviewZoom:NaN},{minOverviewZoom:Infinity}]) {
        assert.throws(()=>travel.plan(cameras.home,cameras.work,options));
    }
});

test('near-identical zooms and subpixel offsets never create zero-length tracks',()=>{
    const start={x:0n,y:0n,zoom:1e26};
    for(const target of [{...start,zoom:1e26*(1+Number.EPSILON)},
        {x:1n,y:0n,zoom:1},{x:0n,y:1n,zoom:1e25}]) {
        const trip=travel.plan(start,target);
        assert.ok(Number.isFinite(trip.duration) && trip.duration>0);
        assert.ok(trip.tracks.every(t=>t.end>t.begin));
        for(const t of [0,0.001,0.5,0.999,1]) {
            const zoom=travel.sample(trip,t).zoom;
            assert.ok(Number.isFinite(zoom) && zoom>=trip.overview && zoom<=Math.max(start.zoom,target.zoom));
        }
        assert.deepEqual(travel.sample(trip,1),target);
    }
});


test('every scene route stays inside Home and preserves a legible pan on narrow and wide viewports',()=>{
    for(const aspect of [0.25,320/900,390/844,1,1.6,3]) {
        for(const [a,start] of Object.entries(cameras)) for(const [b,target] of Object.entries(cameras)) {
            if(a===b)continue;
            const options={aspect,minZoom:0.065,minOverviewZoom:cameras.home.zoom};
            const trip=travel.plan(start,target,options);
            const reverse=travel.plan(target,start,options);
            assert.ok(trip.overview>=Math.min(start.zoom,target.zoom,cameras.home.zoom));
            assert.ok(Math.abs(trip.duration-reverse.duration)<1,'Reverse route should have the same pacing');
            const distance=Math.hypot(m.number(target.x-start.x)/(3*aspect),m.number(target.y-start.y)/3);
            if(trip.overview<Math.min(start.zoom,target.zoom)) {
                assert.ok(distance*trip.overview>=0.75*(1-1e-10),'Pan compressed by excessive zoom-out');
            }
            for(let i=0;i<=200;i++)assert.ok(travel.sample(trip,i/200).zoom>=trip.overview*(1-1e-12));
            if(a==='home'||b==='home')assert.equal(trip.overview,cameras.home.zoom);
        }
    }
});

test('sub-viewport moves stay local across depths; interrupted wide views do not force a dive',()=>{
    for(const zoom of [1,1e6,1e15,1e26])for(const aspect of [0.35,1.6,3]) {
        const start={x:0n,y:0n,zoom};
        const target={...start,x:m.fromNumber(0.6*3*aspect/zoom)};
        const trip=travel.plan(start,target,{aspect,minOverviewZoom:1.35});
        assert.equal(trip.overview,zoom);
        assert.equal(trip.tracks.length,1);
    }
    for(const zoom of [0.065,0.2,0.8]) {
        const wide={...cameras.home,zoom};
        for(const target of Object.values(cameras)) {
            const trip=travel.plan(wide,target,{minZoom:0.065,minOverviewZoom:1.35});
            assert.equal(trip.overview,zoom);
            assert.deepEqual(travel.sample(trip,0),wide);
            assert.deepEqual(travel.sample(trip,1),target);
        }
    }
});

test('seeded routes and replans stay bounded at arbitrary coordinates and depths',()=>{
    let seed=1907;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
    for(let i=0;i<100;i++) {
        const zoom=10**(random()*26), aspect=0.3+random()*2.7;
        const start={x:m.parse('-0.7'),y:m.parse('0.1'),zoom};
        const target={x:start.x+m.fromNumber((random()-.5)*3/zoom),
            y:start.y+m.fromNumber((random()-.5)*3/zoom),zoom:10**(random()*26)};
        const options={aspect,minZoom:0.065,minOverviewZoom:1.35};
        const trip=travel.plan(start,target,options);
        assert.ok(Number.isFinite(trip.duration)&&trip.duration>0);
        assert.ok(trip.overview>=Math.min(start.zoom,target.zoom,1.35));
        for(const t of [0,.01,.25,.5,.75,.99,1]) {
            const point=travel.sample(trip,t);
            assert.ok(between(point.x,start.x,target.x)&&between(point.y,start.y,target.y));
            assert.ok(point.zoom>=trip.overview*(1-1e-12));
            const resumed=travel.plan(point,cameras.home,options);
            assert.deepEqual(travel.sample(resumed,0),point);
            assert.deepEqual(travel.sample(resumed,1),cameras.home);
        }
    }
});
