(function() {
	var LinkedList = require("./LinkedList.js").LinkedList;
	var LRUCache = function (managedSize) {
		this.maxSize = managedSize;
		this.data = new LinkedList();
		this.keyMap = {};
		this.currentSize = 0;
	}

	LRUCache.prototype.put = function(key,value,size) {
		if(key in this.keyMap) {		
			var data = this.keyMap[key];
			this.currentSize -= data.size;
			this.currentSize += size;
			data.value = value;
			data.size = size;			
		} else {
			var data = {
				key:key,
				value:value,
				size:size
			};
			this.data.unshift(data);
			this.keyMap[key] = data;
		
			this.currentSize+=size-0;
			this.recycle();
		}
		return value;
	}
	
	LRUCache.prototype.remove = function(key) {
		var obj = this.get(key);
		if(!obj) {
			return undefined;
		}
		delete this.keyMap[key];
		for(var i=0;i<this.data.size;i++) {
			var entry = this.data.find(i);
			if(entry.value == obj) {
				return this.data.remove(i);
			}
		}
		return null;
	}
	LRUCache.prototype.get = function(key) {
		var obj = this.keyMap[key];
		if(!obj) {
			return undefined;
		}
		
		return obj.value;
	}
	LRUCache.prototype.recycle = function() {
		while(this.currentSize>this.maxSize) {
			var clearData = this.data.pop();
			this.currentSize -= clearData.size;
			delete this.keyMap[clearData.key];
		}
	}
	
	exports.LRUCache = LRUCache;

})();