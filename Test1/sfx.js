// sfx.js - click sounds + audio backend log
(function(){
  console.log('Audio backend:', (window.Howler && Howler.usingWebAudio) ? 'WebAudio' : 'HTML5');
  function settings(){ try{return JSON.parse(localStorage.getItem('settings')||'{}')}catch{return{}} }
  function clickEnabled(){ return !!settings().enableClicks }
  function clickFile(){ return (settings().clickPattern || 'click.mp3') }
  // Build relative path for sound assets.  Use a relative `sounds/` prefix
  // rather than an absolute `/sounds/` to allow the app to run from
  // subdirectories (e.g. /Test1/).  Remove any leading slash in the
  // filename to avoid doubling slashes.
  function soundSrc(name){ return 'sounds/' + String(name||'click.mp3').replace(/^\//,'') }

  function playClick(){
    try{
      if(!clickEnabled() || !window.Howl) return;
      const s = settings();
      const vol = typeof s.volume === 'number' ? s.volume/100 : (s.clickVolume ?? 0.5);
      new Howl({src:[soundSrc(clickFile())], html5:false, volume: vol}).play();
    }catch(e){ /* ignore */ }
  }
  document.addEventListener('click', (e)=>{
    if(e.target.closest('button,select,input[type="checkbox"]')) playClick();
  }, true);
})();