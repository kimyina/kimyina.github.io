"""Extract one complete SCAND recording, without modifying its source bag.

Usage: python3 scripts/build_scand_example.py /media/yina/1TB/datasets/SCAND
Requires OpenCV with H.264 and rosbags (installed locally in /tmp/navware_rosbags).
Every RGB frame, odometry message and joystick message is retained. The browser
maps encoded video frames back to bag receipt timestamps; no inferred commands.
"""
import csv
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.append('/tmp/navware_rosbags')
from rosbags.highlevel import AnyReader

ROOT = Path(__file__).resolve().parents[1]
BASE = Path(sys.argv[1])
BAG = BASE / 'raw/A_Jackal_GDC_SAC_Fri_Oct_29_13.bag'
RGB = '/camera/rgb/image_raw/compressed'
ODOM = '/jackal_velocity_controller/odom'
JOY = '/bluetooth_teleop/joy'
KEY = 'scand-jackal-13'
video = ROOT / f'assets/videos/{KEY}.mp4'
assert not video.exists(), 'Existing output is preserved; remove it explicitly before rebuilding.'
cv2.setNumThreads(1)
odometry, joystick, image_times, header_offsets = [], [], [], []
processed = BASE / 'samples/jackal-13'
processed.mkdir(parents=True, exist_ok=True)
with AnyReader([BAG]) as reader:
    start = reader.start_time
    topics = [dict(topic=c.topic, message_type=c.msgtype, messages=c.msgcount) for c in reader.connections]
    connections = [c for c in reader.connections if c.topic in (RGB, ODOM, JOY)]
    image_connection = next(c for c in connections if c.topic == RGB)
    # Nominal 30 Hz encoding preserves every image, with the exact receipt-time
    # lookup below handling camera jitter instead of assuming perfect sampling.
    writer = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*'avc1'), 30, (960, 540))
    assert writer.isOpened()
    try:
        for connection, timestamp, raw in reader.messages(connections=connections):
            msg = reader.deserialize(raw, connection.msgtype)
            t = (timestamp-start)/1e9
            header_time = msg.header.stamp.sec*10**9 + msg.header.stamp.nanosec
            header_offsets.append((timestamp-header_time)/1e9)
            if connection.topic == RGB:
                frame = cv2.imdecode(msg.data, cv2.IMREAD_COLOR)
                assert frame is not None
                writer.write(cv2.resize(frame, (960, 540), interpolation=cv2.INTER_AREA))
                if len(image_times) in [0, 210, 430, 650, 876]:
                    cv2.imwrite(f'/tmp/scand-frame-{len(image_times)}.jpg', frame)
                if len(image_times) == 210:
                    cv2.imwrite(str(video.with_suffix('.jpg')), frame, [cv2.IMWRITE_JPEG_QUALITY, 88])
                image_times.append(round(t, 9))
            elif connection.topic == ODOM:
                p, q, v = msg.pose.pose.position, msg.pose.pose.orientation, msg.twist.twist
                yaw = math.atan2(2*(q.w*q.z+q.x*q.y), 1-2*(q.y*q.y+q.z*q.z))
                odometry.append([t, p.x, p.y, yaw, v.linear.x, v.angular.z])
                assert msg.header.frame_id == 'odom' and msg.child_frame_id == 'base_link'
            else:
                joystick.append([t, *map(float, msg.axes), *map(int, msg.buttons)])
                assert len(msg.axes) == 8 and len(msg.buttons) == 13
    finally:
        writer.release()
    assert len(image_times) == image_connection.msgcount
    assert len(odometry) == next(c.msgcount for c in connections if c.topic == ODOM)
    assert len(joystick) == next(c.msgcount for c in connections if c.topic == JOY)
for rows in [odometry, joystick]:
    assert all(math.isfinite(v) for row in rows for v in row)
    assert all(a[0] <= b[0] for a, b in zip(rows, rows[1:]))
assert all(a < b for a, b in zip(image_times, image_times[1:]))
for filename, header, rows in [
    ('odometry.csv', ['bag_time_s','odom_x_m','odom_y_m','yaw_rad','linear_x_m_s','angular_z_rad_s'], odometry),
    ('joystick.csv', ['bag_time_s']+[f'axis_{i}' for i in range(8)]+[f'button_{i}' for i in range(13)], joystick),
    ('rgb_timestamps.csv', ['video_frame','bag_time_s'], enumerate(image_times)),
]:
    with (processed/filename).open('x', newline='') as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)
with (BASE/'docs/jackal-13-topics.csv').open('x', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['topic','message_type','messages']); w.writeheader(); w.writerows(topics)
origin = odometry[0][1:3]
data = dict(file=BAG.name, fps=30, videoTimes=image_times,
            odometry=[[round(v, 7) for v in row] for row in odometry],
            joystick=[[round(v, 7) for v in row] for row in joystick],
            origin=origin, clock='bag receipt time, relative to recording start',
            topics=topics, commandTopic=None,
            source='https://huggingface.co/datasets/franciszzj/SCAND',
            note='Third-party mirror. Wheel odometry is not ground truth; joystick axes are unitless raw inputs.')
out = ROOT / f'assets/data/sequences/{KEY}.json'
out.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False))
cap = cv2.VideoCapture(str(video)); assert cap.isOpened()
assert int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) == len(image_times)
cap.set(cv2.CAP_PROP_POS_FRAMES, len(image_times)-1); assert cap.read()[0]; cap.release()
print(json.dumps(dict(rgb=len(image_times), odometry=len(odometry), joystick=len(joystick),
                     rgb_range=[image_times[0],image_times[-1]],
                     receipt_header_offset_s=[min(header_offsets),max(header_offsets)],
                     video_bytes=video.stat().st_size, json_bytes=out.stat().st_size), indent=2))
