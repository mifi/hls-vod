hls-vod 📺
=======

HTTP Live Streaming with on-the-fly encoding of any video file for Apple TV, iPhone, iPad, iPod, Mac Safari and other devices that support HTTP Live Streaming. Also supports Android and normal desktop browsers through the use of [mediaelement.js](http://www.mediaelementjs.com/)



`hls-vod` is a server application lets you stream your whole video collection on-demand, regardless of format, to your iOS devices, playable from Safari, working with AirPlay as well. It does this by invoking ffmpeg/VLC on the fly through the command line, and presenting a web based GUI for playback.

Version 1.0 is out with simpler usage 🎉

Requirements
------------
- [node.js](https://nodejs.org/en/) (Tested on >=4)
- [ffmpeg](https://ffmpeg.org/) (needs >=v1, must be built with libx264 and libmp3lame) OR [VLC](https://www.videolan.org/)
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

## Contributors

### Code Contributors

This project exists thanks to all the people who contribute. [[Contribute](CONTRIBUTING.md)].
<a href="https://github.com/mifi/hls-vod/graphs/contributors"><img src="https://opencollective.com/hls-vod/contributors.svg?width=890&button=false" /></a>

### Financial Contributors

Become a financial contributor and help us sustain our community. [[Contribute](https://opencollective.com/hls-vod/contribute)]

#### Individuals

<a href="https://opencollective.com/hls-vod"><img src="https://opencollective.com/hls-vod/individuals.svg?width=890"></a>

#### Organizations

Support this project with your organization. Your logo will show up here with a link to your website. [[Contribute](https://opencollective.com/hls-vod/contribute)]

<a href="https://opencollective.com/hls-vod/organization/0/website"><img src="https://opencollective.com/hls-vod/organization/0/avatar.svg"></a>
<a href="https://opencollective.com/hls-vod/organization/1/website"><img src="https://opencollective.com/hls-vod/organization/1/avatar.svg"></a>
<a href="https://opencollective.com/hls-vod/organization/2/website"><img src="https://opencollective.com/hls-vod/organization/2/avatar.svg"></a>
<a href="https://opencollective.com/hls-vod/organization/3/website"><img src="https://opencollective.com/hls-vod/organization/3/avatar.svg"></a>
<a href="https://opencollective.com/hls-vod/organization/4/website"><img src="https://opencollective.com/hls-vod/organization/4/avatar.svg"></a>
<a href="https://opencollective.com/hls-vod/organization/5/website"><img src="https://opencollective.com/hls-vod/organization/5/avatar.svg"></a>
<a href="https://opencollective.com/hls-vod/organization/6/website"><img src="https://opencollective.com/hls-vod/organization/6/avatar.svg"></a>
<a href="https://opencollective.com/hls-vod/organization/7/website"><img src="https://opencollective.com/hls-vod/organization/7/avatar.svg"></a>
<a href="https://opencollective.com/hls-vod/organization/8/website"><img src="https://opencollective.com/hls-vod/organization/8/avatar.svg"></a>
<a href="https://opencollective.com/hls-vod/organization/9/website"><img src="https://opencollective.com/hls-vod/organization/9/avatar.svg"></a>
