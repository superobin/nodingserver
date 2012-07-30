
(function() {
	var http = require("http");
	
	exports.Server = function(webRoot,homepage) {
		var webRoot = webRoot || "./webapp";
		homepage = homepage||"/index.html";
		var encoding = 'utf8';
		var fs  = require("fs");
		var zlib = require("zlib");
		var urlUtil =  require('url');
		var vm = require("vm");
		var dynamicPattern = /^.+?([a-zA-Z0-9\-a]+)\.action(\?.+)?$/;
		var ContentTypeMap = require("./content_types");
		
		var actionMap = {};
		
		
		var BaseAction = function(codePath) {
			var code = fs.readFileSync(webRoot+codePath,encoding);
			this.script =vm.createScript(code,codePath);
			var sandbox = this.sandbox = {
				webRoot:webRoot,
				encoding:encoding,
				require:require
			};
			for(var k in global) {
				sandbox[k] = global[k];
			}
		}
		
		BaseAction.prototype.process = function(request,response,errHandler) {
			this.sandbox.request = request;
			this.sandbox.response = response;
			this.sandbox.errHandler = errHandler;
			this.script.runInNewContext(this.sandbox);
		}
		
		
		
		function dynamicRequest(req,res) {
			var errHandler = function (err) {
				res.writeHeader(500);
				res.end(err.toString());
			}
			var urlObj =  urlUtil.parse(req.url);
			var filePath = webRoot+urlObj.pathname;
			var dirPath = filePath.substr(0,filePath.lastIndexOf("/"));
			if(actionMap[urlObj.pathname]) {
				try {
					actionMap[urlObj.pathname].process(req,res);
				} catch(e) {
					errHandler(e);
				}
			} else {
				fs.exists(filePath, function (exists) {
					if(exists) {
							try {
								var action = new BaseAction(urlObj.pathname,webRoot);
								actionMap[urlObj.pathname] = action;
								action.process(req,res);
								var watcher = fs.watch(webRoot+urlObj.pathname,function(a,b) {
									delete actionMap[urlObj.pathname];
									
									fs.unwatchFile(webRoot+urlObj.pathname);
								});
							} catch(e) {
								errHandler(e);
							}
					} else {
						write404(res);
					}
				});
			}
			
		}
		function write404(res) {
			res.writeHeader(404);	
			res.end("<h1>Not Found</h1>");
		}
		function staticRequest(req,res) {
			var urlObj =  urlUtil.parse(req.url);
			var filePath = webRoot+urlObj.pathname;
			if(filePath.indexOf(".")>=0) {
				var extName = filePath.substr(filePath.lastIndexOf(".")+1);
			} else {
				extName = "";
			}
			var contentType = ContentTypeMap[extName];
			
			if(extName in ContentTypeMap) {
				var contentType = ContentTypeMap[extName];
			} else {
				contentType = ContentTypeMap["bin"];
			}
			
			var compressMethod = supportedCompressMethod(req);
			var header = {
				'Content-Type': contentType
			};
			if(compressMethod) {
				header['Content-Encoding'] = compressMethod;
			}
			fs.exists(filePath, function (exists) {
				if(exists) {
					fs.readFile(filePath,function(err,data){
						if(err) {
							write404(res);
							return;
						}
						res.writeHead(200, header);
						if(compressMethod) {
							zlib[compressMethod](data, function(err, buffer) {
								res.end(buffer);
							});
						} else {
							res.end(data);
						}
						
					});
				} else {
					write404(res);
				}
			});
		}
		function supportedCompressMethod(req) {
			var acceptEncoding = req.headers["accept-encoding"]||"";
			if(acceptEncoding.indexOf("deflate")>=0){
				return "deflate"
			} else if(acceptEncoding.indexOf("gzip")>=0){
				return "gzip"
			};
		}
		
		
		var requestHandler = function(req,res) {
			try {
				console.log("--------------------");
				console.log("connector:\t"+req.connection.remoteAddress+":"+req.connection.remotePort);
				console.log("host:\t\t"+req.headers.host);
				console.log("url:\t\t"+req.url);
				console.log("time:\t\t"+new Date());
				console.log("--------------------");
				
				
				if(req.url == "/") {
					res.writeHeader(302,{
						"Location":homepage
					});
					res.end();
				} else if(dynamicPattern.test(req.url)) {
					dynamicRequest(req,res);
				} else {
					staticRequest(req,res);
				}
			} catch(e) {
				res.writeHeader(500);
				res.end((e||"").toString());
			}
		};
		
		this.requestHandler = requestHandler;
		
	}
	
	exports.Server.prototype.startServer = function(_port) {
		http.createServer(this.requestHandler).listen(_port);
		console.log("WebServer started at port"+_port);
	}
})();


