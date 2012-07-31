(function() {
	var encoding = 'utf8';
	
	function write404(res) {
		res.writeHeader(404);	
		res.end("<html><head><title>404 Page Not Found</title></head><body><h1>404 Page Not Found</h1><hr/>NodingServer v0.1 <i>"+new Date()+"</i></body></html>");
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
	
	exports.Server = function(config) {
		var hostMap = config.mappingHosts;
		var port = this.port = config.listenPort;
		var http = require("http");
		
		var LRUCache = require("./LRUCache.js").LRUCache;
		var staticCache = new  LRUCache(config.cacheSize);
		
		this.server = http.createServer(function(req,res) {
			try {
				var headers = req.headers;
				var hostport = hostMap[headers.host.split(":")[0]];
				if(!hostport){
					write404(res);
					return;
				}
				headers.host = hostport.host +":"+hostport.port;
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
					console.log("CacheKey:"+cacheKey);
					var cachedEntry = staticCache.get(cacheKey);
					var writeCachedEntry = function(entry) {
						res.writeHeader(entry.statusCode,entry.headers);
						console.log(entry.statusCode,entry.headers);
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