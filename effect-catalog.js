const entries = [
  ['sequence','Автомонтаж','AUTO CUT','Смена крупных композиций по всему ролику: 23 типа графики в оранжево-белом стиле референса.','auto'],
  ['title','Оранжевый титр','TITLE','Плоское оранжевое поле и спокойный центральный титр, как в начале референса.','type'],
  ['vector','Кресты и метки','CROSSES','Крупные плюсы, короткие метки и направленные линии. Один уверенный графический мотив.','marks'],
  ['grid','Шахматный пол','CHECKER','Контрастный оранжево-белый пол с настоящей перспективой и движением клеток.','marks'],
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
  ['clean','Белый контур','CONTOUR','Реальный контур лица и скелет кистей белой линией поверх исходного видео.','tracking'],
  ['credits','Колонка титров','CREDITS','Узкая вертикальная колонка титров и длинные мягкие линии, как в финале клипа.','type'],
];
export const PRESETS=Object.fromEntries(entries.map(([id,name,code,description,group],index)=>[id,{id,name,code,description,group,index}]));
export const EFFECT_KEYS=entries.slice(1).map(entry=>entry[0]);
export const SEQUENCE=[...EFFECT_KEYS];
const weights={title:.55,grid:1.2,weather:1.3,doodles:1.05,inset:1.05,collage:1.1,contact:1.1,credits:.85};
export function makeTimeline(duration,variant=1){
  const total=Number.isFinite(duration)&&duration>0?duration:15;
  const count=Math.min(SEQUENCE.length,Math.max(8,Math.ceil(total/.75)));
  const body=SEQUENCE.slice(1,-1),needed=count-2;
  // Keep reference order. Rotate which optional scenes are left out of short
  // clips, so a new composition genuinely reveals other effects as well.
  const optional=body.slice(6),remove=body.length-needed;
  const omitted=new Set(Array.from({length:remove},(_,i)=>optional[(i+variant-1)%optional.length]));
  const selected=['title',...body.filter(key=>!omitted.has(key)).slice(0,needed),'credits'];
  const units=selected.reduce((sum,key)=>sum+(weights[key]||.9),0);let position=0;
  return selected.map((preset,index)=>{const start=position;position+=total*(weights[preset]||.9)/units;return {preset,index,start,end:index===selected.length-1?total:position};});
}
