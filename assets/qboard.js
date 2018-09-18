/*global window*/
/*jslint long, browser, multivar*/

(function (window, $) {

    "use strict";

    var current, dispatch, elements, href, init, initCalling, load, next, playCalling, playHtml, playIframe, playImage, playMarquee, playVideo, register, resetContent, resetImage, resetMarquee, resetVideo, showImage, socket;

    //-------------------------------------------------------------------------

    elements = {};

    //-------------------------------------------------------------------------

    dispatch = function (content) {
        $.each(elements, function (type, element) {
            var digest = JSON.stringify(content[type]);

            if (element.digest !== digest) {
                element.digest = digest;
                element.play(element, content[type] || []);
            }
        });
    };

    //-------------------------------------------------------------------------

    initCalling = function (element, data) {
        if (data.length) {
            element.node.data("content", data[0]);
        }
    };

    //-------------------------------------------------------------------------

    init = function () {
        socket = window.io.connect("http://127.0.0.1:8000");

        socket.on("CALLING", playCalling);

        socket.on("CONTENT", load);

        socket.on("FINISH", function (type) {
            setTimeout(function () {
                next(type);
            }, 500);
        });

        socket.on("FINISH_CALLING", function () {
            $("#calling").data("running", false);
        });

        socket.on("PATH", function (data) {
            switch (data.category) {
            case "image":
                if (data.file) {
                    showImage(data);
                    return;
                }
                break;

            case "video":
                if (data.file) {
                    socket.emit("PLAY", data);
                    return;
                }
                break;
            }

            setTimeout(function () {
                next(data.type);
            }, 50);
        });

        socket.on("RELOAD", function () {
            location.reload();
        });

        setTimeout(function () {
            if (!current) {
                load();
            }
        }, 10000);
    };

    //-------------------------------------------------------------------------

    load = function () {
        $.ajax("http://127.0.0.1/content.json").done(function (data) {
            var digest = JSON.stringify(data.content);

            href = data.href;

            if (current !== digest) {
                current = digest;

                dispatch(data.content || {});
            }
        });
    };

    //-------------------------------------------------------------------------

    next = function (type) {
        var element = elements[type];

        if (element) {
            element.play(element);
        }
    };

    //-------------------------------------------------------------------------

    playCalling = function (data) {
        var content, list, node, num, remainder;

        node = $("#calling");
        content = node.data("content");

        if (content) {
            if (node.data("running")) {
                return;
            }

            node.data("running", true);

            list = ["/home/pi/client/assets/blank.mp3"];

            if (content.front_sound) {
                list.push("/var/www/html/files/" + content.front_sound);
            }

            JSON.parse(content.voice_data).forEach(function (voice) {
                if (typeof voice === "number") {
                    list.push("/var/www/html/files/" + voice);
                } else if (voice === "{1}" && data.calling_num) {
                    $("#call-number").text(data.calling_num);

                    num = parseInt(data.calling_num, 10);
                    remainder = num % 100;

                    if (num < 100 || !remainder) {
                        list.push("/home/pi/client/assets/numbers/" + num + ".mp3");
                    } else {
                        list.push("/home/pi/client/assets/numbers/" + (num - remainder) + ".mp3");

                        if (remainder < 20) {
                            remainder = "0" + remainder;
                        }

                        list.push("/home/pi/client/assets/numbers/" + remainder + ".mp3");
                    }
                } else if (voice === "{2}" && data.counter_num) {
                    list.push("/home/pi/client/assets/numbers/" + data.counter_num + ".mp3");
                }
            });

            if (content.rear_sound) {
                list.push("/var/www/html/files/" + content.rear_sound);
            }

            socket.emit("CALLING", list);
        }
    };

    //-------------------------------------------------------------------------

    playHtml = function (element, data) {
        element.reset(element);

        if (data) {
            element.data = data;
        } else {
            data = element.data;
        }

        if (data.length) {
            var target = data.shift();

            data.push(target);

            element.current = $("<div>" + target.content + "</div>").find("img").each(function (ignore, img) {
                var src = $(img).attr("src");

                if (src.match(/^backend\/index.php\?p_action_name=get-file/)) {
                    img.src = href + src;
                }
            }).end().appendTo(element.node);

            if (data.length > 1) {
                var duration = target.duration || element.node.data("duration") || 12;

                element.timeout = setTimeout(function () {
                    playHtml(element);
                }, duration * 1000);
            }
        }
    };

    //-------------------------------------------------------------------------

    playIframe = function (element, data) {
        element.reset(element);

        if (data) {
            element.data = data;
        } else {
            data = element.data;
        }

        if (data.length) {
            var target = data.shift();

            data.push(target);

            element.current = $("<iframe frameBorder=\"0\" src=\"" + target.url + "\" style=\"height:100%;width:100%;\"></iframe>").appendTo(element.node);

            if (data.length > 1) {
                var duration = target.duration || element.node.data("duration") || 12;

                element.timeout = setTimeout(function () {
                    playIframe(element);
                }, duration * 1000);
            }
        }
    };

    //-------------------------------------------------------------------------

    playImage = function (element, data) {
        if (data) {
            element.data = data;
        } else {
            data = element.data;
        }

        if (data.length) {
            var height, target, width;

            height = Math.floor(element.node.height());
            target = data.shift();
            width = Math.floor(element.node.width());

            data.push(target);

            if (target.width !== width) {
                target.height = Math.floor(target.height * width / target.width);
                target.width = width;
            }

            if (target.height > height) {
                target.width = Math.floor(target.width * height / target.height);
                target.height = height;
            }

            socket.emit("PATH", {
                category: "image",
                type: element.type,
                id: target.image,
                duration: target.duration,
                width: target.width,
                height: target.height,
                top: Math.floor((height - target.height) / 2),
                left: Math.floor((width - target.width) / 2)
            });
        } else {
            element.reset(element);
        }
    };

    //-------------------------------------------------------------------------

    playMarquee = function (element, data) {
        element.reset(element);

        if (data) {
            element.data = data;
        } else {
            data = element.data;
        }

        if (data.length) {
            var target = data.shift();

            data.push(target);

            element.current = $("<div class=\"marquee\" style=\"height:100%;\">" + target.marquee + "</div>").appendTo(element.node).marquee({
                duration: (target.duration || element.node.data("duration") || 12) * 1000
            }).on("finished", function () {
                playMarquee(element);
            });

            element.node.css({
                background: target.background || "",
                color: target.color || ""
            });
        }
    };

    //-------------------------------------------------------------------------

    playVideo = function (element, data) {
        element.reset(element);

        if (data) {
            element.data = data;
        } else {
            data = element.data;
        }

        if (data.length) {
            var height, offset, target, width;

            height = Math.floor(element.node.height());
            offset = element.node.offset();
            target = data.shift();
            width = Math.floor(element.node.width());

            data.push(target);

            if (target.width !== width) {
                target.height = Math.floor(target.height * width / target.width);
                target.width = width;
            }

            if (target.height > height) {
                target.width = Math.floor(target.width * height / target.height);
                target.height = height;
            }

            offset.left += Math.floor((width - target.width) / 2);
            offset.top += Math.floor((height - target.height) / 2);

            socket.emit("PATH", {
                category: "video",
                type: element.type,
                id: target.video,
                left: offset.left,
                top: offset.top,
                right: offset.left + target.width,
                bottom: offset.top + target.height
            });
        }
    };

    //-------------------------------------------------------------------------

    register = function (type, play, reset) {
        var node = $("#" + type);

        if (node.length) {
            elements[type] = {
                node: node,
                play: play,
                reset: reset,
                type: type
            };
        }
    };

    //-------------------------------------------------------------------------

    resetContent = function (element) {
        if (element.current) {
            element.current.remove();

            element.current = null;
        }

        if (element.timeout) {
            clearTimeout(element.timeout);

            element.timeout = null;
        }
    };

    //-------------------------------------------------------------------------

    resetImage = function (element, callback) {
        if (element.current) {
            element.current.fadeOut(1000, function () {
                resetContent(element);

                if (callback) {
                    setTimeout(callback, 100);
                }
            });
        } else if (callback) {
            callback();
        }
    };

    //-------------------------------------------------------------------------

    resetMarquee = function (element) {
        if (element.current) {
            element.current.marquee("destroy").remove();
            element.current = null;

            element.node.css({
                background: "",
                color: ""
            });
        }
    };

    //-------------------------------------------------------------------------

    resetVideo = function () {
        socket.emit("STOP");
    };

    //-------------------------------------------------------------------------

    showImage = function (data) {
        var element, image;

        element = elements[data.type];

        if (element) {
            image = $("<img src=\"" + data.url + "\" height=\"" + data.height + "\" width=\"" + data.width + "\" style=\"position:absolute; left:" + data.left + "px; top:" + data.top + "px; display: none;\">");
            image.appendTo(element.node);

            element.reset(element, function () {
                element.current = image;

                image.fadeIn(1000, function () {
                    var duration;

                    if (element.data.length > 1) {
                        duration = data.duration || element.node.data("duration") || 12;

                        element.timeout = setTimeout(function () {
                            element.play(element);
                        }, duration * 1000);
                    }
                });
            });
        }
    };

    //-------------------------------------------------------------------------

    register("calling", initCalling);
    register("html", playHtml, resetContent);
    register("iframe", playIframe, resetContent);
    register("image", playImage, resetImage);
    register("image2", playImage, resetImage);
    register("image3", playImage, resetImage);
    register("marquee", playMarquee, resetMarquee);
    register("video", playVideo, resetVideo);

    //-------------------------------------------------------------------------

    window.register = register;

    if (window.io) {
        setTimeout(init, 1000);
    } else {
        setTimeout(function () {
            location.reload();
        }, 3000);
    }

}(window, window.jQuery));
