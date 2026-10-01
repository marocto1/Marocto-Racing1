const KEYMAP={KeyW:[0,'throttle'],KeyS:[0,'brake'],KeyA:[0,'left'],KeyD:[0,'right'],ShiftLeft:[0,'nitro'],ShiftRight:[0,'nitro'],Space:[0,'handbrake'],KeyR:[0,'reset'],ArrowUp:[1,'throttle'],ArrowDown:[1,'brake'],ArrowLeft:[1,'left'],ArrowRight:[1,'right'],Enter:[1,'nitro'],ControlRight:[1,'handbrake'],Backspace:[1,'reset']};
const ACTIONS={g:'throttle',b:'brake',l:'left',r:'right',n:'nitro',d:'handbrake',reset:'reset'};
function channel(){return {throttle:0,brake:0,left:0,right:0,nitro:0,handbrake:0,reset:0,steer:0};}
export class InputManager {
  constructor(root=document){
    this.keyboard=[channel(),channel()];this.touch=[channel(),channel()];this.gamepad=[channel(),channel()];this.players=[channel(),channel()];
    this.keys=new Set();this.pointers=new Map();this.enabled=false;
    this.onKey=(e,down)=>{const m=KEYMAP[e.code];if(!m||!this.enabled)return;e.preventDefault();if(down)this.keys.add(e.code);else this.keys.delete(e.code);this.rebuildKeyboard();};
    window.addEventListener('keydown',e=>this.onKey(e,true));window.addEventListener('keyup',e=>this.onKey(e,false));
    window.addEventListener('blur',()=>this.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear();});
    root.querySelectorAll('[data-p][data-k]').forEach(button=>{
      button.addEventListener('pointerdown',e=>{if(!this.enabled)return;e.preventDefault();button.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,{p:+button.dataset.p,action:ACTIONS[button.dataset.k],button});this.rebuildTouch();});
      for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,e=>{e.preventDefault();this.pointers.delete(e.pointerId);this.rebuildTouch();});
      button.addEventListener('contextmenu',e=>e.preventDefault());
    });
  }
  setEnabled(v){this.enabled=v;this.clear();}
  rebuildKeyboard(){for(const k of this.keyboard)for(const a in k)k[a]=0;for(const code of this.keys){const m=KEYMAP[code];this.keyboard[m[0]][m[1]]=1;}}
  rebuildTouch(){for(const t of this.touch)for(const a in t)t[a]=0;document.querySelectorAll('[data-p][data-k]').forEach(b=>b.classList.remove('pressed'));for(const ptr of this.pointers.values()){this.touch[ptr.p][ptr.action]=1;ptr.button.classList.add('pressed');}}
  // Future controllers use this channel without touching the simulation or touch code.
  setGamepad(player,state){const g=this.gamepad[player];for(const a in g)g[a]=Number(state[a])||0;}
  sample(){for(let p=0;p<2;p++){const out=this.players[p],k=this.keyboard[p],t=this.touch[p],g=this.gamepad[p];for(const a in out)out[a]=Math.max(k[a],t[a],g[a]);out.steer=Math.max(-1,Math.min(1,out.right-out.left+g.steer));}return this.players;}
  clear(){this.keys.clear();this.pointers.clear();for(const channels of [this.keyboard,this.touch,this.gamepad,this.players])for(const c of channels)for(const a in c)c[a]=0;document.querySelectorAll('.pressed').forEach(b=>b.classList.remove('pressed'));}
}
