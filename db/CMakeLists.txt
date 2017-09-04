cmake_minimum_required(VERSION 3.0)

project(FastDomainsDB)

# Tell CMake to run moc when necessary:
set(CMAKE_AUTOMOC ON)
# As moc files are generated in the binary dir, tell CMake
# to always look for includes there:
set(CMAKE_INCLUDE_CURRENT_DIR ON)

# Network finds its own dependencies.
find_package(Qt5Network REQUIRED)

add_library(
  SMHasherSupport
  smhasher/src/AvalancheTest.cpp
  smhasher/src/Bitslice.cpp
  smhasher/src/Bitvec.cpp
  smhasher/src/CityTest.cpp
  smhasher/src/City.cpp
  smhasher/src/crc.cpp
  smhasher/src/DifferentialTest.cpp
  smhasher/src/Hashes.cpp
  smhasher/src/KeysetTest.cpp
  smhasher/src/lookup3.cpp
  smhasher/src/md5.cpp
  smhasher/src/MurmurHash1.cpp
  smhasher/src/MurmurHash2.cpp
  smhasher/src/MurmurHash3.cpp
  smhasher/src/Platform.cpp
  smhasher/src/Random.cpp
  smhasher/src/sha1.cpp
  smhasher/src/SpeedTest.cpp
  smhasher/src/Spooky.cpp
  smhasher/src/SpookyTest.cpp
  smhasher/src/Stats.cpp
  smhasher/src/SuperFastHash.cpp
  smhasher/src/Types.cpp
  smhasher/src/PMurHash.c
)

# file(GLOB FAST_DOMAINS_SRC "*.cpp")
# file(GLOB FAST_DOMAINS_INC "*.hpp")

add_executable(FastDomainsDB ServerMain.cpp Server.cpp Server.hpp Hasher.hpp TestSuite.cpp Compiler.cpp HashTableCompiled.cpp HashTableCompiled.hpp)

target_compile_features(FastDomainsDB PRIVATE cxx_auto_type)

target_link_libraries(
  FastDomainsDB
  SMHasherSupport
)

qt5_use_modules(FastDomainsDB Core Network)
