var fs = require("fs");
(function() {
	var http = require("http");
	function loadWebAppConfig(webServerConfig){
		var filePath = webServerConfig.webroot+"/.webappconfig";
		if(fs.existsSync(filePath)) {
			try {
				return eval("("+fs.readFileSync(filePath,"utf8")+")");
			} catch(e) {
				console.log("ERROR in .webappconfig file\n"+e.toString());
			}
		} else {
			console.log("WARN no .webappconfig file specified");
			return {};
		}
	}
	
	exports.Server = function(webServerConfig) {
		var webAppConfig = loadWebAppConfig(webServerConfig);
		
		var webRoot = webServerConfig.webroot || "./webapp";
		this.config = webServerConfig;
		var homepage = webAppConfig.homepage||"/index.html";
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
		
		
		
		function dynamicRequest(req,res,url) {
			var errHandler = function (err) {
			
				writeErrorPage(res,500,err.toString());
			}
			var urlObj =  urlUtil.parse(url);
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
						writeErrorPage(res,404,"Not Found");
					}
				});
			}
			
		}
		
		function writeBasic404(res) {
			res.writeHeader(404);	
			res.end("<html><head><title>404 Page Not Found</title></head><body><h1>404 Page Not Found</h1><hr/>NodingServer v0.1 <i>"+new Date()+"</i></body></html>");
		}
		function sendRedirect(res,location) {
			res.writeHeader(302,{
				"Location":location
			});
			res.end();
		}
		function writeErrorPage(res,code,message) {
			var pagePath = (webAppConfig.errorpage||{})[code];
			console.log(webRoot+pagePath);
			if(code==404&&!fs.existsSync(webRoot+pagePath)) {//prevent from 404 loop
				writeBasic404(res);
			} else if(pagePath) {
				sendRedirect(res,pagePath);
			} else {
				res.writeHeader(code);
				res.end("<html><head><title>"+code+"</title></head><body><h1>"+message+"</h1><hr/>NodingServer v0.1 <i>"+new Date()+"</i></body></html>");
			}
		}
		function staticRequest(req,res,url) {
			
		
			var urlObj =  urlUtil.parse(url);
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
							writeErrorPage(res,404,"Not Found");
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
					writeErrorPage(res,404,"Not Found");
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
		
		function alliasURL(url) {
			var alliases = webAppConfig.allias;
			alliases.forEach(function(al) {
				if(url.indexOf(al.from) == 0) {
					url = al.to+url.substr(al.from.length+1);
				}
			});
			return url;
			
		}
		function rewriteURL(url) {
			var rewrites = webAppConfig.urlRewrite;
			rewrites.forEach(function(rewrite) {
				if(rewrite.from.test(url)) {
					url = url.replace(rewrite.from,rewrite.to);
				}
			});
			return url;
		}
		var requestHandler = function(req,res) {
			try {
				console.log("--------------------");
				console.log("connector:\t"+req.connection.remoteAddress+":"+req.connection.remotePort);
				console.log("host:\t\t"+req.headers.host);
				console.log("url:\t\t"+req.url);
				console.log("time:\t\t"+new Date());
				console.log("--------------------");
				var url = rewriteURL(alliasURL(req.url));
				
				if(url == "/") {
				
					sendRedirect(res,homepage);
					
				} else if(dynamicPattern.test(url)) {
					dynamicRequest(req,res,url);
				} else {
					staticRequest(req,res,url);
				}
			} catch(e) {
			
				writeErrorPage(res,500,(e||"").toString());
				
			}
		};
		this.requestHandler = requestHandler;
	}
	
	exports.Server.prototype.start = function() {
		var server = http.createServer(this.requestHandler);
		(this.config.ports||[]).forEach(function(port) {
			server.listen(port);
			console.log("WebServer started at port"+port);
		});
	}
})();


