/* Create a branded PDF estimate using PDFMake's embedded Roboto fonts (including Cyrillic). */
const pdfMake = require('pdfmake/build/pdfmake');
const pdfFonts = require('pdfmake/build/vfs_fonts');
if (pdfFonts && pdfFonts.pdfMake && pdfFonts.pdfMake.vfs) pdfMake.vfs = pdfFonts.pdfMake.vfs;
else if (pdfFonts && pdfFonts.vfs) pdfMake.vfs = pdfFonts.vfs;

function money(value) {
  return Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' BYN';
}
function clean(value) {
  return String(value == null || value === '' ? '—' : value).replace(/[\u0000-\u001f]+/g,' ').trim();
}
function makeEstimatePdf(estimate, company) {
  const items = Array.isArray(estimate.items) ? estimate.items :
    (typeof estimate.items === 'string' ? JSON.parse(estimate.items || '[]') : []);
  const subtotal = items.reduce((sum, item)=>sum+Number(item.qty||0)*Number(item.price||0),0);
  const discount = Math.min(subtotal,Math.max(0,Number(estimate.discount||0)));
  const total = Math.max(0,subtotal-discount);
  const c=company||{};
  const rows=items.map((item,i)=>[
    {text:String(i+1),alignment:'center'},
    clean(item.article||'—'),
    clean(item.name)+(item.note?' — '+clean(item.note):''),
    {text:clean(item.unit||'шт.'),alignment:'center'},
    {text:Number(item.qty||0).toLocaleString('ru-RU',{maximumFractionDigits:2}),alignment:'right'},
    {text:money(item.price),alignment:'right'},
    {text:money(Number(item.qty||0)*Number(item.price||0)),alignment:'right'}
  ]);
  const meta=[
    [{text:'Клиент',bold:true},clean(estimate.client_name)],
    [{text:'Телефон',bold:true},clean(estimate.client_phone)],
    [{text:'Дата',bold:true},new Date(estimate.created_at||Date.now()).toLocaleDateString('ru-RU')],
    [{text:'Организация',bold:true},clean(c.company)],
    [{text:'УНП',bold:true},clean(c.unp)]
  ];
  const doc={
    pageSize:'A4',pageOrientation:'landscape',pageMargins:[30,34,30,38],
    defaultStyle:{font:'Roboto',fontSize:9,color:'#29231c'},
    styles:{
      brand:{fontSize:17,bold:true,color:'#9a7436',alignment:'center',margin:[0,0,0,5]},
      title:{fontSize:15,bold:true,alignment:'center',margin:[0,0,0,4]},
      subtitle:{fontSize:9,color:'#756b60',alignment:'center',margin:[0,0,0,14]},
      section:{fontSize:10,bold:true,color:'#5b472d',margin:[0,10,0,5]},
      total:{fontSize:15,bold:true,color:'#9a7436',alignment:'right',margin:[0,12,0,0]}
    },
    content:[
      {text:'ПАМЯТЬ.БАЙ',style:'brand'},
      {text:'СМЕТА №'+estimate.id,style:'title'},
      {text:'Расчёт стоимости работ и материалов',style:'subtitle'},
      {table:{widths:['auto','*'],body:meta},layout:{hLineColor:'#e7ded0',vLineColor:'#e7ded0',paddingLeft:8,paddingRight:8,paddingTop:4,paddingBottom:4}},
      {text:'Состав сметы',style:'section'},
      {table:{
        headerRows:1,keepWithHeaderRows:1,
        widths:[22,70,'*',34,48,68,72],
        body:[[
          {text:'№',bold:true,alignment:'center'},
          {text:'Артикул',bold:true},
          {text:'Позиция / описание',bold:true},
          {text:'Ед.',bold:true,alignment:'center'},
          {text:'Кол-во',bold:true,alignment:'right'},
          {text:'Цена',bold:true,alignment:'right'},
          {text:'Сумма',bold:true,alignment:'right'}
        ],...rows]
      },layout:{
        fillColor:(row)=>row===0?'#ede2d2':(row%2===0?'#faf7f2':null),
        hLineColor:'#d8c7ad',vLineColor:'#e7ded0',
        paddingLeft:5,paddingRight:5,paddingTop:5,paddingBottom:5
      }},
      {text:'Сумма позиций: '+money(subtotal),alignment:'right',margin:[0,10,0,2]},
      {text:'Скидка: '+money(discount),alignment:'right',margin:[0,0,0,2]},
      {text:'ИТОГО: '+money(total),style:'total'},
      ...(estimate.notes?[{text:'Примечание: '+clean(estimate.notes),fontSize:8,color:'#756b60',margin:[0,10,0,0]}]:[]),
      {text:'Предварительный расчёт. Итоговая стоимость подтверждается после согласования материалов и условий выполнения работ.',fontSize:7,color:'#756b60',italics:true,margin:[0,16,0,0]}
    ],
    footer:(page,pages)=>({text:'ПАМЯТЬ.БАЙ  •  Смета №'+estimate.id+'  •  Страница '+page+' из '+pages,alignment:'center',fontSize:7,color:'#756b60',margin:[0,12,0,0]})
  };
  return new Promise((resolve,reject)=>{
    try {
      const pdf=pdfMake.createPdf(doc);
      pdf.getBuffer(buffer=>resolve(Buffer.from(buffer)));
    } catch(e) { reject(e); }
  });
}
module.exports={makeEstimatePdf};
