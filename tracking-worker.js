// Classic worker deliberately: the MediaPipe WASM loader uses importScripts.
let tracker, initialization, source, generation = 0;
function init() {
  return initialization ||= import('./tracking.js').then(async ({ VideoTracker }) => {
    tracker = new VideoTracker({preferCPU:true});
    await tracker.init();
    return tracker;
  }).catch(error=>{initialization=null;throw error;});
}
let queue = Promise.resolve();
self.onmessage = ({data}) => {
  queue = queue.then(async () => {
    if(data.type==='init') {
      await init();
      if(tracker.state.status==='error') await tracker.init();
      self.postMessage({type:'ready',state:tracker.state,generation});
    } else if(data.type==='reset') {
      generation=data.generation;tracker?.reset();
    } else if(data.type==='frame') {
      try {
        await init();
        if(generation!==data.generation){generation=data.generation;tracker.reset();}
        const sameStill=data.paused&&source?.currentTime===data.time;
        const previous=sameStill?{faces:tracker.state.faces,hands:tracker.state.hands}:null;
        source ||= new OffscreenCanvas(data.bitmap.width,data.bitmap.height);
        if(source.width!==data.bitmap.width||source.height!==data.bitmap.height){source.width=data.bitmap.width;source.height=data.bitmap.height;tracker.reset();}
        source.getContext('2d').drawImage(data.bitmap,0,0);
        Object.assign(source,{videoWidth:source.width,videoHeight:source.height,readyState:2,paused:data.paused,seeking:false,currentTime:data.time,currentSrc:'local-worker-frame'});
        await tracker.update(source,data.timestamp);
        // Additional crop searches of the exact same paused image must not
        // erase landmarks already found in that image. New frames never retain them.
        if(previous){
          if(!tracker.state.faces.length)tracker.state.faces=previous.faces;
          if(!tracker.state.hands.length)tracker.state.hands=previous.hands;
          if(tracker.state.faces.length||tracker.state.hands.length)tracker.state.status='tracking';
        }
        self.postMessage({type:'result',state:tracker.state,generation,id:data.id,time:data.time,needsMore:tracker._forceNext});
      } finally {data.bitmap.close();}
    }
  }).catch(error=>self.postMessage({type:'error',error:error.message,generation:data.generation,id:data.id}));
};
