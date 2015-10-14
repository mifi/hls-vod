hls-vod
=======

HTTP Live Streaming with on-the-fly encoding of any video file for Apple TV, iPhone, iPad, iPod, Mac Safari and other devices that support HTTP Live Streaming.

hls-vod lets you stream your whole video collection on-demand, regardless of format, to your iOS devices, playable from Safari, working with AirPlay as well.

Requirements
============
- Tested on Linux and Mac, but it might work on Windows too.
- node.js (Tested on >0.8.14)
- VLC (tested with 2.0.4) OR ffmpeg (needs >v1)

VLC / ffmpeg ?
==============
VLC is not recommended. Thumbs and audio does not work with VLC. VLC does not transcode perfectly, causing glitches in the video stream.
FFMPEG requires one of the latest versions, so you might need to build it. FFMPEG must be built with libx264 and libmp3lame

Installation
============
- git clone ...
- cd hls-vod
- npm install

Running (with ffmpeg)
============
- Make sure you have node.js and ffmpeg (>1.0) in PATH
- node hls-vod.js --root-path /mnt/videos
- Browse to http://localhost:4040/

Running (with VLC)
============
- Make sure you have node.js and VLC installed
- node hls-vod.js --transcoder-type vlc --transcoder-path /usr/bin/vlc --root-path /mnt/videos
- Browse to http://localhost:4040/


Arguments
------
--root-path: Root path allowed to read files in.

For more arguments run it without arguments: node hls-vod.js

Limitations
-----------
- Currently only supports encoding one stream at a time (only one user at a time).
- Currently search paths must lie under the root path

Compiling ffmpeg
================
You need a fairly recent version

hint:
./configure --enable-libx264 --enable-libmp3lame --enable-gpl --enable-nonfree
make -j9 && make install
