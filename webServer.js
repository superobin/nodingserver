var fs = require("fs");
(function() {
	var http = require("http");
	/**
		Main class of web server.
		@param webServerConfig:The config for the web server.It is excetly the same with webServer.json.
	*/
	exports.Server = function(webServerConfig) {
		//for closure use
		var _server = this;
		//webServerConfig can be accessed by any member of the web server class.
		this.config = webServerConfig;
		//default encoding is utf8.cannot be modified recently.
		var encoding = 'utf8';
		var fs  = require("fs");
		//for gzip and deflate support
		var zlib = require("zlib");
		var urlUtil =  require('url');
		var vm = require("vm");
		//a regexp to determin wether a url is dynamic or not.
		var dynamicPattern = /^.+?([a-zA-Z0-9\-a]+)\.action(\?.+)?$/;
		
		//content type map for static request to use.
		var ContentTypeMap = require("./content_types");
		
		//action object cache in memory
		var actionMap = {};
		
		/**
			Action class for .action file.
			Use to compile script into script object,When a request is accepted,
			the script will run in a predefined context by vm.runInNewContext().
			This may cause performance issues,but I'm not sure.
			@param codePath :code path related with webroot
			@param context :context for action use.Should NOT modify its content.
		*/
		var BaseAction = function(codePath,context) {
			var webroot = context.webroot;
			var code = fs.readFileSync(webroot+codePath,encoding);
			//compile script into script object
			this.script =vm.createScript(code,codePath);
			var sandbox = this.sandbox = {
				webroot:webroot,//the webroot for the current context.
				encoding:encoding,//code encoding.now it's always utf8.
				require:require,//origin require for action use.
				context:context,//see in baseHandler
				requireUserLib:function() {//Users can require user lib in libdir by using this method in action running context.
					var ary = [];
					ary[0] = webroot+context.webAppConfig.libdir+"/"+arguments[0];
					for(var i = 0;i<arguments.length;i++) {
						ary.push(arguments[i]);
					}
					require.apply(null,ary);
				}
			};
			//Adding all other global objects into action running context
			for(var k in global) {
				sandbox[k] = global[k];
			}
		}
		
		/**
			Process request for the action
			@param request:request from webbrowser
			@param response:response to webbrowser
			@param errHandler:will be called when there is an error and havn't been catched.
		*/
		BaseAction.prototype.process = function(request,response,errHandler) {
			this.sandbox.request = request;
			this.sandbox.response = response;
			this.sandbox.errHandler = errHandler;
			this.script.runInNewContext(this.sandbox);
		}
		
		/**
			Write basic error page.
			@param res:response
			@param code:responseCode
			@param message:error message that will pass to the predefined error page.
		*/
		function writeBasic(res,code,message) {
			res.writeHead(code);
			res.end("<html><head><title>"+code+"</title></head><body><h1>"+message||"No error message."+"</h1><hr/>NodingServer v0.1 <i>"+new Date()+"</i></body></html>");
		}
		
		/**
			Write 302 to browser.
			@param res:response
			@param location:redirect url
		*/
		function sendRedirect(res,location) {
			res.writeHead(302,{
				"Location":location
			});
			res.end();
		}
		
		/**
			Write error page,it is configed by errorpage section in `.webappconfig` 
			@param req:request from browser
			@param res:response
			@param code:response code
			@param message:errormessage to bring to the error page.
			@param context:context for action use.Should NOT modify its content.
		*/
		function writeErrorPage(req,res,code,message,context) {
			//page is specified by error code in .webappconfig
			var pagePath = (context.webAppConfig.errorpage||{})[code];
			//if there is already an error,and enter this method again,
			//it means error page went error.we simply use the basic error 
			//page provided by webserver to prevent from loop
			if(req.errorObject||req.errorCode) {
				writeBasic(res,req.errorCode,message);
			} else if(pagePath) {//if there is an config
				req.errorObject = message;//users can find message in req.errorObject in there errorpage
				req.errorCode = code;//users can find code in req.errorCode in there errorpage
				var writeHead = res.writeHead;
				res.writeHead = function() {//by this proxy,writeHead's 1st param will be locked on the current errorcode.
					var ary = [code];
					for(var i=1;i<arguments.length;i++) {
						ary.push(arguments[i]);
					}
					writeHead.apply(this,ary);
				}
				var contextPath = context.contextPath;
				contextPath = stripeLastSlash(contextPath);
				//redirect into baseHandler to handle static or dynamic urlpath
				baseHandler(req,res,contextPath+pagePath);
			} else {//if not configured ,simply write a basic error page.
				writeBasic(res,code,message);
			}
		}
		
		/**
			handle static request for the specified url
			@param req:request from browser.req.url is the origin url as the 3rd param is the real url
			@param res:response
			@param url:the url is the final url to visit after rewriting and redirecting
			@param context:
		*/
		function staticRequest(req,res,url,context) {
			url = stripeContextPath(url,context.contextPath);
			var urlObj =  urlUtil.parse(url);
			var filePath = context.webroot+urlObj.pathname;
			
			//get the extension
			if(filePath.indexOf(".")>=0) {
				var extName = filePath.substr(filePath.lastIndexOf(".")+1);
			} else {
				extName = "";
			}
			
			//judge content type
			var contentType = ContentTypeMap[extName];
			if(extName in ContentTypeMap) {
				var contentType = ContentTypeMap[extName];
			} else {
				contentType = ContentTypeMap["bin"];
			}
			
			//get the supported compress method,for both browser and server.
			var compressMethod = supportedCompressMethod(req);
			//header to write
			var header = {
				'Content-Type': contentType
			};
			//set content encoding 
			if(compressMethod) {
				header['Content-Encoding'] = compressMethod;
			}
			
			fs.exists(filePath, function (exists) {
				if(exists) {
					fs.readFile(filePath,function(err,data){
						if(err) {//if any error,it will go to 404 page
							writeErrorPage(req,res,404,"Not Found",context);
							return;
						}
						
						fs.lstat(filePath,function(err,stat) {
							//handle last-modified
							var mtime = stat.mtime;
							header['last-modified'] = mtime.toUTCString();
							//write ok
							res.writeHead(200, header);
							if(compressMethod) {
								//compress data
								zlib[compressMethod](data, function(err, buffer) {
									res.end(buffer);
								});
							} else {
								//write data immediately
								res.end(data);
							}
						});
						
					});
				} else {//if file is not exists ,goto 404 page
					writeErrorPage(req,res,404,"Not Found",context);
				}
			});
		}
		
		/**
			handle dynamic request for the specified url
			@param req:request from browser.req.url is the origin url as the 3rd param is the real url
			@param res:response
			@param url:the url is the final url to visit after rewriting and redirecting
			@param context:
		*/
		function dynamicRequest(req,res,url,context) {
			url = stripeContextPath(url,context.contextPath);
			var webroot = context.webroot;
			var errHandler = function (err) {//simple error handler closure
				writeErrorPage(req,res,500,err.toString(),context);
			}
			var urlObj =  urlUtil.parse(url);
			var filePath = webroot+urlObj.pathname;
			var dirPath = filePath.substr(0,filePath.lastIndexOf("/"));
			if(actionMap[urlObj.pathname]) {//try if there is an action instance in cache
				try {
					actionMap[urlObj.pathname].process(req,res);//use action instance in cache immediately
				} catch(e) {
					errHandler(e);//if there is any error ,vm will throw it out,and we'll catch it here
				}
			} else {
				fs.exists(filePath, function (exists) {
					if(exists) {
							try {
								//create an action instance
								var action = new BaseAction(urlObj.pathname,context);
								//cache the instance
								actionMap[urlObj.pathname] = action;
								//process the dynamic request
								action.process(req,res);
								//watch the action file.if it is changed ,remove it from cache
								fs.watch(webroot+urlObj.pathname,function(a,b) {
									delete actionMap[urlObj.pathname];
									fs.unwatchFile(webroot+urlObj.pathname);
								});
							} catch(e) {
								errHandler(e);//like before,if any error will be handled here
							}
					} else {
						//if server cannot find the action,goto 404 page
						writeErrorPage(req,res,404,"Not Found",context);
					}
				});
			}
		}
		
		/**
			Get the supported compress method,for both browser and server.
			@param req:request from browser
		*/
		function supportedCompressMethod(req) {
			var acceptEncoding = req.headers["accept-encoding"]||"";
			if(acceptEncoding.indexOf("gzip")>=0){
				return "gzip"
			} else if(acceptEncoding.indexOf("deflate")>=0){
				//on my machine,ie8 does not support deflate,but passed accept-encoding:gzip,deflate.chrome works fine
				//so I changed the priority  of the compress methods.
				return "deflate"
			};
		}
		
		/**
			Handle url rewrite
			@param url:url to rewrite
			@aram context:context for action use.Should NOT modify its content.
		*/
		function rewriteURL(url,context) {
			var rewrites = context.webAppConfig.urlRewrite;
			var breakPoint = {};
			
			for(var i=0;i<rewrites.length;i++) {
				var rewrite = rewrites[i];
				if(rewrite.from.test(url)) {
					url = url.replace(rewrite.from,rewrite.to);
					if(test.doNotContinue) {
						break;
					}
				}
			}
			return url;
		}
		//cache for webappConfigs and webroots.The keys are context path
		var webAppConfigs={},webRoots = {};
		
		/**
			Load file into json and put into webAppConfig
			@param filepath:filepath to load
			@param key:cache key for webAppConfigs
		*/
		function loadFileIntoWebAppConfigs(filePath,key) {
			if(fs.existsSync(filePath)) {
				try {
					//here use eval for regexp to work.so take care of your config file.
					//may be changed in the next version
					webAppConfigs[key] = eval("("+fs.readFileSync(filePath,"utf8")+")");
				} catch(e) {
					console.log("ERROR in .webappconfig file\n"+e.toString());
					//should use default
				}
			} else {
				console.log("WARN no .webappconfig file specified");
			}
		}
		
		/**
			Load webappconfig from .webappconfig file.
			If web server have alias,their .webappconfig will be load and mapped into ther context path.
			@param webServerConfig:The config for the web server.It is excetly the same with webServer.json.
		*/
		function loadWebAppConfig(webServerConfig){
			var filePath = webServerConfig.webroot+"/.webappconfig";
			loadFileIntoWebAppConfigs(filePath,"/");
			webRoots["/"] = webServerConfig.webroot;
			(webServerConfig.alias||[]).forEach(function(o) {
				var contextPath = o.contextPath;
				var approot = o.approot;
				webRoots[contextPath] = approot;
				var filePath = approot+"/.webappconfig";
				loadFileIntoWebAppConfigs(filePath,contextPath);
				
			});
		}
		
		/**
			A simple and not safe way to process url to stripe context path from url
			@param url:url to process
			@prarm contextPath:Assumed to be the prefix of the url.
		*/
		function stripeContextPath(url,contextPath) {
			//simple use
			if(contextPath == "/") {
				contextPath = "";
			}
			return url.substr(contextPath.length);
		}
		
		/**
			Match the context path for url in order to implement alias
			@param url:url to get context path
		*/
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
		
		/**
			Get rid of the last '/' character
			@param str:string to process
		*/
		function stripeLastSlash(str) {
			if(str[str.length-1] == "/"){
				str = str.substr(0,str.length-2);
			}
			return str;
		}
		//session storage in memory
		var sessionStorage = {};
		var cookieProcessRegexp = /\s*(.+?)\s*=\s*(.+?)(?:\s*)(?:;|$)/gi;
		
		/**
			Parse cookie like SESSIONID=aaa;path=/
			@param cookieStr: the cookie string from browser
		*/
		function parseCookie(cookieStr) {
			var obj = {};
			cookieStr.replace(cookieProcessRegexp,function(t,key,value) {
				obj[key]=value;
			});
			return obj;
		}
		
		
		/**
			A simple session implement
			@param [json]: new a session with json will deserialize the json to session
		*/
		function Session(json) {
			if(!json) {
				this.data = {};
			} else if(typeof json == "string") {
				this.data = {};
				this.deserialize(json);
			} else {
				this.data = {};
				for(var k in json) {
					this.data[k] = json[k];
				}
			}			
		}
		
		/**
			put value into session
			@param key:session key
			@param value:session value
		*/
		Session.prototype.put = function(key,value) {
			
			this.data[key] = value;
			this.performChanged();
		};
		
		/**
			Get session value by key
			@param key: session key 
		*/
		Session.prototype.get = function(key) {
			return this.data[key];
		};
		
		/**	
			Clear the session.
		*/
		Session.prototype.clear = function() {
			this.data = {};
			this.performChanged();
		};
		
		/**
			Serialize session into json
		*/
		Session.prototype.serialize = function() {
			return JSON.stringify(this.data);
		};
		
		/**
			Deserialize json and append to this session
			@param json: json string to parse.
		*/
		Session.prototype.deserialize = function(json) {
			var d = JSON.parse(json);
			for(var k in d) {
				this.put(k,d[k]);
			}
			this.performChanged();
		};
		
		/**
			We'll support session persist.Then it will work
		*/
		Session.prototype.performChanged = function() {
			//persist logic later
		};
		
		/**
			Generate a random session id.
		*/
		function generateSessionId() {
			//Ugly method!
			return new Buffer(Math.random()+","+Math.random()+","+Math.random()).toString('base64');
		}
		
		/**
			The main handler to handle url request.
			@param req:request from browser.req.url is the origin url as the 3rd param is the real url
			@param res:response
			@param url:the url is the final url to visit after rewriting and redirecting
			
		*/
		function baseHandler(req,res,url) {
			//handle cookie
			var cookie = req.headers['cookie'];
			if(!cookie) {//if no cookie,generate session id.
				var sessionId = generateSessionId();
				res.setHeader("set-cookie",["SESSIONID="+sessionId,"path=/"]);
			} else {//get current cookie and parse session id.
				var cookieObj = parseCookie(req.headers['cookie']||"")
				sessionId = cookieObj["SESSIONID"];
			}
			
			//load session form storage.if noncached,create a new one
			var session = sessionStorage[sessionId] = sessionStorage[sessionId]||new Session();
			
			var webServerConfig = _server.config;
			loadWebAppConfig(webServerConfig);
			var contextPath = matchContextPath(url);
			var webAppConfig = webAppConfigs[contextPath];
			var webroot = webRoots[contextPath];
			var context = {//build context for the next step to use
				webAppConfig:webAppConfig,
				webroot:webroot,
				contextPath:contextPath,
				session:session
			}
			//match homepage
			var homepage = webAppConfig.homepage||"/index.html";
			try {
				var url = rewriteURL(url,context);
				var stripedURL = stripeContextPath(url,contextPath);
				if(stripedURL == "/"||stripedURL == "") {//Ugly homepage judge
					sendRedirect(res,stripeLastSlash(contextPath)+homepage);
				} else if(dynamicPattern.test(url)) {//if dynamic,goto  dynamicRequest to handle
					dynamicRequest(req,res,url,context);
				} else {//if static ,goto  staticRequest to handle
					staticRequest(req,res,url,context);
				}
			} catch(e) {
				//if there is any runtime error,throw to 500 err page.
				writeErrorPage(req,res,500,(e||"").toString(),context);
			}
		}
		
		/**
			The request handler for http server to use.
			@param req:request from browser.
			@param res:response
		*/
		var requestHandler = function(req,res) {
			//Set server header for nodingServer
			res.setHeader("server","NodingServer(nodejs)");
			//log most important things
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
	
	/**
		Start the server on all ports.
	*/
	exports.Server.prototype.start = function() {
		var server = http.createServer(this.requestHandler);
		var ports = [].concat(this.config.ports);
		var firstPort = ports.shift();
		server.listen(firstPort);
		
		console.log("WebServer listening at port"+firstPort);
		//Using port redirect to implement the feature.
		(ports||[]).forEach(function(port) {
			var Agent = require("./portRedirectAgent.js").Agent;
			var agent = new Agent(port,firstPort);
			
			agent.start();
			console.log("WebServer listening at port"+port+"(redirected)");
		});
	}
})();


