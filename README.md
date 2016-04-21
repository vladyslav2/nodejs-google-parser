# nodejs-google-parser
Small parser for google without getting ban


Problem: we cannot parse google direct  - we will get ban after 10-15 tries.
Main idea of the parser is about a fact that we can search for public proxy servers and use them widely.

## Step 1
Parse public blog or sites with proxy list.
Store all new proxies into redis database (#5)

## Step 2
Get domains that need to be check from mongodb, for each domain we find proxy in order:
- if we have good proxies use them
- if we have new proxies use them
- if we don't have any proxies, go to the first step.


## Step 3
- Check if we do have answer from google server and proxy server did not change the response
- Check if google are not show captcha
- Store proxy in good proxy list (#4) if we did not get captcha and answer was from google. Parse next site with that proxy.
- In case if google ban the proxy - store proxy into secondary proxy list (#4). Will use that proxy for parsing proxy list sites.

We are using:
database 1 for good proxies,
database 2 for not working proxies
database 3 for already banned proxies
database 4 for proxies to use to grab database from sites with proxylists.
database 5 for proxies that are currently in use.


### Its one of the microservice for getting worth of domain.

Full diagram of mircoservices:
<img src="https://webdevelop.pro/static/proxypool.png" />
