
#include <QCoreApplication>
#include <QtCore>

#include <stdlib.h>

#include "Server.hpp"

int printHelp() {
  printf("Please specify an option:\n\n"
         "server\n\n"
         "compile <input> <output>\n\n"
         "test <test name>\n\n"
         );
  return 1;
}

int runTest(const QString& test_name);

int compileDB( const QString& input, const QString& output );

int generateVocabulary( const QString& size, const QString& output );

int main(int argc, char *argv[])
{
    setbuf(stdout, NULL);

    QCoreApplication app(argc, argv);
    QCoreApplication::setApplicationName("FastDomainsDB Server");
    QCoreApplication::setApplicationVersion("1.0");

    qsrand(QTime(0,0,0).secsTo(QTime::currentTime()));

    // Parse otions
    if ( argc < 2 ) {
      return printHelp();
    } else
    if ( QString("server") == argv[1] ) {
      printf("Running server.\n");
      Server* server = new Server(&app);
      if ( server->initDB() ) {
        return app.exec();
      } else {
        return 1;
      }
    } else
    if ( QString("compile") == argv[1] ) {
      printf("Running compiler.\n");
      if ( argc < 4 ) {
        return printHelp();
      }
      QString input = argv[2];
      QString output = argv[3];
      return compileDB( input, output );
    } else
    if ( QString("genvoc") == argv[1] ) {
      printf("Generating vocabulary.\n");
      if ( argc < 4 ) {
        return printHelp();
      }
      QString size = argv[2];
      QString output = argv[3];
      return generateVocabulary( size, output );
    } else
    if ( QString("test") == argv[1] ) {
      printf("Running test suite.\n");
      if ( argc < 3 ) {
        return printHelp();
      }
      QString test_name = argv[2];
      return runTest(test_name);
    } else {
      return printHelp();
    }
    return 1;
}
