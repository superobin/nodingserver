(function() {
	var LinkedList = function() {
		this.head = {};
		this.tail = {};
		this.head.next = this.tail;
		this.tail.previous = this.head;
		this.size = 0;
	}
	LinkedList.prototype.push = function(data) {
		return this.add(this.size,data);
		
	}
	LinkedList.prototype.pop = function() {
		return this.remove(this.size-1);
	}
	LinkedList.prototype.shift = function(data) {
		return this.remove(0);
	}
	
	
	LinkedList.prototype.unshift = function(data) {
		return this.add(0,data);
	}
	LinkedList.prototype.add = function(index,data) {
		var entry = {data:data};
		var target = this.find(index);
		var previous = target.previous;
		target.previous = entry;
		previous.next= entry;
		entry.next = target;
		entry.previous = previous;
		this.size++;
		return entry;
	}
	LinkedList.prototype.remove = function(index) {
		var entry = this.find(index);
		var previous = entry.previous;
		var next = entry.next;
		previous.next = next;
		next.previous = previous;
		this.size--;
		return entry.data;
	}
	
	LinkedList.prototype.find = function(index) {
		if(index>=0&&index<=this.size) {
			var entry = this.head.next;
			for(var i=0;i<index;i++) {
				entry = entry.next;
			}
			return entry;
		} else {
			return null;
		}
	}
	
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