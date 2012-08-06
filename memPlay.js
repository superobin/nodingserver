(function() {
	var magicTime = 1344222142;//in seconds
	
	var slabSize = 1024*1024;
	var powerSmallest = 1;
	var powerLargest = 16;
	var minChunkSize = 2;
	var maxSize = 64*1024*1024;
	var usedSize = 0;
	var currentAlloced = 1;
	var dataBlock = new Buffer(maxSize+1);//offset 0 is skiped to be different from NULL
	
	function Storage() {
		this.slabClasses = [];
		var i = powerSmallest - 1;
		for(;i<powerLargest;i++) {
			var size = minChunkSize<<i;
			
			this.slabClasses[i] = new SlabClass(size,this);
		}
		this.hashMap = {};
		this.slabClassMap = {};
	}
	
	Storage.prototype.selectSlabClass = function(size) {
		for(var i=0;i<this.slabClasses.length;i++) {
			if(size>this.slabClasses[i].size) {
				continue;
			}
			return i;
		}
		return 0;
		
	}
	Storage.prototype.put = function(key,dataBuffer) {
		var oldPointer = this.hashMap[key];
		if(oldPointer) {
			oldItem = new Item(oldPointer);
			oldItem.writeDeleteFlag(1);
		}
		var slabClassIndex = this.selectSlabClass(dataBuffer.length+Item.prototype.headerSize);
		console.log("Selected slab class:"+slabClassIndex);
		if(slabClassIndex<0){
			return false;
		}
		var slabClass = this.slabClasses[slabClassIndex];
		var pointer = slabClass.add();
		if(!pointer) {
			throw "Out Of Memory";
		}
		dataBuffer.copy(dataBlock,pointer+Item.prototype.headerSize);
		
		this.hashMap[key]=pointer;
		var item = new Item(pointer);
		item.dataLen = dataBuffer.length;
		this.moveToHead(pointer);
		return item;
	}
	
	Storage.prototype.get = function(key) {
		var itemKey = this.hashMap[key];
		if(!itemKey) {
			return null;
		}
		var item = new Item(itemKey);
		this.moveToHead(item.pointer);
		if(item) {
			item.hit();
		}
		return item;
	}
	
	//-1 means not found.
	Storage.prototype.isDeleted = function(header) {
		return header?header[8]:-1;
	}
	
	//-1 means not found.
	Storage.prototype.isExperied = function(header) {
		if(header) {
			var expireTime = header.readUInt32BE(4)+magicTime;
			return expireTime<new Date().getTime()/1000 ? 1:0;
		} else {
			return -1;
		}
	}
	
	Storage.prototype.keyExists = function(key) {
		return key in this.hashMap;//Easy implement
	}
	
	Storage.prototype.remove = function (key) {
		var itemKey = this.hashMap[key];
		var item = new Item(itemKey);
		if(item) {
			item.writeDeleteFlag(1);
			return item;
		} else {
			return false;
		}
	}
	Storage.prototype.moveToHead = function(pointer) {
		var absPos = pointer-1;
		var slabPointer = absPos-(absPos%slabSize)+1;
		var slabClass = this.slabClassMap[slabPointer];
		if(slabClass.head == 0) {
			slabClass.head = pointer;
			slabClass.tail = pointer;
		} else if(slabClass.head != pointer) {
		
			
		
			var item = new Item(pointer);
			var next = item.next;
			var previous = item.previous;
			
			
			if(slabClass.tail == pointer) {
				slabClass.tail = previous;
			}
			
			if(previous) {
				var previousItem = new Item(previous);
				previousItem.next = next;
			}
			if(next) {
				var nextItem = new Item(next);
				nextItem.previous = previous;
			} 
			
			var oldHead = new Item(slabClass.head);
			item.next = oldHead.pointer;
			item.previous = 0;
			oldHead.previous = item.pointer;
			slabClass.head = item.pointer;
			
			
		}
	}
	
	function SlabClass(size,storage) {
		this.size = size-0;
		this.perslab = Math.floor(slabSize/this.size);
		this.slabs = [];
		this.endPage = null;
		this.solts = [];//array or linked list?
		this.writeToTail = null;
		this.killing = 0;
		this.requested = 0;
		this.storage = storage;
		
		this.head = 0;
		this.tail = 0;
	}
	
	SlabClass.prototype.add = function() {
		if(!this.slabs.length) {
			var slab = new Slab(this);
			slab.init();
			this.slabs.push(slab);
		}
		var alloced = false;
		if(this.allocChunk) {//
			var pointer = this.allocChunk();
			if(pointer) {
				return pointer;
			}
		} 
		if(this.tail){
			var pointer = this.tail;
			do{
				var item =new Item(pointer);
				if(item.isDeleted()||item.isExpired()) {
					console.log("-------------------->>>!!<<<"+item.pointer);
					console.log(item.isDeleted(),item.isExpired());
					return item.pointer;
				}
			} while(pointer = item.previous);
			console.log("not found");
		} else {
			throw "Error.no tail.";
		}
	}
	
	function Slab(slabClass){
		this.size = slabClass.size;
		this.slabClass = slabClass;
		this.index = this.slabClass.slabs.length;
	}
	
	Slab.prototype.init = function() {
		var test = 0;
		var _this = this;
		this.tailPos = 0;
		if(currentAlloced + slabSize <=maxSize) {
			this.pointer = currentAlloced;
			
			var buffer = dataBlock.slice(currentAlloced,currentAlloced+=slabSize);//new Buffer(slabSize);
			
			this.slabClass.allocChunk = function() {
				
				var itemChunkId = _this.tailPos/_this.size;
				_this.tailPos+=_this.size;
				if(_this.tailPos+_this.size>slabSize) {//If is the last chunk,try to create a new slab;
					var slab = new Slab(_this.slabClass);
					if(slab.init()) {
						_this.slabClass.slabs.push(slab);
					} else {
						console.log("Out of memory");//Out of memory
						return 0;
					}
				}
				
				return _this.pointer+itemChunkId*_this.size;
			};
			this.slabClass.storage.slabClassMap[this.pointer] = this.slabClass;
		} else {
			this.pointer = 0;
			this.slabClass.allocChunk = null;
		
		}
		
		return this.pointer;
	}
	
	var Item = function(pointer){
		this.pointer = pointer;
	}
	Item.prototype.headerSize = 23;
	Item.prototype.__defineGetter__("dataLen",function() {
		return dataBlock.readUInt32BE(this.pointer);
	});
	Item.prototype.__defineGetter__("expires",function() {
		return dataBlock.readUInt32BE(this.pointer+4)+magicTime;
	});
	Item.prototype.__defineGetter__("delFlag",function() {
		return dataBlock.readUInt8(this.pointer+8);
	});
	Item.prototype.__defineGetter__("flags",function() {
		return dataBlock.readUInt16BE(this.pointer+9);
	});
	
	Item.prototype.__defineGetter__("hitCount",function() {
		return dataBlock.readUInt32BE(this.pointer+11);
	});
	
	
	Item.prototype.__defineGetter__("previous",function() {
		return dataBlock.readUInt32BE(this.pointer+15);
	});
	
	Item.prototype.__defineGetter__("next",function() {
		return dataBlock.readUInt32BE(this.pointer+19);
	});
	Item.prototype.__defineSetter__("dataLen",function(num) {
		return dataBlock.writeUInt32BE(num,this.pointer);
	});
	Item.prototype.__defineSetter__("expires",function(num) {
		return dataBlock.writeUInt32BE(num-magicTime,this.pointer+4);
	});
	Item.prototype.__defineSetter__("delFlag",function(num) {
		return dataBlock.writeUInt8(num,this.pointer+8);
	});
	Item.prototype.__defineSetter__("flags",function(num) {
		return dataBlock.writeUInt16BE(num,this.pointer+9);
	});
	
	Item.prototype.__defineSetter__("previous",function(pointer) {
		dataBlock.writeUInt32BE(pointer,this.pointer+15);
		
		
	});
	Item.prototype.__defineSetter__("next",function(pointer) {
		
		dataBlock.writeUInt32BE(pointer,this.pointer+19);
	});
	
	Item.prototype.hit = function() {
		return dataBlock.writeUInt32BE(this.hitCount+1,this.pointer+11);
	}
	/**
		if you saved the item,item will be linked with the memory.
	*/
	Item.prototype.save = function(buf) {
		this.buffer.copy(buf,0);
		this.buffer = buf;
	}
	
	Item.prototype.__defineSetter__("data",function(buffer) {
		if(buffer instanceof Buffer) {
			buffer.copy(this.buffer,this.headerSize,0,this.dataLen);
		} else {
			throw "Data must be a buffer";
		}
	});
	
	Item.prototype.__defineGetter__("data",function() {
		return dataBlock.slice(this.headerSize+this.pointer,this.headerSize+this.dataLen+this.pointer);
	});
	
	Item.prototype.__defineGetter__("size",function() {	
		return this.headerSize+this.dataLen;
	});

	Item.prototype.writeDeleteFlag = function (flag) {
		dataBlock[this.pointer+8] = flag;
	}
	
	Item.prototype.inspect = function() {
		/*console.log("size:"+this.size);
		console.log("dataLen:"+this.dataLen);
		console.log("delFlag:"+this.delFlag);
		console.log("expires:"+this.expires);
		console.log("flags:"+this.flags);
		console.log("hitCount:",this.hitCount);
		console.log("data:",this.data);
		*/
		console.log("-------------------");
		console.log("previous:",this.previous);
		console.log("next:",this.next);
		console.log("-------------------");
	}
	Item.prototype.isExpired = function() {
		return this.expires < new Date().getTime()/1000;
	}
	Item.prototype.isDeleted = function() {
		return !!this.delFlag;
	}
	Item.getInstance = function(pointer) {//object pool
		this.item = this.item||new Item(pointer);
		this.item.pointer = pointer;
		return this.item;
	}
	var storage = new Storage();
	
	/**
		Test case
	*/
	function test(key,data) {
		var item = storage.put(key,new Buffer(data,"ascii"));
		item.expires = (new Date().getTime()/1000+3600).toFixed(0);
		item.delFlag = 0;
		item.flags = 65535;
		item.inspect();
		storage.get(key).inspect();
		//storage.moveItemToQueueHead(item.pointer);
	}
	test("k10","abcdef");
	test("k10","abcdef");
	test("k15","abcdef");
	test("k13","abcdef");
	test("k11","abcdef");
	test("k12","abcdef");
	test("k2","12312asdasasdasdsdasdasd3");
	test("k2","12312asdasasdasdsdasdasd3");
	test("k2","12312asdasasdasdsdasdasd3");
	test("k2","12312asdasasdasdsdasdasd3");
	test("k2","12312asdasasdasdsdasdasd3");
	test("k2","12312asdasasdasdsdasdasd3");
	console.log(storage.hashMap);
	
	
	
	
	var slabClasses = storage.slabClasses;
	slabClasses.forEach(function(o,i) {
		if(o.tail) {
			console.log("linked list found in slab class "+i);
			var p = o.tail;
			do{
				
				var item =new Item(p);
				process.stdout.write(item.pointer+"=>");
				
			} while(p = item.previous);
			console.log("\n");
			
		}
	});
	
	
	var slabClasses = storage.slabClasses;
	slabClasses.forEach(function(o,i) {
		if(o.head) {
			console.log("linked list found in slab class "+i);
			var p = o.head;
			do{
				
				var item =new Item(p);
				process.stdout.write(item.pointer+"=>");
				
			} while(p = item.next);
			console.log("\n");
			
		}
	});

	
	
})();