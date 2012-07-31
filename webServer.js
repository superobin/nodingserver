var fs = require("fs");
(function() {
	var http = require("http");
	exports.Server = function(webServerConfig) {
		var _server = this;
		this.config = webServerConfig;
		var encoding = 'utf8';
		var fs  = require("fs");
		var zlib = require("zlib");
		var urlUtil =  require('url');
		var vm = require("vm");
		var dynamicPattern = /^.+?([a-zA-Z0-9\-a]+)\.action(\?.+)?$/;
		var ContentTypeMap = require("./content_types");
		var actionMap = {};
		
		var BaseAction = function(codePath,context) {
			var webroot = context.webroot;
			var code = fs.readFileSync(webroot+codePath,encoding);
			this.script =vm.createScript(code,codePath);
			var sandbox = this.sandbox = {
				webroot:webroot,
				encoding:encoding,
				require:require,
				requireUserLib:function() {
					var ary = [];
					ary[0] = webroot+context.webAppConfig.libdir+"/"+arguments[0];

					for(var i = 0;i<arguments.length;i++) {
						ary.push(arguments[i]);
					}
					require.apply(null,ary);
				}
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
		
		function dynamicRequest(req,res,url,context) {
			url = stripeContextPath(url,context.contextPath);
			var webroot = context.webroot;
			var errHandler = function (err) {
				writeErrorPage(req,res,500,err.toString(),context);
			}
			var urlObj =  urlUtil.parse(url);
			var filePath = webroot+urlObj.pathname;
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
								var action = new BaseAction(urlObj.pathname,context);
								actionMap[urlObj.pathname] = action;
								action.process(req,res);
								fs.watch(webroot+urlObj.pathname,function(a,b) {
									delete actionMap[urlObj.pathname];
									fs.unwatchFile(webroot+urlObj.pathname);
								});
							} catch(e) {
								errHandler(e);
							}
					} else {
						writeErrorPage(req,res,404,"Not Found",context);
					}
				});
			}
		}
		
		function writeBasic(res,code,message) {
			res.writeHead(code);
			res.end("<html><head><title>"+code+"</title></head><body><h1>"+message||"No error message."+"</h1><hr/>NodingServer v0.1 <i>"+new Date()+"</i></body></html>");
			
			
			//res.writeHead(404);	
			//res.end("<html><head><title>404 Page Not Found</title></head><body><h1>404 Page Not Found</h1><hr/>NodingServer v0.1 <i>"+new Date()+"</i></body></html>");
		}
		
		function sendRedirect(res,location) {
			res.writeHead(302,{
				"Location":location
			});
			res.end();
		}
		
		function writeErrorPage(req,res,code,message,context) {
			var pagePath = (context.webAppConfig.errorpage||{})[code];
			
			if(req.errorObject||req.errorCode) {//prevent from error loop
				writeBasic(res,req.errorCode,"Page Not Found");
			} else if(pagePath) {
				req.errorObject = message;
				req.errorCode = code;
				var writeHead = res.writeHead;
				res.writeHead = function() {
					var ary = [code];
					for(var i=1;i<arguments.length;i++) {
						ary.push(arguments[i]);
					}
					writeHead.apply(this,ary);
				}
				var contextPath = context.contextPath;
				contextPath = stripeLastSlash(contextPath);
				
				baseHandler(req,res,contextPath+pagePath);
			} else {
				writeBasic(res,code,message);
			}
		}
		
		function staticRequest(req,res,url,context) {
			url = stripeContextPath(url,context.contextPath);
			var urlObj =  urlUtil.parse(url);
			var filePath = context.webroot+urlObj.pathname;
			
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
							writeErrorPage(req,res,404,"Not Found",context);
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
					writeErrorPage(req,res,404,"Not Found",context);
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
		
		function rewriteURL(url,context) {
			var rewrites = context.webAppConfig.urlRewrite;
			rewrites.forEach(function(rewrite) {
				if(rewrite.from.test(url)) {
					url = url.replace(rewrite.from,rewrite.to);
				}
			});
			return url;
		}
		
		var webAppConfigs={},webRoots = {};
		function loadFileIntoJsonAndPutInObject(filePath,key) {
			if(fs.existsSync(filePath)) {
				try {
					webAppConfigs[key] = eval("("+fs.readFileSync(filePath,"utf8")+")");
				} catch(e) {
					console.log("ERROR in .webappconfig file\n"+e.toString());
					//should use default
				}
			} else {
				console.log("WARN no .webappconfig file specified");
			}
		}
		
		function loadWebAppConfig(webServerConfig){
			var filePath = webServerConfig.webroot+"/.webappconfig";
			loadFileIntoJsonAndPutInObject(filePath,"/");
			webRoots["/"] = webServerConfig.webroot;
			(webServerConfig.alias||[]).forEach(function(o) {
				var contextPath = o.contextPath;
				var approot = o.approot;
				webRoots[contextPath] = approot;
				var filePath = approot+"/.webappconfig";
				loadFileIntoJsonAndPutInObject(filePath,contextPath);
				
			});
		}
		
		function stripeContextPath(url,contextPath) {
			//simple use
			if(contextPath == "/") {
				contextPath = "";
			}
			return url.substr(contextPath.length);
		}
		
		function matchContextPath(url) {
			//to be improved
			var reg = /^(\/(?:.+?))(?:\/.*)?$/;
			if(reg.test(url)) {
				var contextPath = url.replace(reg,"$1");
			} else {
				contextPath = "/";
			}
			if(contextPath in webRoots) {
				return contextPath;
			} else {
				return "/";
			}
			
		}
		function stripeLastSlash(str) {
			if(str[str.length-1] == "/"){
				str = str.substr(0,str.length-2);
			}
			return str;
		}
		function baseHandler(req,res,url) {
			
			var webServerConfig = _server.config;
			loadWebAppConfig(webServerConfig);
			var contextPath = matchContextPath(url);
			var webAppConfig = webAppConfigs[contextPath];
			var webroot = webRoots[contextPath];
			var context = {
				webAppConfig:webAppConfig,
				webroot:webroot,
				contextPath:contextPath
			}
			var homepage = webAppConfig.homepage||"/index.html";
			console.log(context);
			try {
				var url = rewriteURL(url,context);
				
				var stripedURL = stripeContextPath(url,contextPath);
				if(stripedURL == "/"||stripedURL == "") {
					sendRedirect(res,stripeLastSlash(contextPath)+homepage);
				} else if(dynamicPattern.test(url)) {
					dynamicRequest(req,res,url,context);
				} else {
					staticRequest(req,res,url,context);
				}
			} catch(e) {
				writeErrorPage(req,res,500,(e||"").toString(),context);
			}
		}
		
		var requestHandler = function(req,res) {
			console.log("--------------------");
			console.log("connector:\t"+req.connection.remoteAddress+":"+req.connection.remotePort);
			console.log("host:\t\t"+req.headers.host);
			console.log("url:\t\t"+req.url);
			console.log("time:\t\t"+new Date());
			console.log("--------------------");
			baseHandler(req,res,req.url);
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


