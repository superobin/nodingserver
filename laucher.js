var fs = require('fs');
var encoding = "utf8";
var FrontServer = require("./frontServer").Server;
var WebServer = require("./server.js").Server;
var config = eval("("+fs.readFileSync("config.json",encoding)+")");

var frontServer = new FrontServer(config);
frontServer.startServer(config.frontServerPort);

var servers = config.webServers;
if(servers) {
	servers.forEach(function(o) {
		var server = new WebServer(o.webroot,o.homepage);
		server.startServer(o.port);
	});
}