import { designFor, normalizeVariant } from './composition-random.js';

const entries = [
  ['sequence','Автомонтаж','AUTO CUT','Каждая новая композиция меняет весь монтаж: выбор и порядок сцен, ритм, макеты и движение графики.','auto'],
  ['title','Оранжевый титр','TITLE','Плоское оранжевое поле и спокойный центральный титр, как в начале референса.','type'],
  ['vector','Кресты и метки','CROSSES','Крупные плюсы, короткие метки и направленные линии. Один уверенный графический мотив.','marks'],
  ['grid','Шахматный ритм','CHECKER','Шахматные плоскости: пол, стены, крупная плитка и диагонали. Новая композиция полностью меняет геометрию.','marks'],
  ['dashes','Вертикальные штрихи','DASH RAIN','Вертикальный дождь из ровных оранжевых штрихов, с разной глубиной и скоростью.','marks'],
  ['blocks','Цветовые блоки','COLOR BLOCK','Крупные плоские панели входят в кадр и образуют асимметричную композицию.','marks'],
  ['weather','Погодная карточка','WEATHER','Белая композиция с видео в оранжевой рамке и рядом плоских погодных пиктограмм.','layout'],
  ['doodles','Белые человечки','DOODLES','Белые рисованные фигуры и выразительные линии вокруг героя.','marks'],
  ['inset','Портретная вставка','PORTRAIT','Второй портретный кадр поверх видео, тонкая рамка и аккуратная типографика.','layout'],
  ['rectangles','Контурные рамки','RECTANGLES','Пересекающиеся прямоугольные контуры и скруглённые рамки разных масштабов.','marks'],
  ['discs','Диски и плюсы','DISCS','Крупные плоские круги, вырезы и контрастные плюсы в одной композиции.','marks'],
  ['typeEcho','Эхо текста','TYPE ECHO','Типографический повтор со сдвигом: крупное слово оставляет графический след.','type'],
  ['collage','Текстовый коллаж','COLLAGE','Плотные колонки мелкого текста, полосы и крупный акцент сбоку от героя.','type'],
  ['orbital','Орбитальные линии','ORBITS','Пересечения крупных эллипсов и небольшие метки на плавных орбитах.','marks'],
  ['signal','Горизонтальный сигнал','SIGNAL','Длинные тонкие горизонтали и линии, реагирующие на частоты музыки.','marks'],
  ['ribbons','Текстовые ленты','RIBBONS','Две диагональные полосы текста проходят через кадр как печатные ленты.','type'],
  ['geometry','Геометрическая схема','GEOMETRY','Треугольники, конструкции и выразительные пересечения прямых линий.','marks'],
  ['split','Разделённый кадр','SPLIT','Несколько панелей одного видео, разделённых контрастной графической полосой.','layout'],
  ['waves','Плавные линии','WAVES','Длинные плавные кривые проходят через кадр и меняются под музыку.','marks'],
  ['contact','Контактный лист','CONTACT','Кинораскадровка из нескольких окон видео в рамке контактного листа.','layout'],
  ['starburst','Лучевой знак','BURST','Плоский лучевой знак с крупным силуэтом и печатной геометрией.','marks'],
  ['stamp','Графический штамп','STAMP','Контрастный повёрнутый штамп и типографический блок на краю кадра.','type'],
  ['clean','Белый контур','CONTOUR','Четыре рисунка реального трекинга: контуры, узлы, измерения и ореолы. Графика следует лицу и кистям.','tracking'],
  ['credits','Колонка титров','CREDITS','Узкая вертикальная колонка титров и длинные мягкие линии, как в финале клипа.','type'],
];
export const PRESETS=Object.fromEntries(entries.map(([id,name,code,description,group],index)=>[id,{id,name,code,description,group,index}]));
export const EFFECT_KEYS=entries.slice(1).map(entry=>entry[0]);
export const SEQUENCE=[...EFFECT_KEYS];
const weights={title:.6,grid:1.1,weather:1.3,doodles:1.05,inset:1.2,collage:1.1,contact:1.1,credits:.8};
export function makeTimeline(duration,variant=1){
  variant=normalizeVariant(variant);
  const total=Number.isFinite(duration)&&duration>0?duration:15;
  const d=designFor('edit',variant);
  // Different pacing profiles ensure consecutive edits change their rhythm too.
  const pace=[1.45,.95,1.9,1.15][d.mode]*d.range('tempo',.85,1.15);
  const count=Math.min(144,Math.max(1,Math.min(Math.floor(total/.28)||1,Math.round(total/pace)||1)));
  const selected=[],occurrences=new Map();
  const openings=['title','split','inset','collage'];
  const closings=['credits','stamp','typeEcho','title'];
  selected.push(openings[d.mode]);
  let pool=[],round=0;
  while(selected.length<count-1){
    if(!pool.length)pool=d.shuffle(`round:${round++}`,EFFECT_KEYS.filter(key=>key!=='title'&&key!=='credits'));
    const previous=selected[selected.length-1];
    // Alternate graphic scales/families instead of stacking several similar marks.
    let index=pool.findIndex(key=>key!==previous&&PRESETS[key].group!==PRESETS[previous].group);
    if(index<0)index=pool.findIndex(key=>key!==previous);
    if(index<0){pool=[];continue;}
    selected.push(pool.splice(index,1)[0]);
  }
  if(count>1)selected.push(closings[d.mode]);
  const lengths=selected.map((key,index)=>(weights[key]||1)*d.range(`length:${index}`, .65,1.55));
  const units=lengths.reduce((sum,n)=>sum+n,0);let position=0;
  return selected.map((preset,index)=>{
    const start=position;position+=total*lengths[index]/units;
    const occurrence=occurrences.get(preset)||0;occurrences.set(preset,occurrence+1);
    return {preset,index,start,end:index===selected.length-1?total:position,variant:variant+occurrence*5};
  });
}
