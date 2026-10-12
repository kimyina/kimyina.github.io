"""Create full-duration H.264 web copies and posters from existing local videos.
Usage: python3 scripts/build_dataset_videos.py /media/yina/1TB/datasets
Requires OpenCV with an H.264 encoder. Existing outputs are not overwritten.
Originals are never modified. Transcoded copies contain video only.
"""
from pathlib import Path
import sys, shutil
import cv2
base=Path(sys.argv[1]);out=Path(__file__).resolve().parents[1]/'assets/videos';out.mkdir(parents=True,exist_ok=True)
plan=[
 ('SocNav2/videos/S3I_000000.mp4','socnav2-S3I_000000.mp4',640),
 ('ETH_UCY/raw/UCY/zara01/crowds_zara01.avi','ucy-zara01.mp4',720),
 ('Bi3/videos/um1_cv.mp4','bi3-um1-cv.mp4',960),
 ('NavWareSet/local_data/rgb_inspection/scene01_robot_rgb.mp4','navwareset-scene01-rgb.mp4',None),
 ('SocNav2/videos/S2_000000.mp4','socnav2-S2_000000.mp4',640),
 ('SocNav2/videos/S1_000003.mp4','socnav2-S1_000003.mp4',640),
]
for rel,name,max_width in plan:
 target=out/name
 if not target.exists():
  if max_width is None:shutil.copyfile(base/rel,target)
  else:
   source=cv2.VideoCapture(str(base/rel));assert source.isOpened(),rel
   fps=source.get(cv2.CAP_PROP_FPS);n=int(source.get(cv2.CAP_PROP_FRAME_COUNT))
   w=int(source.get(cv2.CAP_PROP_FRAME_WIDTH));h=int(source.get(cv2.CAP_PROP_FRAME_HEIGHT));scale=min(1,max_width/w);size=(int(w*scale)//2*2,int(h*scale)//2*2)
   writer=cv2.VideoWriter(str(target),cv2.VideoWriter_fourcc(*'avc1'),fps,size);assert writer.isOpened()
   count=0
   try:
    while True:
     ok,frame=source.read()
     if not ok:break
     if (w,h)!=size:frame=cv2.resize(frame,size,interpolation=cv2.INTER_AREA)
     writer.write(frame);count+=1
   finally:writer.release();source.release()
   assert count==n,(name,count,n)
 cap=cv2.VideoCapture(str(target));assert cap.isOpened();n=int(cap.get(cv2.CAP_PROP_FRAME_COUNT));fps=cap.get(cv2.CAP_PROP_FPS)
 cap.set(cv2.CAP_PROP_POS_FRAMES,n-1);assert cap.read()[0]
 poster=target.with_suffix('.jpg')
 if not poster.exists():
  cap.set(cv2.CAP_PROP_POS_FRAMES,n//2);ok,frame=cap.read();assert ok
  assert cv2.imwrite(str(poster),frame,[cv2.IMWRITE_JPEG_QUALITY,85])
 cap.release();print(name,n,round(n/fps,3),'s',target.stat().st_size,'bytes')
