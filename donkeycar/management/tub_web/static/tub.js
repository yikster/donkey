$(document).ready(function(){
    var CF_URL = "http://doujuw4eh8d7e.cloudfront.net/"
    var tubId = window.location.href.split('/').slice(-1)[0];
    var isS3 = false;
    var bucket = "";
    var prefix = "";
    var clips = [];
    var totalFrames = 0;
    var selectedClipIdx = 0;
    var currentFrameIdx = 0;
    var playing = null;

    var selectedClip = function() {
        return clips[selectedClipIdx];
    };

    var pause = function() {
        if (playing) {
            clearInterval(playing);
            playing = null;
        }
        updateStreamControls();
    };

    var play = function() {
        if (playing === null) {
            playing = setInterval(function(){
                currentFrameIdx ++;
                if (currentFrameIdx >= selectedClip().frames.length) {
                    currentFrameIdx = 0;
                    clearInterval(playing);
                    playing = null;
                    updateStreamControls();
                }
                updateStreamImg();
                updatePreviewProgress();
            }, 1000/$('#preview-speed').val());
        }
        updateStreamControls();
    };

    var getTub = function(tId, cb) {
        $.getJSON('/api/tubs/' + tubId, function( data ) {
            clips = data.clips.map(function(clip) {
                return {frames: clip, markedToDelete: false};
            });
            
            totalFrames = clips[0].frames[clips[0].frames.length - 1];
            console.log("TotalFrames: " + totalFrames);

            selectedClipIdx = 0;
            updateStreamImg();
            updateClipTable();
        });
    };
    var checkS3 = function(tubId) {
        if(isS3) return true;
        str = tubId.split(",");
        console.log(str)
        if(str.length == 4) {
        console.log(str.length)

            bucket = str[1];
            // prefix = str[2] + "/" +str[3];
            prefix = str[3];
            isS3 = true;
            return true;
        }
        return false;
    }
    var getImageUrl = function (tubId, curFrame) {
        console.log(checkS3(tubId))
        if(checkS3(tubId)) {
            url = CF_URL + prefix + "/" + curFrame + "_cam-image_array_.jpg"
            console.log( url )
            // return "https://s3.ap-northeast-2.amazonaws.com/"+ bucket + "/" + prefix + "/" + curFrame + "_cam-image_array_.jpg"
            return url;
        }
        else 
            return '/tub_data/' + tubId + '/' + curFrame + '_cam-image_array_.jpg';
    }  

    var getRecordUrl = function (tubId, curFrame) {
        if(checkS3(tubId)) {
            url = CF_URL + prefix + "/record" + curFrame + ".json"
            //return "https://s3.ap-northeast-2.amazonaws.com/"+ bucket + "/" + prefix + "/record_" + curFrame + ".json"
            return url;
        }
        else 
            return '/tub_data/' + tubId + '/' + 'record_' + curFrame + '.json'
    }
    // UI elements update
    var updateStreamImg = function() {
        var curFrame = selectedClip().frames[currentFrameIdx];
        $('#img-preview').attr('src', getImageUrl(tubId, curFrame));
        $('#cur-frame').text(curFrame);
        $.getJSON(getRecordUrl(tubId, curFrame) , function(data) {
            var angle = data["user/angle"];
            var steeringPercent = Math.round(Math.abs(angle) * 100) + '%';
            var steeringRounded = angle.toFixed(2)

            $('.steering-bar .progress-bar').css('width', '0%').html('');
            if(angle < 0) {
                $('#angle-bar-backward').css('width', steeringPercent).html(steeringRounded)
            }
            if (angle > 0) {
                $('#angle-bar-forward').css('width', steeringPercent).html(steeringRounded)
            }
        });
    };

    var updateStreamControls = function() {
        if (playing) {
            $('button#play-stream').switchClass("btn-primary", "btn-danger", 0).html('<i class="glyphicon glyphicon-pause"></i>&nbsp;Pause');
        } else {
            $('button#play-stream').switchClass("btn-danger", "btn-primary", 0).html('<i class="glyphicon glyphicon-play"></i>&nbsp;Play');
        }
    };

    var updateClipTable = function() {
        $('tbody#clips tr').remove();
        clips.forEach(function(clip, i) {
            clz = i === selectedClipIdx ? 'active' : '';
            $('tbody#clips').append('<tr class="' + clz + '"><td>' + playBtnOfClip(i) + '</td><td>' + thumnailsOfClip(i) + '</td><td>' + checkboxOfClip(i) + '</td></tr>');
            $('#mark-to-delete-' + i).click(function() {toggleMarkToDelete(i);});
            $('#play-clip-' + i).click(function() {playClipBtnClicked(i);});
        });
    };

    var playBtnOfClip = function(clipIdx) {
        return '<button type="button" class="btn btn-xs" id="play-clip-' + clipIdx + '"> <span class="glyphicon glyphicon-play"></span>&nbsp; </button>';
    };

    var checkboxOfClip = function(clipIdx) {
        var frames = clips[clipIdx].frames;
        if (clips[clipIdx].markedToDelete) {
            return '<input type="checkbox" id="mark-to-delete-' + clipIdx + '" checked />';
        } else {
            return '<input type="checkbox" id="mark-to-delete-' + clipIdx + '"/>';
        }
    };

	var thumnailsOfClip = function(clipIdx) {
        var frames = clips[clipIdx].frames;
        var html = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].map(function(i) {
            return Math.round(frames.length/16*i);
        })
        .map(function(frameIdx) {
            return '<img class="clip-thumbnail" src="' + getImageUrl(tubId, frameIdx ) + '"/';

        })
        .join('');

        if (clipIdx === selectedClipIdx) {
            html += previewProgress();
        }

        return html;
    };

    var previewProgress = function() {
		return '\
			<div class="progress">\
			  <div id="preview-progress" class="progress-bar" role="progressbar" aria-valuenow="0"\
			  aria-valuemin="0" aria-valuemax="100" style="width:0%">\
			  </div>\
			</div>';
    };

    var updatePreviewProgress = function() {
        var progress = currentFrameIdx*100/selectedClip().frames.length;
        $('#preview-progress').css('width', progress+'%').attr('aria-valuenow', progress);
    };


    // UI event handlers
    var playBtnClicked = function(event) {
        if (playing) {
            pause();
        } else {
            play();
        }
    };

    var rewindBtnClicked = function(event) {
        currentFrameIdx -= 10;
        if (currentFrameIdx < 0) {
            currentFrameIdx = 0;
        }
        updateStreamImg();
    };

    var splitBtnClicked = function(event) {
        if (currentFrameIdx === 0 || currentFrameIdx >= selectedClip().frames.length-1) {
            return;
        }

        clip = selectedClip();
        frames = clip.frames.splice(currentFrameIdx, clip.frames.length); // Remove frames from currentFrameIdx and assign them to another array
        selectedClipIdx++;
        clips.splice(selectedClipIdx, 0, {frames: frames, markedToDelete: false}); //Javascript's way of inserting to array at index
        currentFrameIdx = 0;

        updateStreamImg();
        updateClipTable();
    };

    var toggleMarkToDelete = function(clipIdx) {
        clips[clipIdx].markedToDelete = !clips[clipIdx].markedToDelete;
        updateClipTable();
    }

    var playClipBtnClicked = function(clipIdx) {
        pause();
        selectedClipIdx = clipIdx;
        currentFrameIdx = 0;
        play();
        updateClipTable();
    };

    var submitBtnClicked = function() {
        $('button#submit').prop('disabled', true);
        var clipsToKeep = clips.filter(function(clip) {
            return !clip.markedToDelete;
        })
        .map(function(clip) {
            return clip.frames;
        });

		$.ajax({
		    type: 'POST',
		    url: '/api/tubs/' + tubId,
		    contentType: "application/json",
		    dataType: 'json',
            complete: function() {
                location.reload();
            }
		});
    }


    var currLoadIndex = 0;
    var images = new Array()
    var records = new Array()
    var setRecordData = function() {
        $.getJSON(getRecordUrl(tubId, currLoadIndex) , function(data) {
            var angle = data["user/angle"];
            var steeringPercent = Math.round(Math.abs(angle) * 100) + '%';
            var steeringRounded = angle.toFixed(2)
            records[currLoadIndex] = { "angle": angle, "streeringPercent": steeringPercent, "steeringRounded": steeringRounded};
            console.log(records[currLoadIndex]);
        });
    }

    var loadBtnClicked = function() {

        while(currLoadIndex<=totalFrames) {
             console.log('clicked:' + currLoadIndex)
             images[currLoadIndex] = new Image();
             images[currLoadIndex].src = getImageUrl(tubId, currLoadIndex);
             setRecordData(tubId, currLoadIndex);
             console.log(images[currLoadIndex]);
             currLoadIndex ++;
             if(currLoadIndex % 100 == 0) {
                 setTimeout(loadBtnClicked, 200);
                 break;
             }
         }
    }

    checkS3(tubId);

    getTub();

    $('button#play-stream').click(playBtnClicked);
    $('button#split-stream').click(splitBtnClicked);
    $('button#rewind-stream').click(rewindBtnClicked);
    $('button#submit').click(submitBtnClicked);
    $('button#load-data').click(loadBtnClicked);
    $(document).keydown(function(e) {
        switch(e.which) {
            case 32: // space
                playBtnClicked();
                break;

            case 66: // 'b'
                rewindBtnClicked();
                break;

            case 67: // 'c'
                splitBtnClicked();
                break;

            default: return; // exit this handler for other keys
        }
        e.preventDefault(); // prevent the default action (scroll / move caret)
    });
});


