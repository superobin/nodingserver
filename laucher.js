var fs = require('fs');
var encoding = "utf8";
var laucherConfig = JSON.parse( fs.readFileSync("./config/laucher.json","utf8"));

var FrontServer = require("./frontServer").Server;
var WebServer = require("./webServer.js").Server;
console.log(laucherConfig);
if(laucherConfig.webServerConfig) {
	laucherConfig.webServerConfig.forEach(function(config) {
		try {
			
			var file = config.configFile
			if(file.indexOf("~")!=0&&file.indexOf("/")!=0) {
				file = "./config/"+file;
			}
			if(!fs.existsSync(file)) {
				console.log("WARN! WebServer config not fond at "+file);
				return;
			}
			if(config.standalone) {
				throw "standalone not supported";
			} else {
				var webConfig = JSON.parse(fs.readFileSync(file,"utf8"));
				var server = new WebServer(webConfig);
				server.start();
			}
			
		} catch(e) {
			throw e;
		}
	});
} else {
	console.log("No web server configed");
}
if(laucherConfig.frontServerConfig) {
	laucherConfig.frontServerConfig.forEach(function(config) {
		var file = config.configFile
		if(file.indexOf("~")!=0&&file.indexOf("/")!=0) {
			file = "./config/"+file;
		}
		if(!fs.existsSync(file)) {
			console.log("WARN! FrontServer config not fond at "+file);
			return;
		}
		var serverConfig = eval("("+fs.readFileSync(file,encoding)+")");
		var frontServer = new FrontServer(serverConfig);
		frontServer.start();
	});
}

/*



var frontServer = new FrontServer(config);
frontServer.startServer(config.frontServerPort);

var servers = eval("("+fs.readFileSync("frontServer.config.json",encoding)+")");
if(servers) {
	servers.forEach(function(o) {
		var server = new WebServer(o.webroot,o.homepage);
		server.startServer(o.port);
	});
}
*/