hls-vod
=======

HTTP Live Streaming with on-the-fly encoding of any video file for Apple TV/iPhone/iPad/iPod and possibly other devices.

hls-vod lets you stream your whole video collection on-demand, regardless of format (as long as VLC can transcode it), to your iOS devices, playable from Safari, working AirPlay as well.

It is built on node.js.

Requirements
============
Only tested on Linux, but it might work on Windows too.

Dependencies
============
- node.js (tested with 0.8.14)
- VLC (tested with 2.0.4)
- wrench (node.js module, tested 1.4.4)
- validator (node.js module, tested 0.4.19)

Installation / Running
============
- Make sure you have node.js and VLC installed
- npm install validator
- npm install wrench
- cd hls-vod
- mkdir cache
- node hls-vod.js --vlc-path /usr/bin/vlc --root-path /mnt/videos --search-path /mnt/videos/tv-shows --search-path /mnt/videos/new
- Browse to http://localhost:4040/list

Usage:
------
--root-path: Root path allowed to read files in.

--search-path: Add path to search in.

--vlc-path: VLC executable path (default /usr/bin/vlc).

Limitations
-----------
- Currently only supports encoding one stream at a time (only one user at a time).
- Currently search paths must lie under the root path
