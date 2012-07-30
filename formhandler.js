var url = require("url");
var queryString = require('querystring');
exports.parseRequest = function(request,callback) {
	if(request.method == "POST") {
		handlePost(request,callback);
	} else if(request.method == "GET") {
		handleGet(request,callback);
	}
}
function handlePost(request,callback) {
	var str = "";
	request.on("data",function(data) {
		str+=data.toString("ascii");
	});
	request.on("end",function() {
		handleGet(request,function(params) {
			var queryObj = queryString.parse(str);
			for(var k in queryObj) {
				params[k] = queryObj[k];
			}
			callback(params);
		});
		
	});
}
function handleGet(request,callback) {
	var urlObj = url.parse(request.url,true);
	callback(urlObj.query);
}