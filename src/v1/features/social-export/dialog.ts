import type { SocialFormat, SocialImage, SocialSource } from './render.ts';
import { renderSocialImages } from './render.ts';
import { uiIcon } from '../ui/icons.ts';
import './social-export.css';

export function openSocialExport(source:SocialSource,trigger:HTMLElement):void {
  const dialog=document.createElement('dialog');dialog.className='social-export';dialog.setAttribute('aria-labelledby','social-export-title');
  dialog.innerHTML=`<header class="se-header"><div><span>ALSANCAK</span><h2 id="social-export-title">Paylaşım görselleri</h2></div><button class="se-close" aria-label="Görsel önizlemesini kapat">${uiIcon('close')}</button></header><div class="se-body"><div class="se-preview"><img alt="" hidden/><p role="status">Görseller hazırlanıyor…</p></div><aside class="se-options"><section><h3>Format</h3><div class="se-formats" role="group" aria-label="Görsel formatı"><button data-format="story" aria-pressed="true"><strong>9:16</strong><span>Hikâye</span></button><button data-format="portrait" aria-pressed="false"><strong>4:5</strong><span>Gönderi</span></button></div></section><section><h3>Görseller</h3><div class="se-pages" role="group" aria-label="İndirilecek görsel"></div></section><div class="se-download-area"><span class="se-size">1080 × 1920 · PNG</span><button class="se-download" disabled>${uiIcon('download')}Görseli indir</button></div></aside></div>`;
  document.body.append(dialog);let format:SocialFormat='story',pages:readonly SocialImage[]=[],urls:string[]=[],selected=0,generation=0,closed=false;
  const preview=dialog.querySelector<HTMLImageElement>('.se-preview img')!,status=dialog.querySelector<HTMLElement>('[role="status"]')!,download=dialog.querySelector<HTMLButtonElement>('.se-download')!,pageList=dialog.querySelector<HTMLElement>('.se-pages')!;
  const clearUrls=()=>{urls.forEach(url=>URL.revokeObjectURL(url));urls=[];};
  function selectPage(index:number){
    selected=index;const page=pages[index];if(!page)return;preview.src=urls[index]!;preview.alt=`${page.title} · ${format==='story'?'9:16':'4:5'} paylaşım önizlemesi`;preview.hidden=false;status.hidden=true;
    pageList.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(index===i)));download.disabled=false;
  }
  async function render(){
    const token=++generation;download.disabled=true;preview.hidden=true;status.hidden=false;status.textContent='Görseller hazırlanıyor…';clearUrls();pages=[];pageList.replaceChildren();
    dialog.querySelectorAll<HTMLButtonElement>('[data-format]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.format===format)));
    dialog.querySelector('.se-size')!.textContent=`1080 × ${format==='story'?1920:1350} · PNG`;
    try{
      const result=await renderSocialImages(source,format);if(closed||token!==generation)return;pages=result;urls=pages.map(page=>URL.createObjectURL(page.blob));pageList.replaceChildren();
      pages.forEach((page,i)=>{const b=document.createElement('button');b.dataset.page=String(i);b.innerHTML=`<span>${String(i+1).padStart(2,'0')}</span><strong></strong>${uiIcon('check')}`;b.querySelector('strong')!.textContent=page.title;pageList.append(b);});selectPage(Math.min(selected,pages.length-1));
    }catch(error){if(closed||token!==generation)return;status.textContent=error instanceof Error?error.message:'Görsel hazırlanamadı. Formatı yeniden seçerek deneyebilirsin.';}
  }
  dialog.addEventListener('click',event=>{
    const b=(event.target as Element).closest<HTMLButtonElement>('button');
    if(b?.classList.contains('se-close'))dialog.close();
    else if(b?.dataset.format){format=b.dataset.format as SocialFormat;void render();}
    else if(b?.dataset.page!==undefined)selectPage(Number(b.dataset.page));
    else if(b===download&&!download.disabled){const link=document.createElement('a');link.href=urls[selected]!;link.download=pages[selected]!.filename;document.body.append(link);link.click();link.remove();}
    else if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}
  });
  dialog.addEventListener('close',()=>{closed=true;generation++;clearUrls();dialog.remove();if(trigger.isConnected)trigger.focus();},{once:true});
  dialog.showModal();void render();
}
