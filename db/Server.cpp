#include <QtNetwork>
#include <QJsonObject>
#include <QJsonDocument>
#include <QThread>
#include <QFile>
#include <QTime>
#include <QCoreApplication>
#include <QDir>
#include <QRegExp>

#include <stdlib.h>
#include "Server.hpp"

#define FAST_DOMAINS_VERSION "1.0"
#define FAST_DOMAINS_PORT 4000
#define MAX_COMMANDS_IN_QUEUE 100000

#define REPLY_STATUS_OK 200
#define REPLY_STATUS_CLIENT_ERR 400
#define REPLY_STATUS_SERVER_ERR 500
#define REPLY_STATUS_DISCARD 503
#define FAST_DOMAINS_EOC "\n"

// IMPORTANT TO AVOID memcpy OVERFLOW: don't allow strings longer than 32 chars.
QRegExp gTopicRegex("^[A-Z0-9-]{1,32}$");
QRegExp gCommandRegex("^@[A-Z0-9]{1,16}$");

Server::Server(QObject *parent)
    : QObject(parent)
    , mTcpServer(Q_NULLPTR)
    , mNetworkSession(0)
{
    QNetworkConfigurationManager manager;
    if ( manager.capabilities() & QNetworkConfigurationManager::NetworkSessionRequired ) {
        
        // Get saved network configuration
        QSettings settings(QSettings::UserScope, QLatin1String("QtProject"));
        settings.beginGroup(QLatin1String("QtNetwork"));
        const QString id = settings.value(QLatin1String("DefaultNetworkConfiguration")).toString();
        settings.endGroup();

        // If the saved network configuration is not currently discovered use the system default
        QNetworkConfiguration config = manager.configurationFromIdentifier(id);
        if ( ( config.state() & QNetworkConfiguration::Discovered ) != QNetworkConfiguration::Discovered ) {
            config = manager.defaultConfiguration();
        }

        mNetworkSession = new QNetworkSession(config, this);
        connect(mNetworkSession, &QNetworkSession::opened, this, &Server::sessionOpened);

        printf("Opening network session.\n");
        mNetworkSession->open();
    } else {
        sessionOpened();
    }

    connect(mTcpServer, &QTcpServer::newConnection, this, &Server::connectSocket);
}

void Server::sessionOpened()
{
    // Save the used configuration
    if ( mNetworkSession ) {
        QNetworkConfiguration config = mNetworkSession->configuration();
        QString id;
        if ( config.type() == QNetworkConfiguration::UserChoice )
            id = mNetworkSession->sessionProperty(QLatin1String("UserChoiceConfiguration")).toString();
        else
            id = config.identifier();

        QSettings settings(QSettings::UserScope, QLatin1String("QtProject"));
        settings.beginGroup(QLatin1String("QtNetwork"));
        settings.setValue(QLatin1String("DefaultNetworkConfiguration"), id);
        settings.endGroup();
    }

    mTcpServer = new QTcpServer(this);
    if ( ! mTcpServer->listen( QHostAddress::LocalHost, FAST_DOMAINS_PORT ) ) {
        printf( "Unable to start the server: %s.\n", mTcpServer->errorString().toStdString().c_str() );
        return;
    }
    QString ipAddress;
    QList<QHostAddress> ipAddressesList = QNetworkInterface::allAddresses();
    // use the first non-localhost IPv4 address
    for ( int i = 0; i < ipAddressesList.size(); ++i ) {
        if (ipAddressesList.at(i) == QHostAddress::LocalHost &&
            ipAddressesList.at(i).toIPv4Address()) {
            ipAddress = ipAddressesList.at(i).toString();
            break;
        }
    }
    // if we did not find one, use IPv4 localhost
    if ( ipAddress.isEmpty() ) {
        ipAddress = QHostAddress(QHostAddress::LocalHost).toString();
    }
    printf("FastDomainsDB " FAST_DOMAINS_VERSION " listening on %s:%d\n", ipAddress.toStdString().c_str(), mTcpServer->serverPort() );
}

void Server::connectSocket()
{
    QTcpSocket* socket = mTcpServer->nextPendingConnection();

    // Security - only accept connections from local host - until we setup a proper firewall...
    printf("Connection requested from: %s\n", CSTR(socket->peerAddress().toString()) );
    if ( socket->peerAddress().toString() != "127.0.0.1" ) {
      socket->disconnectFromHost();
      printf("Rejected foreign connection.\n");
    }

    // Allow only two connections
    if ( mSockets.size() < 2 ) {
      mSockets.insert( socket );
      connect(socket, &QTcpSocket::disconnected, this, [this, socket]{ disconnectedSocket(socket); });
      connect(socket, &QAbstractSocket::readyRead, this, [this, socket]{ enqueueCommands(socket); });
      printf("Accepted connection %lu.\n", mSockets.size() );
    } else {
      socket->disconnectFromHost();
      printf("Rejected connection.\n");
    }
}

void Server::disconnectedSocket( QTcpSocket* socket )
{
  // delete old socket and accept new connections
  socket->deleteLater();
  mSockets.erase( socket );
  printf("Deleted socket.\n");
}

void Server::enqueueCommands( QTcpSocket* socket )
{
  std::string str;
  mCommandQueue += socket->readAll();

  QStringList commands = QString( mCommandQueue ).split( FAST_DOMAINS_EOC );

  if ( commands.isEmpty() ) {
    return;
  }

  // A complete command has to be terminatd by a FAST_DOMAINS_EOC byte.
  // In this case the last element after a split is empty, if not it means
  // the last command is incomplete so we put it back in the queue.
  if ( commands.last().isEmpty() ) {
    mCommandQueue.clear();
    commands.pop_back();
  } else {
    mCommandQueue = commands.last();
    commands.pop_back();
  }

  for( int i = 0; i < commands.size(); ++i ) {

    // Parse input JSON

    const QString& command = commands[i];
    QJsonObject jsonIn = QJsonDocument::fromJson( command.toStdString().c_str() ).object();

    // Prepare output JSON

    QJsonObject jsonOut;

    // Basic sanity check

    if ( jsonIn.contains("command") && jsonIn.contains("hash") && jsonIn.contains("ticketID") ) {

      jsonOut["ticketID"] = jsonIn["ticketID"];
      jsonOut["hash"] = jsonIn["hash"];
      jsonOut["status"] = REPLY_STATUS_OK;

      // Process or discard request

      if ( i > MAX_COMMANDS_IN_QUEUE ) {
        // Discard requests if server is too busy
        jsonOut["status"] = REPLY_STATUS_DISCARD;
      } else {
        QString cmd = jsonIn["command"].toString();
        if ( "PING" == cmd ) {
          jsonOut["message"] = "PING";
        } else
        if ( "VERSION" == cmd ) {
          jsonOut["version"] = mDB.version();
        } else
        if ( "UPDATE" == cmd ) {
          if ( ! jsonIn.contains("version") ) {
            jsonOut["status"] = REPLY_STATUS_CLIENT_ERR;
            jsonOut["message"] = "Missing `version` parameter";
          } else {
            // Update database version
            mDB.load( QString("database.") + jsonIn["version"].toString() + ".bin" );
            jsonOut["version"] = mDB.version();
          }
        } else
        if ( "QUERY" == cmd ) {
          if ( ! jsonIn.contains("domains") ) {
            jsonOut["status"] = REPLY_STATUS_CLIENT_ERR;
            jsonOut["message"] = "Missing `domains` parameter";
          } else {
            QJsonArray domains = jsonIn["domains"].toArray();
            mDB.query( domains );
            jsonOut["availability"] = mDB.queryAvailability();
            jsonOut["message"] = "ok";
          }
        } else
        if ( "IDEAS" == cmd ) {
          if ( ! jsonIn.contains("topic") || ! jsonIn.contains("sorting") || ! jsonIn.contains("filter") ) {
            jsonOut["status"] = REPLY_STATUS_CLIENT_ERR;
            jsonOut["message"] = "Missing  parameters";
          } else {
            QString topic = jsonIn["topic"].toString().toUpper();
            QString filter = jsonIn["filter"].toString();
            QString sorting = jsonIn["sorting"].toString();
            // TODO: error checking domain, filter and sorting
            bool err = ( filter != "pre" && filter != "post" && filter != "pre-post" ) ||
                       ( sorting != "len-asc" && sorting != "len-desc" && sorting != "alpha-asc" && sorting != "alpha-desc" && sorting != "random" && sorting != "popularity" ) ||
                       ( gTopicRegex.indexIn( topic ) == -1 && gCommandRegex.indexIn( topic ) == -1 );

            if ( err ) {
              jsonOut["status"] = REPLY_STATUS_CLIENT_ERR;
              jsonOut["message"] = "Parameter error";
            } else {
              if ( gTopicRegex.indexIn( topic ) != -1 ) {
                mDB.ideas( CSTR(topic), filter, sorting );
                jsonOut["ideasIndex"] = mDB.ideasIndex();
                jsonOut["exactMatch"] = mDB.isAvailable( topic );
                jsonOut["message"] = "ok";
              } else {
                mDB.command( topic, sorting );
                jsonOut["domains"] = mDB.commandDomains();
                jsonOut["message"] = "ok";
              }
            }
          }
        } else {
          jsonOut["status"] = REPLY_STATUS_CLIENT_ERR;
          jsonOut["message"] = "Unknown command";
        }
      }
    } else {
      // Try and use what's there

      jsonOut["status"] = REPLY_STATUS_CLIENT_ERR;
      jsonOut["ticketID"] = jsonIn["ticketID"];
      jsonOut["hash"] = jsonIn["hash"];

      printf( "Invalid request: %s\n", command.toStdString().c_str() );
    }
    
    // Send reply
    QByteArray json = QJsonDocument(jsonOut).toJson(QJsonDocument::Compact);
    socket->write( json + FAST_DOMAINS_EOC );
  }
}

bool Server::initDB() {
  QDir dir("data");
  QStringList filters;
  filters.push_back("database.????????_????.bin");
  QFileInfoList entries = dir.entryInfoList(filters, QDir::Files, QDir::SortFlag::Name | QDir::SortFlag::Reversed);
  printf("%d available databases:\n", entries.size() );
  for( QFileInfoList::const_iterator it = entries.begin(); it != entries.end(); ++it ) {
    printf( "    %s\n", CSTR(it->fileName()) );
  }
  if ( entries.size() ) {
    QString database = entries.first().fileName();
    return mDB.load( database );
  } else {
    return false;
  }
}

