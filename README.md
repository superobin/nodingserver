nodingserver
========

NodingServer is a simple webServer with a front server(reverse proxy).

The code changed greatly,and we'll commit the new readme sometime later.

How to Use
------------
	First config the config file.
	{
		"webServers":[
			{
				"webroot":"./sampleApp",
				"port":8082,
				"homepage":"/index.html"//if not passed,the homepage will be /index.html
			},
			{
				"webroot":"./sampleApp2",
				"port":8083,
				"homepage":"/index.html"
			}
		],
		"mappingHosts":{
			/*
			Hosts that front server proxies.
			The key is the host&port passed from browser,value is web server config
			Web server will automaticly created by front server.
			*/
			"localhost":{
				"host":"localhost",
				"port":8082,
				"dynamicPattern":[/^.+?([a-zA-Z0-9\-_]+)\.action(\?.+)?$/]
			},
			"127.0.0.1":{
				"host":"localhost",
				"port":8083,
				"dynamicPattern":[/^.+?([a-zA-Z0-9\-_]+)\.action(\?.+)?$/]
			}
		},
		"frontServerPort":8081,
		"cacheSize":1024*1024*64//in bytes,not exact
	}
	
	Then create webapp like the samples.
	
	You can simply lauch the servers using 
	
	node laucher.js

Restrictions
-------

The server did not passed the test on node v0.6 and earlier.

We only tested it on node v0.8

We only using utf8 in source code and webapp files.

No https suppport.

License
-------

MIT