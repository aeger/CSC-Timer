(function(){
  try{
    document.addEventListener('click', function(e){
      const actionable = e.target.closest('button,a,input[type="button"],input[type="submit"]');
      if(!actionable) return;
      let settings = {};
      try{ settings = JSON.parse(localStorage.getItem('settings')||'{}'); }catch(_){}
      if(settings.enableClicks === false) return;
      if(!window.Howl) return;
      const file = (settings.clickPattern || 'click.mp3').replace(/^\//,'');
      if(!window._cscClickHowl || window._cscClickHowl._src !== '/sounds/'+file){
        window._cscClickHowl = new Howl({ src: [('/sounds/'+file)], html5:false, volume: settings.clickVolume ?? 0.5 });
        window._cscClickHowl._src = '/sounds/'+file;
      }
      try{ window._cscClickHowl.play(); }catch(_){}
    }, true);
  }catch(_){}
})();
