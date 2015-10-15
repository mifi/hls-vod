hls-vod
=======

HTTP Live Streaming with on-the-fly encoding of any video file for Apple TV, iPhone, iPad, iPod, Mac Safari and other devices that support HTTP Live Streaming.

hls-vod lets you stream your whole video collection on-demand, regardless of format, to your iOS devices, playable from Safari, working with AirPlay as well. It does this by invoking ffmpeg/VLC on the fly through the command line.

Requirements
------------
- Tested on Linux and Mac, but it might work on Windows too.
- node.js (Tested on >0.8.14)
- VLC (tested with 2.0.4) OR ffmpeg (needs >v1, must be built with libx264 and libmp3lame)

VLC / ffmpeg ?
--------------
ffmpeg gives the best performance and best format/codec support, in my experience. Thumbs and audio is not implemented for VLC.

Installation
------------
- git clone ...
- cd hls-vod
- npm install

Running (with ffmpeg, default)
------------------------------
- Make sure you have node.js and ffmpeg (>1.0) in PATH
- node hls-vod.js --root-path /mnt/videos
- Browse to http://localhost:4040/

Running (with VLC)
------------------
- Make sure you have node.js and VLC installed
- node hls-vod.js --transcoder-type vlc --transcoder-path /usr/bin/vlc --root-path /mnt/videos
- Browse to http://localhost:4040/


Arguments
------------------
--root-path PATH - Root path allowed to read files in.

--transcoder-type vlc|ffmpeg - Defaults to ffmpeg

--transcoder-path PATH - Will use ffmpeg or vlc in PATH if not specified

For more arguments run it without arguments: node hls-vod.js

Limitations
-----------
- Currently only supports encoding one stream at a time (only one user at a time).

Compiling ffmpeg
----------------
You need a fairly recent version

hint:
./configure --enable-libx264 --enable-libmp3lame --enable-gpl --enable-nonfree
make -j9 && make install
