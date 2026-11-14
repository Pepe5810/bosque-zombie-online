import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const $=s=>document.querySelector(s),overlay=$('#overlay'),hud=$('#hud'),hint=$('#hint');
const rng=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const R=rng(7331),clamp=THREE.MathUtils.clamp,WORLD=240,WL=-1,UP=new THREE.Vector3(0,1,0),RX=z=>24+Math.sin(z*.05)*8;
// ---- terreno procedural (misma semilla = mismo mundo para todos) ----
const P=new Uint8Array(512);{const r=rng(99),p=[...Array(256).keys()].sort(()=>r()-.5);for(let i=0;i<512;i++)P[i]=p[i&255]}
const hs=(x,y)=>P[(P[x&255]+y)&511]/255;
const vn=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),u=x-xi,v=y-yi,a=u*u*(3-2*u),b=v*v*(3-2*v);return hs(xi,yi)*(1-a)*(1-b)+hs(xi+1,yi)*a*(1-b)+hs(xi,yi+1)*(1-a)*b+hs(xi+1,yi+1)*a*b};
const H=(x,z)=>{const h=(vn(x*.035,z*.035)*2+vn(x*.1,z*.1)*.7)*1.6+.3,s=clamp(1-Math.abs(x-RX(z))/11,0,1),k=s*s*(3-2*s);return h*(1-k)-2.4*k};
const mat=(c,r=.9)=>new THREE.MeshStandardMaterial({color:c,roughness:r});
function tex(h,s,l,w,hh,rep,n=3500){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle=`hsl(${h},${s}%,${l}%)`;g.fillRect(0,0,256,256);
 for(let i=0;i<n;i++){g.fillStyle=`hsla(${h+R()*20-10},${s}%,${l+R()*26-13}%,.55)`;const x=R()*256,y=R()*256,ww=w*(.5+R()),h2=hh*(.5+R());for(const a of[0,-256])for(const b of[0,-256])g.fillRect(x+a,y+b,ww,h2)}
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep,rep);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t}
function waterNormal(){const N=128,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d'),d=g.createImageData(N,N),T=Math.PI*2/N;
 const f=(x,y)=>Math.sin(T*(3*x+2*y))+.6*Math.sin(T*(5*x-4*y)+1)+.4*Math.sin(T*(9*y+7*x)+2)+.25*Math.sin(T*(14*x-11*y)+4);
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){const dx=f(x+1,y)-f(x-1,y),dy=f(x,y+1)-f(x,y-1),l=Math.hypot(dx,dy,1.2),i=(y*N+x)*4;d.data[i]=(-dx/l*.5+.5)*255;d.data[i+1]=(-dy/l*.5+.5)*255;d.data[i+2]=(1.2/l*.5+.5)*255;d.data[i+3]=255}
 g.putImageData(d,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(110,110);return t}
// ---- estado ----
let scene,camera,renderer,sun,hemi,sky,skyMat,waterMat,ws,id,started=false,clock=new THREE.Clock(),time=0,day=1,keys={},yaw=0,pitch=0,vy=0,ground=true,sendT=0,swing=0,axe,
 hp=100,food=100,wood=0,stone=0,berries=0,fish=0,others=new Map(),resourceObjects=new Map(),trees=[],falling=[],ents=[],flames=[],place=null,ghost=null,brot=0,rod=null,spawnT=0,eatCd=0,hitCd=0,M={},walls=[],floors=[],wi=0,ammo=60,md=false,zoom=false,tracers=[],lvl=0;
const COST={wall:[5,2],floor:[4,0],roof:[4,1],door:[4,1],window:[4,2],pillar:[2,1],fence:[2,0],stairs:[6,1],road:[0,3],camp:[3,1],lamp:[1,2]},PC=COST;
const W=[{n:'Hacha'},{n:'Pistola',dmg:2,rate:.3,sp:.01,range:90},{n:'Rifle',dmg:2,rate:.1,sp:.03,range:130},{n:'Escopeta',dmg:1.5,rate:.9,sp:.14,range:35,pel:8},{n:'Francotirador',dmg:8,rate:1.4,sp:0,range:260}];
function init(){
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.1,270);camera.position.set(0,H(0,5)+1.7,5);camera.rotation.order='YXZ';scene.add(camera);
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.appendChild(renderer.domElement);
 scene.fog=new THREE.Fog('#bcd8e0',40,210);
 skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:{top:{value:new THREE.Color()},bot:{value:new THREE.Color()}},
  vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform vec3 top,bot;varying vec3 p;void main(){float h=clamp(normalize(p).y*1.6+.1,0.,1.);gl_FragColor=vec4(mix(bot,top,pow(h,.7)),1.);#include <colorspace_fragment>\n}'});
 sky=new THREE.Mesh(new THREE.SphereGeometry(250,24,12),skyMat);sky.frustumCulled=false;scene.add(sky);
 const es=new THREE.Scene(),em=skyMat.clone();em.uniforms.top.value.set('#4d8fd0');em.uniforms.bot.value.set('#cfe3e8');es.add(new THREE.Mesh(new THREE.SphereGeometry(10,16,8),em));const env=new THREE.PMREMGenerator(renderer).fromScene(es).texture;
 hemi=new THREE.HemisphereLight('#d8efff','#42532b',1.6);scene.add(hemi);sun=new THREE.DirectionalLight('#fff0c9',2.4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-45,right:45,top:45,bottom:-45,far:220});sun.shadow.bias=-.0005;scene.add(sun,sun.target);
 // terreno con colores por altura/pendiente + textura
 const tg=new THREE.PlaneGeometry(500,500,260,260);tg.rotateX(-Math.PI/2);const pos=tg.attributes.position;for(let i=0;i<pos.count;i++)pos.setY(i,H(pos.getX(i),pos.getZ(i)));tg.computeVertexNormals();
 const col=new Float32Array(pos.count*3),nr=tg.attributes.normal,C=[[.5,.85,.3],[1.2,1.05,.7],[.9,.9,.88],[.7,.55,.35]];
 for(let i=0;i<pos.count;i++){const y=pos.getY(i),sl=1-nr.getY(i),n=vn(pos.getX(i)*.3,pos.getZ(i)*.3);let c=C[0];if(y<WL+.45)c=C[1];else if(sl>.22)c=C[2];else if(n>.7)c=C[3];col.set(c.map(v=>v*(.85+n*.3)),i*3)}
 tg.setAttribute('color',new THREE.BufferAttribute(col,3));
 const terrain=new THREE.Mesh(tg,(()=>{const t=tex(0,0,62,3,6,130,9000);return new THREE.MeshStandardMaterial({map:t,bumpMap:t,bumpScale:3,vertexColors:true,roughness:1})})());terrain.receiveShadow=true;scene.add(terrain);
 // agua realista: normal map animado + reflejo del cielo + fresnel físico
 waterMat=new THREE.MeshPhysicalMaterial({color:'#1f6f86',roughness:.04,metalness:0,transparent:true,opacity:.8,normalMap:waterNormal(),normalScale:new THREE.Vector2(.7,.7),envMap:env,clearcoat:1,clearcoatRoughness:.05,ior:1.33,specularIntensity:1});
 const water=new THREE.Mesh(new THREE.PlaneGeometry(520,520),waterMat);water.rotation.x=-Math.PI/2;water.position.y=WL;scene.add(water);
 M={bark:new THREE.MeshStandardMaterial({map:tex(25,35,28,3,40,1.5,2500),roughness:1}),leaf:new THREE.MeshStandardMaterial({map:tex(130,45,24,4,4,2,4000),roughness:.9}),
  plank:new THREE.MeshStandardMaterial({map:tex(30,45,42,60,5,1,1500),roughness:.85}),floor:new THREE.MeshStandardMaterial({map:tex(32,40,48,70,4,1,1500),roughness:.85}),
  rock:new THREE.MeshStandardMaterial({map:tex(0,0,55,8,8,1,1500),roughness:1,flatShading:true})};
 for(const k of['bark','plank','floor','rock'])Object.assign(M[k],{bumpMap:M[k].map,bumpScale:2});M.dark=mat('#3a2a1c');M.glass=new THREE.MeshStandardMaterial({color:'#9fd0e0',transparent:true,opacity:.35,roughness:.05});M.roof=new THREE.MeshStandardMaterial({map:tex(8,45,32,30,6,1,1500),roughness:.8});M.road=new THREE.MeshStandardMaterial({map:tex(0,0,28,3,3,1,3000),roughness:.95});
 // árboles (talables)
 for(let i=0,n=0;n<520&&i<9000;i++){const x=(R()-.5)*470,z=(R()-.5)*470,y=H(x,z),sc=.8+R()*.8;if(y<WL+.5||Math.hypot(x,z-5)<5)continue;
  const g=new THREE.Group(),tr=new THREE.Mesh(new THREE.CylinderGeometry(.25,.42,4,8),M.bark);tr.position.y=2;g.add(tr);
  for(let j=0;j<3;j++){const c=new THREE.Mesh(new THREE.ConeGeometry(2.1-j*.45,2.7,8),M.leaf);c.position.y=3.2+j*1.15;g.add(c)}
  g.traverse(o=>{if(o.isMesh)o.castShadow=true});g.position.set(x,y,z);g.scale.setScalar(sc);g.rotation.y=R()*6;scene.add(g);trees.push({g,x,z,y,sc,r:.4*sc,hits:0,dead:false});n++}
 for(let i=0,n=0;n<150&&i<900;i++){const x=(R()-.5)*460,z=(R()-.5)*460,y=H(x,z);if(y<WL)continue;const o=new THREE.Mesh(new THREE.DodecahedronGeometry(.6+R()*.9,0),M.rock);o.position.set(x,y+.2,z);o.scale.y=.7;o.rotation.set(R()*3,R()*3,0);o.castShadow=true;scene.add(o);n++}
 const spawn=(k,cnt,sp)=>{for(let i=0,n=0;n<cnt&&i<4000;i++){const x=(R()-.5)*sp,z=(R()-.5)*sp;if(H(x,z)<WL+.3)continue;addResource(k,x,z,n++)}};spawn('wood',70,400);spawn('stone',70,400);spawn('berries',50,380);spawn('ammo',35,420);
 for(let i=0;i<30;i++){let x,z;do{x=(R()-.5)*420;z=(R()-.5)*420}while(H(x,z)<WL+.5);mkEnt('deer',x,z)}
 axe=new THREE.Group();camera.add(axe);viewModel();
 const st=$('.stats'),d=document.createElement('div');d.innerHTML='🍖 <b id="fish">0</b>';st.appendChild(d);const d2=document.createElement('div');d2.innerHTML='🔫 <b id="ammo">60</b> <span id="wn"></span>';st.appendChild(d2);
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
}
function addResource(kind,x,z,i){const y=H(x,z),g=new THREE.Group();let o;
 if(kind==='wood'){o=new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,1.3,8),M.bark);o.rotation.z=Math.PI/2;o.position.y=.25}
 else if(kind==='stone'){o=new THREE.Mesh(new THREE.DodecahedronGeometry(.45,0),M.rock);o.position.y=.35}
 else if(kind==='ammo'){o=new THREE.Mesh(new THREE.BoxGeometry(.5,.3,.35),mat('#4a5a3a'));o.position.y=.2}
 else{o=new THREE.Mesh(new THREE.SphereGeometry(.45,8,6),M.leaf);o.position.y=.4;g.add(o);for(let j=0;j<5;j++){const b=new THREE.Mesh(new THREE.SphereGeometry(.09,6,6),mat('#8d3e9d',.4));b.position.set(Math.sin(j*1.3)*.4,.4+Math.cos(j*2.1)*.2,Math.cos(j*1.3)*.4);g.add(b)}o=null}
 if(o)g.add(o);g.traverse(m=>{if(m.isMesh)m.castShadow=true});g.position.set(x,y,z);scene.add(g);resourceObjects.set(kind+'-'+i,{mesh:g,kind,x,z,taken:false})}
function mkEnt(type,x,z,netId=null){const g=new THREE.Group(),dz=type==='zombie',m=mat(dz?'#6f8f5c':'#9a6b3f'),part=(w,h,d,px,py,pz,mm=m)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mm);o.position.set(px,py,pz);o.castShadow=true;g.add(o)};
 if(dz){part(.6,.9,.35,0,1.25,0,mat('#3b4f6a'));part(.4,.4,.4,0,1.9,0);part(.15,.15,.8,-.4,1.5,.4);part(.15,.15,.8,.4,1.5,.4);part(.2,.8,.2,-.15,.4,0,mat('#2b3345'));part(.2,.8,.2,.15,.4,0,mat('#2b3345'))}
 else{part(.5,.55,1.2,0,1,0);part(.2,.6,.2,0,1.45,.6);part(.25,.25,.4,0,1.75,.8);for(const[a,b]of[[-.18,-.45],[.18,-.45],[-.18,.45],[.18,.45]])part(.1,.8,.1,a,.4,b)}
 g.position.set(x,H(x,z),z);scene.add(g);ents.push({g,type,hp:dz?4:3,x,z,tx:x,tz:z,wait:0,dead:0,burn:0,id:netId,networked:!!netId})}
// ---- red ----
function connect(){ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}`);
 ws.onopen=()=>ws.send(JSON.stringify({type:'profile',name:$('#name').value||'Superviviente'}));ws.onclose=()=>$('#online').textContent='Reconectando...';
 ws.onmessage=e=>{const m=JSON.parse(e.data);
  if(m.type==='welcome'){id=m.id;m.players.forEach(upsert);m.resources.forEach(r=>{const o=resourceObjects.get(r.key);if(o&&r.taken){o.taken=true;scene.remove(o.mesh)}});(m.felled||[]).forEach(([i,d])=>fell(i,d,true));(m.built||[]).forEach(makeBuilding);(m.zombies||[]).forEach(syncZombie)}
  if(['join','move','profile'].includes(m.type))upsert(m.player);
  if(m.type==='leave'){const o=others.get(m.id);if(o){scene.remove(o.mesh);others.delete(m.id)}}
  if(m.type==='snapshot'){m.players.filter(p=>p.id!==id).forEach(upsert);(m.zombies||[]).forEach(syncZombie)}
  if(m.type==='zombieSpawn'||m.type==='zombieUpdate')syncZombie(m.zombie);
  if(m.type==='damage'){hp=m.hp;if(hp<=0){hp=100;food=60;camera.position.set(0,H(0,5)+1.7,5);say('Has muerto. Reapareces en el campamento.')}}
  if(m.type==='resourceTaken'){const o=resourceObjects.get(m.key);if(o){o.taken=true;scene.remove(o.mesh)}}
  if(m.type==='inventory'){wood=m.wood;stone=m.stone;berries=m.berries;fish=m.fish||0}
  if(m.type==='treeFelled')fell(m.i,m.dir);if(m.type==='built')makeBuilding(m.item);if(m.type==='chat')say(m.name+': '+m.text);if(m.type==='shot')tracer([m.a[0],m.a[1],m.a[2]],[m.b[0],m.b[1],m.b[2]])}}
const send=o=>ws?.readyState===1&&ws.send(JSON.stringify(o));
function syncZombie(z){if(!z)return;let e=ents.find(q=>q.id===z.id);if(z.dead){if(e){scene.remove(e.g);ents.splice(ents.indexOf(e),1)}return}if(!e){mkEnt('zombie',z.x,z.z,z.id);e=ents[ents.length-1]}e.x=z.x;e.z=z.z;e.hp=z.hp;e.dead=0;e.g.position.set(z.x,H(z.x,z.z),z.z)}
function upsert(p){if(!p||p.id===id)return;let o=others.get(p.id);if(!o){const g=new THREE.Group(),b=new THREE.Mesh(new THREE.CapsuleGeometry(.35,.9,3,8),mat('#4f8aaf')),h=new THREE.Mesh(new THREE.SphereGeometry(.25,10,10),mat('#e2b994'));b.position.y=1;h.position.y=1.8;g.add(b,h);g.traverse(m=>{if(m.isMesh)m.castShadow=true});scene.add(g);o={mesh:g};others.set(p.id,o)}
 o.mesh.position.set(p.x,H(p.x,p.z),p.z);o.mesh.rotation.y=p.yaw+Math.PI}
// ---- talar, construir ----
function fell(i,dir,instant){const t=trees[i];if(!t||t.dead)return;t.dead=true;const s=new THREE.Mesh(new THREE.CylinderGeometry(.3*t.sc,.42*t.sc,.6,8),M.bark);s.position.set(t.x,t.y+.3,t.z);s.castShadow=true;scene.add(s);if(instant)scene.remove(t.g);else falling.push({t,dir,a:0})}
const NAMES={wall:'Pared',floor:'Suelo',roof:'Techo',door:'Puerta',window:'Ventana',pillar:'Pilar',fence:'Valla',stairs:'Escalera',road:'Carretera',camp:'Fogata',lamp:'Farola'},EDGE=['wall','door','window','fence'],CELL=['floor','roof','road','stairs'];
const bx=(w,h,d,m,x=0,y=0,z=0)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;return o};
function mk(k,gh){const g=new THREE.Group(),P=M.plank;
 if(k==='wall')g.add(bx(3,2.6,.25,P,0,1.3));else if(k==='fence')g.add(bx(3,1,.12,P,0,.5));
 else if(k==='door')g.add(bx(3,.5,.25,P,0,2.35),bx(.6,2.1,.25,P,-1.2,1.05),bx(.6,2.1,.25,P,1.2,1.05),bx(1.2,2.1,.1,M.dark,0,1.05));
 else if(k==='window')g.add(bx(3,.9,.25,P,0,.45),bx(3,.5,.25,P,0,2.35),bx(.6,1.2,.25,P,-1.2,1.5),bx(.6,1.2,.25,P,1.2,1.5),bx(1.8,1.2,.05,M.glass,0,1.5));
 else if(k==='floor')g.add(bx(3,.5,3,M.floor,0,.1));else if(k==='roof')g.add(bx(3,.3,3,M.roof,0,2.8));else if(k==='road')g.add(bx(3,.12,3,M.road,0,.06));
 else if(k==='pillar')g.add(bx(.5,3,.5,M.floor,0,1.5));
 else if(k==='stairs')for(let i=0;i<4;i++)g.add(bx(3,.75*(i+1),.75,M.floor,0,.375*(i+1),-1.125+i*.75));
 else if(k==='lamp'){g.add(bx(.12,3,.12,M.dark,0,1.5),new THREE.Mesh(new THREE.SphereGeometry(.2,8,8),new THREE.MeshBasicMaterial({color:'#ffe9a0'})));g.children[1].position.y=3.1}
 else{for(let i=0;i<4;i++){const l=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.8,6),M.bark);l.rotation.set(Math.PI/2.4,i*1.57,0);l.position.y=.2;g.add(l)}const f=new THREE.Mesh(new THREE.ConeGeometry(.25,.6,6),new THREE.MeshBasicMaterial({color:'#ff9a2e'}));f.position.y=.5;g.add(f);if(!gh){const L=new THREE.PointLight('#ff8a35',2,14);L.position.y=1;g.add(L);g.userData.fl={L,f}}}
 return g}
function makeBuilding(b){const base=H(b.x,b.z)+(b.lvl||0)*3,k=b.kind,o=mk(k),sw=Math.abs(Math.sin(b.rot||0))>.5;o.position.set(b.x,base,b.z);o.rotation.y=b.rot||0;scene.add(o);if(o.userData.fl)flames.push(o.userData.fl);
 const col=(lx,lz,hx,hz,y0,y1,top)=>{const q={x:b.x+(sw?lz:lx),z:b.z+(sw?-lx:lz),hx:sw?hz:hx,hz:sw?hx:hz,y0:base+y0,y1:base+y1,top:base+top};(top===undefined?walls:floors).push(q)};
 if(k==='wall'||k==='window')col(0,0,1.5,.125,0,2.6);else if(k==='fence')col(0,0,1.5,.125,0,1);else if(k==='door'){col(-1.2,0,.6,.125,0,2.6);col(1.2,0,.6,.125,0,2.6)}
 else if(k==='pillar')col(0,0,.25,.25,0,3);else if(k==='floor')col(0,0,1.5,1.5,0,0,.35);else if(k==='roof')col(0,0,1.5,1.5,0,0,2.95);
 else if(k==='stairs')for(let i=0;i<4;i++)col(0,-1.125+i*.75,1.5,.375,0,0,.75*(i+1))}
function spec(k){const d=new THREE.Vector3();camera.getWorldDirection(d);const px=camera.position.x+d.x*5,pz=camera.position.z+d.z*5,c=v=>Math.floor(v/3)*3+1.5,r=v=>Math.round(v/3)*3,o={lvl};
 if(CELL.includes(k))return{...o,x:c(px),z:c(pz),rot:k==='stairs'?brot:0};
 if(EDGE.includes(k))return brot?{...o,x:r(px),z:c(pz),rot:brot}:{...o,x:c(px),z:r(pz),rot:0};
 if(k==='pillar')return{...o,x:r(px),z:r(pz),rot:0};return{...o,x:px,z:pz,rot:0}}
function startPlace(k){if(!k)return;const[w,s]=COST[k];if(wood<w||stone<s){hint.textContent='Te faltan materiales: '+w+' madera, '+s+' piedra';return}place=k;if(ghost)scene.remove(ghost);
 ghost=mk(k,true);const gm=new THREE.MeshBasicMaterial({color:'#7fff7f',transparent:true,opacity:.45});ghost.traverse(o=>{if(o.isMesh)o.material=gm});scene.add(ghost);$('#buildMenu').classList.add('hidden');hint.textContent='Clic: colocar · R: girar · T: subir piso · Esc: cancelar'}
function cancelPlace(){place=null;if(ghost){scene.remove(ghost);ghost=null}}
// ---- armas ----
function viewModel(){axe.clear();const dk=mat('#222',.4);if(!wi){const bl=bx(.28,.14,.04,mat('#9aa3a8',.4));bl.position.set(.12,.2,0);axe.add(bx(.05,.5,.05,M.bark),bl);axe.position.set(.38,-.35,-.6);axe.rotation.set(.2,0,-.3)}
 else{const L=[0,.5,.7,.6,1][wi];axe.add(bx(.07,.1,.35+L*.5,dk,0,0,-L*.25),bx(.06,.18,.08,dk,0,-.12,.1));axe.position.set(.25,-.25,-.55);axe.rotation.set(.1,0,0)}}
function setWeapon(i){wi=i;cancelPlace();zoom=false;viewModel();hint.textContent=W[i].n+(i?' · clic derecho: '+(i===4?'zoom':'-'):'')}
function tracer(a,b){const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]),new THREE.LineBasicMaterial({color:'#ffe9a0'}));scene.add(l);tracers.push({l,t:.07})}
function hurt(e,n){e.hp-=n;if(e.type==='deer'){e.tx=e.x+(e.x-camera.position.x)*5;e.tz=e.z+(e.z-camera.position.z)*5}if(e.hp<=0&&!e.dead){e.dead=.01;if(e.type==='deer'){gain(2);hint.textContent='Cazado: +2 carne'}else ammo+=6}}
function fire(){const w=W[wi];if(hitCd>0)return;if(ammo<=0){hint.textContent='Sin munición (busca cajas verdes)';hitCd=.4;return}hitCd=w.rate;ammo--;swing=1;const o=camera.position.clone();
 for(let k=0;k<(w.pel||1);k++){const d=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);d.x+=(Math.random()-.5)*w.sp;d.y+=(Math.random()-.5)*w.sp;d.z+=(Math.random()-.5)*w.sp;d.normalize();let best=null,bt=w.range;
  for(const e of ents){if(e.dead)continue;const c=new THREE.Vector3(e.x,e.g.position.y+1,e.z).sub(o),t=c.dot(d);if(t<0||t>bt)continue;if(c.addScaledVector(d,-t).length()<.8){best=e;bt=t}}
  if(best){if(best.type==='zombie'&&best.networked)send({type:'zombieHit',zid:best.id,damage:w.dmg,melee:false});else hurt(best,w.dmg)}const e2=o.clone().addScaledVector(d,bt),s=o.clone().add(new THREE.Vector3(.3,-.25,0).applyQuaternion(camera.quaternion));tracer(s.toArray(),e2.toArray());send({type:'shot',ox:s.x,oy:s.y,oz:s.z,ex:e2.x,ey:e2.y,ez:e2.z})}}
function act(btn){if(btn===2){if(wi===4)zoom=!zoom;return}if(wi===0)attack();else fire()}
// ---- acciones ----
const facing=(x,z,max,min=.6)=>{const d=new THREE.Vector3();camera.getWorldDirection(d);const dx=x-camera.position.x,dz=z-camera.position.z,l=Math.hypot(dx,dz);return l<max&&(l<1||(dx*d.x+dz*d.z)/l/Math.hypot(d.x,d.z)>min)?l:null};
function attack(){if(hitCd>0)return;hitCd=.45;swing=1;let best=null,bd=3.2;
 for(const e of ents)if(!e.dead){const d=facing(e.x,e.z,bd,.75);if(d!==null){best=e;bd=d}}
 if(best){if(best.type==='zombie'&&best.networked){send({type:'zombieHit',zid:best.id,damage:1,melee:true});return}best.hp--;if(best.type==='deer'){best.tx=best.x+(best.x-camera.position.x)*5;best.tz=best.z+(best.z-camera.position.z)*5}if(best.hp<=0){best.dead=.01;if(best.type==='deer'){gain(2);hint.textContent='Cazado: +2 carne'}}return}
 let bt=null;bd=4;trees.forEach(t=>{if(t.dead)return;const d=facing(t.x,t.z,bd,.8);if(d!==null){bt=t;bd=d}});
 if(bt){bt.hits++;bt.g.rotation.z=.03;setTimeout(()=>bt.g.rotation.z=0,80);hint.textContent='Talando… '+bt.hits+'/5';if(bt.hits>=5){const i=trees.indexOf(bt),d=Math.atan2(bt.x-camera.position.x,bt.z-camera.position.z);send({type:'chop',i,dir:d});if(ws?.readyState!==1){fell(i,d);wood+=4}}}}
function gain(n){fish=Math.min(fish+n,99);send({type:'gain',n})}
function collect(){let b=null,dist=3;for(const[k,r]of resourceObjects){if(r.taken)continue;const d=Math.hypot(camera.position.x-r.x,camera.position.z-r.z);if(d<dist){b={key:k,...r};dist=d}}
 if(b){send({type:'collect',key:b.key,kind:b.kind,x:b.x,z:b.z});const o=resourceObjects.get(b.key);o.taken=true;scene.remove(o.mesh);if(b.kind==='wood')wood++;if(b.kind==='stone')stone++;if(b.kind==='berries')berries++;if(b.kind==='ammo'){ammo+=15}hint.textContent='Recogido: '+b.kind}else hint.textContent='Nada cerca (E recoge · clic izq. ataca/tala)'}
function eat(){if(eatCd>0)return;eatCd=.6;if(berries>0){berries--;food=Math.min(100,food+12);send({type:'eat',k:'berries'})}else if(fish>0){fish--;food=Math.min(100,food+30);hp=Math.min(100,hp+8);send({type:'eat',k:'fish'})}else hint.textContent='No tienes comida'}
function fishing(){const d=new THREE.Vector3();camera.getWorldDirection(d);
 if(rod){if(rod.s===2&&rod.t>0){gain(1);hint.textContent='¡Pescado! +1 🍖'}else hint.textContent='Se escapó…';scene.remove(rod.m);rod=null;return}
 const t=(WL-camera.position.y)/d.y,p=camera.position;if(d.y>-.03||t>14||t<2){hint.textContent='Apunta al agua (2-14 m) para pescar';return}
 const x=p.x+d.x*t,z=p.z+d.z*t;if(H(x,z)>WL-.2){hint.textContent='Ahí no hay agua suficiente';return}
 const m=new THREE.Mesh(new THREE.SphereGeometry(.12,8,8),mat('#e03030'));m.position.set(x,WL,z);scene.add(m);rod={m,s:1,t:3+Math.random()*5};hint.textContent='Esperando que pique…'}
function say(t){const l=$('#chatlog');l.textContent=t;setTimeout(()=>{if(l.textContent===t)l.textContent=''},4000)}
// ---- entrada ----
$('#play').onclick=()=>{init();started=true;overlay.style.display='none';hud.style.display='block';connect();renderer.domElement.requestPointerLock();animate()};
const locked=()=>document.pointerLockElement===renderer?.domElement;
document.addEventListener('mousemove',e=>{if(locked()){yaw-=e.movementX*.002;pitch=clamp(pitch-e.movementY*.002,-1.25,1.25);camera.rotation.set(pitch,yaw,0,'YXZ')}});
document.addEventListener('mousedown',e=>{if(!started||e.target.closest('#buildMenu'))return;if(!locked()){renderer.domElement.requestPointerLock();return}if(place&&e.button===0){const s=spec(place);send({type:'build',kind:place,x:s.x,z:s.z,rot:s.rot,lvl:s.lvl});const[w,st]=COST[place];if(ws?.readyState!==1)makeBuilding({kind:place,...s});wood-=w;stone-=st;if(wood<w||stone<st)cancelPlace()}else{md=true;act(e.button)}});document.addEventListener('mouseup',()=>md=false);addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('keydown',e=>{keys[e.code]=true;if(!started)return;
 if(e.code==='KeyB'){const m=$('#buildMenu');m.classList.toggle('hidden');if(!m.classList.contains('hidden'))document.exitPointerLock()}
 if(e.code==='Escape'){$('#buildMenu').classList.add('hidden');cancelPlace()}
 if(e.code==='Space'&&ground){vy=7;ground=false}if(e.code==='KeyE')collect();if(e.code==='KeyF')eat();if(e.code==='KeyG')fishing();
 if(e.code==='KeyR'){brot=brot?0:Math.PI/2}if(/^Digit[1-5]$/.test(e.code))setWeapon(+e.code[5]-1);if(e.code==='KeyT')lvl=(lvl+1)%6;
 if(e.code==='Enter'){document.exitPointerLock();const t=prompt('Mensaje para tu compañero:');if(t)send({type:'chat',text:t})}});
document.addEventListener('keyup',e=>keys[e.code]=false);
{const m=$('#buildMenu');m.innerHTML='<b>CONSTRUIR</b>'+Object.entries(PC).map(([k,c])=>`<button data-build="${k}">${NAMES[k]} · ${c[0]}🪵 ${c[1]}🪨</button>`).join('')+'<small>R girar · T subir piso · Esc cerrar</small>';m.querySelectorAll('[data-build]').forEach(b=>b.onclick=()=>{startPlace(b.dataset.build);renderer.domElement.requestPointerLock()})}
// ---- bucle ----
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);time+=dt;eatCd-=dt;hitCd-=dt;
 const hour=(time/25+8)%24,ang=(hour-6)/24*Math.PI*2,dl=clamp(Math.sin(ang)*1.4+.25,.04,1);day=1+Math.floor((time/25+8)/24);
 skyMat.uniforms.top.value.set('#050a18').lerp(new THREE.Color('#4d8fd0'),dl);skyMat.uniforms.bot.value.set('#0b1226').lerp(new THREE.Color('#cfe3e8'),dl);scene.fog.color.copy(skyMat.uniforms.bot.value);
 hemi.intensity=.25+1.4*dl;sun.intensity=2.4*dl;const p=camera.position;sun.position.set(p.x+Math.cos(ang)*70,Math.max(Math.sin(ang),.1)*70,p.z+25);sun.target.position.set(p.x,0,p.z);sky.position.copy(p);
 waterMat.normalMap.offset.x=time*.012;waterMat.normalMap.offset.y=time*.007;waterMat.envMapIntensity=.15+.85*dl;
 // movimiento
 const f=(keys.KeyW?1:0)-(keys.KeyS?1:0),sd=(keys.KeyD?1:0)-(keys.KeyA?1:0),swim=H(p.x,p.z)<WL-.1,sp=(keys.ShiftLeft&&!swim?8:5)*(swim?.5:1),mv=new THREE.Vector3(sd,0,-f);
 if(mv.lengthSq())mv.normalize().multiplyScalar(sp*dt).applyAxisAngle(UP,yaw);
 let nx=clamp(p.x+mv.x,-WORLD,WORLD),nz=clamp(p.z+mv.z,-WORLD,WORLD);
 for(const t of trees)if(!t.dead){const dx=nx-t.x,dz=nz-t.z,d=Math.hypot(dx,dz),m=t.r+.4;if(d<m&&d>0){nx=t.x+dx/d*m;nz=t.z+dz/d*m}}
 const feet=p.y-1.7;for(const w of walls){if(Math.abs(nx-w.x)>5||Math.abs(nz-w.z)>5||feet>w.y1-.3||feet+1.8<w.y0)continue;const dx=nx-w.x,dz=nz-w.z,ox=w.hx+.4-Math.abs(dx),oz=w.hz+.4-Math.abs(dz);if(ox>0&&oz>0){if(ox<oz)nx+=(dx<0?-1:1)*ox;else nz+=(dz<0?-1:1)*oz}}
 let gb=Math.max(H(nx,nz),WL-.3);for(const f of floors)if(Math.abs(nx-f.x)<f.hx+.1&&Math.abs(nz-f.z)<f.hz+.1&&f.top<=feet+.8&&f.top>gb)gb=f.top;
 p.x=nx;p.z=nz;const gy=gb+1.7+(swim?Math.sin(time*2)*.04:0);vy-=18*dt;p.y+=vy*dt;if(p.y<gy){p.y=gy;vy=0;ground=true}
 // supervivencia
 food=Math.max(0,food-dt*.08);if(food===0)hp-=dt*.6;else if(food>60&&hp<100)hp=Math.min(100,hp+dt*.4);
 if(hp<=0){hp=100;food=60;p.set(0,H(0,5)+1.7,5);say('Has muerto. Reapareces en el campamento.')}
 sendT+=dt;if(sendT>.1){sendT=0;send({type:'move',x:p.x,z:p.z,yaw,hp,food,night:dl<.35})}
 // árboles cayendo
 for(let i=falling.length-1;i>=0;i--){const q=falling[i];q.a+=dt;q.t.g.rotation.order='YXZ';q.t.g.rotation.y=q.dir;q.t.g.rotation.x=Math.min(q.a/1.3,1)**2*1.5;if(q.a>6){scene.remove(q.t.g);falling.splice(i,1)}}
 // fuegos
 flames.forEach(fl=>{fl.L.intensity=1.8+Math.random()*.8;fl.f.scale.y=.8+Math.random()*.5});
 // caña de pescar
 if(rod){rod.t-=dt;if(rod.s===1){rod.m.position.y=WL+Math.sin(time*3)*.02;if(rod.t<=0){rod.s=2;rod.t=1.5;hint.textContent='¡PICA! Pulsa G ya'}}else{rod.m.position.y=WL-.15*Math.abs(Math.sin(time*12));if(rod.t<=0){scene.remove(rod.m);rod=null;hint.textContent='Se escapó…'}}}
 // fantasma de construcción
 if(ghost){const s=spec(place),y=H(s.x,s.z);ghost.position.set(s.x,y+s.lvl*3,s.z);ghost.rotation.y=s.rot}
 // animales y zombis
 spawnT-=dt;
 for(let i=ents.length-1;i>=0;i--){const e=ents[i];
  if(e.dead){e.dead+=dt;e.g.rotation.z=Math.min(e.dead*3,1.5);if(e.dead>15){scene.remove(e.g);ents.splice(i,1)}continue}
  const dx=p.x-e.x,dz=p.z-e.z,d=Math.hypot(dx,dz);let vx=0,vz=0;
  if(e.type==='zombie'){if(e.networked){e.g.position.set(e.x,H(e.x,e.z),e.z);continue}else{scene.remove(e.g);ents.splice(i,1);continue}}
  else if(d<14){vx=-dx/d*6.5;vz=-dz/d*6.5}else{e.wait-=dt;if(e.wait<=0){e.wait=3+Math.random()*5;e.tx=e.x+(Math.random()-.5)*20;e.tz=e.z+(Math.random()-.5)*20}const tx=e.tx-e.x,tz=e.tz-e.z,td=Math.hypot(tx,tz);if(td>1){vx=tx/td*1.5;vz=tz/td*1.5}}
  const ex=clamp(e.x+vx*dt,-WORLD,WORLD),ez=clamp(e.z+vz*dt,-WORLD,WORLD);if(H(ex,ez)>WL-.1||e.type==='zombie'){e.x=ex;e.z=ez}else e.wait=0;
  e.g.position.set(e.x,H(e.x,e.z),e.z);if(vx||vz)e.g.rotation.y=Math.atan2(vx,vz)}
 // arma
 swing=Math.max(0,swing-dt*3);axe.rotation.x=(wi?.1:.2)-Math.sin(swing*Math.PI)*(wi?.25:1.2);if(md&&wi===2&&!place)fire();camera.fov+=((zoom&&wi===4?22:75)-camera.fov)*Math.min(1,dt*10);camera.updateProjectionMatrix();for(let i=tracers.length-1;i>=0;i--){tracers[i].t-=dt;if(tracers[i].t<=0){scene.remove(tracers[i].l);tracers.splice(i,1)}}
 $('#day').textContent='DÍA '+day+' · '+String(Math.floor(hour)).padStart(2,'0')+':'+String(Math.floor(hour%1*60)).padStart(2,'0');
 $('#hp').textContent=Math.round(hp);$('#food').textContent=Math.round(food);$('#wood').textContent=wood;$('#stone').textContent=stone;$('#berries').textContent=berries;$('#fish').textContent=fish;$('#ammo').textContent=ammo;$('#wn').textContent=W[wi].n;$('#online').textContent='● '+(others.size+1)+' superviviente(s) online';
 renderer.render(scene,camera)}
