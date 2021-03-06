module.exports = function(RED) {
    "use strict";
    var HikvisionAPI = require('node-hikvision-api');
    var http = require('http');

    function HikvisionCredentialsNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        let options = {
            host: this.credentials.host,
            port: this.credentials.port,
            user: this.credentials.username,
            pass: this.credentials.password,
            log: false,
        };

        if (options.user === undefined || options.user == '') {
            options.user = 'admin';
        }

        // Default to port 80 if not set.
        if (options.port === undefined || options.port == '' || options.port == 0) {
            options.port = '80';
        }

        this.options = options;
    }

    HikvisionCredentialsNode.prototype.connect = function(node) {
        var hikApi = null;

        node.status({
            fill: "red",
            shape: "ring",
            text: "disconnected"
        });

        if (this.options != null) {
            hikApi = new HikvisionAPI(this.options);

            hikApi.on('connect', function(err) {
                node.status({
                    fill: "green",
                    shape: "ring",
                    text: "connected"
                });
            });

            hikApi.on('error', (err) => {
                if (err) {
                    node.error(err);
                } else {
                    node.error("Unknown error occurred!");
                }

                node.status({
                    fill: "red",
                    shape: "ring",
                    text: "connection error"
                });
            });

            hikApi.on('end', () => {
                node.error("Connection closed!");
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: "disconnected"
                });
            });

        }

        return hikApi;
    }

    RED.nodes.registerType("hikvision-credentials", HikvisionCredentialsNode, {
        credentials: {
            host: {
                type: "text"
            },
            port: {
                type: "text"
            },
            username: {
                type: "text"
            },
            password: {
                type: "password"
            }
        }
    });

    function HikvisionAlarmInNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        this.hikvision = RED.nodes.getNode(config.hikvision);

        this.hikApi = this.hikvision.connect(node);

        if (this.hikApi != null) {
            // Monitor Camera Alarms
            this.hikApi.on('alarm', function(code, action, index) {
                let data = {
                    'code': code,
                    'action': action,
                    'index': index,
                    'time': new Date()
                };

                node.send({
                    payload: data
                });
            });
        } else {
            node.error("Invalid credentials");
            node.status({
                fill: "red",
                shape: "ring",
                text: "conf invalid"
            });
        }

        this.on('close', function(done) {
            node.hikApi.client.destroy();
            done();
        });
    }

    RED.nodes.registerType("hikvision-alarm-in", HikvisionAlarmInNode);

    function HikvisionImageInNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        this.hikvision = RED.nodes.getNode(config.hikvision);

        this.http_options = {
            host: this.hikvision.options.host,
            port: this.hikvision.options.port,
            path: '/Streaming/Channels/101/Picture',
            headers: {
                'Authorization': "Basic " + new Buffer(this.hikvision.options.user + ":" + this.hikvision.options.pass).toString('base64')
            }
        };

        if (this.hikvision.options != null) {
            this.on('input', function(msg) {
                let http_options = this.http_options;

                if ("snapshotPath" in msg) {
                    http_options['path'] = msg['snapshotPath'];
                }

                http.get(http_options, function(response) {
                    var data = [];
                    response.on('data', function(d) {
                        data.push(d);
                    });
                    response.on('end', function() {
                        if (response.statusCode != 200) {
                            node.error("Invalid status code", msg);
                            node.status({
                                fill: "red",
                                shape: "ring",
                                text: "communication error"
                            });
                        } else {
                            msg.payload = Buffer.concat(data);
                            node.send(msg);
                            node.status({
                                fill: "green",
                                shape: "ring",
                                text: "successful"
                            });
                        }
                    });
                });
            });
        } else {
            node.error("Invalid credentials");
            node.status({
                fill: "red",
                shape: "ring",
                text: "conf invalid"
            });
        }
    }

    RED.nodes.registerType("hikvision-image-in", HikvisionImageInNode);

    function HikvisionProfileOutNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        this.hikvision = RED.nodes.getNode(config.hikvision);

        this.hikApi = this.hikvision.connect(node);

        if (this.hikApi != null) {
            this.on('input', function(msg) {
                if (msg.payload.profile == 'day') {
                    this.hikApi.dayProfile();
                } else if (msg.payload.profile == 'night') {
                    this.hikApi.nightProfile();
                } else {
                    node.error("Invalid profile", msg);
                    return null;
                }

                node.send(msg);
            });
        } else {
            node.error("Invalid credentials");
            node.status({
                fill: "red",
                shape: "ring",
                text: "conf invalid"
            });
        }

        this.on('close', function(done) {
            node.hikApi.client.destroy();
            done();
        });
    }

    RED.nodes.registerType("hikvision-profile-out", HikvisionProfileOutNode);
}
