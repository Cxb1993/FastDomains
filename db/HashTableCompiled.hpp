#ifndef HashTableCompiled_INCLUDE_ONCE
#define HashTableCompiled_INCLUDE_ONCE

#include <QObject>
#include <QFile>
#include <QTime>
#include <QStringList>
#include <QJsonArray>
#include <vector>
#include <cassert>
#include <unordered_set>

#include "Hasher.hpp"

#define CSTR(QSTRING) QSTRING.toStdString().c_str()

class HashTableCompiled {
public:
  HashTableCompiled( ) {
    mSize = 0;
  }

  void init( size_t size, float overprovision = 1.01f ) {
    size = size_t(size * overprovision);

    mTable.clear();
    mNext.clear();

    mTable.shrink_to_fit();
    mNext.shrink_to_fit();

    mTable.resize( size );
    mNext.resize( size );

    for( size_t i = 0; i < size; ++ i ) {
      mNext[ i ] = -1;
    }

    mSize = 0;
  }

  bool put( const HashType& hash ) {
    size_t next = hash % mTable.size();
    if ( mTable[ next ] == 0 ) {
      mTable[ next ] = hash;
      ++mSize;
      return true;
    }

    // find end of chain
    while ( mNext[ next ] != -1 ) {
      if ( mTable[ next ] == hash ) {
        return true;
      }
      next = mNext[ next ];
    }

    // find free position
    size_t max = mTable.size() + next;
    for( size_t i = next; i < max; ++i ) {
      int pos = int(i % mTable.size());
      if ( mTable[ pos ] == 0 ) {
        mTable[ pos ] = hash;
        mNext[ next ] = pos;
        ++mSize;
        return true;
      }
    }

    throw std::runtime_error("PUT FAILED");

    return false;
  }

  bool get( const HashType& hash ) {
    int next = hash % mTable.size();
    while ( next != -1 ) {
      if ( mTable[next] == hash ) {
        return true;
      } else {
        next = mNext[ next ];
      }
    }
    return false;
  }

  bool save( const QString& path ) {
    QTime time;
    time.start();
    QFile fout( QString("data/") + path );
    printf("Saving %s\n", CSTR(fout.fileName()) );
    if( ! fout.open( QIODevice::WriteOnly ) ) {
      printf("Error opening output file %s. Error %d\n", CSTR(fout.fileName()), (int)fout.error() );
      return false;
    }

    size_t table_len = mTable.size();

    fout.write( (const char*)&table_len, sizeof(table_len) );
    if ( table_len ) {
      fout.write( (const char*)&mTable[0], sizeof(mTable[0]) * table_len );
      fout.write( (const char*)&mNext[0],  sizeof(mNext[0])  * table_len );
    }
    fout.close();

    printf( "Saved compiled: %lu table size, in %.1f seconds\n", table_len, time.elapsed() / 1000.0f );

    return true;
  }

  bool load( const QString& path ) {
    QTime time;
    time.start();
    QFile fin( QString("data/") + path );
    printf("Loading %s\n", CSTR(fin.fileName()) );
    if( ! fin.open( QIODevice::ReadOnly ) ) {
      printf("Error opening output file %s. Error %d\n", CSTR(fin.fileName()), (int)fin.error() );
      return false;
    }

    mVersion = path.mid(9, 13);

    size_t table_len = 0;
    fin.read( (char*)&table_len, sizeof(table_len) );
    init( table_len, 1.0 );

    if ( table_len ) {
      fin.read( (char*)&mTable[0], sizeof(mTable[0]) * table_len );
      fin.read( (char*)&mNext[0],  sizeof(mNext[0])  * table_len );
    }
    fin.close();

    printf( "Loaded compiled database. %lu table size, in %.1f seconds\n", table_len, time.elapsed() / 1000.0f );
    return true;
  }

  bool test() {
    const size_t TEST_SIZE = 1 * 1000 * 1000;

    QTime time;
    time.start();

    // test against C++11 hash table

    std::unordered_set<HashType> hash_table;
    for ( size_t i = 0; i < TEST_SIZE; ++i ) {
      HashType hash = mHasher.compute( &i, sizeof(size_t ) );
      hash_table.insert( hash );
    }
    printf("PUT: std::unordered_set<HashType>: %.1fK put/sec in %f secs\n", TEST_SIZE / (float)time.elapsed(), time.elapsed() / 1000.0f );

    time.start();
    init( TEST_SIZE );
    for ( size_t i = 0; i < TEST_SIZE; ++i ) {
      HashType hash = mHasher.compute( &i, sizeof(size_t ) );
      put( hash );
    }
    printf("PUT: HashTablePacked:              %.1fK put/sec in %f secs\n", TEST_SIZE / (float)time.elapsed(), time.elapsed() / 1000.0f );

    // test idempotent
    time.start();
    init( TEST_SIZE );
    for ( size_t i = 0; i < TEST_SIZE; ++i ) {
      HashType hash = mHasher.compute( &i, sizeof(size_t ) );
      put( hash );
    }
    printf("IDE: HashTablePacked:              %.1fK put/sec in %f secs\n", TEST_SIZE / (float)time.elapsed(), time.elapsed() / 1000.0f );

    printf("Correctness testing...\n");
    save( "database.00000000_0000.bin.test" );
    load( "database.00000000_0000.bin.test" );

    time.start();
    for ( size_t i = 0; i < mTable.size(); ++i ) {
      HashType hash = mTable[ i ];
      if ( hash != 0 && hash_table.find( hash ) == hash_table.end() ) {
        printf("Failed.\n");
        return false;
      }
    }
    printf("GET: std::unordered_set<HashType>: %.1fK get/sec in %f secs\n", TEST_SIZE / (float)time.elapsed(), time.elapsed() / 1000.0f );

    time.start();
    for ( std::unordered_set<HashType>::iterator it = hash_table.begin(); it != hash_table.end(); ++it ) {
      HashType hash = *it;
      if ( ! get( hash) ) {
        printf("Failed.\n");
        return false;
      }
    }
    printf("GET: HashTablePacked:              %.1fK get/sec in %f secs\n", TEST_SIZE / (float)time.elapsed(), time.elapsed() / 1000.0f );

    printf("Success.\n");
    return true;
  }

  // FIXME: use std::string through out all the query pipeline
  // Domains here must be all uppercase and without .com
  void query(const QJsonArray& domains);

  const QJsonArray& queryAvailability() const { return mQueryAvailability; }

  void ideas( const char* topic, const QString& filter, const QString& sorting );

  const QJsonArray& ideasIndex() const { return mIdeasIndex; }

  const QString& version() const { return mVersion; }

  bool isAvailable( const QString& domain );

  void command( const QString& topic, const QString& sorting );

  const QJsonArray& commandDomains() const { return mCommandDomains; }

  std::vector<HashType> mTable;
  std::vector<int> mNext;
  QString mVersion;
  Hasher mHasher;
  size_t mSize;

  QJsonArray mQueryAvailability;
  QJsonArray mIdeasIndex;
  QJsonArray mCommandDomains;
};

#endif
