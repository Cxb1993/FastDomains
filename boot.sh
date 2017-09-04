#!/usr/bin/env bash

set -o nounset # error if unset variables
set -o errexit # exit if error

(cd ~/FastDomains && git pull) || :
cd ~/FastDomains/app/ && npm install

make -C ~/FastDomains/db/build

echo Active Processes
ps aux | grep -P 'FastDomainsDB server|node .*index.js' | head

PROCESSES=`ps aux | grep -P 'FastDomainsDB server|node .*index.js' | head -n -1 | grep -oP '^root\s+\d+' | grep -oP '\d+' || :`

for p in $PROCESSES; do
  echo "Killing process $p"
  kill -9 $p || :
done

# Start DB server
(cd ~/FastDomains && make -C db/build/ -j 8 && ./db/build/FastDomainsDB server) > ~/FastDomains/db.log 2>&1 &

# Start Node production
(cd ~/FastDomains/app && NODE_ENV=production node --expose-gc index.js) > ~/FastDomains/node-prod.log 2>&1 &

sleep 1

echo Active Processes
ps aux | grep -P 'FastDomainsDB server|node .*index.js' | head -n -1
