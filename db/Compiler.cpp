#include <QObject>
#include <QFile>
#include <QTime>
#include <QTextStream>
#include <QRegExp>

#include "HashTableCompiled.hpp"

#include <stdlib.h>

int generateVocabulary( const QString& size_str, const QString& output ) {
  printf( "%s:\n", __FUNCTION__ );

  QString input = "../words.txt";
  QFile fin(input);
  QFile fout(output);

  if( ! fin.open(QIODevice::ReadOnly) ) {
    printf("Error opening input file %s\n", CSTR(input) );
    return 1;
  } else {
    printf("OK input file %s\n", CSTR(input) );
  }

  if( ! fout.open(QIODevice::WriteOnly) ) {
    printf("Error opening output file %s\n", CSTR(output) );
    return 1;
  } else {
    printf("OK output file %s\n", CSTR(output) );
  }

  printf("Loading base vocabulary...\n");
  QTextStream in(&fin);
  std::vector<QString> vocabulary;
  QString line;
  while( ! in.atEnd() ) {
      line = in.readLine();
      if ( ! line.isEmpty() ) {
        vocabulary.push_back(line);
      }
  }
  fin.close();

  printf("Generating vocabulary...\n");
  QTime time;
  time.start();
  QTime time_progress;
  time_progress.start();
  int size = size_str.toInt();
  QString entry;
  const char* END_OF_LINE = "\n";
  for( int i = 0; i <size; ++i ) {
    // append number to make it really unique
    entry = vocabulary[ rand() % vocabulary.size() ] + "-" + vocabulary[ rand() % vocabulary.size() ] + "-" + QString().sprintf("%d", i);
    fout.write( CSTR(entry), entry.length() );
    fout.write(END_OF_LINE, 1);
    if ( time_progress.elapsed() > 1000 ) {
      time_progress.start();
      printf("%%%.1f, %.1fs left \r", 100.0f * i / size, (size - i) * (time.elapsed() / 1000.0f / i) );
    }
  }
  printf("\n");
  printf("Vocabulary generated in %.1f seconds\n", time.elapsed() / 1000.0f);
  return 0;
}

int compileDB( const QString& input, const QString& output ) {
  QTime time;
  time.start();

  QFile fin(input);

  if( ! fin.open(QIODevice::ReadOnly) ) {
    printf("Error opening input file %s\n", CSTR(input) );
    return 1;
  } else {
    printf("OK input file %s\n", CSTR(input) );
  }

  QTextStream in(&fin);

  // 80 shoud account for an over provisioning of about 2-3%
  quint64 hash_table_size = fin.size() / 80;
  printf("Allocating hash table: %lld\n", hash_table_size);
  HashTableCompiled hash_table;
  hash_table.init( hash_table_size, 1.0 );
  Hasher hasher;

  printf("Reading input file\n");
  QTime time_progress;
  time_progress.start();
  double average_word_size = 0;
  int word_count = 0;

  // FIXME: optimize line reading later by reading big chunks and avoiding reallocation in the loop.
  QString line;
  HashType hash = 0;
  size_t prev_size = 0;
  QRegExp regex("^([A-Z0-9-]+) NS ");
  int len_stats[64];
  memset( len_stats, 0, 64 * sizeof(int) );
  QString prev_name;
  while( ! in.atEnd() ) {
      line = in.readLine();

      if ( line.isEmpty() ) {
        continue;
      }

      if ( regex.indexIn(line) != 0 ) {
        // printf("! %s\n", CSTR(line) );
        continue;
      }

      line = regex.cap(1);
      // skip duplicates
      if ( line == prev_name ) {
        // printf("& %s\n", CSTR(line) );
        continue;
      }
      prev_name = line;
      // printf("@ %s\n", CSTR(line) );

      if ( line.length() < 64 ) {
        len_stats[ line.length() ]++;
      } else {
        printf(">>>64>>> %s\n", CSTR(line) );
      }
      hash = hasher.compute( CSTR(line), (int)line.length() );
      hash_table.put( hash );
      if ( hash_table.mSize == prev_size ) {
        // printf("Hash collision: %s -> %llx\n", CSTR(line), (quint64)hash);
      }
      prev_size = hash_table.mSize;
      word_count++;
      average_word_size += line.length();

      if ( time_progress.elapsed() > 1000 ) {
        time_progress.start();
        printf("%d words (%lu collisions)\r", word_count, word_count - hash_table.mSize);
      }
  }
  printf("                                                            \r");
  fin.close();
  average_word_size /= word_count;
  size_t collisions = word_count - hash_table.mSize;
  printf("Input file read in %.1f seconds\n", time.elapsed() / 1000.0f);
  printf("Average word size %.1f\n", (float)average_word_size);
  printf("%.1fK words per second\n", word_count / (time.elapsed() / 1000.0f) / 1000.0f );
  printf("Word count %d\n", word_count);
  printf("HashTable size %lu\n", hash_table.mSize);
  printf("Hash collisions %lu (%%%.4f) (1/%.1f)\n",
         collisions,
         100.0f * collisions / word_count,
         collisions ? 1.0f * word_count / collisions : 0.0f );

  printf("\n");
  printf("Length stats:\n");
  int cumulative_len = 0;
  for( int i=0; i<64; ++i ) {
    cumulative_len += len_stats[i];
    printf("%02d -> %08d %%%.3f %%%.3f\n", i, len_stats[i], 100.0f * len_stats[i] / word_count, 100.0f * cumulative_len / word_count);
  }
  printf("\n");

  hash_table.save( output );

  return 0;
}
