/** Keep inference off the compositor thread so playback/recording stay smooth. */
export class BackgroundTracker {
  constructor({onStatus=()=>{}}={}) {
    this.state={faces:[],hands:[],status:'idle',error:null};this.onStatus=onStatus;
    this.worker=null;this.generation=0;this.lastTime=-1;this.lastSent=-Infinity;this.id=0;this.inFlight=0;this.needsMore=false;this.source='';this.lastResult=-Infinity;
  }
  publish(state){this.state=state;this.onStatus(this.state);}
  init(){
    if(this.initializing)return this.initializing;
    if(this.worker&&this.state.status!=='error')return Promise.resolve(this.state);
    this.publish({...this.state,status:'loading',error:null});
    this.initializing=new Promise(resolve=>{
      this.resolveInit=resolve;
      if(!this.worker){
        try{this.worker=new Worker(new URL('./tracking-worker.js',import.meta.url));}
        catch(error){this.fail(error.message);return;}
        this.worker.onmessage=({data})=>{
          if(data.type==='ready'){
            this.publish({...data.state,faces:[],hands:[]});this.finishInit();
          }else if(data.type==='result'){
            if(data.id===this.inFlight)this.inFlight=0;
            if(data.generation!==this.generation)return;
            this.needsMore=data.needsMore;this.lastResult=performance.now();this.resultTime=data.time;this.resultGeneration=data.generation;this.publish(data.state);
          }else if(data.type==='error'){
            if(!data.id||data.id===this.inFlight)this.inFlight=0;
            if(data.generation===undefined||data.generation===this.generation)this.fail(data.error);
          }
        };
        this.worker.onerror=event=>{event.preventDefault();this.fail(event.message||'Не удалось запустить фоновое распознавание.');};
      }
      this.worker.postMessage({type:'init'});
      this.initTimer=setTimeout(()=>this.fail('Модели распознавания не загрузились вовремя. Нажми «Повторить».'),45000);
    });
    return this.initializing;
  }
  finishInit(){clearTimeout(this.initTimer);this.resolveInit?.(this.state);this.resolveInit=null;this.initializing=null;}
  fail(message){this.publish({faces:[],hands:[],status:'error',error:message});this.finishInit();}
  async update(video,now=performance.now()){
    if(!this.worker){if(this.state.status==='idle')this.init();return this.state;}
    if(['loading','error'].includes(this.state.status))return this.state;
    const source=video.currentSrc||video.src;
    if(source!==this.source){this.source=source;this.reset();}
    if(video.seeking||video.readyState<2)return this.state;
    if(!video.paused&&now-this.lastResult>750&&this.state.faces.length+this.state.hands.length){this.publish({...this.state,faces:[],hands:[],status:'searching'});}
    if(this.inFlight||now-this.lastSent<100)return this.state;
    if(video.currentTime===this.lastTime&&!this.needsMore)return this.state;
    const id=++this.id;this.inFlight=id;const generation=this.generation,time=video.currentTime;
    this.lastSent=now;this.lastTime=time;
    try{
      const bitmap=await createImageBitmap(video);
      if(generation!==this.generation){bitmap.close();this.inFlight=0;return this.state;}
      this.worker.postMessage({type:'frame',bitmap,time,paused:video.paused,timestamp:now,generation,id},[bitmap]);
    }catch(error){this.inFlight=0;this.fail(error.message);}
    return this.state;
  }
  reset(){this.generation++;this.lastTime=-1;this.needsMore=false;this.publish({...this.state,faces:[],hands:[]});this.worker?.postMessage({type:'reset',generation:this.generation});}
  dispose(){this.worker?.terminate();this.worker=null;this.finishInit();this.publish({faces:[],hands:[],status:'disposed',error:null});}
}
