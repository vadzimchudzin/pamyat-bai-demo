(function(){
  'use strict';
  var $=function(s){return document.querySelector(s);};
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function money(n){return Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:2})+' BYN';}
  function date(v){return v?new Date(v).toLocaleDateString('ru-RU'):'—';}
  $('#print').addEventListener('click',function(){window.print();});
  var token=new URLSearchParams(location.search).get('token');
  if(!token){$('#quote').innerHTML='<p class="error">В ссылке отсутствует токен сметы.</p>';return;}
  $('#downloadWord').href='/api/estimate-file?token='+encodeURIComponent(token);
  fetch('/api/finance?token='+encodeURIComponent(token),{headers:{accept:'application/json'},cache:'no-store'})
    .then(function(r){return r.json().then(function(d){if(!r.ok||!d.ok)throw new Error(d.error||'Смета не найдена');return d;});})
    .then(function(d){
      var e=d.estimate||{},c=d.company||{},items=Array.isArray(e.items)?e.items:[];
      var subtotal=items.reduce(function(n,x){return n+Number(x.qty||0)*Number(x.price||0);},0);
      var discount=Math.min(subtotal,Math.max(0,Number(e.discount||0)));
      var total=Math.max(0,subtotal-discount);
      var rows=items.map(function(x,i){return '<tr><td>'+ (i+1)+'</td><td>'+esc(x.article||'—')+'</td><td><b>'+esc(x.name)+'</b>'+(x.note?'<small>'+esc(x.note)+'</small>':'')+'</td><td class="num">'+esc(x.unit||'шт.')+'</td><td class="num">'+Number(x.qty||0).toLocaleString('ru-RU')+'</td><td class="num">'+money(x.price)+'</td><td class="num">'+money(Number(x.qty||0)*Number(x.price||0))+'</td></tr>';}).join('');
      $('#quote').innerHTML=
        '<header class="quote-head"><div><div class="brand"><div class="brand-mark">П</div><div><div class="brand-name">ПАМЯТЬ<span>.БАЙ</span></div><div class="brand-sub">Памятники · гранит · благоустройство</div></div></div>'+
        '<div class="company">'+(c.company?esc(c.company)+'<br>':'')+(c.unp?'УНП '+esc(c.unp)+'<br>':'')+(c.phone?'Тел.: '+esc(c.phone)+'<br>':'')+(c.email?esc(c.email):'')+'</div></div>'+
        '<div class="q-meta"><strong>СМЕТА №'+esc(e.id)+'</strong><div>Дата: '+date(e.created_at)+'</div><div>Статус: '+esc(({draft:'Черновик',sent:'Отправлена',approved:'Согласована',rejected:'Отклонена'})[e.status]||e.status||'Черновик')+'</div></div></header>'+
        '<h1>Расчёт стоимости работ и материалов</h1>'+
        '<div class="client"><div><span>Клиент</span><b>'+esc(e.client_name||'—')+'</b></div><div><span>Телефон</span><b>'+esc(e.client_phone||'—')+'</b></div></div>'+
        '<table><thead><tr><th>№</th><th>Артикул</th><th>Наименование</th><th class="num">Ед.</th><th class="num">Кол-во</th><th class="num">Цена</th><th class="num">Сумма</th></tr></thead><tbody>'+ (rows||'<tr><td colspan="7">Позиции не добавлены</td></tr>') +'</tbody></table>'+
        '<div class="totals"><div class="total-row"><span>Сумма позиций</span><b>'+money(subtotal)+'</b></div>'+(discount?'<div class="total-row"><span>Скидка</span><b>− '+money(discount)+'</b></div>':'')+
        '<div class="total-row final"><span>Итого</span><strong>'+money(total)+'</strong></div></div>'+
        (e.notes?'<div class="notes"><b>Примечание</b><br>'+esc(e.notes)+'</div>':'')+
        '<p class="disclaimer">Смета носит предварительный характер. Итоговая стоимость подтверждается после согласования материалов, размеров и условий работ. Все цены указаны в белорусских рублях.</p>'+
        '<div class="signatures"><div>Заказчик / подпись</div><div>Исполнитель / подпись</div></div>';
      document.title='Смета №'+e.id+' — ПАМЯТЬ.БАЙ';
    })
    .catch(function(err){$('#quote').innerHTML='<p class="error">'+esc(err.message||'Не удалось загрузить смету')+'</p>';});
})();
