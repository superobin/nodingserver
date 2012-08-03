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
	
	function Command() {
	}
	var CommandCategoryMap = {
		"add":StorageCommand,
		"set":StorageCommand,
		"get":GetCommand
	}
	var CommandLengthMap = {
		"add":[5,5],
		"set":[5,5],
		"get":[2,128]
	}
	Command.parse = function(cmdBody) {
		var segments = cmdBody.split(" ");
		var cmdName = segments[0];
		if(CommandCategoryMap[cmdName]&&segments.length >= CommandLengthMap[cmdName][0]&&segments.length <= CommandLengthMap[cmdName][1]) {
			var cmd = CommandCategoryMap[cmdName].parse(segments);
		} else {
			cmd = new ErrorCommand("ERROR","cannot reconize the command");
		}
		return cmd;
	}
	Command.prototype.error = function(errKind,errmessage) {
		var err = new ErrorCommand(errKind,errmessage).init(this.parser);
		this.needData = false;
		this.isError = true;
		this.execute = function() {
			err.execute();
		}
	}
	Command.prototype.init = function(parser) {
		this.parser = parser;
		this.stream = parser.stream;
		return this;
	}

	Command.prototype.send = function() {
		throw "Abstract command!Please implement it";
	}
	
	function GetCommand() {
		
	}
	function StorageCommand() {
		this.key = "";
		this.flags = 0;
		this.exptime = 0;
		this.bytes = 0;
		this.buffer = new Buffer(0);
	}
	StorageCommand.parse = function(cmdBodySegments) {
		var cmdName = cmdBodySegments[0];
		if(cmdName == "add"){
			var cmd = new AddCommand();
		} else if(cmdName == "set") {
			cmd = new SetCommand();
		}
		
		cmd.key = cmdBodySegments[1];
		cmd.flags =  cmdBodySegments[2]-0;
		cmd.exptime = cmdBodySegments[3]-0;
		cmd.bytes = cmdBodySegments[4]-0;
		if(isNaN(cmd.flags)) {
			cmd.error("ERROR","error flags");
			return cmd;
		}
		
		if(isNaN(cmd.exptime)) {
			cmd.error("ERROR","error exptime");
			return cmd;
		}
		
		if(isNaN(cmd.bytes)) {
			cmd.error("ERROR","error bytes");
			return cmd;
		}
		
		cmd.needData = true;
		console.log(cmd);
		return cmd;
	}
	util.inherits(StorageCommand, Command);
	
	function AddCommand() {
	}
	util.inherits(AddCommand, StorageCommand);
	AddCommand.prototype.execute = function() {
		if(this.key in storage) {
			this.stream.write("NOT_STORED\r\n");
		} else {
			var entry = {
				data:this.buffer,
				flags:this.flags,
				exptime:this.exptime,
				key:this.key
			}
			storage[this.key] = entry;
			this.stream.write("STORED\r\n");
		}
	};
	
	function SetCommand() {
		if(this.key in storage) {
			
			var entry = storage[this.key];
			entry.data=this.buffer;
			entry.flags=this.flags;
			entry.exptime=this.exptime;
			entry.key=this.key;
			this.stream.write("STORED\r\n");
		} else {
			this.stream.write("NOT_STORED\r\n");
		}
	}
	util.inherits(SetCommand, StorageCommand);
	
	SetCommand.prototype.execute = function() {
		this.stream.write("execute set command");
	}
	function ErrorCommand(errorKind,errMessage) {
		this.errorKind = errorKind;
		this.errMessage= errMessage;	
		this.isError = true;
	}
	util.inherits(ErrorCommand, Command);
	ErrorCommand.prototype.execute = function() {
		var str = this.errorKind + (this.errMessage ?(" "+this.errMessage):"");
		this.stream.write(str);
		this.stream.write("\r\n");
	};
	
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
				this.cmd = new ErrorCommand("ERROR","bad command").init(this);;
				
				this.buffer = new Buffer(0);
				return true;
			}
		}
		if(pos>0) {
			var commandStr = this.buffer.slice(0,pos).toString("ascii");
			this.buffer = this.buffer.slice(pos+2);
			var cmd = this.cmd = Command.parse(commandStr).init(this);
			
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
	
	var a = 0;
	Parser.prototype.nextCommand = function(callback) {
		var command = new AddCommand();
		command.init(this);
		
		if(!a++) {
			callback(command);
		}
	}
	
	
	Parser.prototype.reset = function() {
		
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
