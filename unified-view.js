/* Embedded-view adapter. Trust only same-origin messages from the parent workspace.
 * Pause hidden playback without unloading frames or discarding review drafts.
 */
if(new URLSearchParams(location.search).has('embedded')){
 document.documentElement.classList.add('embedded');
 const style=document.createElement('style');style.textContent='.embedded .review-header,.embedded .wrap>h1,.embedded .wrap>.lede,.embedded .wrap>p:has(a[href="motion-review.html"]){display:none}.embedded main,.embedded .wrap{padding-top:18px}';document.head.append(style);
 addEventListener('message',event=>{
  if(event.origin!==location.origin || event.source!==parent || event.data?.type!=='bayan-pause-view')return;
  if(typeof Signer!=='undefined')Signer.paused=true;
  document.querySelectorAll('audio,video').forEach(media=>media.pause());
 });
}
