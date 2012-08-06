(function() {
	/**
		Ugly linked list.can be optimized a lot.
	*/
	var LinkedList = exports.LinkedList = function() {
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
})();