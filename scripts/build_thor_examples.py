"""Build three full-duration THÖR-MAGNI examples from selected local originals.

Usage: python3 scripts/build_thor_examples.py /media/yina/1TB/datasets/THOR_MAGNI
No interpolation, temporal subsampling, or invented predictions. Positions use
the supplied rigid-body centroids, converted from mm to m; missing bodies are
omitted for that frame. Gaze remains in scene-camera pixel coordinates.
"""
import csv
import json
import math
import sys
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parents[1]
BASE = Path(sys.argv[1]) / 'raw'
EXAMPLES = [
    ('thor-sc3b', 3, '170522_SC3B_R1', 'Tobii3_170522_SC3B_R1_H6.mp4', 'Helmet_6', 'TB3'),
    ('thor-sc4b', 4, '300922_SC4B_R1', 'Tobii2_300922_SC4B_R1_H10.mp4', 'Helmet_10', 'TB2'),
    ('thor-sc5', 5, '300922_SC5_R1', 'Tobii2_300922_SC5_R1_H10.mp4', 'Helmet_10', 'TB2'),
]


def number(value):
    try:
        value = float(value)
        return value if math.isfinite(value) else None
    except (ValueError, TypeError):
        return None


cv2.setNumThreads(1)
manifest_path = ROOT / 'assets/data/dataset-samples.json'
manifest = json.loads(manifest_path.read_text())
for key, scenario, recording, video_name, wearer, tracker in EXAMPLES:
    source = BASE / f'CSVs_Scenarios/Scenario_{scenario}/THOR-Magni_{recording}.csv'
    metadata = {}
    frames, points = [], []
    missing = {}
    gaze_valid = 0
    with source.open(newline='') as stream:
        reader = csv.reader(stream)
        for row in reader:
            if row[0] == 'Frame':
                header = row
                break
            metadata[row[0]] = [value for value in row[1:] if value]
        bodies = [name for name in metadata['BODY_NAMES'] if name.startswith('Helmet_') or name == 'DARKO_Robot']
        roles = dict(zip(metadata['BODY_NAMES'], metadata['BODY_ROLES']))
        missing = dict.fromkeys(bodies, 0)
        for values in reader:
            row = dict(zip(header, values))
            people = []
            for body in bodies:
                x, y = (number(row.get(f'{body} Centroid_{axis}')) for axis in ('X', 'Y'))
                if x is None or y is None:
                    missing[body] += 1
                    continue
                x, y = round(x / 1000, 4), round(y / 1000, 4)
                robot = body == 'DARKO_Robot'
                people.append(dict(id='R' if robot else body.split('_')[1], kind='robot' if robot else 'person', x=x, y=y))
                points.append((x, y))
            prefix = f'{wearer} {tracker}_'
            gaze = [number(row.get(prefix + 'G2D_' + axis)) for axis in ('X', 'Y')]
            valid = all(value is not None for value in gaze)
            gaze_valid += valid
            frames.append(dict(time=float(row['Time']), sourceFrame=int(row['Frame']), people=people,
                               gaze=gaze if valid else None, sceneFrame=number(row.get(prefix + 'SceneFNr')),
                               eyeMovement=row.get(prefix + 'Movement', 'N/A')))
    assert len(frames) == int(metadata['N_FRAMES_QTM'][0])
    assert all(a['time'] < b['time'] for a, b in zip(frames, frames[1:]))
    bounds = [min(p[0] for p in points), max(p[0] for p in points), min(p[1] for p in points), max(p[1] for p in points)]
    data = dict(file=source.name, unit='m', timeLabel='s', bounds=bounds, fullBounds=bounds,
                wearer=wearer, tracker=tracker, roles=roles, sourceRows=len(frames), missingCentroids=missing,
                validGazeRows=gaze_valid, sourceVideo=video_name, frames=frames,
                note='원 CSV의 모든 QTM 프레임. Centroid XY를 mm에서 m로 변환했다. 누락값은 보간하지 않았다. 눈 시선은 카메라 픽셀 좌표이며, 이동 평면의 위치나 머리 방향이 아니다.')
    destination = ROOT / f'assets/data/sequences/{key}.json'
    destination.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False))
    manifest[key] = {k: v for k, v in data.items() if k != 'frames'}
    manifest[key].update(rows=len(frames), start=frames[0]['time'], end=frames[-1]['time'], bytes=destination.stat().st_size)
    print(key, 'frames', len(frames), 'seconds', frames[-1]['time'], 'missing centroids', missing, 'gaze rows', gaze_valid, flush=True)

    target = ROOT / f'assets/videos/{key}.mp4'
    if not target.exists():
        cap = cv2.VideoCapture(str(BASE / 'MP4_Videos/Files' / video_name))
        assert cap.isOpened()
        n, fps = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)), cap.get(cv2.CAP_PROP_FPS)
        w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        size = (720, int(h * 720 / w) // 2 * 2)
        temporary = target.with_name(target.stem + '-encoding.mp4')
        writer = cv2.VideoWriter(str(temporary), cv2.VideoWriter_fourcc(*'avc1'), fps, size)
        assert writer.isOpened()
        count = 0
        while True:
            ok, image = cap.read()
            if not ok:
                break
            writer.write(cv2.resize(image, size, interpolation=cv2.INTER_AREA))
            count += 1
        writer.release()
        cap.release()
        assert count == n, (count, n)
        temporary.rename(target)
    cap = cv2.VideoCapture(str(target))
    n, fps = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)), cap.get(cv2.CAP_PROP_FPS)
    cap.set(cv2.CAP_PROP_POS_FRAMES, n // 2)
    ok, image = cap.read()
    assert ok
    cv2.imwrite(str(target.with_suffix('.jpg')), image, [cv2.IMWRITE_JPEG_QUALITY, 88])
    cap.set(cv2.CAP_PROP_POS_FRAMES, n - 1)
    assert cap.read()[0]
    cap.release()
    manifest[key]['webVideo'] = dict(frames=n, fps=fps, duration=n / fps, bytes=target.stat().st_size, audio=False)
    data['webVideo'] = manifest[key]['webVideo']
    destination.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False))
    manifest[key]['bytes'] = destination.stat().st_size
    print(key, 'video', n, 'frames', round(n / fps, 3), 's', target.stat().st_size, 'bytes', flush=True)
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
