/* ==================================================================
   js/services/schedule.js
   Propósito : Horario laboral: hrs(), spans() (turno simple o partido) y outside() (¿cae fuera de horario?).
   Depende de: state.js
   La usan   : calendario.js, programar.js, horario.js
   ================================================================== */
/* ---- horario laboral (se guarda en tenants.settings.working_hours) ---- */
const DAYS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const hrs = () => { const o = {}; for (let i = 0; i < 7; i++) o[i] = {on: i > 0, f: "08:00", t: "15:00"}; return {...o, ...(T.settings?.working_hours || {})}; };
const tm = t => { const [a, b] = t.split(":"); return +a * 60 + +b; };
const mins = d => d.getHours() * 60 + d.getMinutes();
const spans = w => [[tm(w.f), tm(w.t)], ...(w.f2 && w.t2 ? [[tm(w.f2), tm(w.t2)]] : [])];
const outside = (s, e) => { const h = hrs()[s.getDay()]; return !h.on || e.toDateString() !== s.toDateString() || !spans(h).some(([a, b]) => mins(s) >= a && mins(e) <= b); };
