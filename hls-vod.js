var childProcess = require('child_process');
var http = require('http');
var url = require('url');
var fs = require('fs');
var path = require('path');
var readLine = require('readline');

// 3rd party
var sanitize = require('validator').sanitize;
var wrench = require('wrench');
var express = require('express');

// Parameters
var listenPort = 4040;
var videoBitrate = 1000;
var audioBitrate = 128;
var targetWidth = 1280;
var searchPaths = [];
var rootPath = null;
var outputPath = './cache';
var transcoderPath = 'ffmpeg';
var transcoderType = 'ffmpeg';
var processCleanupTimeout = 6 * 60 * 60 * 1000;
var debug = false;
var playlistRetryDelay = 500;
var playlistRetryTimeout = 60000;
var playlistEndMinTime = 20000;


var videoExtensions = ['.mp4','.3gp2','.3gp','.3gpp', '.3gp2','.amv','.asf','.avs','.dat','.dv', '.dvr-ms','.f4v','.m1v','.m2p','.m2ts','.m2v', '.m4v','.mkv','.mod','.mp4','.mpe','.mpeg1', '.mpeg2','.divx','.mpeg4','.mpv','.mts','.mxf', '.nsv','.ogg','.ogm','.mov','.qt','.rv','.tod', '.trp','.tp','.vob','.vro','.wmv','.web,', '.rmvb', '.rm','.ogv','.mpg', '.avi', '.mkv', '.wmv', '.asf', '.m4v', '.flv', '.mpg', '.mpeg', '.mov', '.vob', '.ts'];
var audioExtensions = ['.mp3', '.aac', '.m4a'];

// Program state
var encoderProcesses = {};
var currentFile = null;
var lock = false;
var encodingStartTime = null;

// We have to apply some hacks to the playlist
function withModifiedPlaylist(readStream, eachLine, done) {
	var rl = readLine.createInterface({input: readStream});
	
	var foundPlaylistType = false;

	rl.on('line', function (line) {
		if (line.match('^#EXT-X-PLAYLIST-TYPE:')) foundPlaylistType = true;
		else if (line.match('^#EXTINF:') && !foundPlaylistType) {
			// Insert the type if it does not exist (ffmpeg doesn't seem to add this). Not having this set to VOD or EVENT will lead to no scrub-bar when encoding is completed
			eachLine('#EXT-X-PLAYLIST-TYPE:EVENT');
			foundPlaylistType = true;
		}
		
		// Due to what seems like a bug in Apples implementation, if #EXT-X-ENDLIST is included too fast, it seems the player will hang. Removing it will cause the player to re-fetch the playlist once more, which seems to prevent the bug.
		if (line.match('^#EXT-X-ENDLIST') && new Date().getTime() - encodingStartTime.getTime() < playlistEndMinTime) {
			console.log('File was encoded too fast, skiping END tag');
		}
		else {
			eachLine(line);
		}
	});
	rl.on('close', function() {
		if (debug) console.log('Done reading lines');
		done();
	});
}

function spawnNewProcess(file, playlistPath) {
	var outputUrlPrefix = '/segment/';

	var playlistFileName = 'stream.m3u8';

	if (transcoderType === 'ffmpeg') {
		// https://www.ffmpeg.org/ffmpeg-formats.html#segment
		var tsOutputFormat = 'stream%05d.ts';
		var args = [
			'-i', file, '-sn',
			'-async', '1', '-acodec', 'libmp3lame', '-b:a', 128 + 'k', '-ar', '44100', '-ac', '2',
			'-vf', 'scale=min(' + targetWidth + '\\, iw):-1', '-b:v', videoBitrate + 'k', '-vcodec', 'libx264', '-profile:v', 'baseline', '-preset:v' ,'superfast',
			'-x264opts', 'level=3.0',
			'-threads', '0', '-flags', '-global_header', '-map', '0',
			// '-map', '0:v:0', '-map', '0:a:1'
			'-f', 'segment',
			'-segment_list', playlistFileName, '-segment_format', 'mpegts', '-segment_list_flags', 'live', tsOutputFormat
			//'-segment_time', '10', '-force_key_frames', 'expr:gte(t,n_forced*10)',
			//'-f', 'hls', '-hls_time', '10', '-hls_list_size', '0', '-hls_allow_cache', '0', '-hls_segment_filename', tsOutputFormat, playlistFileName
		];
	}
	else {
		// https://wiki.videolan.org/Documentation:Streaming_HowTo/Streaming_for_the_iPhone/
		var tsOutputFormat = 'stream#####.ts';
		
		var args = [
			'-I' ,'dummy', '--no-loop', '--no-repeat', file, 'vlc://quit',
			'--sout=#transcode{width=' + targetWidth + ',vcodec=h264,vb=' + videoBitrate + ',fps=25' +
			//',venc=x264{aud,profile=baseline,level=30,keyint=30,ref=1,preset=superfast},' +
			',venc=x264{aud,profile=baseline,level=30,preset=superfast},' +
			'acodec=mp3,ab=128,channels=2,audio-sync}:std{access=livehttp{seglen=10,delsegs=false,numsegs=0,index=' + playlistFileName + ',index-url=' + tsOutputFormat + '},' +
			'mux=ts{use-key-frames},dst=' + tsOutputFormat + '}'
		];
	}

	var encoderChild = childProcess.spawn(transcoderPath, args, {cwd: outputPath, env: process.env});

	console.log('Spawned transcoder instance');
	if (debug) console.log(transcoderPath + ' ' + args.join(' '));

	encoderProcesses[file] = encoderChild;
	currentFile = file;

	if (debug) {
		encoderChild.stderr.on('data', function(data) {
			console.log(data.toString());
		});
	}

	encoderChild.on('exit', function(code) {
		if (code == 0) {
			console.log('Transcoding completed');
		}
		else {
			console.log('Transcoder exited with code ' + code);
		}

		delete encoderProcesses[file];
	});

	// Kill any "zombie" processes
	setTimeout(function() {
		if (encoderProcesses[file]) {
			console.log('Killing long running process');

			killProcess(encoderProcesses[file]);
		}
	}, processCleanupTimeout);
}

function pollForPlaylist(file, response, playlistPath) {
	var numTries = 0;

	function checkPlaylistCount(stream, cb) {
		var rl = readLine.createInterface({ input: stream });
		var count = 0;
		var need = 3;
		var found = false;

		rl.on('line', function (line) {
			if (line.match('^#EXTINF:[0-9]+')) count++;
			if (count >= need) {
				found = true;
				rl.close();
			}
		});
		rl.on('close', function() {
			if (debug) {
				if (!found) console.log('Found only ' + count + ' file(s) in playlist');
				else console.log('Found needed ' + need + ' files in playlist!');
			}

			cb(found);
		});
	}

	function retry() {
		numTries++;
		if (debug) console.log('Retrying playlist file...');		
		setTimeout(tryOpenFile, playlistRetryDelay);
	}

	function tryOpenFile() {
		if (numTries > playlistRetryTimeout/playlistRetryDelay) {
			console.log('Whoops! Gave up trying to open m3u8 file');
			response.writeHead(500);
			response.end();
		}
		else {
			var readStream = fs.createReadStream(playlistPath);
			readStream.on('error', function(err) {
				if (err.code === 'ENOENT') {
					if (debug) console.log('Playlist file does not exist.');
					retry();
				}
				else console.log(err);
			});

			checkPlaylistCount(readStream, function(found) {
				if (!found) {
					return retry();
				}

				if (debug) console.log('Found playlist file!');

				//response.sendfile(playlistPath);

				var readStream2 = fs.createReadStream(playlistPath);

				readStream2.on('error', function(err) {
					console.log(err);
					readStream2.close();
					response.writeHead(500);
					response.end();
				});

				response.setHeader('Content-Type', 'application/x-mpegURL');

				withModifiedPlaylist(readStream2, function(line) {
					if (debug) console.log(line);
					response.write(line + '\n');
				}, function() {
					response.end();
				});
			});
		}
	}

	tryOpenFile();
}

function killProcess(processToKill, callback) {
	processToKill.kill();

	setTimeout(function() {
		processToKill.kill('SIGKILL');
	}, 5000);

	processToKill.on('exit', function(code) {
		if (callback) callback();
	});
}

function handlePlaylistRequest(file, response) {
	if (debug) console.log('Playlist request: ' + file)
	
	if (!file) {
		request.writeHead(400);
		request.end();
	}

	if (lock) {
		console.log('Ongoing spawn process not finished, denying request');
		response.writeHead(503);
		response.end();
		return;
	}

	file = path.join('/', file); // Remove ".." etc
	file = path.join(rootPath, file);
	var playlistPath = path.join(outputPath, '/stream.m3u8');

	if (currentFile != file) {
		lock = true;

		console.log('New file to encode chosen');
		
		encodingStartTime = new Date();

		function startNewEncoding() {
			fs.unlink(playlistPath, function (err) {
				spawnNewProcess(file, playlistPath, outputPath);
				pollForPlaylist(file, response, playlistPath);
				lock = false;
			});
		}

		// Make sure old one gets killed
		if (encoderProcesses[currentFile]) {
			killProcess(encoderProcesses[currentFile], startNewEncoding);
		}
		else {
			startNewEncoding();
		}
	}
	else {
		console.log('We are already encoding this file');
		pollForPlaylist(file, response, playlistPath);
	}
}

function listFiles(response) {
	var searchRegex = '(' + videoExtensions.join('|') + ')$';

	if (searchPaths.length === 0) response.end();

	searchPaths.forEach(function(searchPath) {
		wrench.readdirRecursive(searchPath, function(err, curFiles) {
			if (err) {
				console.log(err);
				return;
			}
			if (curFiles == null) {
				response.end(); // No more files
				return;
			}

			curFiles.forEach(function(filePath) {
				filePath = path.join(path.relative(rootPath, searchPath), filePath);
				if (filePath.match(searchRegex)) {
					var friendlyName = filePath;
					var matches = friendlyName.match(/\/?([^/]+)\.[a-z0-9]+$/);
					if (matches && matches.length == 2) {
						friendlyName = matches[1];
					}

					response.write(
						'<a href="/hls/file-' + encodeURIComponent(filePath) + '.m3u8' + '" title="' + sanitize(filePath).entityEncode() + '">'
						+ sanitize(friendlyName).entityEncode() + '</a>'
						+ ' (' + sanitize(path.extname(filePath)).entityEncode() + ')'
						+ ' (<a href="' + sanitize(path.join('/raw', filePath)).entityEncode() + '">Raw</a>)<br />');
				}
			});
		});
	});
}


function browseDir(browsePath, response) {
	browsePath = path.join('/', browsePath); // Remove ".." etc
	fsBrowsePath = path.join(rootPath, browsePath);

	var fileList = [];

	fs.readdir(fsBrowsePath, function(err, files) {
		if (err) {
			response.writeHead(500);
			response.end();
			console.log('Failed to read directory, ' + err);
			return;
		}

		var filesDone = 0;
		function fileDone() {
			filesDone++;

			if (filesDone == files.length) {
				fileList.sort(function(a, b) {
					return a.name.localeCompare(b.name);
				});
				response.json({
					cwd: browsePath,
					files: fileList
				});
				response.end();
			}
		}

		if (files.length === 0) {
			filesDone--;
			fileDone();
		}
		else {
			files.forEach(function(file) {
				var fsPath = path.join(fsBrowsePath, file);
				fs.lstat(fsPath, function(err, stats) {
					var fileObj = {};

					fileObj.name = file;

					if (err) {
						fileObj.error = true;
						fileObj.errorMsg = err;
					}
					else if (stats.isFile()) {
						var relPath = path.join(browsePath, file);
						var extName = path.extname(file);

						if (videoExtensions.indexOf(extName) != -1) {
							fileObj.type = 'video';
							fileObj.path = '/hls/file-' + encodeURIComponent(relPath) + '.m3u8';
						}
						else if (audioExtensions.indexOf(extName) != -1) {
							fileObj.type = 'audio';
							fileObj.path = path.join('/audio/' + relPath);
						}
						else {
							fileObj.path = path.join('/audio/' + relPath);
						}

						fileObj.relPath = path.join('/', relPath);

					}
					else if (stats.isDirectory()) {
						var relPath = path.join(browsePath, file);

						fileObj.type = 'directory';
						fileObj.path = path.join('/browse' + relPath);
					}

					fileList.push(fileObj);

					fileDone();
				});
			});
		}
	});
}

function handleThumbnailRequest(file, response) {
	file = path.join('/', file);
	var fsPath = path.join(rootPath, file);

	// http://superuser.com/questions/538112/meaningful-thumbnails-for-a-video-using-ffmpeg
	var args = ['-ss', '00:00:20', '-i', fsPath, '-vf', 'select=gt(scene\,0.4)', '-vf', 'scale=iw/2:-1,crop=iw:iw/2', '-f', 'image2pipe', '-vframes', '1', '-'];

	var child = childProcess.spawn(transcoderPath, args, {cwd: outputPath, env: process.env});

	if (debug) {
		child.stderr.on('data', function(data) {
			console.log(data.toString());
		});
	}
	response.setHeader('Content-Type', 'image/jpeg');
	child.stdout.pipe(response);

	child.on('exit', function(code) {
		response.end();
	});

	setTimeout(function() {
		child.kill('SIGKILL');
	}, 4000);
}


// Problem: some clients interrupt the HTTP request and send a new one, causing the song to restart...
function handleAudioRequest(relPath, request, response) {
	var file = path.join('/', relPath);
	var filePath = path.join(rootPath, file);
	var headerSent = false;

	// TODO: Child management
	//var encoderChild = childProcess.spawn(transcoderPath, ['-i', filePath, '-b:a', 64 + 'k', '-ac', '2', '-acodec', 'libaacplus', '-threads', '0', '-f', 'adts', '-']);
	var encoderChild = childProcess.spawn(transcoderPath, [
		'-i', filePath, '-threads', '0',
		'-b:a', 192 + 'k', '-ac', '2', '-acodec', 'libmp3lame',
		'-map', '0:a:0',
		'-f', 'mp3', '-'
	]);

	if (debug) {
		encoderChild.stderr.on('data', function(data) {
			console.log(data.toString());
		});
	}

	encoderChild.stdout.on('data', function() {
		if (!headerSent) {
			response.writeHead(200, {'Content-Type': 'audio/mpeg'});
			headerSent = true;
		}
	});

	request.on('close', function() {
		encoderChild.kill();
		setTimeout(function() {
			encoderChild.kill('SIGKILL');
		}, 5000);
	});

	encoderChild.stdout.pipe(response);
}


function exitWithUsage(argv) {
	console.log(
		'Usage: ' + argv[0] + ' ' + argv[1]
		+ ' --root-path PATH'
		+ ' [--search-path PATH1 [--search-path PATH2 [...]]]'
		+ ' [--port PORT]'
		+ ' [--cache-dir PATH]'
		+ ' [--transcoder-path PATH]'
		+ ' [--transcoder-type ffmpeg|vlc]'
		+ ' [--debug]'
	);
	process.exit();
}

for (var i=2; i<process.argv.length; i++) {
	switch (process.argv[i]) {
		case '--transcoder-path':
		if (process.argv.length <= i+1) {
			exitWithUsage(process.argv);
		}
		transcoderPath = process.argv[++i];
		console.log('Transcoder path ' + transcoderPath);
		break;

		case '--root-path':
		if (process.argv.length <= i+1) {
			exitWithUsage(process.argv);
		}
		rootPath = process.argv[++i];
		break;

		case '--search-path':
		if (process.argv.length <= i+1) {
			exitWithUsage(process.argv);
		}
		searchPaths.push(process.argv[++i]);
		break;

		case '--cache-dir':
		if (process.argv.length <= i+1) {
			exitWithUsage(process.argv);
		}
		outputPath = process.argv[++i];
		break;

		case '--port':
		if (process.argv.length <= i+1) {
			exitWithUsage(process.argv);
		}
		listenPort = parseInt(process.argv[++i]);
		break;

		case '--transcoder-type':
		if (process.argv.length <= i+1) {
			exitWithUsage(process.argv);
		}
		transcoderType = process.argv[++i];
		if (['vlc', 'ffmpeg'].indexOf(transcoderType) == -1) exitWithUsage(process.argv);
		break;

		case '--debug':
			debug = true;
		break;

		default:
		console.log(process.argv[i]);
		exitWithUsage(process.argv);
		break;
	}
}

console.log(rootPath + ' ' + searchPaths);

if (!rootPath) {
	exitWithUsage(process.argv);
}

fs.mkdir(outputPath, function(err, data) {
	if (err && err.code == 'EEXIST') return;
	else if (err) return console.log(err);
	console.log('Created directory ' + outputPath);
});

var app = express();
app.use(express.bodyParser());

app.all('*', function(request, response, next) {
	console.log(request.url);
	next();
});

app.use('/', express.static(__dirname + '/static'));

// Flash plugin needs path to end with .m3u8, so we hack it with file name url encoded inside the path component!
// In addition, m3u8 file has to be under the same path as the TS-files, so they can be linked relatively in the m3u8 file
app.get(/^\/hls\/file-(.+).m3u8/, function(request, response) {
	var filePath = decodeURIComponent(request.params[0]);
	handlePlaylistRequest(filePath, response);
});

app.use('/hls/', express.static(__dirname + '/cache/'));

app.get(/^\/thumbnail\//, function(request, response) {
	var urlParsed = url.parse(request.url, true);
	var file = path.relative('/thumbnail/', decodeURIComponent(urlParsed.pathname));
	handleThumbnailRequest(file, response);
});

app.get('/list', function(request, response) {
	listFiles(response);
});

app.get(/^\/browse/, function(request, response) {
	var browsePath = path.relative('/browse', decodeURIComponent(request.path));
	browseDir(browsePath, response);
});

app.use('/raw/', express.static(rootPath));

app.get(/^\/audio\//, function(request, response) {
	var urlParsed = url.parse(request.url, true);
	var relPath = path.relative('/audio/', decodeURIComponent(urlParsed.pathname));
	handleAudioRequest(relPath, request, response);
});

app.post(/^\/settings/, function(request, response) {
	console.log(request.body);

	var newBitrate = request.body.videoBitrate;
	if (newBitrate) {
		videoBitrate = parseInt(newBitrate);
	}

	response.end();
});

app.get(/^\/settings/, function(request, response) {
	response.setHeader('Content-Type', 'application/json');
	response.write(JSON.stringify({
		'videoBitrate': videoBitrate
	}));
	response.end();
});

app.listen(listenPort);
