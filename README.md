# nodejs-google-parser
Small parser for google without getting ban


Problem: we cannot parse google direct  - we will get ban after 10-15 tries.
Main idea of that parser is using proxy servers to be able to use proxy servers widely, by parsing open source proxy sites, different blogs for new proxies.
Each proxy server we store into reddis database. 

We are using:
database 1 for good proxies,
database 2 for not working proxies
database 3 for already banned proxies
database 4 for proxies to use to grab database from sites with proxylists.
database 5 for proxies that are currently in use.

Here i an diagramm who does program works:
<img src="https://webdevelop.pro/static/proxypool.png" />
