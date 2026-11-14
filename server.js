const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const PORT = process.env.PORT || 3000;
const root = path.join(__dirname, 'public');
const server = http.createServer((req,res)=>{
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(root,p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404);return res.end('Not found');}
    const ext=path.extname(file);
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
    res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});res.end(data);
  });
});
const wss = new WebSocket.Server({server});
const players = new Map();
const resources = new Map();
const worldSeed = 7331;
const COST={wall:[5,2],floor:[4,0],roof:[4,1],door:[4,1],window:[4,2],pillar:[2,1],fence:[2,0],stairs:[6,1],road:[0,3],camp:[3,1],lamp:[1,2]};
const felled = new Map(), built = [];
const zombies = new Map();
let zombieSeq = 0, isNight = false;
const lastHit = new Map();
const inv = p => ({type:'inventory',wood:p.wood,stone:p.stone,berries:p.berries,fish:p.fish});
function send(ws,obj){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}
function broadcast(obj,except){const s=JSON.stringify(obj);for(const c of wss.clients)if(c!==except&&c.readyState===WebSocket.OPEN)c.send(s);}
wss.on('connection',ws=>{
  const id=Math.random().toString(36).slice(2,9);
  const player={id,name:'Superviviente',x:0,y:0,z:5,yaw:0,hp:100,food:100,wood:0,stone:0,berries:0,fish:0,joined:Date.now()};
  players.set(id,player);ws.playerId=id;
  send(ws,{type:'welcome',id,players:[...players.values()].filter(p=>p.id!==id),resources:[...resources.values()],felled:[...felled],built,zombies:[...zombies.values()]});
  broadcast({type:'join',player},ws);
  ws.on('message',raw=>{
    let m;try{m=JSON.parse(raw)}catch{return}
    if(m.type==='move'){
      player.x=clamp(m.x,-250,250);player.y=0;player.z=clamp(m.z,-250,250);player.yaw=Number(m.yaw)||0;
      player.hp=clamp(Number(m.hp)||player.hp,0,100);player.food=clamp(Number(m.food)||player.food,0,100);
      if(typeof m.night==='boolean') isNight=m.night;
      broadcast({type:'move',player},ws);
    }
    if(m.type==='profile'){player.name=String(m.name||'Superviviente').slice(0,16);broadcast({type:'profile',player},ws)}
    if(m.type==='collect'){
      const key=String(m.key||'').slice(0,80); if(!key)return;
      if(!resources.has(key)) resources.set(key,{key,kind:m.kind,x:clamp(m.x,-250,250),z:clamp(m.z,-250,250),taken:false});
      const r=resources.get(key); if(!r.taken){r.taken=true;player[m.kind==='wood'?'wood':m.kind==='stone'?'stone':'berries']+=1;broadcast({type:'resourceTaken',key,by:id});send(ws,inv(player));}
    }
    if(m.type==='shot'){broadcast({type:'shot',a:[m.ox,m.oy,m.oz].map(Number),b:[m.ex,m.ey,m.ez].map(Number)},ws)}
    if(m.type==='zombieHit'){const z=zombies.get(String(m.zid));const now=Date.now(),key=id+':'+String(m.zid);if(z&&!z.dead&&now-(lastHit.get(key)||0)>180){const dx=player.x-z.x,dz=player.z-z.z,dist=Math.hypot(dx,dz),range=m.melee?3.4:270;if(dist<=range){lastHit.set(key,now);z.hp-=clamp(m.damage,0.5,12);if(z.hp<=0){z.dead=true;setTimeout(()=>zombies.delete(z.id),5000)}broadcast({type:'zombieUpdate',zombie:z})}}}
    if(m.type==='chop'){const i=Number(m.i);if(Number.isInteger(i)&&i>=0&&i<1000&&!felled.has(i)){const dir=Number(m.dir)||0;felled.set(i,dir);player.wood+=4;broadcast({type:'treeFelled',i,dir});send(ws,inv(player))}}
    if(m.type==='gain'){player.fish=Math.min(99,player.fish+clamp(m.n,1,2));send(ws,inv(player))}
    if(m.type==='eat'){if(m.k==='berries'&&player.berries>0)player.berries--;if(m.k==='fish'&&player.fish>0)player.fish--;send(ws,inv(player))}
    if(m.type==='build'){
      const c=COST[m.kind];if(!c)return;const cost={wood:c[0],stone:c[1]};
      if(player.wood>=cost.wood&&player.stone>=cost.stone){player.wood-=cost.wood;player.stone-=cost.stone;const item={id:Math.random().toString(36).slice(2,9),kind:m.kind,x:clamp(m.x,-250,250),z:clamp(m.z,-250,250),rot:Number(m.rot)||0,lvl:clamp(m.lvl,0,5),owner:id};built.push(item);broadcast({type:'built',item});send(ws,inv(player));}
    }
    if(m.type==='chat'){broadcast({type:'chat',name:player.name,text:String(m.text||'').slice(0,100)})}
  });
  ws.on('close',()=>{players.delete(id);broadcast({type:'leave',id})});
});
function clamp(v,a,b){v=Number(v);return Number.isFinite(v)?Math.max(a,Math.min(b,v)):0}
setInterval(()=>{
  const active=[...players.values()];
  if(isNight&&active.length&&zombies.size<Math.min(12,active.length*6)){
    const target=active[Math.floor(Math.random()*active.length)],a=Math.random()*Math.PI*2;
    const id='z'+(++zombieSeq),z={id,x:clamp(target.x+Math.cos(a)*32,-230,230),z:clamp(target.z+Math.sin(a)*32,-230,230),hp:4,dead:false};
    zombies.set(id,z);broadcast({type:'zombieSpawn',zombie:z});
  }
  for(const z of zombies.values()){
    if(z.dead)continue;
    let target=null,dist=Infinity;
    for(const p of active){const d=Math.hypot(p.x-z.x,p.z-z.z);if(d<dist){dist=d;target=p}}
    if(target&&dist<48&&dist>1.25){z.x=clamp(z.x+(target.x-z.x)/dist*0.85,-240,240);z.z=clamp(z.z+(target.z-z.z)/dist*0.85,-240,240)}
    if(target&&dist<1.65){target.hp=Math.max(0,target.hp-3);sendToPlayer(target.id,{type:'damage',hp:target.hp});}
  }
  broadcast({type:'snapshot',players:active,zombies:[...zombies.values()]});
},250);
function sendToPlayer(id,obj){for(const c of wss.clients){if(c.playerId===id)send(c,obj)}}
server.listen(PORT,'0.0.0.0',()=>console.log('Bosque Zombie Online en puerto '+PORT));
