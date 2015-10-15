$(function() {
	var $videoPlayer = $('#video');
	
	// State
	var loading = false;
	

	function audioStop() {
		var audioPlayer = $('audio');
		audioPlayer.prop('controls', false);
		audioPlayer[0].pause();
		audioPlayer.hide();
	};

	function videoStop() {
		$videoPlayer[0].pause();
		$videoPlayer.hide();
	};

	function audioPlay(path) {
		videoStop();

		var audioPlayer = $('audio');
		audioPlayer.prop('controls', true);
		audioPlayer.show();

		audioPlayer[0].src = path;
		audioPlayer[0].load();
		audioPlayer[0].play();
	};

	function videoPlay(path) {
		audioStop();

		$videoPlayer.show();

		$videoPlayer[0].src = path;
		$videoPlayer[0].load();
		$videoPlayer[0].play();
	};


	function browseTo(path) {
		if (loading) return;
		loading = true;
		
		$('#thumbnail-viewer .x-button').click(function() {
			$('#thumbnail-viewer').fadeOut(200);
		});

		$.ajax(path, {
			success: function(data) {
				loading = false;

				$('#dir-header').text(data.cwd);

				$('#file-list').empty();

				var back = $('<li/>');
				back.html('..');
				back.click(function() {
					browseTo(data.cwd != '/' ? path + '/..' : path);
				});
				$('#file-list').append(back);

				$.each(data.files, function(index, file) {
					var elem = $('<li/>');
					elem.text(file.name);

					switch(file.type) {
					case 'video':
						elem.click(function() {
							if (confirm('Play video? (Will delete any previous encoding)')) {
								videoPlay(file.path);
							}
						});
						break;

					case 'audio':
						elem.click(function() {
							if (confirm('Play audio?')) {
								audioPlay(file.path);
							}
						});
						break;

					case 'directory':
						elem.click(function() {
							browseTo(file.path);
						});
						break;
					
					default:
					}

					if (file.error) {
						elem.attr('title', file.errorMsg);
					}

					if (file.type == 'video' || file.type == 'audio') {
						var rawLink = $('<a />').attr('href', '/raw' + file.relPath).text('[RAW]');
						rawLink.click(function(event) {
							event.stopPropagation();
						});
						elem.append(rawLink);
					}

					if (file.type == 'video') {
						//var thumbLink = $('<a />').attr('href', '/thumbnail' + file.relPath).text('[Thumb]').attr('target', '_blank');
						var thumbLink = $('<span />').text('[Thumb]');
						thumbLink.click(function(event) {
							event.stopPropagation();
							var path = '/thumbnail' + file.relPath;
							$('#thumbnail-viewer img').attr('src', path).fadeIn(200);
							$('#thumbnail-viewer').fadeIn(200);
						});
						elem.append(thumbLink);
					}


					$('#file-list').append(elem);
				});
			}
		});
	}
	
	
	
	$('audio, video').hide();

	browseTo('/browse');

	$('#settings-btn').click(function() {
		$('#settings-container').fadeToggle();
	});

	$('#settings-container select[name=videoBitrate]').change(function() {
		$.ajax('/settings', {
			data: {
				videoBitrate: $(this).val()
			},
			type: 'POST',
			error: function() {
				alert('Failed');
			}
		});
	});

	$.get('/settings', function(data) {
		$('#settings-container select[name=videoBitrate]').val(data.videoBitrate);
	});
});
