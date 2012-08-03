(function() {
	var util = require("util");
	var CommandCategoryMap  ={
		"add":StorageCommand,
		"set":StorageCommand,
		"get":GetCommand
	}
	var CommandLengthMap = {
		"add":[5,5],
		"set":[5,5],
		"get":[2,128]
	}
	
	function Command() {
	}
	exports.Command = Command;
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
		var err = new ErrorCommand(errKind,errmessage).init(this.parser,this.storage);
		this.needData = false;
		this.isError = true;
		this.execute = function() {
			err.execute();
		}
	}
	Command.prototype.init = function(parser,storage) {
		this.parser = parser;
		this.stream = parser.stream;
		this.storage = storage;
		return this;
		
	}

	Command.prototype.send = function() {
		throw "Abstract command!Please implement it";
	}
	
	function GetCommand() {
		
	}
	GetCommand.parse = function(segments) {
		segments.shift();//now segments is keys.
		segments.forEach(function(key) {
			var entry = this.storage[key];
			
		});
		
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
		if(this.key in this.storage) {
			this.stream.write("NOT_STORED\r\n");
		} else {
			var entry = {
				data:this.buffer,
				flags:this.flags,
				exptime:this.exptime,
				key:this.key
			}
			this.storage[this.key] = entry;
			this.stream.write("STORED\r\n");
		}
	};
	
	function SetCommand() {
		
	}
	util.inherits(SetCommand, StorageCommand);
	
	SetCommand.prototype.execute = function() {
		if(this.key in this.storage) {
			var entry = this.storage[this.key];
			entry.data=this.buffer;
			entry.flags=this.flags;
			entry.exptime=this.exptime;
			entry.key=this.key;
			this.stream.write("STORED\r\n");
		} else {
			this.stream.write("NOT_STORED\r\n");
		}
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
})();