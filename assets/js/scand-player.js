(() => {
  'use strict';
  const host = document.querySelector('[data-scand-player]');
  if (!host) return;
  const video = host.querySelector('video');
  const status = host.querySelector('[data-scand-status]');
  const ns = 'http://www.w3.org/2000/svg';
  function node(tag, attrs) {
    const el = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    return el;
  }
  function before(rows, time) {
    let lo = 0, hi = rows.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (rows[mid][0] <= time) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  let data, points, trail, marker, heading, cursors, animation;
  function makeChart(svg, rows, column) {
    const values = rows.map(row => row[column]);
    const min = Math.min(0, ...values), max = Math.max(...values);
    const span = Math.max(.1, max-min);
    const x = t => 32+t/data.videoTimes.at(-1)*300;
    const y = v => 65-(v-min)/span*52;
    svg.replaceChildren();
    svg.append(node('line', {x1:32, x2:332, y1:y(0), y2:y(0), class:'scand-grid'}));
    svg.append(node('polyline', {points:rows.map(row => `${x(row[0])},${y(row[column])}`).join(' '), class:'scand-signal'}));
    for (const [value, labelY] of [[min, 66], [max, 16]]) {
      const label = node('text', {x:27, y:labelY, 'text-anchor':'end'});
      label.textContent = value.toFixed(1); svg.append(label);
    }
    for (const [time, anchor] of [[0, 'start'], [data.videoTimes.at(-1), 'end']]) {
      const label = node('text', {x:x(time), y:85, 'text-anchor':anchor});
      label.textContent = `${time.toFixed(1)} s`; svg.append(label);
    }
    const cursor = node('line', {x1:32,x2:32,y1:8,y2:70,class:'scand-cursor'});
    svg.append(cursor);
    return {cursor, x};
  }
  function setup() {
    const svg = host.querySelector('[data-scand-route]');
    const xs = data.odometry.map(row => row[1]-data.origin[0]);
    const ys = data.odometry.map(row => row[2]-data.origin[1]);
    const left = Math.min(...xs), right = Math.max(...xs), bottom = Math.min(...ys), top = Math.max(...ys);
    const scale = Math.min(180/Math.max(.1,right-left),200/Math.max(.1,top-bottom));
    points = data.odometry.map((row,i) => [120+(xs[i]-(left+right)/2)*scale,120-(ys[i]-(top+bottom)/2)*scale]);
    svg.replaceChildren();
    svg.append(node('polyline', {points:points.map(p=>p.join(',')).join(' '), class:'scand-route-all'}));
    trail = node('polyline', {class:'scand-route-past'}); svg.append(trail);
    const start = node('circle',{cx:points[0][0],cy:points[0][1],r:4,class:'scand-start'}); svg.append(start);
    marker = node('circle',{r:5,class:'scand-position'}); svg.append(marker);
    heading = node('line',{class:'scand-direction'}); svg.append(heading);
    cursors = [makeChart(host.querySelector('[data-scand-linear]'),data.odometry,4),
               makeChart(host.querySelector('[data-scand-angular]'),data.odometry,5)];
    status.textContent = '영상을 재생하거나 탐색하면 같은 시점의 기록이 표시된다.';
    render();
  }
  function render() {
    if (!data) return;
    const frame = Math.min(data.videoTimes.length-1, Math.floor(video.currentTime*data.fps + 1e-6));
    const time = data.videoTimes[frame];
    const index = before(data.odometry,time), row = data.odometry[index];
    const joy = data.joystick[before(data.joystick,time)];
    const [x,y] = points[index];
    trail.setAttribute('points',points.slice(0,index+1).map(p=>p.join(',')).join(' '));
    marker.setAttribute('cx',x); marker.setAttribute('cy',y);
    heading.setAttribute('x1',x); heading.setAttribute('y1',y);
    heading.setAttribute('x2',x+12*Math.cos(row[3])); heading.setAttribute('y2',y-12*Math.sin(row[3]));
    host.querySelector('[data-scand-time]').textContent = `${time.toFixed(2)} s`;
    host.querySelector('[data-scand-v]').textContent = `${row[4].toFixed(2)} m/s`;
    host.querySelector('[data-scand-w]').textContent = `${row[5].toFixed(2)} rad/s`;
    host.querySelector('[data-scand-joy]').textContent = `axis 0: ${joy[1].toFixed(2)} · axis 1: ${joy[2].toFixed(2)}`;
    cursors.forEach(({cursor,x:toX})=>{cursor.setAttribute('x1',toX(time));cursor.setAttribute('x2',toX(time));});
  }
  function tick() {
    render();
    if (!video.paused && !video.ended) animation = requestAnimationFrame(tick);
  }
  video.addEventListener('play',()=>{cancelAnimationFrame(animation);tick();});
  ['timeupdate','seeked','loadedmetadata','ended'].forEach(event=>video.addEventListener(event,render));
  video.addEventListener('pause',()=>{cancelAnimationFrame(animation);render();});
  let loading = false;
  async function load() {
    if (loading || data) return;
    loading = true;
    try {
      const response = await fetch(host.dataset.scandPlayer);
      if (!response.ok) throw new Error('download failed');
      data = await response.json(); setup();
      host.querySelector('[data-scand-retry]').hidden = true;
    } catch (_) {
      data = null; status.textContent = '주행 기록을 불러오지 못했다.';
      host.querySelector('[data-scand-retry]').hidden = false;
    } finally { loading = false; }
  }
  host.querySelector('[data-scand-retry]').addEventListener('click',load);
  const observer = new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.isIntersecting)){load();observer.disconnect();}
  },{rootMargin:'400px'});
  observer.observe(host);
})();
