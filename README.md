# Fast Domains

## About

Fast .com domains search tool.

## Installation

The below install instructions assume you have cloned this repository in `~/FastDomains`.

I've developed and tested this tool on Ubuntu 16.04 LTS and Windows 10 only.

### FastDomainsDB Server: Install

The server is written in Qt5/C++ and uses CMake for cross platform compilation. It's basically a giant hashtable that you can talk to via sockets.

The current implementation can be further simplified and enhnced by the use of the official [Socket.IO C++ client](https://socket.io/blog/socket-io-cpp/).

```
# not all of these are actually needed but I use them frequently
sudo apt-get update
sudo apt-get install cmake make g++ git vim curl apache2-utils qt5-default python htop -y
cd ~/FastDomains
mkdir -p build
cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
make -j 8
```

### FastDomainsDB Server: Download Data & Run

You will need your Verizon username and password to access the Verizon FTP server and download the `com.zone` files.

```
VERIZON_USER='<username>'
VERIZON_PWD='<password>'
ZONE=com.zone
DATE=`date +%Y%m%d_%H%M`
ZONE_FILENAME=$ZONE.$DATE
FD_ROOT=~/FastDomains
DATA_PATH=$FD_ROOT/data
cd $FD_ROOT

# Download & uncompress data
wget -c "ftp://${VERIZON_USER}:${VERIZON_PWD}@rz.verisign-grs.com/$ZONE.gz" -O $DATA_PATH/$ZONE_FILENAME.gz
gunzip -c $DATA_PATH/$ZONE_FILENAME.gz > $DATA_PATH/$ZONE_FILENAME.raw

# Compile database
$FD_ROOT/db/build/FastDomainsDB compile $DATA_PATH/$ZONE_FILENAME.raw database.$DATE.bin

# Run database server
$FD_ROOT/db/build/FastDomainsDB server

# ... or update database to version $DATE if already running
curl -H "Content-Type: application/json" -X POST -d '{"version":"'$DATE'"}' http://127.0.0.1:8080/api/1.0/database/update.json; echo ''

# Check current version
curl -H "Content-Type: application/json" -X GET -d '{}' http://localhost:8080/api/1.0/database/version.json; echo ''

# Benchmark
$FD_ROOT/db/build/FastDomainsDB test all
```

### Web Server: Installation

Requires the latest stable node.js distrubution, ex. `nvm install --lts`, [nvm can be found here](https://github.com/creationix/nvm#installationhttps://github.com/creationix/nvm#installation).

```
cd ~/FastDomains/app
npm install
```

### Web Server: Run 

```
NODE_ENV=production node --expose-gc index.js
```

This will wait for the FastDomainsDB to come oneline.

Visit http://localhost:8080 or `http://<IP-ADDRESS/DOMAIN-NAME>:8080` if running this on a server

You can bootstrap both severs with `boot.sh` which will kill any existing server and restart new ones.

## Inspired By

- [Lean Domain Search](http://www.leandomainsearch.com)
- [Instant Domain Search](https://instantdomainsearch.com/)
- [Shopify Business Name Generator](https://www.shopify.com/tools/business-name-generator)
