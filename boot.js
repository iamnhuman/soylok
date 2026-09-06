const legacy=new URLSearchParams(location.search).get('version')==='gpt-5.6-sol';
document.documentElement.dataset.version=legacy?'legacy':'astra';
document.title=`SOYLOK — ${legacy?'gpt-5.6-sol':'gpt-6-astra'}`;
for(const link of document.querySelectorAll('.version-options a')){
  if(link.dataset.version===(legacy?'legacy':'astra'))link.setAttribute('aria-current','page');
  else link.removeAttribute('aria-current');
}
if(legacy){
  const frame=document.getElementById('legacyFrame');
  frame.hidden=false;frame.src=new URL('./legacy/gpt-5.6-sol.html',import.meta.url).href;
}else{
  import('./app.js').catch(error=>{
    document.querySelector('#mediaLoader strong').textContent='Не удалось запустить редактор. Обнови страницу.';
    document.querySelector('.spinner').hidden=true;document.querySelector('#centerPlay').hidden=true;
    console.error('Editor startup:',error);
  });
}
