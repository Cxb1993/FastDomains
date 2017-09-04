#include <QObject>
#include <QFile>
#include <QTime>

#include "HashTableCompiled.hpp"

#include <stdlib.h>

int runTest(const QString& test_name) {

  HashTableCompiled hashtable;
  hashtable.test();

  return 0;
}
