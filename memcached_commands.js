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
		this.keys = [];
	}
	
	util.inherits(GetCommand, Command);
	GetCommand.parse = function(segments) {
		console.log(this.storage);
		segments.shift();//now segments is keys.
		var cmd = new GetCommand();
		segments.forEach(function(key) {
			cmd.keys.push(key);
		});
		return cmd;
	}
	GetCommand.prototype.execute = function() {
		try {
			var _this = this;
			this.keys.forEach(function(key) {
			
				var item = _this.storage.get(key);
				if(item) {
					_this.stream.write("data\r\n");
					_this.stream.write(item.data);
				}
				_this.stream.write("\r\n");
			});
		} catch(e){
			console.log(e);
		}
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
		if(this.storage.keyExists(this.key)) {
			this.stream.write("NOT_STORED\r\n");
		} else {
			var item = this.storage.put(this.key,this.buffer);
			if(item) {
				item.flags = this.flags-0;
				item.exptime = this.exptime - 0;
				this.stream.write("STORED\r\n");
			} else {
				this.stream.write("NOT_STORED\r\n");//error?
			}
		}
	};
	
	function SetCommand() {
		
	}
	util.inherits(SetCommand, StorageCommand);
	
	SetCommand.prototype.execute = function() {
		if(this.storage.keyExists(this.key)) {
			var item = this.storage.put(this.key,this.buffer);
			
			item.flags = this.flags-0;
			item.exptime = this.exptime-0;
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