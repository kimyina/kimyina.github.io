"""Build full-sequence web visualizations; source data is read-only.
Usage: python3 scripts/build_dataset_visuals.py /media/yina/1TB/datasets
All recorded rows and prediction steps are retained, rounded to 4 decimals.
"""
import csv, json, math, re, sys, zipfile
from pathlib import Path
from collections import defaultdict
root=Path(__file__).resolve().parents[1]; base=Path(sys.argv[1]); out=root/'assets/data/sequences';out.mkdir(parents=True,exist_ok=True)
soc_only="--soc-only" in sys.argv
manifest=json.loads((root/"assets/data/dataset-samples.json").read_text()) if soc_only else {}
def rnd(x):return round(float(x),4)
def actor(id,kind,x,y):return dict(id=str(id),kind=kind,x=rnd(x),y=rnd(y))
def write(key,data):
 points=[];raw_points=[]
 for f in data['frames']:
  points.extend((p['x'],p['y']) for p in f['people'])
  for w in f.get('walls',[]):points.extend([w[:2],w[2:]])
  points.extend(f.get('goal',[]))
  points.extend((p['x'],p['y']) for p in f.get('objects',[]))
  for p in f.get('predictions',[]):
   (raw_points if p['field']=='raw_cohan_predictions' else points).extend(p['points'])
 data['bounds']=[min(p[0] for p in points),max(p[0] for p in points),min(p[1] for p in points),max(p[1] for p in points)]
 all_points=points+raw_points
 data['fullBounds']=[min(p[0] for p in all_points),max(p[0] for p in all_points),min(p[1] for p in all_points),max(p[1] for p in all_points)]
 assert all(data['frames'][i]['time']<=data['frames'][i+1]['time'] for i in range(len(data['frames'])-1))
 path=out/(key+'.json');path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False))
 manifest[key]={k:v for k,v in data.items() if k not in ['frames','tracks']};manifest[key].update(rows=len(data['frames']),start=data['frames'][0]['time'],end=data['frames'][-1]['time'],bytes=path.stat().st_size)
 print(key,manifest[key]['rows'],manifest[key]['end'],path.stat().st_size)
if not soc_only:
 # Original UCY annotation: show every recorded control-point time. Do not
 # manufacture a dense ground truth with an unverified spline interpolator.
 lines=[line.split(' - ')[0].strip() for line in (base/'ETH_UCY/raw/UCY/zara01/crowds_zara01.vsp').read_text().splitlines() if line.strip()]
 n=int(lines[0]);cursor=1;frames=defaultdict(list);tracks=[]
 for i in range(n):
  count=int(lines[cursor]);cursor+=1;track=[]
  for line in lines[cursor:cursor+count]:
   x,y,frame,direction=map(float,line.split());p=actor(i+1,'person',x,y);p['direction']=rnd(direction)
   frames[int(frame)].append(p);track.append([rnd(x),rnd(y)])
  cursor+=count;tracks.append({'id':str(i+1),'kind':'person','points':track})
 write('ucy-zara01',dict(file='crowds_zara01.vsp',unit='pixel',timeLabel='s',tracks=tracks,sourceRows=sum(len(x) for x in frames.values()),note='원 주석 전체: 148명 · 1,520 control points. 선택 시점에는 그 프레임에 실제 주석된 점만 표시한다.',frames=[dict(time=round(f/25,5),sourceFrame=f,people=points) for f,points in sorted(frames.items())]))
 # Entire previously used preprocessing file, accessible separately.
 frames=defaultdict(list)
 for line in (base/'ETH_UCY/samples/sgan_zara1_test.txt').read_text().splitlines():
  f,id,x,y=map(float,line.split());frames[int(f)].append(actor(int(id),'person',x,y))
 write('ucy-sgan',dict(file='sgan_zara1_test.txt',unit='file XY',timeLabel='frame',playbackUnitsPerSecond=25,note='SGAN 전처리 test 파일 전체 5,153행. 1×는 25 frame/초이며 보통 10 frame마다 관측이 갱신된다. 원영상·VSP와의 ID/시간/좌표 정합은 하지 않았다.',frames=[dict(time=f,people=p) for f,p in sorted(frames.items())]))
 for variant in ['cv','hst','cohan','static','blind']:
  rows=json.loads((base/f'Bi3/raw/json/{variant}.json').read_text());frames=[];invalid=0
  for r in rows:
   f=dict(time=round(r['time'],6),people=[actor('R','robot',*r['robot_state'][:2])]+[actor(j+1,'person',*a[:2]) for j,a in enumerate(r['agent_states'])],goal=[[rnd(v) for v in r['robot_goal']]],predictions=[],invalid=0)
   for field,kind in [('predictions','person'),('robot_prediction','robot')]:
    for batch,modes in enumerate(r[field]):
     for mode,steps in enumerate(modes):
      for a in range(len(steps[0])):
       path=[step[a] for step in steps]
       # Documented 9999.9 sentinel, not a plausible future position.
       if any(not math.isfinite(v) or abs(v-9999.9)<.01 for p in path for v in p):f['invalid']+=1;continue
       f['predictions'].append(dict(id='R' if kind=='robot' else str(a+1),kind=kind,field=field,mode=mode,points=[[rnd(v) for v in p] for p in path]))
   for a,path in enumerate(r.get('raw_cohan_predictions',[])):
    if any(not math.isfinite(v) or abs(v-9999.9)<.01 for p in path for v in p):f['invalid']+=1;continue
    f['predictions'].append(dict(id=str(a+1),kind='person',field='raw_cohan_predictions',points=[[rnd(v) for v in p] for p in path]))
   invalid+=f['invalid'];frames.append(f)
  write('bi3-'+variant,dict(file=variant+'.json',unit='m',timeLabel='s',note=f'{len(rows):,}행 전체 · 원본의 모든 유효 예측 단계 표시. 제외한 무효 경로 {invalid:,}개(시점별 합계). robot_prediction은 실행 계획과 구분한다.',frames=frames))
 for scene in [1,8]:
  rows=list(csv.DictReader((base/f'NavWareSet/local_data/sample/{scene}_robot_and_participants.csv').open()));t0=int(rows[0]['timestamp']);frames=[]
  for r in rows:
   people=[actor('R','robot',r['robot_x'],r['robot_y'])]+[actor(i,'person',r[f'x{i}'],r[f'y{i}']) for i in range(1,6)]
   assert all(math.isfinite(p['x']) and math.isfinite(p['y']) for p in people)
   frames.append(dict(time=round((int(r['timestamp'])-t0)/1e9,6),people=people))
  write('nav-scene'+str(scene),dict(file=f'{scene}_robot_and_participants.csv',unit='m',timeLabel='s',note=f'Scene {scene} 전체 {len(rows):,}행. CSV 첫 timestamp를 0초로 표시. 영상은 Scene 1 RGB이며 타임라인을 자동 동기화하지 않는다. 이 CSV에는 예측 경로가 없다.',frames=frames))
for key,rel in [('soc-interaction','SocNav2/samples/S3I_000000.json'),('soc-dynamic','SocNav2/samples/S2_000000.json'),('soc-inference','SocNav2/samples/S1_000003.json'),('soc-labelled','SocNav2/raw/representative/A000350_L4.json'),('soc-rated-gap','data/A000908_L1.json'),('soc-rated-positive','data/A005654_L1.json')]:
 if rel.startswith('data/'):
  with zipfile.ZipFile(base/'SocNav2/archives/data.zip') as archive: rows=json.loads(archive.read(rel))
 else: rows=json.loads((base/rel).read_text())
 ordered=sorted(enumerate(rows),key=lambda r:r[1]['timestamp']);t0=ordered[0][1]['timestamp'];frames=[]
 for idx,r in ordered:
  f=dict(time=round(r['timestamp']-t0,6),sourceRow=idx,people=[actor(p['id'],'person',p['x'],p['y']) for p in r['people']],walls=[[rnd(w[k]) for k in ['x1','y1','x2','y2']] for w in r['walls']],goal=[[rnd(g['x']),rnd(g['y'])] for g in r['goal']],objects=[actor(p['id'],'object',p['x'],p['y']) for p in r['objects']],interaction=r['interaction'],command=r['command'])
  if 'label_Q1' in r:f['labels']=[r['label_Q1'],r['label_Q2']]
  frames.append(f)
 write(key,dict(file=Path(rel).name,unit='file XY',timeLabel='s',localFrame=True,note='파일의 모든 snapshot. 재생용으로 시간 오름차순 정렬했으며 원래 행 번호를 보존한다. 로봇 기준 상대 좌표로, 로봇 R은 (0, 0)에 표시한다. robot_pose와 섞거나 시점 사이의 전역 궤적을 연결하지 않는다. 평정은 예측 궤적이 아니다.',frames=frames))
(root/'assets/data/dataset-samples.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
