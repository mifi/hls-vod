var childProcess = require('child_process');
var http = require('http');
var url = require('url');
var fs = require('fs');
var path = require('path');

// 3rd party
var sanitize = require('validator').sanitize;
var wrench = require('wrench');

// Parameters
var listenPort = 4040;
var videoBitrate = 1000;
var videoHeight = 576;
var videoPreset = 'normal';
var searchPaths = [];
var rootPath = null;
var outputPath = './cache';
var vlcPath = '/usr/bin/vlc';
var processCleanupTimeout = 6 * 60 * 60 * 1000;

var debug = false;

var searchExtensions = ['mp4', 'avi', 'mkv', 'wmv', 'asf', 'm4v', 'flv', 'mpg', 'mov'];

var mimeTypes = {
	'mp4': 'video/mp4',
	'avi': 'video/x-msvideo',
	'mkv': 'video/x-matroska',
	'wmv': 'video/x-ms-wmv',
	'asf': 'video/x-ms-asf',
	'm4v': 'video/x-m4v',
	'flv': 'video/x-flv',
	'mpg': 'video/mpeg',
	'mov': 'video/quicktime',
	'ts': 'video/MP2T'
};

// Program state
var childProcesses = {};
var currentFile = null;
var lock = false;


var getMimeType = function(file) {
	var extname = path.extname(file);
	if (extname != '') extname = extname.split('.')[1];

	if (mimeTypes[extname]) return mimeTypes[extname];
	else return 'application/octet-stream';
}

var spawnNewProcess = function(file, playlistPath) {
	var tsOutputPath = path.join(outputPath, 'stream-########.ts');
	var outputUrl = path.join('/segment', 'stream-########.ts');

	// TODO escape any characters?
	var soutChain = '--sout=#transcode{height=' + videoHeight + ',vcodec=h264,vb=' + videoBitrate + ',venc=x264{aud,profile=baseline,level=30,preset=' + videoPreset + '},acodec=mp3,ab=128,channels=2,audio-sync}:std{access=livehttp{seglen=10,delsegs=false,numsegs=0,index=' + playlistPath + ',index-url=' + outputUrl + '},mux=ts{use-key-frames},dst=' + tsOutputPath + '}'

	if (debug) console.log(soutChain);

	var child = childProcess.spawn(vlcPath, ['-I', 'dummy', file, 'vlc://quit', soutChain]);
	childProcesses[file] = child;
	currentFile = file;

	console.log('Spawned VLC instance');

	if (debug) {
		child.stderr.on('data', function(data) {
			console.log(data.toString());
		});
	}

	child.on('exit', function(code) {
		if (code !== 0) {
			console.log('VLC exited with code ' + code);
		}
		else {
			console.log('VLC exited successfully');
		}

		delete childProcesses[file];
	});

	// Kill any "zombie" processes
	setTimeout(function() {
		if (childProcesses[file]) {
			console.log('Killing long running process');
			
			killProcess(child, function() {
			});
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
				if (err) {
					numTries++;
					setTimeout(tryOpenFile, 500);
				}
				else {
					if (!debug) {
						response.setHeader('Content-Type', 'application/x-mpegURL');
					}
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

		console.log('Current file change');

		// Make sure old one gets killed
		if (childProcesses[currentFile]) {
			killProcess(childProcesses[currentFile], function() {
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
	var searchRegex = '\\.(' + searchExtensions.join('|') + ')$';

	searchPaths.forEach(function(searchPath) {
		wrench.readdirRecursive(searchPath, function(err, curFiles) {
			if (err) {
				console.log(err);
				//response.end();
				return;
			}
			if (curFiles == null) {
				response.end();
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
						'<a href="/stream.m3u8?file=' + encodeURIComponent(filePath) + '" title="' + sanitize(filePath).entityEncode() + '">'
						+ sanitize(friendlyName).entityEncode() + '</a>'
						+ ' (' + sanitize(path.extname(filePath)).entityEncode() + ')'
						+ ' (<a href="' + sanitize(path.join('/raw', filePath)).entityEncode() + '">Raw</a>)<br />');
				}
			});
		});
	});
};

var handleStaticFileRequest = function(relativePath, file, response) {
	file = path.join('/', file);
	var filePath = path.join(relativePath, file);

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

var handleHttpRequest = function(request, response) {
	var urlParsed = url.parse(request.url, true);

	var pathname = urlParsed.pathname;
	if (pathname.match(/^\/stream.m3u8$/)) {
		var file = urlParsed.query['file'];
		handlePlaylistRequest(file, response);
	}
	else if (pathname.match(/^\/list$/)) {
		listFiles(response);
	}
	else if (pathname.match(/^\/raw\//)) {
		var file = path.relative('/raw/', decodeURIComponent(urlParsed.pathname))
		handleStaticFileRequest(rootPath, file, response);
	}
	else if (pathname.match(/^\/segment\//)) {
		var file = path.relative('/segment/', decodeURIComponent(urlParsed.pathname))
		handleStaticFileRequest(outputPath, file, response);
	}
	else {
		console.log('Path not found: ' + request.url);
		response.writeHead(404);
		response.end();
	}
};

var exitWithUsage = function(argv) {
	console.log('Usage: ' + argv[0] + ' ' + argv[1]
		+ ' --root-path PATH'
		+ ' --search-path PATH1 [--search-path PATH2 [...]]');
		+ ' [--vlc-path PATH]'
	process.exit();
}

for (var i=2; i<process.argv.length; i++) {
	switch (process.argv[i]) {
		case '--vlc-path':
		if (process.argv.length <= i+1) {
			exitWithUsage(process.argv);
		}

		vlcPath = process.argv[++i];
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
		
		default:
		console.log(process.argv[i]);
		exitWithUsage(process.argv);
		break;
	}
}

console.log(rootPath + ' ' + searchPaths);

if (!rootPath || searchPaths.length == 0) {
	exitWithUsage(process.argv);
}

http.createServer(handleHttpRequest).listen(listenPort);
