import type { Attribute, Player, PlayerCatalog } from '../../domain/players.js';
import type { Lineup, LineupDraft, SelectionDraft, TeamSelection } from '../../domain/teams.js';
import { FORMATIONS } from '../../config/formations.ts';
import { CARD_POSITIONS } from '../player-profile/player-card.ts';
import { playerInsights } from '../player-profile/profile-insights.ts';
import { playerKitMarkup, playerVisualIdentity, teamKitMarkup } from '../player-profile/player-kit.ts';
import { attributeOnTwenty, roleOnTwenty, roleStarUnits } from '../player-profile/presentation.ts';
import { ATTRIBUTE_LABELS } from '../player-profile/model.ts';

export type SocialFormat='story'|'portrait';
export type SocialSource=
  | {readonly kind:'player';readonly player:Player;readonly catalog:PlayerCatalog}
  | {readonly kind:'squads';readonly selection:SelectionDraft;readonly catalog:PlayerCatalog;readonly lineups?:LineupDraft};
export interface SocialImage {readonly title:string;readonly filename:string;readonly blob:Blob}
const W=1080,GOLD='#e7c181',TEXT='#edf1f7',MUTED='#9caec4',BLUE='#8cb4ed',RED='#e598a8';
type Ctx=CanvasRenderingContext2D;
const family='Manrope,"Segoe UI",sans-serif';
const dimensions=(format:SocialFormat)=>({width:W,height:format==='story'?1920:1350});
const safeName=(value:string)=>value.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'oyuncu';

function text(c:Ctx,value:string,x:number,y:number,size=26,color=TEXT,weight=600,align:CanvasTextAlign='left'){
  c.font=`${weight} ${size}px ${family}`;c.fillStyle=color;c.textAlign=align;c.textBaseline='alphabetic';c.fillText(value,x,y);
}
function lines(c:Ctx,value:string,width:number,size:number,weight=500):string[]{
  c.font=`${weight} ${size}px ${family}`;
  const result:string[]=[];let line='';
  for(const word of value.split(/\s+/u)){
    const next=line?`${line} ${word}`:word;
    if(c.measureText(next).width<=width){line=next;continue;}
    if(line){result.push(line);line='';}
    // Guest names may contain a single long word; do not let it escape the card.
    for(const char of word){if(line&&c.measureText(line+char).width>width){result.push(line);line='';}line+=char;}
  }
  if(line)result.push(line);return result;
}
function paragraph(c:Ctx,value:string,x:number,y:number,width:number,size=25,color=MUTED,weight=500,lineHeight=size*1.5){
  const wrapped=lines(c,value,width,size,weight);wrapped.forEach((line,i)=>text(c,line,x,y+i*lineHeight,size,color,weight));return wrapped.length*lineHeight;
}
function fit(c:Ctx,value:string,width:number,size:number,min=18){c.font=`700 ${size}px ${family}`;while(size>min&&c.measureText(value).width>width){size--;c.font=`700 ${size}px ${family}`;}return size;}
function rect(c:Ctx,x:number,y:number,w:number,h:number,r=14,fill='#222e3e',stroke='#ffffff12'){
  c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}
}
function rule(c:Ctx,x:number,y:number,w:number,color='#ffffff14'){c.beginPath();c.moveTo(x,y);c.lineTo(x+w,y);c.strokeStyle=color;c.lineWidth=1;c.stroke();}
function section(c:Ctx,label:string,y:number,aside=''){
  text(c,label,64,y,21,GOLD,750);if(aside)text(c,aside,1016,y,19,MUTED,500,'right');rule(c,64,y+23,952);
}
function base(h:number,type:string,page=1,total=1){
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=h;const c=canvas.getContext('2d',{alpha:false});
  if(!c)throw new Error('Bu tarayıcı görsel oluşturamıyor.');
  const bg=c.createLinearGradient(0,0,W,h);bg.addColorStop(0,'#263243');bg.addColorStop(.5,'#171f2b');bg.addColorStop(1,'#111a27');c.fillStyle=bg;c.fillRect(0,0,W,h);
  const glow=c.createRadialGradient(1000,100,0,1000,100,780);glow.addColorStop(0,'#9f794018');glow.addColorStop(1,'#9f794000');c.fillStyle=glow;c.fillRect(0,0,W,h);
  c.save();c.strokeStyle='#ffffff03';c.lineWidth=1;for(let i=-h;i<W;i+=100){c.beginPath();c.moveTo(i,0);c.lineTo(i+h,h);c.stroke();}c.restore();
  text(c,'A.',64,95,49,GOLD,800);text(c,'ALSANCAK',137,88,24,TEXT,800);text(c,type,1016,86,18,MUTED,650,'right');rule(c,64,125,952);
  rule(c,64,h-80,952);text(c,'ALSANCAK  /  SAHANIN HİKÂYESİ',64,h-43,16,MUTED,650);text(c,`${String(page).padStart(2,'0')} / ${String(total).padStart(2,'0')}`,1016,h-43,17,GOLD,650,'right');
  return {canvas,c};
}
async function loadImage(url:string):Promise<HTMLImageElement>{
  return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Görsel yüklenemedi.'));img.src=url;});
}
async function kit(markup:string):Promise<HTMLImageElement>{
  const svg=markup.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="300" height="292" ');
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));try{return await loadImage(url);}finally{URL.revokeObjectURL(url);}
}
function image(c:Ctx,img:HTMLImageElement,x:number,y:number,w:number,h=w*292/300){c.save();c.shadowColor='#060c1855';c.shadowBlur=28;c.shadowOffsetY=15;c.drawImage(img,x,y,w,h);c.restore();}
function star(c:Ctx,x:number,y:number,r:number,units:number){
  const path=new Path2D();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rad=i%2?r*.44:r,px=x+Math.cos(a)*rad,py=y+Math.sin(a)*rad;if(i)path.lineTo(px,py);else path.moveTo(px,py);}path.closePath();
  c.fillStyle='#455064';c.fill(path);if(units){c.save();c.clip(path);c.fillStyle=GOLD;c.fillRect(x-r,y-r,2*r*(units/2),2*r);c.restore();}
}
function stars(c:Ctx,rating:number,x:number,y:number,r=12){const units=roleStarUnits(rating);for(let i=0;i<5;i++)star(c,x+i*r*2.65,y,r,Math.max(0,Math.min(2,units-i*2)));}
async function png(canvas:HTMLCanvasElement):Promise<Blob>{return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG oluşturulamadı.')),'image/png'));}
function grade(n:number){return n>=16?'#24dd85':n>=10?'#e8df48':'#ef6871';}

async function playerProfile(player:Player,catalog:PlayerCatalog,h:number){
  const {canvas,c}=base(h,'OYUNCU PROFİLİ',1,2),tall=h>1500,insight=playerInsights(player,catalog);
  const glow=c.createRadialGradient(820,tall?420:340,15,820,tall?420:340,270);glow.addColorStop(0,'#cb9c3824');glow.addColorStop(1,'#cb9c3800');c.fillStyle=glow;c.fillRect(560,140,500,560);
  const visual=playerVisualIdentity(player);let portrait:HTMLImageElement|null=null;
  if(visual.portraitUrl){try{portrait=await loadImage(visual.portraitUrl);}catch{/* Authored shirt remains available if a future portrait cannot be exported. */}}
  const hero=portrait??await kit(playerKitMarkup(player)),heroY=tall?230:175,heroW=tall?410:360;
  if(portrait){const ratio=Math.min(heroW/portrait.naturalWidth,420/portrait.naturalHeight),pw=portrait.naturalWidth*ratio,ph=portrait.naturalHeight*ratio;image(c,hero,810-pw/2,heroY,pw,ph);}else image(c,hero,810-heroW/2,heroY,heroW);
  text(c,player.origin.kind==='guest'?'MİSAFİR OYUNCU':'OYUNCU DOSYASI',64,tall?236:211,18,GOLD,750);
  let size=tall?96:87;while(lines(c,player.name,530,size,800).length>2&&size>42)size-=2;
  const nameLines=lines(c,player.name,530,size,800),nameY=tall?352:310;
  nameLines.forEach((line,i)=>text(c,line,64,nameY+i*size*1.12,size,TEXT,800));
  const roleY=nameY+(nameLines.length-1)*size*1.12+53;
  text(c,CARD_POSITIONS[player.mainPosition],64,roleY,28,'#d5dfed',650);paragraph(c,insight.style,64,roleY+47,510,24,GOLD,600);
  if(player.origin.kind==='guest'){
    const origin=player.origin,ref=catalog.players.find(p=>p.id===origin.referencePlayerId);if(ref)paragraph(c,`${ref.name} referansıyla`,64,roleY+118,510,20,MUTED);
  }
  const statsY=tall?760:570;section(c,player.kind==='goalkeeper'?'KALECİLİK':'ÖZELLİKLER',statsY,'20 ÜZERİNDEN');
  if(player.kind==='outfield'){
    const keys:readonly Attribute[]=['passing','vision','control','dribbling','shooting','finishing','speed','stamina','strength','positioning','defending','pressing'];
    const rowH=tall?100:68,panelY=statsY+51;
    for(let i=0;i<keys.length;i++){
      const key=keys[i]!,col=i%2,row=Math.floor(i/2),x=64+col*486,y=panelY+row*rowH,value=attributeOnTwenty(player.attributes[key]);
      rect(c,x,y,466,rowH-8,9,row%2?'#202c3c':'#253243');text(c,ATTRIBUTE_LABELS[key],x+22,y+(rowH-8)/2+9,tall?28:25,'#d0dbea',550);text(c,String(value),x+440,y+(rowH-8)/2+12,tall?39:35,grade(value),800,'right');
    }
  }else{
    const y=statsY+55,level=roleOnTwenty(player.goalkeeperRating),height=tall?450:370;rect(c,64,y,952,height,18);
    text(c,'Kalecilik',108,y+74,27,'#c8d4e6',650);text(c,String(level),108,y+238,150,grade(level),800);text(c,'/ 20',320,y+236,33,MUTED,600);stars(c,player.goalkeeperRating,124,y+height-67,20);
    c.save();c.strokeStyle='#9caec433';c.lineWidth=3;c.strokeRect(560,y+90,350,220);for(let i=1;i<7;i++){rule(c,560,y+90+i*31,350,'#9caec41c');c.beginPath();c.moveTo(560+i*50,y+90);c.lineTo(560+i*50,y+310);c.stroke();}c.restore();
  }
  const roles=[...new Set([player.mainPosition,...player.preferredPositions])].slice(0,3),rolesY=tall?1480:1085;
  section(c,'SAHADAKİ YERİ',rolesY);
  roles.forEach((role,i)=>{
    const x=64+i*324,y=rolesY+50,rating=player.kind==='goalkeeper'?player.goalkeeperRating:role==='GK'?0:player.positionRatings[role];
    rect(c,x,y,304,tall?200:119,12);text(c,CARD_POSITIONS[role],x+22,y+(tall?50:36),fit(c,CARD_POSITIONS[role],260,23),TEXT,700);stars(c,rating,x+35,y+(tall?109:78),14);
  });
  return canvas;
}

async function playerNotes(player:Player,catalog:PlayerCatalog,h:number){
  const {canvas,c}=base(h,'SAHA İÇİ NOTLARI',2,2),insight=playerInsights(player,catalog),tall=h>1500;
  image(c,await kit(playerKitMarkup(player)),830,153,185);
  text(c,player.name,64,242,fit(c,player.name,735,72,32),TEXT,800);text(c,insight.style,64,293,fit(c,insight.style,710,25),GOLD,600);
  type Note={title:string;text:string;tone?:'caution'};
  const observations:Note[]=insight.observations.slice(0,2);
  const extras:Note[]=insight.partners.slice(0,2).map(p=>({title:p.title,text:p.text}));
  for(const value of insight.context){if(extras.length>=2)break;extras.push({title:extras.length?'Takım düzeninde':'Oyununa etki edenler',text:value});}
  // A concise profile can legitimately have no special relationship data.
  const groups=[{label:'SAHADAKİ KARAKTERİ',items:observations},...(extras.length?[{label:'UYUM VE ÖZEL NOTLAR',items:extras}]:[])];
  const available=h-482,minFont=23;let font=tall?30:26;
  const totalHeight=(size:number)=>groups.reduce((sum,g)=>sum+68+g.items.reduce((n,item)=>n+97+lines(c,item.text,864,size).length*size*1.5,0),0);
  while(font>minFont&&totalHeight(font)>available)font--;
  // Keep complete paragraphs, never a cropped ending, when a future catalog has longer notes.
  while(totalHeight(font)>available&&extras.length>1)extras.pop();
  while(totalHeight(font)>available&&observations.length>1)observations.pop();
  let y=370;const extraSpace=Math.max(0,(available-totalHeight(font))/Math.max(1,observations.length+extras.length));
  for(const group of groups){
    section(c,group.label,y);y+=48;
    for(const item of group.items){
      const rows=lines(c,item.text,864,font),titleSize=fit(c,item.title,864,29,22),height=82+rows.length*font*1.5+Math.min(tall?65:14,extraSpace);
      rect(c,64,y,952,height,13);rect(c,64,y,4,height,0,item.tone==='caution'?'#cc8a65':'#b89b69','');text(c,item.title,92,y+42,titleSize,item.tone==='caution'?'#e6b08c':'#e3e9f3',750);paragraph(c,item.text,92,y+82,864,font,'#afbed1');y+=height+15;
    }
    y+=20;
  }
  return canvas;
}

function matchHeading(c:Ctx,selection:SelectionDraft,subtitle:string){
  text(c,'MAÇ GÜNÜ',64,198,19,GOLD,750);text(c,subtitle,64,268,64,TEXT,800);
  const date=new Date(`${selection.weekId}T12:00:00`);if(!Number.isNaN(date.getTime()))text(c,date.toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}),1016,201,22,MUTED,600,'right');
}
function teamHeading(c:Ctx,team:TeamSelection,x:number,y:number,w:number,subtitle:string){
  const color=team.teamId==='team-1'?BLUE:RED;
  rect(c,x,y,w,96,14,team.teamId==='team-1'?'#24354d':'#3a2b3b');text(c,team.name,x+25,y+43,fit(c,team.name,w-120,31,22),TEXT,800);text(c,subtitle,x+25,y+76,18,color,650);rect(c,x+w-20,y+24,3,48,1,color,'');
}
async function squadLists(source:Extract<SocialSource,{kind:'squads'}>,h:number){
  const {canvas,c}=base(h,'KADROLAR'),tall=h>1500;matchHeading(c,source.selection,'Sahaya çıkacak isimler.');
  const start=tall?390:345,rowH=tall?109:70;
  for(const [index,team] of source.selection.teams.entries()){
    const x=64+index*486,w=466,players=team.playerIds.map(id=>source.catalog.players.find(p=>p.id===id)).filter((p):p is Player=>!!p);
    teamHeading(c,team,x,start,w,`${players.length} OYUNCU`);
    for(const [i,p] of players.entries()){
      const y=start+112+i*rowH;rect(c,x,y,w,rowH-7,8,i%2?'#202b3b':'#253141');
      image(c,await kit(teamKitMarkup(team.teamId,p.kind==='goalkeeper',p)),x+10,y+(rowH-64)/2,66,64);
      text(c,p.name,x+91,y+rowH/2-3,fit(c,p.name,w-117,tall?29:25,18),TEXT,750);text(c,CARD_POSITIONS[p.mainPosition],x+91,y+rowH/2+22,tall?19:17,MUTED,550);
    }
    if(!players.length)text(c,'Henüz oyuncu seçilmedi.',x+25,start+161,22,MUTED);
  }
  return canvas;
}
function pitch(c:Ctx,x:number,y:number,w:number,h:number){
  rect(c,x,y,w,h,13,'#203b37','#8cae9e44');c.save();c.beginPath();c.roundRect(x,y,w,h,13);c.clip();
  for(let i=0;i<10;i++){if(i%2){c.fillStyle='#ffffff04';c.fillRect(x,y+i*h/10,w,h/10);}}
  c.translate(x+18,y+18);const a=w-36,b=h-36;c.strokeStyle='#a8c5b73d';c.lineWidth=2;c.strokeRect(0,0,a,b);c.beginPath();c.moveTo(0,b/2);c.lineTo(a,b/2);c.stroke();c.beginPath();c.ellipse(a/2,b/2,a*.14,b*.088,0,0,Math.PI*2);c.stroke();c.strokeRect(a*.2,0,a*.6,b*.16);c.strokeRect(a*.36,0,a*.28,b*.06);c.strokeRect(a*.2,b*.84,a*.6,b*.16);c.strokeRect(a*.36,b*.94,a*.28,b*.06);c.restore();
}
async function formationField(c:Ctx,lineup:Lineup,team:TeamSelection,catalog:PlayerCatalog,x:number,y:number,w:number,h:number){
  teamHeading(c,team,x,y,w,lineup.formationId);const py=y+113,ph=h-113;pitch(c,x,py,w,ph);
  for(const slot of FORMATIONS[lineup.formationId].slots){
    const id=lineup.assignments.find(a=>a.slotId===slot.id)?.playerId,p=catalog.players.find(v=>v.id===id);if(!p)continue;
    const px=x+52+slot.anchor.z*(w-104),sy=py+56+(1-slot.anchor.x)*(ph-135),size=h>1100?124:94;
    image(c,await kit(teamKitMarkup(team.teamId,p.kind==='goalkeeper',p)),px-size/2,sy-size/2,size);
    const labelSize=fit(c,p.name,Math.min(240,w*.23),h>1100?32:29,20);c.font=`700 ${labelSize}px ${family}`;const labelWidth=c.measureText(p.name).width+22,labelY=sy+size/2-2;
    rect(c,px-labelWidth/2,labelY,labelWidth,42,6,'#112925ee','#9ab7a32a');text(c,p.name,px,labelY+30,labelSize,TEXT,700,'center');
  }
}
async function squadFormation(source:Extract<SocialSource,{kind:'squads'}>,h:number,index:number){
  const {canvas,c}=base(h,'DİZİLİŞLER',index+1,2),team=source.selection.teams[index]!;
  matchHeading(c,source.selection,'İlk 11.');const y=h>1500?365:320,height=h-y-132;
  const lineup=source.lineups!.lineups.find(l=>l.teamId===team.teamId);if(lineup)await formationField(c,lineup,team,source.catalog,64,y,952,height);
  return canvas;
}

/** Separate authored compositions, not a screenshot of the desktop UI. */
export async function renderSocialImages(source:SocialSource,format:SocialFormat):Promise<readonly SocialImage[]>{
  await Promise.all(['800 48px Manrope','700 30px Manrope','500 26px Manrope'].map(font=>document.fonts.load(font))).catch(()=>{});
  const {height}=dimensions(format),ratio=format==='story'?'9x16':'4x5';
  if(source.kind==='player'){
    const name=safeName(source.player.name),profile=await playerProfile(source.player,source.catalog,height),notes=await playerNotes(source.player,source.catalog,height);
    return [{title:'Oyuncu profili',filename:`alsancak-${name}-${ratio}-01-profil.png`,blob:await png(profile)},{title:'Saha içi notları',filename:`alsancak-${name}-${ratio}-02-notlar.png`,blob:await png(notes)}];
  }
  if(source.lineups){
    const pages:SocialImage[]=[];for(const [i,team] of source.selection.teams.entries())pages.push({title:team.name,filename:`alsancak-dizilis-${safeName(team.name)}-${source.selection.weekId}-${ratio}.png`,blob:await png(await squadFormation(source,height,i))});return pages;
  }
  return [{title:'Kadrolar',filename:`alsancak-kadrolar-${source.selection.weekId}-${ratio}.png`,blob:await png(await squadLists(source,height))}];
}
