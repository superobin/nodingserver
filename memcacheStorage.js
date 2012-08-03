(function() {


	var SlabSize = 1024*1024;
	var powerSmallest = 1;
	var powerLargest = 16;
	var minChunkSize = 32;
	var maxSize = 64*1024*1024;
	var usedSize = 0;
	function Storage() {
		this.init();
	}
	Storage.prototype.init = function () {
		this.slabClasses = [];
		var i = powerSmallest - 1;
		for(;i<powerLargest;i++) {
			var size = powerSmallest<<i;
			this.slabClasses[i] = new SlabClass(size);
		}
		this.hashMap = {};
	}
	Storage.prototype.put = function(key,item) {
		var slabClassIndex = 2;//to judge later
		var slabClass = this.slabClasses[slabClassIndex];
		var oldItem = this.get(key);
		if(oldItem) {
			oldItem.writeDeleteFlag(1);
		}
		var itemId = slabClassIndex+","+slabClass.add(item);
		
		this.hashMap[key]=itemId;
	}
	Storage.prototype.get = function(key) {
		var itemKey = this.hashMap[key];
		if(itemKey) {
			var segments = itemKey.split(",");
			console.log(segments)
			var slabClassIndex = segments[0]-0;
			var slabClass = this.slabClasses[slabClassIndex];
			var slabIndex = segments[1]-0;
			var slab = slabClass.slabs[slabIndex];
			console.log(slab);
			if(!slab) {
				return null;
			}
			var chunkIndex = segments[2]-0;
			var offset = chunkIndex*slab.size;
			
			var item = new Item(slab.buffer.slice(offset,offset+slab.size));
			return item;
		}
	}
	Storage.prototype.keyExists = function(key) {
		return key in this.hashMap;//Easy implement
	}
	Storage.prototype.remove = function (key) {
		
	}

	
	function SlabClass(size) {
		this.size = size-0;
		this.perslab = Math.floor(SlabSize/this.size);
		this.slabs = [];
		this.endPage = null;
		this.solts = [];//array or linked list?
		this.writeToTail = null;
		this.killing = 0;
		this.requested = 0;
	}
	SlabClass.prototype.add = function(item) {
		if(!this.slabs.length) {
			var slab = new Slab(this);
			slab.init();
			this.slabs.push(slab);
			
		}
		
		console.log(this.writeToTail)
		if(this.writeToTail) {//
			var itemIdPart = this.writeToTail(item);
			return itemIdPart;
		} else {
			//free logic
		}
	}
	
	
	function Slab(slabClass){
		this.size = slabClass.perslab;
		this.slabClass = slabClass;
		this.index = this.slabClass.slabs.length;
	}
	Slab.prototype.init = function() {
		var _this = this;
		this.tailPos = 0;
		if(usedSize + SlabSize <=maxSize) {
			var buffer = this.buffer = new Buffer(SlabSize);
			usedSize+=SlabSize;
			this.slabClass.writeToTail = function(item) {
			
				item.save(buffer.slice(_this.tailPos,_this.size+_this.tailPos));
				var itemChunkId = _this.tailPos/_this.size;
				_this.tailPos+=_this.size;
				
				if(_this.tailPos+_this.size<SlabSize) {
					var slab = new Slab(_this.slabClass);
					if(slab.init()) {
						_this.slabClass.slabs.push(slab);
					}
				}
				
				return _this.index+","+itemChunkId;
			};
			return true;
		} else {
			this.slabClass.writeToTail = null;
			return false;
		}
	}
	//false when free failed
	Slab.prototype.free = function() {
		
	}

	var Item = function(buf){
		if(buf) {
			this.init(buf);
		}
	}
	Item.prototype.headerSize = 11;
	Item.prototype.init = function(buf) {
		var pos = 0;
		
		this.dataLen = buf.readUInt32BE(pos);
		pos+=4;
		this.expires = buf.readUInt32BE(pos);
		pos+=4;
		this.delFlag = buf.readUInt8(pos);
		pos+=1;
		this.flags = buf.readUInt16BE(pos);
		pos+=2;
		this.originBuffer = buf;
	}
	
	Item.prototype.save = function(buf,pos) {
		pos=pos||0;
		buf.writeUInt32BE(this.dataLen, pos);
		pos+=4;
		buf.writeUInt32BE(this.expires, pos);
		pos+=4;
		buf.writeUInt8(this.delFlag, pos);
		pos+=1;
		buf.writeUInt16BE(this.flags, pos);
		pos+=2;
		if(this.originBuffer) {
			this.originBuffer.copy(buf,this.headerSize,this.headerSize,this.headerSize+this.dataLen);
		} else {
			this.buffer.copy(buf,this.headerSize);
		}
	}
	Item.prototype.getData = function() {
		return this.originBuffer.slice(this.headerSize,this.headerSize+this.dataLen);
	}
	Item.prototype.writeDeleteFlag = function (flag) {
		if(this.originBuffer) {
			this.originBuffer[8] = flag;
		} else {
			throw "must be item from cache!";
		}
	}
	var storage = new Storage();
	var item = new Item();
	
	item.dataLen = 3;
	item.expires = 3;
	item.delFlag = 0;
	item.flags = 123;	
	item.buffer = new Buffer("abc","ascii");
	storage.put("key",item);
	storage.put("key",item);
	storage.put("key",item);
	console.log(storage.get("key"));
	console.log(storage.hashMap);
	
})();