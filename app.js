/* Tablero FPQS · CONECTA — UNIMINUTO Sede Tolima-Huila */
(function () {
  'use strict';

  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const MESES_L = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const TIPO_COLOR = { 'Petición':'#3A6EA5', 'Queja':'#C0462F', 'Felicitación':'#2F7A6D', 'Sugerencia':'#E2962B' };
  const TIPO_PLURAL = { 'Petición':'Peticiones', 'Queja':'Quejas', 'Felicitación':'Felicitaciones', 'Sugerencia':'Sugerencias' };
  const EXTRA_COLORS = ['#7A5BA8','#5B6B7F','#A0526E'];
  const FIN = ['Cerrado','Resuelto'];
  const nf = new Intl.NumberFormat('es-CO');
  const pf1 = new Intl.NumberFormat('es-CO',{minimumFractionDigits:1,maximumFractionDigits:1});

  let D, ROWS, MONTHS, YEARS, CORTE, PARTIAL_KEY = null;
  const S = { years:new Set(), months:new Set(), tipos:new Set(), procs:new Set(), estados:new Set() };
  const charts = {};
  let tblSort = { key:'total', dir:-1 }, tblAll = false;

  const colorTipo = (t,i) => TIPO_COLOR[t] || EXTRA_COLORS[i % EXTRA_COLORS.length];
  const mkey = (y,m) => `${y}-${String(m).padStart(2,'0')}`;
  const mlabel = k => { const [y,m] = k.split('-'); return YEARS.length > 1 ? `${MESES[+m-1]} ${y}` : MESES[+m-1]; };
  const mlong = k => { const [y,m] = k.split('-'); return `${MESES_L[+m-1]} ${y}`; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ---------- Etiquetas de valor (plugin propio, sin CDN externo) ---------- */
  const valueLabels = {
    id:'valueLabels',
    afterDatasetsDraw(chart, _a, opts) {
      if (!opts || !opts.mode) return;
      const { ctx } = chart; ctx.save();
      ctx.font = `600 11px 'IBM Plex Sans', system-ui, sans-serif`;
      ctx.fillStyle = '#1B2433';
      if (opts.mode === 'line') {
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di); if (meta.hidden) return;
          ctx.fillStyle = ds.borderColor; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          meta.data.forEach((el, i) => { const v = ds.data[i]; if (v == null) return; ctx.fillText(pf1.format(v), el.x, el.y - 7); });
        });
      } else {
        const horiz = chart.options.indexAxis === 'y';
        const n = chart.data.labels.length;
        for (let i = 0; i < n; i++) {
          let tot = 0, el = null;
          chart.data.datasets.forEach((ds, di) => {
            const meta = chart.getDatasetMeta(di); if (meta.hidden || !chart.isDatasetVisible(di)) return;
            tot += ds.data[i] || 0; el = el || meta.data[i];
          });
          if (!tot || !el) continue;
          if (horiz) {
            const x = chart.scales.x.getPixelForValue(tot);
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(nf.format(tot), x + 5, el.y);
          } else {
            const y = chart.scales.y.getPixelForValue(tot);
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(nf.format(tot), el.x, y - 4);
          }
        }
      }
      ctx.restore();
    }
  };

  /* ---------- Carga de datos ---------- */
  function load() {
    if (window.FPQS_DATA) return Promise.resolve(window.FPQS_DATA);
    return fetch('data.json', { cache:'no-store' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  function init(data) {
    D = data;
    ROWS = D.rows.map(r => {
      const [y,m,d] = r[0].split('-').map(Number);
      const dt = new Date(y, m-1, d);
      return { f:r[0], y, m, mk:mkey(y,m), dow:(dt.getDay()+6)%7, h:r[1], t:r[2], c:r[3], p:D.categorias[r[3]][1], e:r[4] };
    });
    // Meses continuos desde el primer radicado hasta el corte
    const [y0,m0] = D.desde.split('-').map(Number), [y1,m1,d1] = D.corte.split('-').map(Number);
    MONTHS = []; for (let y=y0,m=m0; y<y1 || (y===y1 && m<=m1); m===12 ? (y++,m=1) : m++) MONTHS.push(mkey(y,m));
    YEARS = [...new Set(MONTHS.map(k => +k.slice(0,4)))];
    CORTE = new Date(y1, m1-1, d1);
    const lastDay = new Date(y1, m1, 0).getDate();
    if (d1 < lastDay) PARTIAL_KEY = mkey(y1,m1);
    resetState();
    buildFilters();
    header();
    document.getElementById('btnReset').onclick = () => { resetState(); buildFilters(); render(); };
    document.getElementById('search').addEventListener('input', () => { tblAll = false; renderTable(); });
    document.getElementById('btnMore').onclick = () => { tblAll = !tblAll; renderTable(); };
    render();
  }

  function resetState() {
    S.years.clear(); S.months.clear();
    S.tipos = new Set(D.tipos.map((_,i)=>i));
    S.procs = new Set(D.procesos.map((_,i)=>i));
    S.estados = new Set(D.estados.map((_,i)=>i));
  }

  /* ---------- Filtros ---------- */
  const monthsInScope = () => MONTHS.filter(k => {
    const y = +k.slice(0,4);
    return !S.years.size || S.years.has(y);
  });
  const selMonths = () => { const sc = monthsInScope(); return S.months.size ? sc.filter(k => S.months.has(k)) : sc; };

  function passPeriod(r, months) { return months.has(r.mk); }
  function rowsBy({ skipTipo = false } = {}) {
    const ms = new Set(selMonths());
    return ROWS.filter(r => passPeriod(r, ms) && (skipTipo || S.tipos.has(r.t)) && S.procs.has(r.p) && S.estados.has(r.e));
  }

  function buildFilters() {
    const periodRows = ROWS.filter(r => new Set(selMonths()).has(r.mk));
    const cnt = (key, i) => periodRows.filter(r => r[key] === i).length;
    const g = [];
    let per = '';
    if (YEARS.length > 1) per += `<div class="fhint" style="margin:0 0 6px">Año</div><div class="chips">${YEARS.map(y=>`<button class="chip ${S.years.has(y)?'on':''}" data-f="years" data-v="${y}">${y}</button>`).join('')}</div>`;
    per += `<div class="fhint" style="margin:${YEARS.length>1?'12px':'0'} 0 6px">Mes</div><div class="chips">${monthsInScope().map(k=>`<button class="chip ${S.months.has(k)?'on':''}" data-f="months" data-v="${k}">${mlabel(k)}${k===PARTIAL_KEY?'*':''}</button>`).join('')}</div>`;
    per += `<div class="fhint">Sin selección se incluyen todos los meses.${PARTIAL_KEY?' * Mes con corte parcial.':''}</div>`;
    g.push(group('Periodo', per));
    g.push(group('Tipo de radicado', D.tipos.map((t,i)=>check('tipos',i,t,cnt('t',i),colorTipo(t,i))).join('')));
    g.push(group('Proceso', D.procesos.map((p,i)=>({p,i,n:cnt('p',i)})).filter(o=>o.n||S.procs.has(o.i)&&ROWS.some(r=>r.p===o.i)).sort((a,b)=>b.n-a.n).map(o=>check('procs',o.i,o.p,o.n)).join(''), true));
    g.push(group('Estado', D.estados.map((e,i)=>check('estados',i,e,cnt('e',i))).join(''), true));
    const el = document.getElementById('filters');
    const closed = [...el.querySelectorAll('.fgroup.closed')].map(x=>x.dataset.g);
    el.innerHTML = g.join('');
    if (closed.length) el.querySelectorAll('.fgroup').forEach(x => x.classList.toggle('closed', closed.includes(x.dataset.g)));
    el.querySelectorAll('.fgroup>button').forEach(b => b.onclick = () => { const p=b.parentElement; p.classList.toggle('closed'); b.setAttribute('aria-expanded', !p.classList.contains('closed')); });
    el.querySelectorAll('.chip').forEach(b => b.onclick = () => {
      const f = b.dataset.f, v = f === 'months' ? b.dataset.v : +b.dataset.v;
      S[f].has(v) ? S[f].delete(v) : S[f].add(v);
      if (f !== 'months') { const sc = new Set(monthsInScope()); [...S.months].forEach(k => { if (!sc.has(k)) S.months.delete(k); }); }
      buildFilters(); render();
    });
    el.querySelectorAll('input[type=checkbox]').forEach(c => c.onchange = () => {
      const f = c.dataset.f, v = +c.value; c.checked ? S[f].add(v) : S[f].delete(v); buildFilters(); render();
    });
  }
  function group(title, body, closed = false) {
    return `<div class="fgroup ${closed?'closed':''}" data-g="${esc(title)}"><button aria-expanded="${!closed}"><span>${title}</span><span class="chev">▾</span></button><div class="fbody">${body}</div></div>`;
  }
  function check(f, i, label, n, dot) {
    return `<label class="check"><input type="checkbox" data-f="${f}" value="${i}" ${S[f].has(i)?'checked':''}>${dot?`<span class="dot" style="background:${dot}"></span>`:''}<span>${esc(label)}</span><span class="cnt">${nf.format(n)}</span></label>`;
  }

  /* ---------- Encabezado ---------- */
  function header() {
    const d = CORTE;
    const corteTxt = `${d.getDate()} de ${MESES_L[d.getMonth()]} de ${d.getFullYear()}`;
    document.getElementById('cutInfo').innerHTML = `Información con corte al<strong>${corteTxt}</strong>${PARTIAL_KEY?`<span class="partial">${cap(mlong(PARTIAL_KEY))} aún no cierra: cifras parciales</span>`:''}`;
    document.getElementById('sideInfo').textContent = `Fuente: ${D.fuente}. Datos generados el ${D.generado}.`;
    document.getElementById('footer').textContent = `Tablero FPQS · UNIMINUTO Sede Tolima-Huila · ${nf.format(D.rows.length)} radicados desde ${mlong(D.desde.slice(0,7))} hasta el corte.`;
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- Render ---------- */
  function render() {
    const rows = rowsBy();
    const rowsAllTipos = rowsBy({ skipTipo:true });
    renderBalance(rows);
    renderKpis(rows, rowsAllTipos);
    renderMonthly(rows);
    renderRates(rowsAllTipos);
    renderProc(rows);
    renderQuejas(rowsAllTipos);
    renderHeat(rows);
    renderTable();
  }

  function prevMonthOf(k) { const i = MONTHS.indexOf(k); return i > 0 ? MONTHS[i-1] : null; }

  function renderBalance(rows) {
    const tot = rows.length;
    const ms = selMonths(); const last = ms[ms.length-1]; const prev = last ? prevMonthOf(last) : null;
    const base = ROWS.filter(r => S.procs.has(r.p) && S.estados.has(r.e));
    const bar = document.getElementById('bbar'), leg = document.getElementById('blegend');
    const tipos = D.tipos.map((t,i)=>({t,i,n:rows.filter(r=>r.t===i).length})).filter(o=>S.tipos.has(o.i));
    bar.innerHTML = tot ? tipos.filter(o=>o.n).map(o => {
      const p = o.n / tot * 100;
      return `<div class="bseg" style="flex:0 0 ${p}%;background:${colorTipo(o.t,o.i)}" title="${o.t}: ${nf.format(o.n)} (${pf1.format(p)}%)">${p >= 7 ? pf1.format(p)+'%' : ''}</div>`;
    }).join('') : '';
    leg.innerHTML = tipos.map(o => {
      let dl = '';
      if (prev && last) {
        const a = base.filter(r=>r.mk===last && r.t===o.i).length, b = base.filter(r=>r.mk===prev && r.t===o.i).length;
        const diff = a - b, cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
        dl = `<span class="delta ${cls}">${diff>0?'▲ +':diff<0?'▼ ':'= '}${nf.format(diff)}</span> en ${mlabel(last)}${last===PARTIAL_KEY?'*':''} frente a ${mlabel(prev)}`;
      }
      const tipoCls = o.t === 'Felicitación' ? 'fel' : '';
      return `<div class="bl ${tipoCls}" style="border-color:${colorTipo(o.t,o.i)}"><div class="t">${TIPO_PLURAL[o.t]||o.t}</div><div class="v">${nf.format(o.n)}</div><div class="s">${tot?pf1.format(o.n/tot*100):'0,0'}% del total${dl?' · '+dl:''}</div></div>`;
    }).join('');
    document.getElementById('balanceNote').textContent = tot ? `${nf.format(tot)} radicados en ${ms.length===MONTHS.length?'todo el periodo':ms.length===1?mlong(ms[0]):ms.length+' meses'}` : 'Sin radicados para esta selección';
  }

  function renderKpis(rows, rowsAll) {
    const ms = selMonths();
    const full = ms.filter(k => k !== PARTIAL_KEY);
    const nFull = rows.filter(r => r.mk !== PARTIAL_KEY).length;
    const avg = full.length ? nFull / full.length : (ms.length ? rows.length / ms.length : 0);
    const byM = ms.map(k => ({k, n:rows.filter(r=>r.mk===k).length})).sort((a,b)=>b.n-a.n);
    const iq = D.tipos.indexOf('Queja'), iF = D.tipos.indexOf('Felicitación');
    const q = rowsAll.filter(r=>r.t===iq).length, f = rowsAll.filter(r=>r.t===iF).length;
    const fin = rows.filter(r => FIN.includes(D.estados[r.e])).length;
    const pend = rows.length - fin;
    const k = [
      ['Promedio mensual', nf.format(Math.round(avg)), full.length ? `Radicados por mes cerrado (${full.length} ${full.length===1?'mes':'meses'})` : 'Radicados por mes'],
      ['Mes con más radicados', byM[0] && byM[0].n ? cap(mlong(byM[0].k)) : '—', byM[0] && byM[0].n ? `${nf.format(byM[0].n)} radicados` : 'Sin datos'],
      ['Felicitaciones por cada queja', q ? pf1.format(f/q) : (f ? '∞' : '—'), `${nf.format(f)} felicitaciones y ${nf.format(q)} quejas`],
      ['Casos cerrados o resueltos', rows.length ? pf1.format(fin/rows.length*100)+'%' : '—', pend ? `${nf.format(pend)} en otro estado` : 'Ningún caso pendiente']
    ];
    document.getElementById('kpis').innerHTML = k.map(([t,v,s]) => `<div class="kpi"><div class="t">${t}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('');
  }

  const baseOpts = (extra = {}) => Object.assign({
    responsive:true, maintainAspectRatio:false, animation:{ duration:300 },
    plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, boxHeight:10, usePointStyle:true, pointStyle:'rectRounded', color:'#475467', font:{ size:12 } } },
      tooltip:{ backgroundColor:'#16324F', titleFont:{ family:'Space Grotesk', weight:'600' }, bodyFont:{ family:'IBM Plex Sans' }, padding:10, cornerRadius:6 } },
  }, extra);
  const gridC = '#EEF1F5', tickC = '#667085';

  function mount(id, cfg, emptyMsg) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
    const canvas = document.getElementById(id), box = canvas.parentElement;
    box.querySelectorAll('.empty').forEach(e=>e.remove());
    if (emptyMsg) { canvas.style.display = 'none'; box.insertAdjacentHTML('beforeend', `<div class="empty">${emptyMsg}</div>`); return; }
    canvas.style.display = '';
    cfg.plugins = [valueLabels];
    charts[id] = new Chart(canvas, cfg);
  }

  function renderMonthly(rows) {
    const ms = selMonths();
    const ds = D.tipos.map((t,i)=>({t,i})).filter(o=>S.tipos.has(o.i)).map(o => ({
      label: TIPO_PLURAL[o.t]||o.t, backgroundColor: colorTipo(o.t,o.i), borderRadius:3, maxBarThickness:46,
      data: ms.map(k => rows.filter(r=>r.mk===k && r.t===o.i).length)
    }));
    mount('chMonthly', { type:'bar', data:{ labels: ms.map(k=>mlabel(k)+(k===PARTIAL_KEY?'*':'')), datasets: ds },
      options: baseOpts({ layout:{ padding:{ top:18 } },
        scales:{ x:{ stacked:true, grid:{ display:false }, ticks:{ color:tickC } }, y:{ stacked:true, beginAtZero:true, grid:{ color:gridC }, ticks:{ color:tickC, precision:0 } } },
        plugins:{ ...baseOpts().plugins, valueLabels:{ mode:'total' } } }) },
      rows.length ? null : 'No hay radicados para esta selección. Prueba ampliando el periodo o los tipos.');
  }

  function renderRates(rowsAll) {
    const ms = selMonths();
    const iq = D.tipos.indexOf('Queja'), iF = D.tipos.indexOf('Felicitación');
    const rate = (k, ti) => { const t = rowsAll.filter(r=>r.mk===k); return t.length ? +(t.filter(r=>r.t===ti).length / t.length * 100).toFixed(1) : null; };
    const ds = [];
    if (iq >= 0) ds.push({ label:'Quejas por cada 100', data: ms.map(k=>rate(k,iq)), borderColor:TIPO_COLOR['Queja'], backgroundColor:TIPO_COLOR['Queja'], cubicInterpolationMode:'monotone', borderWidth:2.5, pointRadius:4 });
    if (iF >= 0) ds.push({ label:'Felicitaciones por cada 100', data: ms.map(k=>rate(k,iF)), borderColor:TIPO_COLOR['Felicitación'], backgroundColor:TIPO_COLOR['Felicitación'], cubicInterpolationMode:'monotone', borderWidth:2.5, pointRadius:4 });
    mount('chRates', { type:'line', data:{ labels: ms.map(k=>mlabel(k)+(k===PARTIAL_KEY?'*':'')), datasets: ds },
      options: baseOpts({ layout:{ padding:{ top:20, left:6, right:10 } },
        scales:{ x:{ grid:{ display:false }, ticks:{ color:tickC } }, y:{ beginAtZero:true, grid:{ color:gridC }, ticks:{ color:tickC } } },
        plugins:{ ...baseOpts().plugins, valueLabels:{ mode:'line' },
          tooltip:{ ...baseOpts().plugins.tooltip, callbacks:{ label: c => ` ${c.dataset.label}: ${pf1.format(c.parsed.y)}` } } } }) },
      rowsAll.length ? null : 'No hay radicados para esta selección.');
  }

  function wrapLabel(s, max = 26) {
    const w = s.split(' '), out = []; let line = '';
    w.forEach(x => { if ((line + ' ' + x).trim().length > max) { if (line) out.push(line); line = x; } else line = (line + ' ' + x).trim(); });
    if (line) out.push(line); return out.length > 2 ? [out[0], out.slice(1).join(' ').slice(0, max-1) + '…'] : out;
  }

  function renderProc(rows) {
    const procs = D.procesos.map((p,i)=>({p,i,n:rows.filter(r=>r.p===i).length})).filter(o=>o.n).sort((a,b)=>b.n-a.n);
    const ds = D.tipos.map((t,i)=>({t,i})).filter(o=>S.tipos.has(o.i)).map(o => ({
      label: TIPO_PLURAL[o.t]||o.t, backgroundColor: colorTipo(o.t,o.i), borderRadius:3, maxBarThickness:26,
      data: procs.map(pr => rows.filter(r=>r.p===pr.i && r.t===o.i).length)
    }));
    mount('chProc', { type:'bar', data:{ labels: procs.map(o=>wrapLabel(o.p)), datasets: ds },
      options: baseOpts({ indexAxis:'y', layout:{ padding:{ right:34 } },
        scales:{ x:{ stacked:true, beginAtZero:true, grid:{ color:gridC }, ticks:{ color:tickC, precision:0 } }, y:{ stacked:true, grid:{ display:false }, ticks:{ color:'#1B2433', font:{ size:12 }, autoSkip:false } } },
        plugins:{ ...baseOpts().plugins, valueLabels:{ mode:'total' } } }) },
      procs.length ? null : 'No hay radicados para esta selección.');
  }

  function renderQuejas(rowsAll) {
    const iq = D.tipos.indexOf('Queja');
    if (iq < 0 || !S.tipos.has(iq)) return mount('chQuejas', null, 'Activa el tipo “Queja” en los filtros para ver esta gráfica.');
    const q = rowsAll.filter(r=>r.t===iq);
    const m = new Map(); q.forEach(r => m.set(r.c, (m.get(r.c)||0)+1));
    const top = [...m.entries()].sort((a,b)=>b[1]-a[1] || D.categorias[a[0]][0].localeCompare(D.categorias[b[0]][0])).slice(0,10);
    mount('chQuejas', { type:'bar', data:{ labels: top.map(([c])=>wrapLabel(D.categorias[c][0], 30)),
        datasets:[{ label:'Quejas', data: top.map(([,n])=>n), backgroundColor:TIPO_COLOR['Queja'], borderRadius:3, maxBarThickness:22 }] },
      options: baseOpts({ indexAxis:'y', layout:{ padding:{ right:28 } },
        scales:{ x:{ beginAtZero:true, grid:{ color:gridC }, ticks:{ color:tickC, precision:0 } }, y:{ grid:{ display:false }, ticks:{ color:'#1B2433', font:{ size:12 }, autoSkip:false } } },
        plugins:{ ...baseOpts().plugins, legend:{ display:false }, valueLabels:{ mode:'total' },
          tooltip:{ ...baseOpts().plugins.tooltip, callbacks:{ afterLabel: c => { const ci = top[c.dataIndex][0]; return ` Proceso: ${D.procesos[D.categorias[ci][1]]}`; } } } } }) },
      q.length ? null : 'No hay quejas en esta selección.');
  }

  function renderHeat(rows) {
    const hrsAll = ROWS.map(r=>r.h);
    let h0 = Math.min(6, ...hrsAll), h1 = Math.max(21, ...hrsAll);
    const hours = []; for (let h=h0; h<=h1; h++) hours.push(h);
    const M = DIAS.map(() => hours.map(() => 0));
    rows.forEach(r => { M[r.dow][r.h - h0]++; });
    const max = Math.max(1, ...M.flat());
    const el = document.getElementById('heat');
    el.style.gridTemplateColumns = `40px repeat(${hours.length}, minmax(26px,1fr))`;
    const cell = v => {
      if (!v) return `<div class="hc" style="background:#F4F6F9"></div>`;
      const a = 0.12 + 0.88 * (v / max);
      return `<div class="hc" style="background:rgba(22,50,79,${a.toFixed(2)});color:${a>.5?'#fff':'#16324F'}">${v}</div>`;
    };
    let html = `<div></div>` + hours.map(h=>`<div class="hh">${h}h</div>`).join('');
    DIAS.forEach((d,di) => { html += `<div class="hl">${d}</div>` + hours.map((h,hi)=>{ const v=M[di][hi]; return cell(v).replace('<div class="hc"', `<div class="hc" title="${d} ${h}:00–${h}:59 · ${v} radicados"`); }).join(''); });
    el.innerHTML = html;
    document.getElementById('heatScale').innerHTML = `Menos ${[0.15,0.35,0.55,0.75,1].map(a=>`<i style="background:rgba(22,50,79,${a})"></i>`).join('')} Más`;
    const ins = document.getElementById('heatInsight');
    if (!rows.length) { ins.textContent = ''; return; }
    const habil = rows.filter(r => r.dow < 5 && r.h >= 8 && r.h < 18).length;
    const byDay = DIAS.map((d,i)=>({d,n:rows.filter(r=>r.dow===i).length})).sort((a,b)=>b.n-a.n)[0];
    const byH = hours.map(h=>({h,n:rows.filter(r=>r.h===h).length})).sort((a,b)=>b.n-a.n)[0];
    const fuera = rows.length - habil;
    ins.innerHTML = `<b>${pf1.format(habil/rows.length*100)}%</b> llega de lunes a viernes entre 8:00 y 18:00; <b>${nf.format(fuera)}</b> radicados entran fuera de ese horario. El día con más radicados es <b>${diaLargo(byDay.d)}</b> y la hora pico, <b>${byH.h}:00</b>.`;
  }
  const diaLargo = d => ({Lun:'lunes',Mar:'martes','Mié':'miércoles',Jue:'jueves',Vie:'viernes','Sáb':'sábado',Dom:'domingo'})[d];

  function sparkline(vals) {
    const w = 84, h = 22, max = Math.max(1, ...vals), n = vals.length;
    if (n < 2) return '';
    const pts = vals.map((v,i)=>`${(i/(n-1)*(w-4)+2).toFixed(1)},${(h-2-(v/max)*(h-4)).toFixed(1)}`).join(' ');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="#16324F" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  function renderTable() {
    const rows = rowsBy(); const ms = selMonths(); const tot = rows.length;
    const vis = D.tipos.map((t,i)=>({t,i})).filter(o=>S.tipos.has(o.i));
    const agg = new Map();
    rows.forEach(r => {
      if (!agg.has(r.c)) agg.set(r.c, { c:r.c, cat:D.categorias[r.c][0], proc:D.procesos[r.p], total:0, t:{}, m:{} });
      const a = agg.get(r.c); a.total++; a.t[r.t] = (a.t[r.t]||0)+1; a.m[r.mk] = (a.m[r.mk]||0)+1;
    });
    const q = document.getElementById('search').value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    let list = [...agg.values()].filter(a => !q || (a.cat+' '+a.proc).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q));
    const k = tblSort.key;
    list.sort((a,b) => {
      const va = k.startsWith('t') && k !== 'total' ? (a.t[+k.slice(1)]||0) : a[k], vb = k.startsWith('t') && k !== 'total' ? (b.t[+k.slice(1)]||0) : b[k];
      return typeof va === 'string' ? tblSort.dir * va.localeCompare(vb) : tblSort.dir * (va - vb) || a.cat.localeCompare(b.cat);
    });
    const LIM = 20, shown = tblAll ? list : list.slice(0, LIM);
    const arrow = key => tblSort.key === key ? (tblSort.dir < 0 ? ' ▼' : ' ▲') : ' <span class="ar">↕</span>';
    const head = `<thead><tr><th data-k="cat">Categoría${arrow('cat')}</th><th data-k="proc">Proceso${arrow('proc')}</th>${vis.map(o=>`<th class="n" data-k="t${o.i}">${TIPO_PLURAL[o.t]||o.t}${arrow('t'+o.i)}</th>`).join('')}<th class="n" data-k="total">Total${arrow('total')}</th><th class="n">% del total</th><th>Tendencia mensual</th></tr></thead>`;
    const body = shown.length ? shown.map(a => `<tr><td class="cat">${esc(a.cat)}</td><td><span class="ptag">${esc(a.proc)}</span></td>${vis.map(o=>{ const v=a.t[o.i]||0; return `<td class="n ${v?'':'zero'}">${v?nf.format(v):'0'}</td>`; }).join('')}<td class="n"><b>${nf.format(a.total)}</b></td><td class="n">${pf1.format(a.total/tot*100)}%</td><td title="${ms.map(m=>`${mlabel(m)}: ${a.m[m]||0}`).join(' · ')}">${sparkline(ms.map(m=>a.m[m]||0))}</td></tr>`).join('')
      : `<tr><td colspan="${vis.length+5}" style="text-align:center;color:var(--muted);padding:24px">No hay categorías que coincidan con la búsqueda o los filtros.</td></tr>`;
    const t = document.getElementById('tbl'); t.innerHTML = head + '<tbody>' + body + '</tbody>';
    t.querySelectorAll('th[data-k]').forEach(th => th.onclick = () => { const key = th.dataset.k; tblSort = { key, dir: tblSort.key === key ? -tblSort.dir : (key==='cat'||key==='proc' ? 1 : -1) }; renderTable(); });
    const btn = document.getElementById('btnMore');
    btn.style.display = list.length > LIM ? '' : 'none';
    btn.textContent = tblAll ? 'Mostrar solo las 20 primeras' : `Ver las ${nf.format(list.length)} categorías`;
  }

  load().then(init).catch(err => {
    document.querySelector('.main').insertAdjacentHTML('afterbegin', `<div class="card" style="margin:20px 0;border-color:#C0462F"><h3>No se pudo cargar data.json</h3><div class="sub">Verifica que data.json esté en la misma carpeta que index.html en el repositorio. Detalle: ${esc(err.message)}</div></div>`);
  });
})();
