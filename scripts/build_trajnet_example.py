"""Render every track in the official bundled WILDTRACK training file.

Usage: python3 scripts/build_trajnet_example.py /media/yina/1TB/datasets/TrajNetPlusPlus
The source is read-only. No interpolation, prediction, or trajectory filtering.
"""
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]) / 'samples/wildtrack.ndjson'
records = [json.loads(line) for line in source.read_text().splitlines()]
scenes = [row['scene'] for row in records if 'scene' in row]
tracks = [row['track'] for row in records if 'track' in row]
assert {s['fps'] for s in scenes} == {2}
frames = defaultdict(list)
seen = set()
for row in tracks:
    assert all(math.isfinite(row[k]) for k in ('x', 'y'))
    assert (row['f'], row['p']) not in seen
    seen.add((row['f'], row['p']))
    frames[row['f']].append(dict(id=str(row['p']), kind='person', x=row['x'], y=row['y']))
frame_ids = sorted(frames)
assert {b - a for a, b in zip(frame_ids, frame_ids[1:])} == {5}
# This file samples every five source frame IDs at the declared 2 Hz.
bounds = [min(t['x'] for t in tracks), max(t['x'] for t in tracks),
          min(t['y'] for t in tracks), max(t['y'] for t in tracks)]
data = dict(file='wildtrack.ndjson · official bundled train', unit='m', timeLabel='s',
            bounds=bounds, fullBounds=bounds, sourceRows=len(tracks),
            note='공식 저장소에 포함된 WILDTRACK 학습 파일의 모든 관측 위치. 예측 좌표는 포함하지 않는다.',
            frames=[dict(time=(f-frame_ids[0])/5/2, sourceFrame=f, people=frames[f]) for f in frame_ids])
key = 'trajnet-wildtrack'
output = root / f'assets/data/sequences/{key}.json'
output.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False))
manifest_path = root / 'assets/data/dataset-samples.json'
manifest = json.loads(manifest_path.read_text())
manifest[key] = {k: v for k, v in data.items() if k != 'frames'}
manifest[key].update(rows=len(frame_ids), start=0, end=data['frames'][-1]['time'], bytes=output.stat().st_size)
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(f'{len(frame_ids)} frames, {len(tracks)} tracks, {data["frames"][-1]["time"]} s')
