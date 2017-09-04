# Fast Domains

![Fast Domains](https://user-images.githubusercontent.com/10284338/30039255-c8e19abc-91ce-11e7-9b43-cbcb84a20e0b.png)

## About

Fast *.com* domains search tool. Finds thousands of available *.com* domains in realtime as you type. Allows for domains containing both hyphens and numbers.

Why is this project interesting? Mainly because it shows how to implement in C++ a simple high-performance in-memory database and how to connect it to a Node.js server via sockets. This last part could be implemented much better using the official Socket.IO C++ client instead of the raw Qt5 socket classes.

The server requires at least 2GB of RAM. 4GB are required to use the online DB update feature.

*Warning: hacky code. This is a side project I built in a few sleepless nights recycling various bits of code from previous ancient projects.*

### Front-End & Web Server

- Web server implemented in Node.js
- The browser uses Sockets.IO to communicate with the web server which also uses sockets to communicate with the `FastDomainsDB` server
- The browser sends a new request via sockets every time the user presses a new character
- Since client-side the bottleneck is rebuilding the HTML DOM from the 5000 results, we rebuild the HTML in batches for better interactivity
- The client JS is based on an ancient framework of mine, no fancy React here

### FastDomainsDB Server

- *FastDomainsDB* is an in-memory custom database conceptually similar to Redis and Memcache
- The database is populated with the data extracted from Verizon's *com.zone* file, which lists DNS info for most *.com* domains (registered domains might be missing from this file for various reasons)
- The *com.zone* file (11GB) is compiled into a native format to be directly used by the `FastDomainsDB` server (1.6GB)
- Implemented in C++ & Qt5, cross-platform compilation done via CMake by Kitware
- Storage is a custom designed hashtable optimized to:
  - Minimize memory consumption
  - Maximize read speed
  - Write speed not important (but it's also very fast)
  - Maximize database load speed
  - Dynamic resize not important, since our data is "static", ie updated once a day 
- Implements a *set* where you can only *insert* an element and test for element *inclusion* in the set (ie. is a given domain available?)
- We do not need to iterate over elements
- Because of the above we do not store the full domain name but just its MD5 hash (as a `quint64`)
- The database it's basically a very compact hashtable of `quint64` MD5 hashes
- Communicates via JSON over sockets
- Implementation is currently single thread but it could easily take advantage of multiple threads
- Implements batch domain query: idea -> available domains
  - For each "idea" (ex. "shop") tests 11,499 domains based on a [vocabulary](https://github.com/MicBosi/FastDomains/blob/master/db/IdeaDictionary.hpp) of common prefixes and suffixes
  - Each of the 11,499 domain names is generated manipulating strings in a way to not cause memory allocations
  - Returns a list of indexes (ie 1, 2, 3...) each representing an available domain (could be compacted even more by returning a *bit field*)
  
**Test:**

```
curl -sH "Content-Type: application/json" -X POST -d '{"topic":"domains","filter":"pre-post","sorting":"alpha-asc"}' http://localhost:8080/api/1.0/domains/ideas.json
```

Result:

> {"status":200,"message":"ok","ideasIndex":[8441,11412,6057,11104,5218,11121,10952,11286,10493,8298,11033,7264,9548,7635,7338,7040,7986,6498,7659,11361,8019,10429,9192,8799,8860,10951,7091,7752,9947,7127,10212,8045,7600,6509,10396,8806,8300,10580,10954,9776,7588,9998,6777,8171,11129,9523,10410,6989,7445,8131,...

### Benchmarks on 2 x Intel(R) Xeon(R) CPU E5-2650 v4 @ 2.20GHz (DigitalOcean 2GB VPS)

*Results are not typical.* This section exists just to provide a general sense of what to expect.

**Custom hastable vs standard C++ hastable:**

```
~/FastDomains/db/build/FastDomainsDB test all
```

Results:

```
PUT: std::unordered_set: 1190.5K put/sec in 0.840000 secs
PUT: HashTablePacked:     826.4K put/sec in 1.209000 secs
GET: std::unordered_set: 4166.7K get/sec in 0.240000 secs
GET: HashTablePacked:    7042.3K get/sec in 0.142000 secs
```

The main reason to use the custom one is it uses a fraction of the RAM not just because it has faster read speed.

**Node.js + FastDomainsDB batch query throughput:**

```
echo '{"topic":"domains","filter":"pre-post","sorting":"alpha-asc"}' > post-ideas.txt
ab -n 500 -c 10 -T "application/json" -p post-ideas.txt http://localhost:8080/api/1.0/domains/ideas.json
```

Results:

```
Concurrency Level:      10
Time taken for tests:   10.353 seconds
Complete requests:      500
Failed requests:        0
Total transferred:      12584000 bytes
Total body sent:        111500
HTML transferred:       12507500 bytes
Requests per second:    48.30 [#/sec] (mean)
Time per request:       207.056 [ms] (mean)
Time per request:       20.706 [ms] (mean, across all concurrent requests)
Transfer rate:          1187.03 [Kbytes/sec] received
                        10.52 kb/s sent
                        1197.55 kb/s total
```

In this test the VPS handles 48.30 requests per second (database bound). Since each request tests 11K domains we yield a total throughput of ~550,000 domains tested per second.

**Node.js + FastDomainsDB single domain query throughput:**

```
echo '{"domain":"michelebosi"}' > domains-check.txt
ab -n 10000 -c 100 -T "application/json" -p domains-check.txt http://localhost:8080/api/1.0/domains/check.json
```

Results:

```
Concurrency Level:      100
Time taken for tests:   9.115 seconds
Complete requests:      10000
Failed requests:        0
Total transferred:      2050000 bytes
Total body sent:        1860000
HTML transferred:       520000 bytes
Requests per second:    1097.04 [#/sec] (mean)
Time per request:       91.154 [ms] (mean)
Time per request:       0.912 [ms] (mean, across all concurrent requests)
Transfer rate:          219.62 [Kbytes/sec] received
                        199.27 kb/s sent
                        418.89 kb/s total
```

In this test the VPS handles 1097.04 requests per second (web server bound). Since each request tests 1 domain only we yield a throughput of ~1,100 domains tested per second.

Note that in the test above I'm running `ab` in the very server being tested. Running it from an external server or a server with more CPUs will dramatically change the results (and their meaning).

## Installation

The instructions below assume you have cloned this repository in `~/FastDomains`.

I've developed and tested this software on Ubuntu 16.04 LTS and Windows 10 only. It'll probably work on a Mac with minor or no modifications.

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

# ... or update database to version $DATE while server is running (will likely need a 4GB ram VPS)
curl -H "Content-Type: application/json" -X POST -d '{"version":"'$DATE'"}' http://localhost:8080/api/1.0/database/update.json; echo ''

# Check current data version
curl -H "Content-Type: application/json" -X GET -d '{}' http://localhost:8080/api/1.0/database/version.json; echo ''

# Benchmark
$FD_ROOT/db/build/FastDomainsDB test all
```

**Compilation output example:**

```
Running compiler.
OK input file /root/FastDomains/data/com.zone.20170904_1117.raw
Allocating hash table: 137153992
Reading input file
Input file read in 2419.3 seconds
Average word size 12.9
53.2K words per second
Word count 128664096
HashTable size 128664096
Hash collisions 0 (%0.0000) (1/0.0)

Length stats:
00 -> 00000000 %0.000 %0.000
01 -> 00000003 %0.000 %0.000
02 -> 00001291 %0.001 %0.001
03 -> 00047700 %0.037 %0.038
04 -> 00989582 %0.769 %0.807
05 -> 04539253 %3.528 %4.335
06 -> 07024356 %5.459 %9.795
07 -> 07301619 %5.675 %15.470
08 -> 08181849 %6.359 %21.829
09 -> 09023267 %7.013 %28.842
10 -> 09899824 %7.694 %36.536
11 -> 10165187 %7.901 %44.437
12 -> 09934619 %7.721 %52.158
13 -> 09491242 %7.377 %59.535
14 -> 08723291 %6.780 %66.315
15 -> 07735848 %6.012 %72.327
16 -> 06735023 %5.235 %77.562
17 -> 05818137 %4.522 %82.084
18 -> 04826963 %3.752 %85.835
19 -> 03938882 %3.061 %88.897
20 -> 03225772 %2.507 %91.404
21 -> 02565157 %1.994 %93.397
22 -> 02032197 %1.579 %94.977
23 -> 01594923 %1.240 %96.216
24 -> 01224298 %0.952 %97.168
25 -> 00928366 %0.722 %97.890
26 -> 00704483 %0.548 %98.437
27 -> 00522826 %0.406 %98.843
28 -> 00384657 %0.299 %99.142
29 -> 00285524 %0.222 %99.364
30 -> 00209905 %0.163 %99.527
31 -> 00151919 %0.118 %99.645
32 -> 00111184 %0.086 %99.732
33 -> 00081395 %0.063 %99.795
34 -> 00060225 %0.047 %99.842
35 -> 00045257 %0.035 %99.877
36 -> 00034536 %0.027 %99.904
37 -> 00025505 %0.020 %99.924
38 -> 00019751 %0.015 %99.939
39 -> 00014954 %0.012 %99.951
40 -> 00011829 %0.009 %99.960
41 -> 00009244 %0.007 %99.967
42 -> 00007367 %0.006 %99.973
43 -> 00005946 %0.005 %99.978
44 -> 00004808 %0.004 %99.981
45 -> 00003954 %0.003 %99.984
46 -> 00003048 %0.002 %99.987
47 -> 00002541 %0.002 %99.989
48 -> 00002070 %0.002 %99.990
49 -> 00001641 %0.001 %99.992
50 -> 00001559 %0.001 %99.993
51 -> 00001173 %0.001 %99.994
52 -> 00001100 %0.001 %99.995
53 -> 00000974 %0.001 %99.995
54 -> 00000842 %0.001 %99.996
55 -> 00000678 %0.001 %99.996
56 -> 00000658 %0.001 %99.997
57 -> 00000600 %0.000 %99.997
58 -> 00000550 %0.000 %99.998
59 -> 00000537 %0.000 %99.998
60 -> 00000616 %0.000 %99.999
61 -> 00000467 %0.000 %99.999
62 -> 00000420 %0.000 %99.999
63 -> 00000704 %0.001 %100.000

Saving data/database.20170904_1117.bin
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

Visit http://localhost:8080 (production) or http://localhost:80801 (development).

You can bootstrap both severs with `boot.sh` which will kill any existing server and restart new ones.

## Inspired By

- [Lean Domain Search](http://www.leandomainsearch.com)
- [Instant Domain Search](https://instantdomainsearch.com/)
- [Shopify Business Name Generator](https://www.shopify.com/tools/business-name-generator)

## Warning

Use at your own risk. This program is probably vulnerable to all kinds of security exploits.

## Copyright

&copy; 2017 Michele Bosi. Use this software as you want.

This software uses [SMHasher](https://github.com/aappleby/smhasher/wiki) a test suite designed to test the distribution, collision, and performance properties of non-cryptographic hash functions.

