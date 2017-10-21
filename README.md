hls-vod 📺
=======

HTTP Live Streaming with on-the-fly encoding of any video file for Apple TV, iPhone, iPad, iPod, Mac Safari and other devices that support HTTP Live Streaming. Also supports Android and normal desktop browsers through the use of [mediaelement.js](http://www.mediaelementjs.com/)

`hls-vod` is a server application lets you stream your whole video collection on-demand, regardless of format, to your iOS devices, playable from Safari, working with AirPlay as well. It does this by invoking ffmpeg/VLC on the fly through the command line, and presenting a web based GUI for playback.

Requirements
------------
- [node.js](https://nodejs.org/en/) (Tested on >4)
- [ffmpeg](https://ffmpeg.org/) (needs >v1, must be built with libx264 and libmp3lame) OR [VLC](https://www.videolan.org/)
- Tested on Linux and Mac, but it might work on Windows too.

Installation
------------
```
npm i -g hls-vod
```

Running (with ffmpeg, default)
------------------------------
- Make sure you have node.js and ffmpeg in PATH
- `hls-vod --root-path /path/to/my/videos`
- Or: `hls-vod --transcoder-path /path/to/ffmpeg --root-path /path/to/my/videos`
- Browse to http://localhost:4040/

Running (with VLC)
------------------
- Make sure you have node.js and VLC installed and in PATH
- `hls-vod --transcoder-type vlc --root-path /path/to/my/videos`
- Or: `hls-vod --transcoder-type vlc --transcoder-path /usr/bin/vlc --root-path /path/to/my/videos`
- Browse to http://localhost:4040/

VLC or ffmpeg ?
--------------
`hls-vod` supports both VLC and ffmpeg as streaming backend. ffmpeg gives the best performance and best format/codec support, in my experience. Thumbs and audio is not implemented for VLC.


Arguments
------------------
```
--root-path PATH - Root path allowed to read files in. Defaults to current directory.

--cache-path PATH - Where to write transcoded video cache. Defaults to OS temp dir.

--transcoder-type vlc|ffmpeg - Defaults to ffmpeg.

--transcoder-path PATH - Will use ffmpeg or vlc in PATH if not specified.
```

For more arguments run it without arguments: `hls-vod`

Limitations
-----------
- Currently only supports encoding one stream at a time (only one user at a time).
