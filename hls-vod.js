var childProcess = require('child_process');
var http = require('http');
var url = require('url');
var fs = require('fs');
var path = require('path');

// 3rd party
var sanitize = require('validator').sanitize;
var wrench = require('wrench');
var express = require('express');

// Parameters
var listenPort = 4040;
var videoBitrate = 1000;
var enableThumbnails = true;
var audioBitrate = 128;
var targetWidth = 1280;
var searchPaths = [];
var rootPath = null;
var outputPath = './cache';
var transcoderPath = '/usr/bin/vlc';
var transcoderType = 'vlc';
var processCleanupTimeout = 6 * 60 * 60 * 1000;

var debug = true;


var videoExtensions = ['.mp4', '.avi', '.mkv', '.wmv', '.asf', '.m4v', '.flv', '.mpg', '.mpeg', '.mov', '.vob'];
var audioExtensions = ['.mp3', '.aac', '.m4a'];

var mimeTypes = {
	'.mp4': 'video/mp4',
	'.avi': 'video/x-msvideo',
	'.mkv': 'video/x-matroska',
	'.wmv': 'video/x-ms-wmv',
	'.asf': 'video/x-ms-asf',
	'.m4v': 'video/x-m4v',
	'.flv': 'video/x-flv',
	'.mpg': 'video/mpeg',
	'.mov': 'video/quicktime',
	'.ts': 'video/MP2T'
};

// Program state
var encoderProcesses = {};
var currentFile = null;
var lock = false;


var getMimeType = function(file) {
	var extname = path.extname(file);

	if (mimeTypes[extname]) return mimeTypes[extname];
	else return 'application/octet-stream';
}

var spawnNewProcess = function(file, playlistPath) {
	var outputUrlPrefix = '/segment/';

	
	if (transcoderType === 'ffmpeg') {
		//var args = ['-i', file, '-async', '1', '-b:a', 64 + 'k', '-vf', 'scale=min(' + targetWidth + '\\, iw):-1', '-b:v', videoBitrate + 'k', '-ar', '44100', '-ac', '2', '-vcodec', 'libx264', '-x264opts', 'level=3.0', '-profile:v', 'baseline', '-preset:v' ,'superfast', '-acodec', 'libaacplus', '-threads', '0', '-flags', '-global_header', '-map', '0', '-f', 'segment', '-segment_time', '10', '-segment_list', 'stream.m3u8', '-segment_format', 'mpegts', '-segment_list_flags', 'live', 'stream%05d.ts'];
		var args = ['-i', file, '-async', '1', '-acodec', 'libmp3lame', '-b:a', 128 + 'k', '-vf', 'scale=min(' + targetWidth + '\\, iw):-1', '-b:v', videoBitrate + 'k', '-ar', '44100', '-ac', '2', '-vcodec', 'libx264', '-x264opts', 'level=3.0', '-profile:v', 'baseline', '-preset:v' ,'superfast', '-threads', '0', '-flags', '-global_header', '-map', '0', '-f', 'segment', '-segment_time', '10', '-segment_list', 'stream.m3u8', '-segment_format', 'mpegts', '-segment_list_flags', 'live', 'stream%05d.ts'];
	}
	else {
		var playlistPath = 'stream.m3u8';
		var outputUrl = 'stream-#####.ts';
		var tsOutputPath = 'stream-#####.ts';
		var args = ['-I', 'dummy', file, 'vlc://quit', '--sout=#transcode{width=' + targetWidth + ',vcodec=h264,vb=' + videoBitrate + ',venc=x264{aud,profile=baseline,level=30,preset=superfast},acodec=mp3,ab=128,channels=2,audio-sync}:std{access=livehttp{seglen=10,delsegs=false,numsegs=0,index=' + playlistPath + ',index-url=' + outputUrl + '},mux=ts{use-key-frames},dst=' + tsOutputPath + '}'];
	}

	var encoderChild = childProcess.spawn(transcoderPath, args, {cwd: outputPath});

	console.log(transcoderPath + args);

	encoderProcesses[file] = encoderChild;
	currentFile = file;

	console.log('Spawned transcoder instance');

	if (debug) {
		encoderChild.stderr.on('data', function(data) {
			console.log(data.toString());
		});
	}

	encoderChild.on('exit', function(code) {
		console.log('Transcoder exited with code ' + code);

		delete encoderProcesses[file];
	});

	// Kill any "zombie" processes
	setTimeout(function() {
		if (encoderProcesses[file]) {
			console.log('Killing long running process');

			killProcess(encoderProcesses[file]);
		}
	}, processCleanupTimeout);
};

var pollForPlaylist = function(file, response, playlistPath) {
	var numTries = 0;

	var tryOpenFile = function() {
		if (numTries > 20) {
			console.log('Gave up trying to open m3u8 file');
			response.writeHead(500);
			response.end();
		}
		else {
			fs.readFile(playlistPath, function (err, data) {
				if (err || data.length === 0) {
					numTries++;
					setTimeout(tryOpenFile, 500);
				}
				else {
					if (!debug) {
						response.setHeader('Content-Type', 'application/x-mpegURL');
					}
					//console.log('response: ' + data);
					response.write(data);
					response.end();
				}
			});
		}
	};

	tryOpenFile();
}

var killProcess = function(processToKill, callback) {
	processToKill.kill();

	setTimeout(function() {
		processToKill.kill('SIGKILL');
	}, 5000);

	processToKill.on('exit', function(code) {
		if (callback) callback();
	});
}

var handlePlaylistRequest = function(file, response) {	
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

		// Make sure old one gets killed
		if (encoderProcesses[currentFile]) {
			killProcess(encoderProcesses[currentFile], function() {
				fs.unlink(playlistPath, function (err) {
					spawnNewProcess(file, playlistPath, outputPath);
					pollForPlaylist(file, response, playlistPath);
					lock = false;
				});
			});
		}
		else {
			fs.unlink(playlistPath, function (err) {
				spawnNewProcess(file, playlistPath, outputPath);
				pollForPlaylist(file, response, playlistPath);
				lock = false;
			});
		}
	}
	else {
		console.log('We are already encoding this file');
		pollForPlaylist(file, response, playlistPath);
	}
};

var listFiles = function(response) {
	var searchRegex = '(' + videoExtensions.join('|') + ')$';

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
						'<a href="/hls/?file=' + encodeURIComponent(filePath) + '" title="' + sanitize(filePath).entityEncode() + '">'
						+ sanitize(friendlyName).entityEncode() + '</a>'
						+ ' (' + sanitize(path.extname(filePath)).entityEncode() + ')'
						+ ' (<a href="' + sanitize(path.join('/raw', filePath)).entityEncode() + '">Raw</a>)<br />');
				}
			});
		});
	});
};


var browseDir = function(browsePath, response) {
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
		var fileDone = function() {
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
							fileObj.path = '/hls/?file=' + encodeURIComponent(relPath);
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
};

var handleThumbnailRequest = function(file, response) {
	if (!enableThumbnails) {
		response.setHeader('Content-Type', 'image/jpeg');
		response.end();
		return;
	}

	file = path.join('/', file);
	var fsPath = path.join(rootPath, file);

	var args = ['-ss', '00:00:10', '-i', fsPath, '-vf', 'scale=iw/2:-1,crop=iw:iw/2', '-f', 'image2pipe', '-vframes', '1', '-'];

	var child = childProcess.spawn(transcoderPath, args, {cwd: outputPath});

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

var handleStaticFileRequest = function(insidePath, file, response) {
	file = path.join('/', file);
	var filePath = path.join(insidePath, file);

	var fileStream = fs.createReadStream(filePath);
	fileStream.on('error', function(err) {
		console.log(err);
		response.writeHead(404);
		response.end();
	});

	fileStream.on('open', function() {
		response.writeHead(200, {'Content-Type': getMimeType(filePath)});
	});

	fileStream.pipe(response);
};

// Problem: some clients interrupt the HTTP request and send a new one, causing the song to restart...
var handleAudioRequest = function(relPath, request, response) {
	var file = path.join('/', relPath);
	var filePath = path.join(rootPath, file);
	var headerSent = false;

	// TODO: Child management
	//var encoderChild = childProcess.spawn(transcoderPath, ['-i', filePath, '-b:a', 64 + 'k', '-ac', '2', '-acodec', 'libaacplus', '-threads', '0', '-f', 'adts', '-']);
	var encoderChild = childProcess.spawn(transcoderPath, ['-i', filePath, '-b:a', 192 + 'k', '-ac', '2', '-acodec', 'libmp3lame', '-threads', '0', '-f', 'mp3', '-']);

	/*encoderChild.stderr.on('data', function(data) {
		console.log(data.toString());
	});*/

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


var exitWithUsage = function(argv) {
	console.log('Usage: ' + argv[0] + ' ' + argv[1]
		+ ' --root-path PATH'
		+ ' [--search-path PATH1 [--search-path PATH2 [...]]]'
		+ ' [--port PORT]'
		+ ' [--cache-dir PATH]'
		+ ' [--transcoder-path PATH]');
	process.exit();
}

for (var i=2; i<process.argv.length; i++) {
	switch (process.argv[i]) {
		case '--transcoder-path':
		if (process.argv.length <= i+1) {
			exitWithUsage(process.argv);
		}
		transcoderPath = process.argv[++i];
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

var app = express();
app.use(express.bodyParser());

app.all('*', function(request, response, next) {
	console.log(request.url);
	next();
});

app.get('^/static$', function(req, res) { res.redirect('/static/'); });
app.use('/static/', express.static(__dirname + '/static'));

app.get(/^\/hls\/$/, function(request, response) {
	var urlParsed = url.parse(request.url, true);
	var file = urlParsed.query['file'];
	handlePlaylistRequest(file, response);
});

app.get(/^\/hls\//, function(request, response) {
	var urlParsed = url.parse(request.url, true);
	var file = path.relative('/hls/', decodeURIComponent(urlParsed.pathname));
	handleStaticFileRequest(outputPath, file, response);
});

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

app.get(/^\/raw\//, function(request, response) {
	var urlParsed = url.parse(request.url, true);
	var file = path.relative('/raw/', decodeURIComponent(urlParsed.pathname));
	handleStaticFileRequest(rootPath, file, response);
});

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
	if (request.body.enableThumbnails != null) {
		enableThumbnails = request.body.enableThumbnails === 'true' ? true : false;
		console.log('enableThumbnails ' + enableThumbnails);
	}

	response.end();
});

app.get(/^\/settings/, function(request, response) {
	response.setHeader('Content-Type', 'application/json');
	response.write(JSON.stringify({
		'videoBitrate': videoBitrate,
		'thumbnails': enableThumbnails,
	}));
	response.end();
});

app.listen(listenPort);
