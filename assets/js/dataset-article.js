(() => {
  'use strict';
  const article = document.querySelector('[data-sequence-base]');
  if (!article) return;
  // Reuse the footnote text so the inline explanation and endnote stay in sync.
  let activeNote = null, notePinned = false, noteTimer;
  function closeNote() {
    clearTimeout(noteTimer);
    if (activeNote) activeNote.tip.hidden = true;
    activeNote = null;
    notePinned = false;
  }
  function positionNote() {
    if (!activeNote) return;
    const { link, tip } = activeNote;
    const rect = link.getBoundingClientRect(), gap = 10, edge = 12;
    const width = document.documentElement.clientWidth, height = window.innerHeight;
    tip.style.maxWidth = `${width - edge * 2}px`;
    if (rect.bottom < 0 || rect.top > height) { closeNote(); return; }
    const left = Math.max(edge, Math.min(rect.left - 20, width - tip.offsetWidth - edge));
    const below = rect.bottom + gap + tip.offsetHeight <= height - edge;
    const top = below ? rect.bottom + gap : Math.max(edge, rect.top - gap - tip.offsetHeight);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.dataset.placement = below ? 'below' : 'above';
    tip.style.setProperty('--tail-x', `${Math.max(22, Math.min(rect.left + rect.width / 2 - left, tip.offsetWidth - 22))}px`);
  }
  article.querySelectorAll('.note-ref a').forEach(link => {
    const source = document.getElementById(link.hash.slice(1));
    if (!source) return;
    const tip = document.createElement('div');
    tip.className = 'note-tooltip';
    tip.id = `${source.id}-tooltip`;
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    const content = source.cloneNode(true);
    content.querySelectorAll('a').forEach(anchor => anchor.remove());
    const body = document.createElement('div');
    body.className = 'note-tooltip-body';
    body.append(...content.childNodes);
    tip.append(body);
    document.body.append(tip);
    link.setAttribute('aria-describedby', tip.id);
    const note = { link, tip };
    function open() {
      clearTimeout(noteTimer);
      if (activeNote !== note) { closeNote(); activeNote = note; }
      tip.hidden = false;
      positionNote();
    }
    function leave() {
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => {
        if (activeNote === note && !notePinned && document.activeElement !== link) closeNote();
      }, 180);
    }
    link.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') open(); });
    link.addEventListener('pointerleave', leave);
    link.addEventListener('focus', open);
    link.addEventListener('blur', leave);
    link.addEventListener('click', event => {
      event.preventDefault();
      if (activeNote === note && notePinned) closeNote();
      else { open(); notePinned = true; }
    });
    tip.addEventListener('pointerenter', () => clearTimeout(noteTimer));
    tip.addEventListener('pointerleave', leave);
  });
  document.addEventListener('click', event => {
    if (activeNote && !activeNote.link.contains(event.target) && !activeNote.tip.contains(event.target)) closeNote();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeNote(); });
  window.addEventListener('resize', positionNote);
  window.addEventListener('scroll', positionNote, { passive: true });
  article.querySelectorAll('[data-explorer]').forEach(explorer => {
    const tabs = [...explorer.querySelectorAll('[role=tab]')];
    const panels = [...explorer.querySelectorAll('[role=tabpanel]')];
    function select(index) {
      players.forEach(stop => stop());
      tabs.forEach((tab, i) => {
        tab.setAttribute('aria-selected', String(i === index));
        tab.tabIndex = i === index ? 0 : -1;
      });
      panels.forEach((panel, i) => {
        if (i !== index) panel.querySelectorAll('video').forEach(video => video.pause());
        panel.hidden = i !== index;
      });
    }
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i));
      tab.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
        if (event.key === 'ArrowLeft') next = (i + tabs.length - 1) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next !== undefined) { event.preventDefault(); select(next); tabs[next].focus(); }
      });
    });
  });
  article.querySelectorAll('[data-source-explorer]').forEach(explorer => {
    const select = explorer.querySelector('[data-shared-sequence]');
    const figure = explorer.querySelector('[data-source-video]');
    const video = figure.querySelector('video');
    select.addEventListener('change', () => {
      video.pause();
      const option = select.selectedOptions[0], available = Boolean(option.dataset.video);
      video.hidden = !available;
      figure.querySelector('.source-unavailable').hidden = available;
      figure.querySelector('.video-observation').hidden = !available;
      figure.querySelector('figcaption').hidden = !available;
      if (!available) { video.removeAttribute('src'); video.querySelector('source')?.removeAttribute('src'); video.load(); return; }
      const source = `${explorer.dataset.mediaBase}${option.dataset.video}`;
      video.poster = `${source}.jpg`;
      video.src = `${source}.mp4`;
      video.querySelector('a').href = `${source}.mp4`;
      video.setAttribute('aria-label', `SocNav2 ${option.dataset.recordId} 원영상`);
      figure.querySelector('.video-observation').textContent = option.dataset.watch;
      figure.querySelector('[data-source-caption]').textContent = `${option.dataset.recordId} · 공식 시뮬레이션 원영상`;
    });
  });
  article.querySelectorAll('[data-recording-video]').forEach(figure => {
    const select = figure.querySelector('[data-recording-select]');
    const video = figure.querySelector('video');
    select.addEventListener('change', () => {
      video.pause();
      const option = select.selectedOptions[0];
      const source = `${figure.dataset.mediaBase}${select.value}`;
      video.poster = `${source}.jpg`;
      video.src = `${source}.mp4`;
      video.querySelector('a').href = `${source}.mp4`;
      video.setAttribute('aria-label', `THÖR-MAGNI ${option.dataset.description} 착용형 카메라`);
      figure.querySelector('[data-recording-caption]').textContent = option.dataset.description;
      figure.querySelector('.video-observation').textContent = option.dataset.watch;
    });
  });
  article.addEventListener('play', event => {
    if (event.target.tagName === 'VIDEO') article.querySelectorAll('video').forEach(video => { if (video !== event.target) video.pause(); });
  }, true);
  const cache = new Map(), players = new Set();
  const ns = 'http://www.w3.org/2000/svg';
  function element(tag, attrs = {}, text) {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function load(key) {
    if (!cache.has(key)) cache.set(key, fetch(`${article.dataset.sequenceBase}${key}.json?v=${article.dataset.sequenceVersion || 1}`).then(r => {
      if (!r.ok) throw new Error('자료를 불러오지 못했다.'); return r.json();
    }).catch(error => { cache.delete(key); throw error; }));
    return cache.get(key);
  }
  article.querySelectorAll('[data-sample]').forEach(figure => {
    const svg = figure.querySelector('svg'), slider = figure.querySelector('[type=range]');
    const button = figure.querySelector('.sample-play'), select = figure.querySelector('.sequence-select') || figure.closest('[data-explorer]')?.querySelector('[data-shared-sequence]');
    const plotScale = figure.querySelector('.plot-scale');
    const speed = figure.querySelector('.playback-speed'), output = figure.querySelector('output');
    const showPredictions = figure.querySelector('[data-layer=predictions]');
    const predictionControl = showPredictions?.closest('label') || showPredictions;
    const description = figure.querySelector('.sequence-description');
    const fieldPanel = figure.closest('.sequence-workspace')?.querySelector('.sequence-fields');
    function updateDescription() {
      if (description) description.textContent = select?.selectedOptions[0].dataset.description || figure.dataset.description || '';
    }

    let data, xy, layer, historyPaths = [], timer = null, request = 0, startedAt, startedTime;
    const stop = () => { cancelAnimationFrame(timer); timer = null; button.textContent = '재생'; button.setAttribute('aria-pressed', 'false'); };
    players.add(stop);
    function build() {
      let [left,right,bottom,top] = plotScale?.value==='full'?data.fullBounds:data.bounds;
      if (data.localFrame) { left=Math.min(left,0);right=Math.max(right,0);bottom=Math.min(bottom,0);top=Math.max(top,0); }
      const scale = Math.min(540/Math.max(right-left,.1),260/Math.max(top-bottom,.1));
      xy = (x,y) => [320+(x-(right+left)/2)*scale,165-(y-(top+bottom)/2)*scale];
      svg.replaceChildren();
      for (let x=50;x<=600;x+=55) svg.append(element('line',{class:'gridline',x1:x,x2:x,y1:25,y2:305}));
      for (let y=25;y<=305;y+=56) svg.append(element('line',{class:'gridline',x1:50,x2:600,y1:y,y2:y}));
      const clipId=`plot-${figure.dataset.sample}`;
      const defs=element('defs'),clip=element('clipPath',{id:clipId});clip.append(element('rect',{x:40,y:15,width:560,height:295}));defs.append(clip);svg.append(defs);
      const history=element('g',{class:'observed-history','clip-path':`url(#${clipId})`});svg.append(history);
      historyPaths=[];
      // Relative coordinates from different robot poses cannot form a world path.
      if (!data.localFrame) {
        const active=new Map();
        data.frames.forEach((frame,index)=>frame.people.forEach(p=>{
          let path=active.get(p.id);
          // Original UCY control points are sparse; other records break on missing IDs.
          if (!path || (!data.tracks && path.indices.at(-1)!==index-1)) {
            const node=element('polyline',{class:`recorded-trail ${p.kind==='robot'?'robot-trail':''}`,points:''});
            history.append(node);path={node,indices:[],points:[],shown:-1};historyPaths.push(path);active.set(p.id,path);
          }
          path.indices.push(index);path.points.push(xy(p.x,p.y).join(','));
        }));
      }
      layer=element('g',{'clip-path':`url(#${clipId})`});svg.append(layer);
      svg.append(element('text',{class:'axis-label',x:50,y:328},`X / Y · ${data.unit} · 전체 시퀀스 기준 축 범위`));
      slider.max = data.frames.length-1; slider.value=0;
      const hasPredictions=data.frames.some(f=>f.predictions?.length);
      if (showPredictions) {
        showPredictions.disabled=!hasPredictions;showPredictions.checked=hasPredictions;
        predictionControl.hidden=!hasPredictions;
      }
      if (plotScale) {
        const hasRawPredictions=data.frames.some(f=>f.predictions?.some(p=>p.field==='raw_cohan_predictions'));
        plotScale.closest('label').hidden=!hasRawPredictions;
      }
      figure.querySelector('.sample-heading span').textContent='';
      if(fieldPanel)fieldPanel.querySelector('.field-file').textContent=data.file;
      const caption=figure.querySelector('figcaption');
      caption.textContent=data.localFrame?'로봇 R을 기준으로 본 주변 장면이다.':'';
      caption.hidden=!caption.textContent;
      figure.querySelector('.sequence-length').textContent=`${data.frames[0].time.toFixed(0)}–${data.frames.at(-1).time.toFixed(0)} ${data.timeLabel}`;
    }
    function draw() {
      if (!data) return;
      const index=Number(slider.value);
      historyPaths.forEach(path=>{
        let lo=0,hi=path.indices.length;
        while(lo<hi){const mid=(lo+hi)>>1;if(path.indices[mid]<=index)lo=mid+1;else hi=mid;}
        if(path.shown!==lo){path.node.setAttribute('points',path.points.slice(0,lo).join(' '));path.shown=lo;}
      });
      const frame=data.frames[index], fragment=document.createDocumentFragment();
      const add=(tag,attrs,text)=>{const node=element(tag,attrs,text);fragment.append(node);return node;};
      (frame.walls||[]).forEach(w=>{const a=xy(...w.slice(0,2)),b=xy(...w.slice(2));add('line',{class:'wall',x1:a[0],y1:a[1],x2:b[0],y2:b[1]});});
      (frame.goal||[]).forEach(g=>{const [x,y]=xy(...g);add('path',{d:`M${x} ${y-7}l7 7-7 7-7-7z`,fill:'white',stroke:'#333'});});
      (frame.objects||[]).forEach(p=>{const [x,y]=xy(p.x,p.y);add('rect',{x:x-5,y:y-5,width:10,height:10,fill:'#bbb'});add('text',{class:'agent-label',x:x+8,y:y-8},`O${p.id}`);});
      (frame.interaction||[]).forEach(relation=>{const a=frame.people.find(p=>Number(p.id)===relation.src),b=[...frame.people,...(frame.objects||[])].find(p=>Number(p.id)===relation.dst);if(a&&b){const p=xy(a.x,a.y),q=xy(b.x,b.y);add('line',{class:'interaction-link',x1:p[0],y1:p[1],x2:q[0],y2:q[1]});}});
      if (showPredictions?.checked) (frame.predictions||[]).forEach(path=>{
        const actor=frame.people.find(p=>p.id===path.id);
        const points=actor?[[actor.x,actor.y],...path.points]:path.points;
        add('polyline',{class:`prediction-trail ${path.field==='raw_cohan_predictions'?'raw-prediction':''}`,points:points.map(p=>xy(...p).join(',')).join(' ')});
        path.points.forEach(p=>{const [cx,cy]=xy(...p);add('circle',{cx,cy,r:1.8,fill:'#333'});});
      });
      frame.people.forEach(p=>{const [x,y]=xy(p.x,p.y);
        if(p.kind==='robot')add('rect',{x:x-6,y:y-6,width:12,height:12,fill:'#111'});
        else add('circle',{cx:x,cy:y,r:5,fill:'white',stroke:'#111','stroke-width':1.7});
        add('text',{class:'agent-label',x:x+9,y:y-8},p.kind==='robot'?'R':`P${p.id}`);
      });
      if (data.localFrame) {
        const [x,y]=xy(0,0);
        add('rect',{class:'reference-robot',x:x-8,y:y-8,width:16,height:16,rx:2,fill:'#111',stroke:'white','stroke-width':2});
        add('text',{class:'agent-label',x:x+12,y:y-12},'R (0, 0)');
      }
      layer.replaceChildren(fragment);
      output.textContent=`${frame.time.toFixed(2)} ${data.timeLabel}`;
      if(fieldPanel) fieldPanel.querySelector('.field-current').textContent=`현재 ${frame.time.toFixed(2)} ${data.timeLabel}`;
      if (fieldPanel?.querySelector('[data-gaze-wearer]')) {
        const wearerId = data.wearer.replace('Helmet_', '');
        const trackerName = { TB2: 'Tobii Pro Glasses 2', TB3: 'Tobii Pro Glasses 3' }[data.tracker] || data.tracker;
        fieldPanel.querySelector('[data-gaze-wearer]').textContent = `P${wearerId} · ${data.wearer.replace('_', ' ')} · ${trackerName}`;
        fieldPanel.querySelector('[data-gaze-value]').textContent = frame.gaze ? `Gaze (px): ${frame.gaze.map(v => Math.round(v)).join(', ')}` : 'Gaze: 이 시점의 측정값 없음';
        fieldPanel.querySelector('[data-gaze-frame]').textContent = `Scene frame: ${frame.sceneFrame ?? '—'}${frame.eyeMovement && frame.eyeMovement !== 'N/A' ? ` · ${frame.eyeMovement}` : ''}`;
      }
      svg.setAttribute('aria-label',`${data.file} ${frame.time} ${data.timeLabel}, ${frame.people.length}개 관측 위치${data.localFrame?', 로봇 R은 상대 좌표 원점 (0, 0)':''}`);
      const parts=[];
      const ratings=fieldPanel?.querySelector('.human-ratings');
      if(ratings) {
        ratings.hidden=!frame.labels;
        if(frame.labels) ratings.querySelectorAll('meter').forEach((meter,i)=>{
          meter.value=frame.labels[i];
          ratings.querySelector(`[data-score="${i}"]`).textContent=`${frame.labels[i]} / 100`;
        });
      }
      if(data.localFrame && !frame.labels) parts.push('이 원영상 예제에는 사람의 평정 점수가 없다. 기록 선택에서 평가 예제를 따로 볼 수 있다.');
      if(data.localFrame && frame.labels && index === data.frames.length - 1) parts.push('평가 구간 끝 · 목표 도착까지의 기록은 아니다.');
      const readout=figure.querySelector('.sample-readout');
      readout.textContent=parts.join(' ');readout.hidden=!parts.length;
    }
    async function choose() {
      observer.disconnect();stop();const token=++request;button.disabled=true;slider.disabled=true;data=null;
      if (predictionControl) predictionControl.hidden=true;
      updateDescription();
      const ratings=fieldPanel?.querySelector('.human-ratings');if(ratings)ratings.hidden=true;
      figure.querySelector('.sample-readout').hidden=false;
      figure.querySelector('.sample-readout').textContent='전체 시퀀스를 불러오는 중…';
      try {
        const next=await load(select?.value || figure.dataset.sequence);if(token!==request)return;data=next;build();draw();button.disabled=false;slider.disabled=false;
      } catch(error) { if(token===request)figure.querySelector('.sample-readout').textContent=`${error.message} 시퀀스를 다시 선택하면 된다.`; }
    }
    function tick(now) {
      const target=startedTime+(now-startedAt)/1000*Number(speed.value)*(data.playbackUnitsPerSecond || 1);
      const frames=data.frames;let lo=0,hi=frames.length-1;
      while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(frames[mid].time<=target)lo=mid;else hi=mid-1;}
      if(Number(slider.value)!==lo){slider.value=lo;draw();}
      if(target>=frames.at(-1).time){stop();return;}timer=requestAnimationFrame(tick);
    }
    button.addEventListener('click',()=>{
      if(timer!==null){stop();return;}players.forEach(fn=>fn());
      if(Number(slider.value)>=data.frames.length-1)slider.value=0;
      startedTime=data.frames[Number(slider.value)].time;startedAt=performance.now();button.textContent='정지';button.setAttribute('aria-pressed','true');draw();timer=requestAnimationFrame(tick);
    });
    slider.addEventListener('input',()=>{stop();draw();});select?.addEventListener('change',choose);
    plotScale?.addEventListener('change',()=>{if(!data)return;stop();const index=slider.value;build();slider.value=index;draw();});
    speed.addEventListener('change',stop);showPredictions?.addEventListener('change',draw);
    new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)stop();}).observe(figure);
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){choose();observer.disconnect();}},{rootMargin:'400px'});observer.observe(figure);
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)players.forEach(stop=>stop());});
})();
