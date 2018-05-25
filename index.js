/*jslint long, multivar, node*/

(function () {

    "use strict";

    var app, backend, browser, check, command, config, connect, current, dispatch, download, express, filesite, fs, home, http, init, io, network, omx, path, playing, queue, request, save, server, snapshot, socket, stop, task, template, tmp, trigger, website;

    connect = require("socket.io-client");
    express = require("express");
    fs = require("fs");
    http = require("http");
    network = require("network");
    omx = require("omxplayer-controll");
    request = require("request");
    socket = require("socket.io");

    //-------------------------------------------------------------------------

    command = "/home/pi/bin/command.sh";
    config = "/home/pi/server.json";
    filesite = false;
    home = "/var/www/html/";
    snapshot = "/var/www/html/snapshot.png";
    tmp = "/tmp/";
    trigger = "/home/pi/raspi2png/trigger";

    //-------------------------------------------------------------------------

    app = express();
    queue = [];
    server = http.createServer(app);
    io = socket(server);

    //-------------------------------------------------------------------------

    check = function (type) {
        omx.getPosition(function (error) {
            if (playing) {
                if (error) {
                    playing = false;

                    if (browser) {
                        browser.emit("FINISH", type);
                    }
                } else {
                    setTimeout(function () {
                        check(type);
                    }, 1000);
                }
            }
        });
    };

    //-------------------------------------------------------------------------

    dispatch = function (bundle) {
        var background, digest, program;

        if (bundle) {
            current = bundle;
        }

        if (browser && current) {
            if (current.data && current.data[0].programs) {
                program = current.data[0].programs.filter(function (item) {
                    if (item.begin_time <= current.time) {
                        if (!item.end_time || current.time <= item.end_time) {
                            return true;
                        }
                    }

                    return false;
                });
            } else {
                program = [];
            }

            if (program.length) {
                program = program.pop();
            } else {
                program = {
                    template: {}
                };
            }

            digest = JSON.stringify(program.template);

            if (template !== digest) {
                template = digest;

                background = "";

                if (program.template.bg_color) {
                    background += "#main { background-color: " + program.template.bg_color + "; }\n";
                }

                if (program.template.bg_image) {
                    background += "#main { background-image: url(" + path(program.template.bg_image) + "); }\n";
                }

                save("custom.css", program.template.style);
                save("program.css", background);
                save("custom.php", program.template.content);
                save("custom.js", program.template.script);

                browser.emit("RELOAD");
            } else {
                save("content.json", JSON.stringify({
                    date: current.date,
                    time: current.time,
                    href: website,
                    content: program.content
                }));

                browser.emit("CONTENT");
            }
        }
    };

    //-------------------------------------------------------------------------

    download = function (category, id, destination) {
        var file, status, url;

        if (category === "image") {
            url = website + "backend/index.php?p_action_name=get-file&width=1280&height=720&id=" + id;
        } else {
            url = path(id, filesite);
        }

        if (task) {
            if (!download[id]) {
                download[id] = true;

                queue.push({
                    category: category,
                    id: id,
                    destination: destination
                });
            }
        } else {
            download[id] = true;
            file = tmp + id;
            task = fs.createWriteStream(file);

            task.on("close", function () {
                var next = queue.shift();

                delete download[id];

                task = null;

                if (status === 200) {
                    fs.renameSync(file, destination);
                }

                if (next) {
                    download(next.category, next.id, next.destination);
                }
            });

            request(url).on("response", function (response) {
                status = response.statusCode;
            }).pipe(task);
        }

        return url;
    };

    //-------------------------------------------------------------------------

    init = function () {
        network.get_active_interface(function (error, data) {
            var settings;

            if (error) {
                setTimeout(init, 1000);
                return;
            }

            settings = JSON.parse(fs.readFileSync(config, "UTF-8"));

            backend = connect("http://" + settings.domain + ":" + settings.port + "/?network=" + Buffer.from(JSON.stringify({
                address: data.ip_address,
                gateway: data.gateway_ip,
                netmask: data.netmask,
                token: data.mac_address
            })).toString("base64"));

            backend.on("PROGRAMS", dispatch);

            backend.on("REBOOT", function () {
                fs.writeFile(command, "sudo reboot");
            });

            backend.on("SNAPSHOT", function (filename) {
                fs.writeFile(trigger, filename);
            });

            backend.on("WEBSITE", function (url) {
                website = url;
            });
        });
    };

    //-------------------------------------------------------------------------

    path = function (id, prefix) {
        if (!prefix) {
            prefix = website + "files/";
        }

        return prefix + Math.floor(id / 1000) + "/" + id;
    };

    //-------------------------------------------------------------------------

    save = function (name, text) {
        fs.writeFileSync(home + name, text || "");
    };

    //-------------------------------------------------------------------------

    stop = function () {
        if (playing) {
            playing = false;

            omx.getDuration(function (error, duration) {
                if (error) {
                    omx.hideVideo();
                    omx.pause();
                } else {
                    omx.setPosition(duration);
                }
            });
        }
    };

    //-------------------------------------------------------------------------

    app.get("/snapshot-done", function (request, response) {
        if (backend && fs.existsSync(snapshot)) {
            backend.emit("SNAPSHOT", {
                name: request.query.token,
                content: fs.readFileSync(snapshot).toString("base64")
            });
        }

        response.send("");
    });

    //-------------------------------------------------------------------------

    io.on("connection", function (client) {
        if (browser) {
            client.disconnect();
            return;
        }

        browser = client;

        browser.on("disconnect", function () {
            browser = null;

            stop();
        });

        browser.on("PATH", function (data) {
            var file = home + "files/" + data.id;

            if (fs.existsSync(file)) {
                fs.utimes(file, new Date(), new Date());

                data.file = file;
                data.url = "http://127.0.0.1/files/" + data.id;
            } else {
                data.url = download(data.category, data.id, file);
            }

            browser.emit("PATH", data);
        });

        browser.on("PLAY", function (data) {
            var file = data.file || data.url;

            if (file) {
                playing = true;

                omx.open(file, {
                    blackBackground: false,
                    otherArgs: ["--win", data.left + "," + data.top + "," + data.right + "," + data.bottom]
                });

                setTimeout(function () {
                    check(data.type);
                }, 3000);
            }
        });

        browser.on("SNAPSHOT", function () {
            fs.writeFile(trigger, "");
        });

        browser.on("STOP", stop);

        dispatch();
    });

    //-------------------------------------------------------------------------

    server.listen(8000);

    //-------------------------------------------------------------------------

    init();

}());
