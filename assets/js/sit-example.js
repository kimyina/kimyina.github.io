(() => {
  'use strict';
  document.querySelectorAll('[data-sit-example]').forEach(root => {
    const video = root.querySelector('video');
    const select = root.querySelector('select');
    const overlay = root.querySelector('[data-sit-boxes]');
    const plot = root.querySelector('[data-sit-plot]');
    const status = root.querySelector('[data-sit-status]');
    const frameLabel = root.querySelector('[data-sit-frame]');
    const context = overlay.getContext('2d'), map = plot.getContext('2d');
    let data, lastFrame = -1, callback = null, ready = false;

    function draw(time = video.currentTime) {
      if (!data) return;
      const index = Math.max(0, Math.min(data.frames.length - 1, Math.floor(time * data.fps + 0.00001)));
      if (index === lastFrame) return;
      lastFrame = index;
      const frame = data.frames[index], camera = Number(select.value);
      const boxes = frame.boxes.filter(box => box.camera === camera);
      const visible = new Set(boxes.map(box => box.id));
      context.clearRect(0, 0, overlay.width, overlay.height);
      context.font = 'bold 18px Pretendard, sans-serif';
      boxes.forEach(box => {
        const [x, y, w, h] = box.xywh.map(v => v / 2);
        context.strokeStyle = '#111'; context.lineWidth = 4;
        context.strokeRect(x, y, w, h);
        context.strokeStyle = '#fff'; context.lineWidth = 2;
        context.strokeRect(x, y, w, h);
        const label = `P${box.id}`, width = context.measureText(label).width + 8;
        const left = Math.max(0, Math.min(overlay.width - width, x));
        const top = Math.max(0, Math.min(overlay.height - 24, y - 24));
        context.fillStyle = '#111'; context.fillRect(left, top, width, 24);
        context.fillStyle = '#fff'; context.fillText(label, left + 4, top + 18);
      });
      map.clearRect(0, 0, plot.width, plot.height);
      const [xmin, xmax, ymin, ymax] = data.bounds;
      const scale = Math.min(560 / Math.max(xmax - xmin, 1), 240 / Math.max(ymax - ymin, 1));
      const xy = (x, y) => [320 + (x - (xmin + xmax) / 2) * scale, 145 - (y - (ymin + ymax) / 2) * scale];
      map.strokeStyle = '#eee'; map.lineWidth = 1;
      for (let x = 40; x <= 600; x += 56) { map.beginPath(); map.moveTo(x, 20); map.lineTo(x, 275); map.stroke(); }
      for (let y = 20; y <= 275; y += 51) { map.beginPath(); map.moveTo(40, y); map.lineTo(600, y); map.stroke(); }
      // Each frame is retained; gaps in a person's annotations break the trail.
      const previous = new Map();
      for (let i = 0; i <= index; i++) {
        const f = data.frames[i];
        const actors = [...f.people, {id: 'R', x: f.robot[0], y: f.robot[1]}];
        actors.forEach(p => {
          const current = xy(p.x, p.y), prior = previous.get(p.id);
          if (prior && prior.index === i - 1) {
            map.strokeStyle = p.id === 'R' ? '#111' : visible.has(p.id) ? '#555' : '#ccc';
            map.lineWidth = p.id === 'R' ? 2.5 : 1.2;
            map.beginPath(); map.moveTo(...prior.point); map.lineTo(...current); map.stroke();
          }
          previous.set(p.id, {index: i, point: current});
        });
      }
      map.font = '12px Pretendard, sans-serif';
      frame.people.forEach(p => {
        const [x, y] = xy(p.x, p.y), highlight = visible.has(p.id);
        map.beginPath(); map.arc(x, y, highlight ? 4 : 2.5, 0, Math.PI * 2);
        map.fillStyle = highlight ? '#fff' : '#bbb'; map.fill();
        map.strokeStyle = highlight ? '#111' : '#bbb'; map.lineWidth = 1.5; map.stroke();
        if (highlight) { map.fillStyle = '#222'; map.fillText(`P${p.id}`, x + 6, y - 6); }
      });
      const [rx, ry] = xy(...frame.robot);
      map.fillStyle = '#111'; map.fillRect(rx - 5, ry - 5, 10, 10); map.fillText('R', rx + 8, ry - 8);
      map.fillStyle = '#666'; map.fillText('World XY · m', 40, 304);
      plot.setAttribute('aria-label', `프레임 ${frame.frame}: 사람 ${frame.people.length}명의 위치와 로봇의 실제 이동 경로`);
      frameLabel.textContent = `${frame.time.toFixed(1)} s · Frame ${frame.frame} / 199`;
      status.textContent = `Camera ${camera} · 사람 박스 ${boxes.length}개`;
    }

    function tick() {
      if (video.paused || video.ended) { callback = null; return; }
      if (video.requestVideoFrameCallback) {
        callback = video.requestVideoFrameCallback((_, metadata) => { draw(metadata.mediaTime); tick(); });
      } else {
        callback = requestAnimationFrame(() => { draw(); tick(); });
      }
    }
    function cancelTick() {
      if (callback !== null) {
        if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(callback);
        else cancelAnimationFrame(callback);
        callback = null;
      }
    }
    video.addEventListener('play', () => { cancelTick(); tick(); });
    video.addEventListener('pause', () => { cancelTick(); draw(); });
    ['seeked', 'loadeddata', 'ended'].forEach(event => video.addEventListener(event, () => draw()));
    let pendingTime = 0, mediaRequest = 0, objectURL = null, mediaController;
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(pendingTime, Math.max(0, video.duration - .1));
      pendingTime = 0;
    });
    video.addEventListener('error', () => { status.textContent = '영상을 불러오지 못했다. 페이지를 새로고침해 다시 시도할 수 있다.'; });
    async function setCamera(time) {
      const request = ++mediaRequest;
      mediaController?.abort();
      mediaController = new AbortController();
      pendingTime = time;
      video.pause(); lastFrame = -1;
      video.poster = `${root.dataset.mediaBase}sit-cafe2-camera${select.value}.jpg`;
      // Hide annotations while the new camera loads; keep the chosen frame.
      context.clearRect(0, 0, overlay.width, overlay.height);
      status.textContent = `Camera ${select.value} 불러오는 중…`;
      select.disabled = true;
      video.controls = false;
      try {
        // A complete small video Blob supports seeking on local static servers
        // that do not implement HTTP Range; only one camera is kept in memory.
        const response = await fetch(`${root.dataset.mediaBase}sit-cafe2-camera${select.value}.mp4`, {signal: mediaController.signal});
        if (!response.ok) throw new Error(response.status);
        const blob = await response.blob();
        if (request !== mediaRequest) return;
        if (objectURL) URL.revokeObjectURL(objectURL);
        objectURL = URL.createObjectURL(blob);
        video.src = objectURL;
        video.load();
        video.controls = true;
        select.disabled = false;
      } catch (error) {
        if (error.name === 'AbortError') return;
        status.textContent = '영상을 불러오지 못했다. 카메라를 다시 선택해 시도할 수 있다.';
        select.disabled = false;
      }
    }
    select.addEventListener('change', () => {
      if (ready) setCamera(video.currentTime);
    });

    const observer = new IntersectionObserver(async entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      try {
        const response = await fetch(root.dataset.sitExample);
        if (!response.ok) throw new Error(response.status);
        data = await response.json(); ready = true; draw();
        await setCamera(0);
      } catch (_) {
        status.textContent = '주석을 불러오지 못했다. 페이지를 새로고침해 다시 시도할 수 있다.';
      }
    }, {rootMargin: '400px'});
    observer.observe(root);
  });
})();
