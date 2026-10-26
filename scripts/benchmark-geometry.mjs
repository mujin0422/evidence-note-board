// CPU-only synthetic geometry benchmark, NOT a GNOME frame-time/FPS claim.
// It estimates how pure curve math scales without loading GJS or the compositor.
import {performance} from 'node:perf_hooks';
import {curveVisible} from '../extension/core/runtimePolicy.js';
import {pinCenter} from '../extension/geometry/stringMath.js';
const view={width:1920,height:1080};
for (const count of [10,100,500]) {
    const notes=Array.from({length:count},(_,id)=>({
        id:String(id),x:(id%40)*90,y:Math.floor(id/40)*140,
        width:270,height:185,rotation:0,
    }));
    const edges=Array.from({length:count===500?1000:Math.max(10,count*2)},
        (_,id)=>[id%count,(id*17+3)%count]);
    const begin=performance.now();
    let visible=0;
    for (let attempt=0;attempt<25;attempt++) {
        for (const [a,b] of edges) {
            if (curveVisible(pinCenter(notes[a]),pinCenter(notes[b]),view))
                visible++;
        }
    }
    const ms=performance.now()-begin;
    console.log(`Geometry benchmark notes=${count}, edges=${edges.length}, `+
        `25 passes=${ms.toFixed(2)} ms, visible=${visible}`);
}
console.log('CPU geometry only; compositor FPS, GPU memory and idle CPU remain unmeasured.');
