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
				context:context,
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
		function generateSessionId() {
			return new Buffer(Math.random()+","+Math.random()+","+Math.random()).toString('base64');
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
						fs.lstat(filePath,function(err,stat) {
							var mtime = stat.mtime;
							header['last-modified'] = mtime.toUTCString();
							res.writeHead(200, header);
							if(compressMethod) {
								zlib[compressMethod](data, function(err, buffer) {
									res.end(buffer);
								});
							} else {
								res.end(data);
							}
						});
						
					});
				} else {
					writeErrorPage(req,res,404,"Not Found",context);
				}
			});
		}
		
		function supportedCompressMethod(req) {
			var acceptEncoding = req.headers["accept-encoding"]||"";
			if(acceptEncoding.indexOf("gzip")>=0){
				return "gzip"
			} else if(acceptEncoding.indexOf("deflate")>=0){//on my machine,ie8 does not support deflate,but passed accept-encoding:gzip,deflate
				return "deflate"
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
		var sessionStorage = {};//
		var cookieProcessRegexp = /\s*(.+?)=(.+?)(?:\s*)(?:;|$)/gi;
		function parseCookie(cookieStr) {
			var obj = {};
			cookieStr.replace(cookieProcessRegexp,function(t,key,value) {
				obj[key]=value;
			});
			return obj;
		}
		function Session(json) {
			if(!json) {
				this.data = {};
			} else if(typeof json == "string") {
				this.data = {};
				this.deseriaze(json);
			} else {
				this.data = {};
				for(var k in json) {
					this.data[k] = json[k];
				}
			}			
		}
		Session.prototype.put = function(key,value) {
			
			this.data[key] = value;
			this.performChanged();
		};
		Session.prototype.get = function(key) {
			return this.data[key];
		};
		Session.prototype.clear = function() {
			this.data = {};
			this.performChanged();
		};
		Session.prototype.seriaze = function() {
			return JSON.stringify(this.data);
		};
		Session.prototype.deseriaze = function(json) {
			var d = JSON.parse(json);
			for(var k in d) {
				this.put(k,d[k]);
			}
			this.performChanged();
		};
		Session.prototype.performChanged = function() {
			//persist logic later
		};
		
		
		function baseHandler(req,res,url) {
			var cookie = req.headers['cookie'];
			if(!cookie) {
				var sessionId = generateSessionId();
				res.setHeader("set-cookie",["SESSIONID="+sessionId,"path=/"]);
			} else {
				var cookieObj = parseCookie(req.headers['cookie']||"")
				sessionId = cookieObj["SESSIONID"];
			
			}
			
			var session = sessionStorage[sessionId] = sessionStorage[sessionId]||new Session();

			var webServerConfig = _server.config;
			loadWebAppConfig(webServerConfig);
			var contextPath = matchContextPath(url);
			var webAppConfig = webAppConfigs[contextPath];
			var webroot = webRoots[contextPath];
			var context = {
				webAppConfig:webAppConfig,
				webroot:webroot,
				contextPath:contextPath,
				session:session
			}
			var homepage = webAppConfig.homepage||"/index.html";
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
		
			res.setHeader("server","NodingServer(nodejs)");
			var visitStack = "connector:\t"+(req.headers['x-forwarded-for']
				?(req.headers['x-forwarded-for']+","+req.connection.remoteAddress)
				:req.connection.remoteAddress);
			console.log("--------------------");
			console.log(visitStack);
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
		var ports = [].concat(this.config.ports);
		var firstPort = ports.shift();
		server.listen(firstPort);
		
		console.log("WebServer listening at port"+firstPort);
		(ports||[]).forEach(function(port) {
			var Agent = require("./portRedirectAgent.js").Agent;
			var agent = new Agent(port,firstPort);
			
			agent.start();
			console.log("WebServer listening at port"+port+"(redirected)");
		});
	}
})();


