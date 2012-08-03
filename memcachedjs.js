(function(){
	var util = require("util");
	var net = require("net");
	function Server(options) {
		this.server = net.createServer(function (c) {
			var parser = new Parser(c,this.server);
		});
	}
	Server.prototype.listen = function(port) {
		this.server.listen(port);
	}
	var storage = {};
	
	var Command = require("./memcached_commands.js").Command;
	function Parser(stream) {
		this.eventHandlers = {};
		this.stream = stream;
		this.available = 0;
		this.buffer = new Buffer(0);
		this.passBytes = 0;
		var _this = this;
		this.requireDataLength = -1;
		this.status = 0;//0:read command,1:read data;
		stream.on("data",function(data) {
			_this.buffer = _this.buffer.length?Buffer.concat([_this.buffer,data]):data;
			if(_this.passBytes>0) {
				if(_this.buffer.length>_this.passBytes) {
					_this.buffer = _this.buffer.slice(_this.passBytes);
					_this.passBytes = 0;
				} else {
					_this.passBytes -= _this.buffer.length;
					_this.buffer = new Buffer(0);
				}
			}
			_this.toggleData();
		});
	}
	
	Parser.prototype.toggleData = function() {
		var len = this.buffer.length;
		console.log(this.status);
		if(this.status == 0) {
			console.log("read command line");
			var finished = this.readCommandBody();
		} else if(this.requireDataLength>0&&this.buffer.length>=this.requireDataLength){
			console.log("read data block");
			finished = this.readDataBlock();
		}
		if(finished) {
			this.toggleData();
		}
	}
	
	
	Parser.prototype.readDataBlock = function() {
		if(this.buffer.length>=this.requireDataLength+2) {
			if(this.buffer[this.requireDataLength] =="\r".charCodeAt(0)&&this.buffer[this.requireDataLength+1] == "\n".charCodeAt(0)) {
				this.cmd.buffer = this.buffer.slice(0,this.requireDataLength);
				this.buffer = this.buffer.slice(this.requireDataLength+2);
				this.status = 0;
				this.requireDataLength=-1;
			} else {
				this.cmd.error("ERROR","error data block");
				this.buffer = new Buffer(0);
				this.status = 0;
				this.requireDataLength=-1;
			}
			this.cmd.execute();
			this.cmd = null;
			return true;//read finished
		}
		return false;//read rollbacked
	}
	Parser.prototype.readCommandBody = function() {
		var pos = -1;
		for(var i=0;i<this.buffer.length-1;i++) {
			if(this.buffer[i]=="\r".charCodeAt(0)&&this.buffer[i+1] == "\n".charCodeAt(0)){ 
				pos = i;
			}
			if(i>1024) {//Max command size
				this.cmd = new ErrorCommand("ERROR","bad command").init(this,storage);
				this.buffer = new Buffer(0);
				return true;
			}
		}
		if(pos>0) {
			var commandStr = this.buffer.slice(0,pos).toString("ascii");
			this.buffer = this.buffer.slice(pos+2);
			var cmd = this.cmd = Command.parse(commandStr).init(this,storage);
			
			console.log(cmd);
			if(cmd.isError) {
				cmd.execute();
			} else if(cmd.needData) {
				this.status = 1;
				this.requireDataLength = cmd.bytes;
			}
			return true;
		}
		return false;
	}
	exports.Server = Server;
})();

var net = require("net");
var Server = exports.Server;
var server = new Server();
server.listen(2001);


/*
	Parser.prototype.on = function(eventName,eventHandler) {
		var h = this.eventHandlers[eventName] = this.eventHandlers[eventName] || [];
		h.push(eventHandler);
	}
	Parser.prototype.toggleEvent = function(eventName,eventObj) {
		var h = this.eventHandlers[eventName];
		if(h) {
			var _this = this;
			h.forEach(function(o) {
				o.call(_this,eventObj);
			});
		}
	}
*/
