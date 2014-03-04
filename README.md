hls-vod
=======

HTTP Live Streaming with on-the-fly encoding of any video file for Apple TV/iPhone/iPad/iPod and possibly other devices.

hls-vod lets you stream your whole video collection on-demand, regardless of format, to your iOS devices, playable from Safari, working with AirPlay as well.

It is built on node.js.

Requirements
============
Tested on Linux and Mac, but it might work on Windows too.

Dependencies
============
- node.js (tested with 0.8.14)
- VLC (tested with 2.0.4) OR ffmpeg (needs v > 1)
- wrench (node.js module, tested 1.4.4)
- validator (node.js module, tested 0.4.19)
- express (node.js module)

VLC / ffmpeg ?
==============
VLC is not recommended. Thumbs and audio does not work with VLC. VLC does not transcode perfectly, causing glitches in the video stream.
FFMPEG requires one of the latest versions, so you might need to build it. FFMPEG must be built with libx264 and libmp3lame

Compiling ffmpeg
================
You need a fairly recent version
hint:
./configure --enable-libx264 --enable-libmp3lame --enable-gpl --enable-nonfree
make -j9 && make install

Installation
============
- cd hls-vod
- npm install
- mkdir cache

Running (with ffmpeg)
============
- Make sure you have node.js and ffmpeg (>1.0)
- node hls-vod.js --port 4040 --transcoder-type ffmpeg --transcoder-path /usr/bin/ffmpeg --root-path /mnt/videos
- Browse to http://localhost:4040/static/

Running (with VLC)
============
- Make sure you have node.js and VLC installed
- node hls-vod.js --port 4040 --transcoder-path /usr/bin/vlc --root-path /mnt/videos
- Browse to http://localhost:4040/static/


Usage:
------
--port: Listen to this port.

--root-path: Root path allowed to read files in.

--search-path: Add path to search in. Must lie under root-path.

--transcoder-path: VLC/ffmpeg executable path (default /usr/bin/vlc).

--transcoder-type vlc|ffmpeg: Select which type of transcoder-path points to (defaults to vlc)

Limitations
-----------
- Currently only supports encoding one stream at a time (only one user at a time).
- Currently search paths must lie under the root path
