(function() {
	var encoding = 'utf8';
	var fs = require("fs");
	function write404(res) {
		res.writeHeader(404);	
		res.end("<html><head><title>404 Page Not Found</title></head><body><h1>404 Page Not Found</h1><hr/>NodingServer v0.1 <i>"+new Date().toUTCString()+"</i></body></html>");
	}
	function write400(res) {
		res.writeHeader(400);	
		res.end("<html><head><title>400 Bad Request</title></head><body><h1>400 Bad Request.</h1><hr/>NodingServer v0.1 <i>"+new Date().toUTCString()+"</i></body></html>");
	}
	function isDynamic(patterns,url) {
		for(var i=0;i<patterns.length;i++) {
			if(patterns[i].test(url)) {
				return true;
			}
		}
		return false;
	}
	
	function supportedCompressMethod(req) {
		var acceptEncoding = req.headers["accept-encoding"]||"";
		if(acceptEncoding.indexOf("deflate")>=0){
			return "deflate"
		} else if(acceptEncoding.indexOf("gzip")>=0){
			return "gzip"
		};
	}
	function createServer(protocol,options,handler) {
		if(protocol.toLowerCase() == "https") {
			var key = fs.readFileSync(options.keyPath);
			var cert = fs.readFileSync(options.certPath);
			options.key = key;
			options.cert =cert;
			return require("https").createServer(options,handler);
		} else if(protocol.toLowerCase() == "http") {
			return require("http").createServer(handler);
		} else {
			throw "Protocol "+protocol+" not supported!!!";
		}
	}
	exports.Server = function(config) {
		var hostMap = config.mappingHosts;
		var port = this.port = config.listenPort;
		var http = require("http");
		
		var LRUCache = require("./LRUCache.js").LRUCache;
		var staticCache = new  LRUCache(config.cacheSize);
		
		this.server = createServer(config.protocol||"http",config.httpsOptions||{},function(req,res) {
			try {
				var headers = req.headers;
				
				if(!headers.host){
					write400(res);
					return;
				}
				var hostport = hostMap[headers.host.split(":")[0]];
				if(!hostport){
					write404(res);
					return;
				}
				headers.host = hostport.host +":"+(hostport.port||80);//for host with no port 
				headers['x-forwarded-for'] = headers['x-forwarded-for']
					?(headers['x-forwarded-for']+","+req.connection.remoteAddress)
					:req.connection.remoteAddress;
				var options = {
					host: hostport.host,
					port: hostport.port,
					path: req.url,
					method: req.method,
					headers:headers
				};
			
				var commonLoad = function(cacheCallback) {
					var proxyReq = http.request(options, function(proxyRes) {
						res.writeHeader(proxyRes.statusCode,proxyRes.headers);
						if(cacheCallback) {
							var cacheData = [];
							cacheData.size = 0;
							cacheData.hitCount = 0;
							cacheData.headers = proxyRes.headers;
							cacheData.statusCode = proxyRes.statusCode;
						}
						proxyRes.on('data', function (chunk) {
							if(cacheCallback) {
								cacheData.push(chunk);
								cacheData.size += chunk.length;
							} else {
								res.write(chunk);
							}
						});
						proxyRes.on('end',function() {
							if(cacheCallback) {
								cacheCallback(cacheData,proxyRes.statusCode);
							} else {
								res.end();
							}
						});
					});

					proxyReq.on('error', function(e) {
						res.writeHeader(500);
						res.end((e||"").toString());
					});

					req.on("data",function(buffer) {
						proxyReq.write(buffer);
					});
					req.on("end",function() {
						proxyReq.end();
					});
				}
				
				if(!isDynamic(hostport.noCachePattern,req.url)&&req.method=="GET") {
					var compressMethod = supportedCompressMethod(req)||"plain";
					var cacheKey = compressMethod+"|"+hostport.host+":"+hostport.port+req.url;
					
					var cachedEntry = staticCache.get(cacheKey);
					var writeCachedEntry = function(entry) {
						res.writeHeader(entry.statusCode,entry.headers);
						entry.forEach(function(o) {
							res.write(o);
						});
						res.end();
					}
					if(cachedEntry) {
						cachedEntry.hitCount ++;
						console.log("HitCount:"+cachedEntry.hitCount);
						writeCachedEntry(cachedEntry);	
					} else {
						commonLoad(function(data,statusCode) {
							if(statusCode == 200) {
								staticCache.put(cacheKey,data);
							}
							writeCachedEntry(data);	
						});
					}
				} else {
					commonLoad();
				}
			}catch(e) {
				res.writeHeader(500);
				res.end((e||"").toString());
			}
		});
	}
	
	exports.Server.prototype.start = function() {
		this.server.listen(this.port);
		console.log("Server start at "+this.port);
	}
})();