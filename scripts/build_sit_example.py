"""Build a complete SiT Cafe_street_2 example directly from the local ZIP.

Usage: python3 scripts/build_sit_example.py /path/to/Cafe_street_2.zip
No raw extraction, model inference, interpolation or temporal subsampling.
Schema: https://github.com/SPALaboratory/SiT-Dataset#ground-truth
World XY: label_3d fields 5:7 and ego_trajectory translation, as used in
prediction/ynet/preprocess_ped.py (both receive the same map transform there).
Time: published 10 Hz sequence cadence, not absolute sensor timestamps.
"""
import json
import sys
import zipfile
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
cv2.setNumThreads(1)
frames = []
with zipfile.ZipFile(sys.argv[1]) as archive:
    names = set(archive.namelist())
    ids = sorted(int(Path(n).stem) for n in names if n.startswith('ego_trajectory/') and n.endswith('.txt'))
    assert ids == list(range(200)), 'Unexpected sequence coverage'
    for i in ids:
        pose = np.fromstring(archive.read(f'ego_trajectory/{i}.txt').decode(), sep=',').reshape(4, 4)
        assert np.isfinite(pose).all() and np.allclose(pose[3], [0, 0, 0, 1])
        people, boxes = [], []
        for line in archive.read(f'label_3d/{i}.txt').decode().splitlines():
            fields = line.split()
            if fields[0] != 'Pedestrian':
                continue
            assert len(fields) == 9
            xy = list(map(float, fields[5:7]))
            assert np.isfinite(xy).all()
            people.append(dict(id=fields[1].split(':')[1], x=round(xy[0], 4), y=round(xy[1], 4)))
        assert len({p['id'] for p in people}) == len(people)
        for line in archive.read(f'label_2d/{i}.txt').decode().splitlines():
            fields = line.split()
            if fields[0] != 'Pedestrian':
                continue
            assert len(fields) == 7
            box = list(map(float, fields[3:7]))
            assert np.isfinite(box).all() and box[2] >= 0 and box[3] >= 0
            boxes.append(dict(id=fields[1].split(':')[1], camera=int(fields[2]), xywh=[round(v, 2) for v in box]))
        frames.append(dict(frame=i, time=i / 10, robot=[round(float(x), 4) for x in pose[:2, 3]], people=people, boxes=boxes))

    for camera in range(1, 6):
        target = ROOT / f'assets/videos/sit-cafe2-camera{camera}.mp4'
        if not target.exists():
            temporary = target.with_name(target.stem + '-encoding.mp4')
            writer = cv2.VideoWriter(str(temporary), cv2.VideoWriter_fourcc(*'avc1'), 10, (960, 600))
            assert writer.isOpened()
            for i in ids:
                image = cv2.imdecode(np.frombuffer(archive.read(f'cam_img/{camera}/data_rgb/{i}.png'), dtype=np.uint8), cv2.IMREAD_COLOR)
                assert image is not None and image.shape == (1200, 1920, 3)
                image = cv2.resize(image, (960, 600), interpolation=cv2.INTER_AREA)
                writer.write(image)
                if i == 0:
                    cv2.imwrite(str(target.with_suffix('.jpg')), image)
            writer.release()
            temporary.rename(target)
        capture = cv2.VideoCapture(str(target))
        count = 0
        while capture.read()[0]:
            count += 1
        assert count == 200 and capture.get(cv2.CAP_PROP_FPS) == 10
        capture.release()
        print(f'Camera {camera}: verified {count} frames, {target.stat().st_size:,} bytes', flush=True)

points = [p for f in frames for p in [f['robot']] + [[p['x'], p['y']] for p in f['people']]]
data = dict(sequence='Cafe_street_2', fps=10, imageSize=[1920, 1200],
            coordinateSystem='Provided world XY in metres; no semantic-map transform applied.',
            timeBasis='frame index / published 10 Hz cadence',
            source='Cafe_street_2.zip: cam_img, label_2d, label_3d, ego_trajectory',
            bounds=[min(p[0] for p in points), max(p[0] for p in points), min(p[1] for p in points), max(p[1] for p in points)],
            frames=frames)
target = ROOT / 'assets/data/sequences/sit-cafe2.json'
target.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False))
print('Saved', target.name, 'with all', len(frames), 'frames.', flush=True)
